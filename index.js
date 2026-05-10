const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();

// --- Firebase Admin Setup ---
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8",
);
const serviceAccount = JSON.parse(decoded);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// --- Middleware ---
const allowedOrigins = [
  "http://localhost:5173",
  "https://clubspere-firebase.web.app",
  "https://clubspere-firebase.firebaseapp.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// --- MongoDB Connection Management (Singleton Pattern) ---
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ypjumbw.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;
  await client.connect();
  cachedDb = client.db("clubSpere_Database");
  console.log("MongoDB connected successfully");
  return cachedDb;
}

const escapeRegExp = (string = "") =>
  string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- Auth Middlewares ---
const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token)
    return res.status(401).send({ message: "Authorization token is required" });
  try {
    const idToken = token.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.decodedToken = decodedToken;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid or expired token" });
  }
};

const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decodedToken?.email;
    const db = await getDb();
    const user = await db.collection("users").findOne({
      email: { $regex: `^${escapeRegExp(email)}$`, $options: "i" },
    });
    if (user?.role !== "admin")
      return res.status(403).send({ message: "Forbidden: Admins only" });
    next();
  } catch (error) {
    res.status(500).send({ message: "Admin verification failed" });
  }
};

const verifyMember = async (req, res, next) => {
  try {
    const email = req.decodedToken?.email;
    const db = await getDb();
    const user = await db.collection("users").findOne({
      email: { $regex: `^${escapeRegExp(email)}$`, $options: "i" },
    });
    if (user?.role !== "member")
      return res
        .status(403)
        .send({ message: "Only members can perform this action" });
    next();
  } catch (error) {
    res.status(500).send({ message: "Member verification failed" });
  }
};

// --- API ROUTES ---

app.get("/", (req, res) => res.send("ClubSphere Server is running!"));

app.get("/db-health", async (req, res) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.send({ server: "ok", database: "connected" });
  } catch (e) {
    res
      .status(500)
      .send({ server: "ok", database: "failed", error: e.message });
  }
});

// Users
app.post("/users", async (req, res) => {
  const db = await getDb();
  const user = req.body;
  const existing = await db
    .collection("users")
    .findOne({ email: { $regex: `^${user.email}$`, $options: "i" } });
  if (existing) return res.send({ message: "User exists", existing: true });
  const result = await db
    .collection("users")
    .insertOne({ ...user, role: "member", createdAt: new Date() });
  res.send(result);
});

app.get("/users/role/:email", async (req, res) => {
  const db = await getDb();
  const user = await db
    .collection("users")
    .findOne({ email: { $regex: `^${req.params.email}$`, $options: "i" } });
  res.send({ role: user?.role || "member" });
});

// Clubs
app.get("/clubs", async (req, res) => {
  const db = await getDb();
  const { email } = req.query;
  const query = email
    ? { managerEmail: { $regex: `^${email}$`, $options: "i" } }
    : {};
  const result = await db
    .collection("clubs")
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

app.get("/clubs/approved", async (req, res) => {
  const db = await getDb();
  const result = await db
    .collection("clubs")
    .find({ status: "approved" })
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

app.post("/clubs", verifyFBToken, async (req, res) => {
  const db = await getDb();
  const result = await db
    .collection("clubs")
    .insertOne({ ...req.body, status: "pending", createdAt: new Date() });
  res.send(result);
});

// Payments & Membership
app.post(
  "/create-membership-payment-intent",
  verifyFBToken,
  verifyMember,
  async (req, res) => {
    try {
      const db = await getDb();
      const { clubId } = req.body;
      const club = await db
        .collection("clubs")
        .findOne({ _id: new ObjectId(clubId) });
      const amount = Math.round(Number(club.membershipFee || 0) * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        metadata: { clubId, userEmail: req.decodedToken.email },
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  },
);

app.post(
  "/membership-payment-success",
  verifyFBToken,
  verifyMember,
  async (req, res) => {
    try {
      const db = await getDb();
      const { clubId, paymentIntentId, userName } = req.body;
      const userEmail = req.decodedToken.email;

      const club = await db
        .collection("clubs")
        .findOne({ _id: new ObjectId(clubId) });
      const paymentIntent =
        await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== "succeeded")
        return res.status(400).send({ message: "Payment failed" });

      const membershipInfo = {
        clubId,
        clubName: club.clubName,
        userEmail,
        userName,
        fee: Number(club.membershipFee || 0),
        status: "active",
        joinedDate: new Date().toISOString(),
      };

      const result = await db
        .collection("clubMembers")
        .insertOne(membershipInfo);
      res.send({ success: true, result });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  },
);

// Events
app.get("/events", async (req, res) => {
  const db = await getDb();
  const { clubId } = req.query;
  const query = clubId ? { clubId } : {};
  const result = await db
    .collection("events")
    .find(query)
    .sort({ eventDate: 1 })
    .toArray();
  res.send(result);
});

app.post("/events", verifyFBToken, async (req, res) => {
  const db = await getDb();
  const result = await db
    .collection("events")
    .insertOne({ ...req.body, createdAt: new Date() });
  res.send(result);
});

// Home Stats
app.get("/home-stats", async (req, res) => {
  try {
    const db = await getDb();
    const stats = {
      totalClubs: await db
        .collection("clubs")
        .countDocuments({ status: "approved" }),
      totalEvents: await db.collection("events").countDocuments(),
      totalMembers: await db
        .collection("clubMembers")
        .countDocuments({ status: "active" }),
    };
    res.send(stats);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// Member Dashboard: Joined Clubs
app.get("/my-joined-clubs/:email", verifyFBToken, async (req, res) => {
  const db = await getDb();
  const memberships = await db
    .collection("clubMembers")
    .find({ userEmail: req.params.email })
    .toArray();
  const clubIds = memberships.map((m) => new ObjectId(m.clubId));
  const clubs = await db
    .collection("clubs")
    .find({ _id: { $in: clubIds } })
    .toArray();
  res.send(clubs);
});

// --- Export for Vercel ---
module.exports = app;

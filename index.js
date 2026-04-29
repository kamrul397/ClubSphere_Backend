const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 3000;
const admin = require("firebase-admin");

const serviceAccount = require("./clubspere_admin_sdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "Authorization token is required" });
  }
  try {
    const idToken = token.split(" ")[1]; // Extract the token part after "Bearer"
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    // console.log("decoded token", decodedToken);

    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid or expired token" });
  }
};

// const verifyAdmin = async (req, res, next) => {
//   const email = req.decodedToken.email;
//   const user = await usersCollection.findOne({ email });
//   if (user?.role !== "admin") {
//     return res.status(403).send({ message: "Forbidden: Admins only" });
//   }
//   next();
// };

const uri = `mongodb+srv://${
  process.env.DB_USER
}:${process.env.DB_PASSWORD}@cluster0.ypjumbw.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("clubSpere_Database");
    const clubsCollection = db.collection("clubs");
    const usersCollection = db.collection("users");
    const clubManagersCollection = db.collection("clubManagers");
    const clubMembersCollection = db.collection("clubMembers");

    // users api
    app.post("/users", async (req, res) => {
      const user = req.body;
      const email = user.email;
      const existingUser = await usersCollection.findOne({ email });
      if (existingUser) {
        return res.status(400).send({ message: "User already exists" });
      }

      user.createdAt = new Date();
      user.role = "member"; // Set default role to "user"
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users", verifyFBToken, async (req, res) => {
      const searchText = req.query.searchText;
      let query = {};

      if (searchText) {
        query.$or = [
          {
            // 'i' makes it case-insensitive
            // This allows matching "kam" if the name is "Kamrul"
            name: { $regex: searchText, $options: "i" },
          },
          {
            email: { $regex: searchText, $options: "i" },
          },
        ];
      }

      const result = await usersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.patch(
      "/users/:id/role",
      verifyFBToken,

      async (req, res) => {
        const { id } = req.params;
        const { role } = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: role,
          },
        };
        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
      },
    );

    // Change the path order to match what your frontend is calling
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;

      // Change this line to use a case-insensitive regex
      const user = await usersCollection.findOne({
        email: { $regex: `^${email}$`, $options: "i" },
      });

      if (!user) {
        // If user isn't in DB yet, they are a member by default
        return res.send({ role: "member" });
      }

      res.send({ role: user.role || "member" });
    });
    // club managers api

    app.post("/club-managers", verifyFBToken, async (req, res) => {
      const manager = req.body;
      const email = manager.email;

      // 1. Safety Check: Check if this user already applied
      const existingRequest = await clubManagersCollection.findOne({ email });
      if (existingRequest) {
        return res.status(400).send({
          message:
            "You have already submitted an application. Please wait for admin review.",
        });
      }

      // 2. Override status and add timestamp on server-side for security
      const finalApplication = {
        ...manager,
        status: "pending", // Prevents users from sending "approved"
        createdAt: new Date(),
      };

      const result = await clubManagersCollection.insertOne(finalApplication);
      res.send(result);
    });

    app.get("/club-managers", verifyFBToken, async (req, res) => {
      const query = {};
      if (req.query.status) {
        query.status = req.query.status;
      }
      const result = await clubManagersCollection.find().toArray();
      res.send(result);
    });

    app.patch("/club-managers/:id", verifyFBToken, async (req, res) => {
      const status = req.body.status;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status,
        },
      };
      const result = await clubManagersCollection.updateOne(query, updateDoc);
      if (status === "approved") {
        const email = req.body.email;
        const userQuery = { email: email };
        const userUpdateDoc = {
          $set: {
            role: "clubManager",
          },
        };
        await usersCollection.updateOne(userQuery, userUpdateDoc);
      }
      res.send(result);
    });

    // clubs api
    app.get("/clubs", verifyFBToken, async (req, res) => {
      const { email } = req.query; // This gets "kamrulislam25262800@gmail.com" from the URL
      let query = {};

      if (email) {
        // IMPORTANT: Use 'managerEmail' because that is what you stored in MongoDB
        query = { managerEmail: { $regex: `^${email}$`, $options: "i" } };
      }
      const options = {
        sort: { createdAt: -1 }, // Sort by createdAt in descending order
      };

      const result = await clubsCollection.find(query, options).toArray();
      res.send(result);
    });

    // POST a new club (Initial Request)
    app.post("/clubs", verifyFBToken, async (req, res) => {
      const newClub = req.body;

      // Security: Force status to pending and add timestamp
      const finalClubData = {
        ...newClub,
        status: "pending",
        createdAt: new Date(),
      };

      const result = await clubsCollection.insertOne(finalClubData);
      res.send(result);
    });
    // Admin Route to Approve/Reject Club
    app.patch("/clubs/:id/status", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      const { status, managerEmail } = req.body; // status will be 'approved' or 'rejected'

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { status: status },
      };

      const result = await clubsCollection.updateOne(query, updateDoc);

      // // If approved, ensure the user has the manager role
      // if (status === "approved" && managerEmail) {
      //   const userQuery = { email: managerEmail };
      //   const userUpdateDoc = {
      //     $set: { role: "clubManager" },
      //   };
      //   await usersCollection.updateOne(userQuery, userUpdateDoc);
      // }

      res.send(result);
    });
    // Get only approved clubs that the user has NOT joined yet
    app.get("/clubs/approved", verifyFBToken, async (req, res) => {
      const { email } = req.query;
      let query = { status: "approved" };

      if (email) {
        // 1. Find all club IDs the user has already joined
        const joinedClubs = await clubMembersCollection
          .find({ userEmail: email })
          .project({ clubId: 1 })
          .toArray();

        // 2. Extract IDs into an array
        const joinedIds = joinedClubs.map((c) => new ObjectId(c.clubId));

        // 3. Filter the query to exclude these IDs
        if (joinedIds.length > 0) {
          query._id = { $nin: joinedIds };
        }
      }

      const result = await clubsCollection.find(query).toArray();
      res.send(result);
    });
    // Get a single club by ID
    app.get("/clubs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await clubsCollection.findOne(query);
      res.send(result);
    });

    // get club members by clubId
    app.post("/club-members", verifyFBToken, async (req, res) => {
      const memberInfo = req.body;
      // memberInfo should include: clubId, clubName, userEmail, userName, fee, status
      const result = await clubMembersCollection.insertOne(memberInfo);
      res.send(result);
    });

    // Check if a specific user has already joined a specific club
    app.get("/membership-check", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const clubId = req.query.clubId;
      const query = { userEmail: email, clubId: clubId };
      const membership = await clubMembersCollection.findOne(query);
      res.send({ isMember: !!membership });
    });
    // Get all memberships for a specific user
    app.get("/my-memberships/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const memberships = await clubMembersCollection
        .find({ userEmail: email })
        .project({ clubId: 1 }) // Only fetch the clubId to keep it light
        .toArray();
      res.send(memberships.map((m) => m.clubId)); // Returns array of IDs: ["id1", "id2"]
    });

    // Get detailed club info for a member's dashboard
    app.get("/my-joined-clubs/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;

      // 1. Find all membership records for this user
      const memberships = await clubMembersCollection
        .find({ userEmail: email })
        .toArray();

      if (memberships.length === 0) {
        return res.send([]);
      }

      // 2. Extract the clubIds and convert to ObjectIds for querying
      const clubIds = memberships.map((m) => new ObjectId(m.clubId));

      // 3. Fetch full club details (name, banner, etc.) from the clubs collection
      const joinedClubs = await clubsCollection
        .find({ _id: { $in: clubIds } })
        .toArray();

      // 4. Merge membership-specific data (status, joinedDate) with club data
      const result = joinedClubs.map((club) => {
        const membershipInfo = memberships.find(
          (m) => m.clubId === club._id.toString(),
        );
        return {
          ...club,
          membershipStatus: membershipInfo?.status,
          joinedAt: membershipInfo?.joinedDate,
        };
      });

      res.send(result);
    });

    // Leave a club (Remove membership)
    app.delete("/leave-club", verifyFBToken, async (req, res) => {
      const { email, clubId } = req.query;
      const query = { userEmail: email, clubId: clubId };

      const result = await clubMembersCollection.deleteOne(query);
      res.send(result);
    });

    // Delete a club by ID
    app.delete("/clubs/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // Validate if ID is a valid MongoDB ObjectId string
        if (!id || id.length !== 24) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const query = { _id: new ObjectId(id) };
        const result = await clubsCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({ message: "No club found with this ID" });
        }

        res.send(result);
      } catch (error) {
        console.error("Delete Error:", error); // Check your terminal for this!
        res
          .status(500)
          .send({ message: "Internal Server Error", error: error.message });
      }
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

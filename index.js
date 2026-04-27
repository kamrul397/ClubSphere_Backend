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

    app.get("/users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/users/:id", async (req, res) => {
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
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const { query } = email;
      const user = await usersCollection.findOne(query);
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }
      res.send({ role: user.role || "member" }); // Default to "member" if role is not set
    });
    // club managers api

    app.post("/club-managers", async (req, res) => {
      const manager = req.body;
      manager.status = "pending"; // Set default status to "pending"
      manager.createdAt = new Date();
      const result = await clubManagersCollection.insertOne(manager);
      res.send(result);
    });

    app.get("/club-managers", async (req, res) => {
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
        query = { managerEmail: email };
      }
      const options = {
        sort: { createdAt: -1 }, // Sort by createdAt in descending order
      };

      const result = await clubsCollection.find(query, options).toArray();
      res.send(result);
    });

    app.post("/clubs", async (req, res) => {
      const newClub = req.body;
      newClub.createdAt = new Date(); // Add a createdAt field with the current date and time
      const result = await clubsCollection.insertOne(newClub);
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

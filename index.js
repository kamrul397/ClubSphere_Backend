const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

    // clubs api
    app.get("/clubs", async (req, res) => {
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

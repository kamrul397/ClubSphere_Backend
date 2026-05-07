const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const port = process.env.PORT || 3000;
const admin = require("firebase-admin");

const serviceAccount = require("./clubspere_admin_sdk.json");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    const idToken = token.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // important
    req.decodedToken = decodedToken;

    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid or expired token" });
  }
};

// const verifyMember = async (req, res, next) => {
//   const email = req.decodedToken.email;

//   const user = await usersCollection.findOne({
//     email: { $regex: `^${email}$`, $options: "i" },
//   });

//   if (user?.role !== "member") {
//     return res.status(403).send({
//       message: "Only members can perform this action.",
//     });
//   }

//   next();
// };

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
    const eventsCollection = db.collection("events");
    // --- Event Registrations API ---
    const eventRegistrationsCollection = db.collection("eventRegistrations");

    const paymentsCollection = db.collection("payments");

    const escapeRegExp = (string = "") => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const verifyAdmin = async (req, res, next) => {
      try {
        const email = req.decodedToken?.email;

        if (!email) {
          return res.status(401).send({ message: "Unauthorized" });
        }

        const user = await usersCollection.findOne({
          email: { $regex: `^${escapeRegExp(email)}$`, $options: "i" },
        });

        if (user?.role !== "admin") {
          return res.status(403).send({ message: "Forbidden: Admins only" });
        }

        next();
      } catch (error) {
        res.status(500).send({
          message: "Failed to verify admin",
          error: error.message,
        });
      }
    };

    const verifyMember = async (req, res, next) => {
      try {
        const email = req.decodedToken?.email;

        if (!email) {
          return res.status(401).send({ message: "Unauthorized" });
        }

        const user = await usersCollection.findOne({
          email: { $regex: `^${email}$`, $options: "i" },
        });

        if (user?.role !== "member") {
          return res.status(403).send({
            message: "Only members can perform this action.",
          });
        }

        next();
      } catch (error) {
        res.status(500).send({
          message: "Failed to verify member",
          error: error.message,
        });
      }
    };
    app.post(
      "/create-membership-payment-intent",
      verifyFBToken,
      verifyMember,
      async (req, res) => {
        try {
          const { clubId } = req.body;
          const userEmail = req.decodedToken.email;

          if (!clubId || !ObjectId.isValid(clubId)) {
            return res.status(400).send({ message: "Invalid club ID." });
          }

          const club = await clubsCollection.findOne({
            _id: new ObjectId(clubId),
          });

          if (!club) {
            return res.status(404).send({ message: "Club not found." });
          }

          if (club.status !== "approved") {
            return res.status(400).send({
              message: "You can only join approved clubs.",
            });
          }

          const alreadyMember = await clubMembersCollection.findOne({
            clubId,
            userEmail,
          });

          if (alreadyMember) {
            return res.status(400).send({
              message: "You have already joined this club.",
            });
          }

          const amount = Math.round(Number(club.membershipFee || 0) * 100);

          if (amount <= 0) {
            return res.status(400).send({
              message: "This club is free. Payment is not required.",
            });
          }

          const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency: "usd",
            metadata: {
              type: "membership",
              clubId,
              clubName: club.clubName || "",
              userEmail,
            },
          });

          res.send({
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount,
            clubName: club.clubName,
          });
        } catch (error) {
          console.error("Payment intent error:", error);
          res.status(500).send({
            message: "Failed to create payment intent.",
            error: error.message,
          });
        }
      },
    );
    // app.post(
    //   "/membership-payment-success",
    //   verifyFBToken,
    //   verifyMember,
    //   async (req, res) => {
    //     try {
    //       const { clubId, paymentIntentId } = req.body;
    //       const userEmail = req.decodedToken.email;

    //       if (!clubId || !ObjectId.isValid(clubId)) {
    //         return res.status(400).send({ message: "Invalid club ID." });
    //       }

    //       if (!paymentIntentId) {
    //         return res.status(400).send({
    //           message: "Payment intent ID is required.",
    //         });
    //       }

    //       const club = await clubsCollection.findOne({
    //         _id: new ObjectId(clubId),
    //       });

    //       if (!club) {
    //         return res.status(404).send({ message: "Club not found." });
    //       }

    //       const paymentIntent =
    //         await stripe.paymentIntents.retrieve(paymentIntentId);

    //       if (paymentIntent.status !== "succeeded") {
    //         return res.status(400).send({
    //           message: "Payment was not successful.",
    //         });
    //       }

    //       if (
    //         paymentIntent.metadata?.clubId !== clubId ||
    //         paymentIntent.metadata?.userEmail !== userEmail
    //       ) {
    //         return res.status(403).send({
    //           message: "Payment information does not match this user or club.",
    //         });
    //       }

    //       const alreadyMember = await clubMembersCollection.findOne({
    //         clubId,
    //         userEmail,
    //       });

    //       if (alreadyMember) {
    //         return res.send({
    //           message: "Membership already exists.",
    //           alreadyMember: true,
    //         });
    //       }

    //       const user = await usersCollection.findOne({
    //         email: { $regex: `^${userEmail}$`, $options: "i" },
    //       });

    //       const membershipInfo = {
    //         clubId,
    //         clubName: club.clubName,
    //         userEmail,
    //         userName: user?.name || paymentIntent.receipt_email || "Member",
    //         fee: Number(club.membershipFee || 0),
    //         status: "active",
    //         paymentId: paymentIntent.id,
    //         joinedDate: new Date().toISOString(),
    //       };

    //       const membershipResult =
    //         await clubMembersCollection.insertOne(membershipInfo);

    //       const paymentRecord = {
    //         userEmail,
    //         amount: Number(club.membershipFee || 0),
    //         amountInCents: paymentIntent.amount,
    //         type: "membership",
    //         clubId,
    //         clubName: club.clubName,
    //         stripePaymentIntentId: paymentIntent.id,
    //         status: paymentIntent.status,
    //         createdAt: new Date(),
    //       };

    //       const paymentResult =
    //         await paymentsCollection.insertOne(paymentRecord);

    //       res.send({
    //         success: true,
    //         membershipResult,
    //         paymentResult,
    //       });
    //     } catch (error) {
    //       console.error("Membership payment success error:", error);
    //       res.status(500).send({
    //         message: "Failed to complete membership after payment.",
    //         error: error.message,
    //       });
    //     }
    //   },
    // );

    app.post(
      "/membership-payment-success",
      verifyFBToken,
      verifyMember,
      async (req, res) => {
        try {
          const { clubId, paymentIntentId, userName } = req.body; // Receive userName along with paymentIntentId and clubId
          const userEmail = req.decodedToken.email;

          if (!clubId || !ObjectId.isValid(clubId)) {
            return res.status(400).send({ message: "Invalid club ID." });
          }

          if (!paymentIntentId) {
            return res.status(400).send({
              message: "Payment intent ID is required.",
            });
          }

          if (!userName) {
            return res.status(400).send({
              message: "User name is required.",
            });
          }

          const club = await clubsCollection.findOne({
            _id: new ObjectId(clubId),
          });

          if (!club) {
            return res.status(404).send({ message: "Club not found." });
          }

          const paymentIntent =
            await stripe.paymentIntents.retrieve(paymentIntentId);

          if (paymentIntent.status !== "succeeded") {
            return res.status(400).send({
              message: "Payment was not successful.",
            });
          }

          // Ensure payment metadata matches the clubId and userEmail to prevent mismatches
          if (
            paymentIntent.metadata?.clubId !== clubId ||
            paymentIntent.metadata?.userEmail !== userEmail
          ) {
            return res.status(403).send({
              message: "Payment information does not match this user or club.",
            });
          }

          // Check if the user is already a member of the club
          const alreadyMember = await clubMembersCollection.findOne({
            clubId,
            userEmail,
          });

          if (alreadyMember) {
            return res.send({
              message: "Membership already exists.",
              alreadyMember: true,
            });
          }

          // Get user details from the users collection (for userName)
          const user = await usersCollection.findOne({
            email: { $regex: `^${userEmail}$`, $options: "i" },
          });

          // Create membership record
          const membershipInfo = {
            clubId,
            clubName: club.clubName,
            userEmail,
            userName:
              userName || user?.name || paymentIntent.receipt_email || "Member", // Use userName if provided, fallback to email or "Member"
            fee: Number(club.membershipFee || 0),
            status: "active",
            paymentId: paymentIntent.id,
            joinedDate: new Date().toISOString(),
          };

          const membershipResult =
            await clubMembersCollection.insertOne(membershipInfo);

          // Create payment record
          const paymentRecord = {
            userEmail,
            userName, // Store userName in payment record
            amount: Number(club.membershipFee || 0),
            amountInCents: paymentIntent.amount,
            type: "membership",
            clubId,
            clubName: club.clubName,
            stripePaymentIntentId: paymentIntent.id,
            status: paymentIntent.status,
            createdAt: new Date(),
          };

          const paymentResult =
            await paymentsCollection.insertOne(paymentRecord);

          res.send({
            success: true,
            membershipResult,
            paymentResult,
            transactionId: paymentIntent.id, // Send transaction ID as part of the response
          });
        } catch (error) {
          console.error("Membership payment success error:", error);
          res.status(500).send({
            message: "Failed to complete membership after payment.",
            error: error.message,
          });
        }
      },
    );

    // Admin: Get all payment details
    app.get("/admin/payments", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const {
          search = "",
          status,
          type,
          clubId,
          page = 1,
          limit = 10,
        } = req.query;

        const currentPage = Math.max(parseInt(page), 1);
        const perPage = Math.min(Math.max(parseInt(limit), 1), 100);
        const skip = (currentPage - 1) * perPage;

        const query = {};

        if (status) {
          query.status = status;
        }

        if (type) {
          query.type = type;
        }

        if (clubId) {
          query.clubId = clubId;
        }

        if (search) {
          const safeSearch = escapeRegExp(search);

          query.$or = [
            { userName: { $regex: safeSearch, $options: "i" } },
            { userEmail: { $regex: safeSearch, $options: "i" } },
            { clubName: { $regex: safeSearch, $options: "i" } },
            { stripePaymentIntentId: { $regex: safeSearch, $options: "i" } },
          ];
        }

        const totalPayments = await paymentsCollection.countDocuments(query);

        const payments = await paymentsCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(perPage)
          .toArray();

        const summary = await paymentsCollection
          .aggregate([
            { $match: query },
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$amount" },
                totalAmountInCents: { $sum: "$amountInCents" },
                totalTransactions: { $sum: 1 },
              },
            },
          ])
          .next();

        res.send({
          payments,
          totalPayments,
          currentPage,
          totalPages: Math.ceil(totalPayments / perPage),
          summary: summary || {
            totalAmount: 0,
            totalAmountInCents: 0,
            totalTransactions: 0,
          },
        });
      } catch (error) {
        console.error("Admin payments fetch error:", error);
        res.status(500).send({
          message: "Failed to fetch admin payment records.",
          error: error.message,
        });
      }
    });
    // manager payment intent
    app.get("/club-payments/:clubId", verifyFBToken, async (req, res) => {
      try {
        const { clubId } = req.params; // Get the clubId from the request parameters
        const userEmail = req.decodedToken.email; // Get the logged-in user's email

        // Check if the logged-in user is a Club Manager for this club
        // const clubManager = await clubManagersCollection.findOne({
        //   email: userEmail,
        //   clubId: new ObjectId(clubId),
        // });

        // If the user is not a Club Manager, return a forbidden status
        // if (!clubManager) {
        //   return res
        //     .status(403)
        //     .send({ message: "Only Club Managers can view payments." });
        // }

        // Fetch the payment records for this club
        const payments = await paymentsCollection.find({ clubId }).toArray();

        // If no payments are found, send a message
        if (!payments.length) {
          return res
            .status(404)
            .send({ message: "No payments found for this club." });
        }

        // Send the payment records as a response
        res.send({ payments });
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).send({ message: "Failed to fetch payment records." });
      }
    });

    // users api
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        const email = user.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required" });
        }

        const existingUser = await usersCollection.findOne({
          email: { $regex: `^${email}$`, $options: "i" },
        });

        if (existingUser) {
          return res.send({
            message: "User already exists",
            existing: true,
            insertedId: null,
          });
        }

        const newUser = {
          name: user.name,
          email: user.email,
          photoURL: user.photoURL || "",
          role: "member",
          createdAt: new Date(),
          lastLogin: user.lastLogin || new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to save user",
          error: error.message,
        });
      }
    });

    app.patch("/users/profile/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const { name, photoURL } = req.body;

      const query = {
        email: { $regex: `^${email}$`, $options: "i" },
      };

      const updateDoc = {
        $set: {
          name,
          photoURL,
          updatedAt: new Date(),
        },
      };

      const result = await usersCollection.updateOne(query, updateDoc);
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

    // Public homepage stats
    app.get("/home-stats", async (req, res) => {
      try {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const totalClubs = await clubsCollection.countDocuments({
          status: "approved",
        });

        const totalEvents = await eventsCollection.countDocuments();

        const totalMembers = await clubMembersCollection.countDocuments({
          status: "active",
        });

        const eventsThisMonth = await eventsCollection.countDocuments({
          createdAt: { $gte: startOfMonth },
        });

        const membersThisMonth = await clubMembersCollection.countDocuments({
          joinedDate: { $gte: startOfMonth.toISOString() },
        });

        const totalRegistrations =
          await eventRegistrationsCollection.countDocuments();

        const latestClub = await clubsCollection.findOne(
          { status: "approved" },
          { sort: { createdAt: -1 } },
        );

        const latestEvent = await eventsCollection.findOne(
          {},
          { sort: { createdAt: -1 } },
        );

        const latestEventJoined = latestEvent
          ? await eventRegistrationsCollection.countDocuments({
              eventId: latestEvent._id.toString(),
            })
          : 0;

        res.send({
          totalClubs,
          totalEvents,
          totalMembers,
          eventsThisMonth,
          membersThisMonth,
          totalRegistrations,
          latestClubName: latestClub?.clubName || "Featured Club",
          latestEventTitle: latestEvent?.title || "Upcoming Event",
          latestEventJoined,
        });
      } catch (error) {
        res.status(500).send({
          message: "Failed to load homepage stats",
          error: error.message,
        });
      }
    });
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
      try {
        const manager = req.body;
        const email = manager.email;

        if (!email) {
          return res.status(400).send({ message: "Email is required." });
        }

        if (req.decodedToken.email !== email) {
          return res.status(403).send({
            message: "You cannot submit an application for another user.",
          });
        }

        const user = await usersCollection.findOne({
          email: { $regex: `^${escapeRegExp(email)}$`, $options: "i" },
        });

        if (!user) {
          return res.status(404).send({ message: "User not found." });
        }

        if (user.role !== "member") {
          return res.status(403).send({
            message: "Only members can apply to become Club Managers.",
          });
        }

        const existingActiveRequest = await clubManagersCollection.findOne({
          email: { $regex: `^${escapeRegExp(email)}$`, $options: "i" },
          status: { $in: ["pending", "approved"] },
        });

        if (existingActiveRequest) {
          return res.status(400).send({
            message:
              "You already have an active manager application. Please wait for admin review.",
          });
        }

        const finalApplication = {
          name: manager.name,
          email: manager.email,
          photoURL: manager.photoURL || "",
          nid: manager.nid,
          address: manager.address,
          roleRequested: "clubManager",
          status: "pending",
          createdAt: new Date(),
        };

        const result = await clubManagersCollection.insertOne(finalApplication);
        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to submit manager application",
          error: error.message,
        });
      }
    });
    app.get(
      "/club-managers/my-application/:email",
      verifyFBToken,
      async (req, res) => {
        try {
          const email = req.params.email;

          if (req.decodedToken.email !== email) {
            return res.status(403).send({
              message: "You cannot view another user's application.",
            });
          }

          const application = await clubManagersCollection.findOne({
            email: { $regex: `^${escapeRegExp(email)}$`, $options: "i" },
            status: { $in: ["pending", "approved"] },
          });

          if (!application) {
            return res.send({
              hasApplication: false,
              application: null,
            });
          }

          res.send({
            hasApplication: true,
            application,
          });
        } catch (error) {
          res.status(500).send({
            message: "Failed to check manager application",
            error: error.message,
          });
        }
      },
    );

    app.get("/club-managers", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const query = {};

        if (req.query.status) {
          query.status = req.query.status;
        }

        const result = await clubManagersCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to fetch manager applications",
          error: error.message,
        });
      }
    });

    app.patch(
      "/club-managers/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const { id } = req.params;
          const { status, email } = req.body;

          if (!ObjectId.isValid(id)) {
            return res.status(400).send({ message: "Invalid application ID." });
          }

          if (!["approved", "rejected"].includes(status)) {
            return res.status(400).send({ message: "Invalid status." });
          }

          const application = await clubManagersCollection.findOne({
            _id: new ObjectId(id),
          });

          if (!application) {
            return res.status(404).send({ message: "Application not found." });
          }

          if (application.status !== "pending") {
            return res.status(400).send({
              message: "Only pending applications can be approved or rejected.",
            });
          }

          const applicantEmail = email || application.email;

          // If admin rejects: delete request and keep user as member
          if (status === "rejected") {
            await usersCollection.updateOne(
              {
                email: {
                  $regex: `^${escapeRegExp(applicantEmail)}$`,
                  $options: "i",
                },
              },
              {
                $set: {
                  role: "member",
                  updatedAt: new Date(),
                },
              },
            );

            const deleteResult = await clubManagersCollection.deleteOne({
              _id: new ObjectId(id),
            });

            return res.send({
              ...deleteResult,
              rejected: true,
              message: "Application rejected and removed.",
            });
          }

          // If admin approves: keep request as approved and make user clubManager
          const result = await clubManagersCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                status: "approved",
                reviewedAt: new Date(),
                reviewedBy: req.decodedToken.email,
              },
            },
          );

          await usersCollection.updateOne(
            {
              email: {
                $regex: `^${escapeRegExp(applicantEmail)}$`,
                $options: "i",
              },
            },
            {
              $set: {
                role: "clubManager",
                updatedAt: new Date(),
              },
            },
          );

          res.send(result);
        } catch (error) {
          res.status(500).send({
            message: "Failed to update manager application",
            error: error.message,
          });
        }
      },
    );
    // app.post("/club-managers", verifyFBToken, async (req, res) => {
    //   const manager = req.body;
    //   const email = manager.email;

    //   // 1. Safety Check: Check if this user already applied
    //   const existingRequest = await clubManagersCollection.findOne({ email });
    //   if (existingRequest) {
    //     return res.status(400).send({
    //       message:
    //         "You have already submitted an application. Please wait for admin review.",
    //     });
    //   }

    //   // 2. Override status and add timestamp on server-side for security
    //   const finalApplication = {
    //     ...manager,
    //     status: "pending", // Prevents users from sending "approved"
    //     createdAt: new Date(),
    //   };

    //   const result = await clubManagersCollection.insertOne(finalApplication);
    //   res.send(result);
    // });

    // app.get("/club-managers", verifyFBToken, async (req, res) => {
    //   const query = {};
    //   if (req.query.status) {
    //     query.status = req.query.status;
    //   }
    //   const result = await clubManagersCollection.find().toArray();
    //   res.send(result);
    // });

    // app.patch("/club-managers/:id", verifyFBToken, async (req, res) => {
    //   const status = req.body.status;
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const updateDoc = {
    //     $set: {
    //       status: status,
    //     },
    //   };
    //   const result = await clubManagersCollection.updateOne(query, updateDoc);
    //   if (status === "approved") {
    //     const email = req.body.email;
    //     const userQuery = { email: email };
    //     const userUpdateDoc = {
    //       $set: {
    //         role: "clubManager",
    //       },
    //     };
    //     await usersCollection.updateOne(userQuery, userUpdateDoc);
    //   }
    //   res.send(result);
    // });
    // app.delete("/club-managers/:id", verifyFBToken, async (req, res) => {
    //   const id = req.params.id;
    //   const query = { _id: new ObjectId(id) };
    //   const result = await clubManagersCollection.deleteOne(query);
    //   res.send(result);
    // });

    // clubs api
    app.get("/clubs", async (req, res) => {
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

    // Public endpoint for fetching approved clubs without authentication
    app.get("/clubs/approved", async (req, res) => {
      try {
        // Fetch only approved clubs for public access
        const result = await clubsCollection
          .find({ status: "approved" })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching approved clubs:", error);
        res.status(500).send({ message: "Error fetching approved clubs" });
      }
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
    app.post("/club-members", verifyFBToken, verifyMember, async (req, res) => {
      const memberInfo = req.body;

      const userEmail = req.decodedToken.email;

      if (memberInfo.userEmail !== userEmail) {
        return res.status(403).send({
          message: "You cannot create membership for another user.",
        });
      }

      const existing = await clubMembersCollection.findOne({
        clubId: memberInfo.clubId,
        userEmail,
      });

      if (existing) {
        return res.status(400).send({
          message: "You have already joined this club.",
        });
      }

      const club = await clubsCollection.findOne({
        _id: new ObjectId(memberInfo.clubId),
      });

      if (!club) {
        return res.status(404).send({ message: "Club not found." });
      }

      if (Number(club.membershipFee || 0) > 0) {
        return res.status(400).send({
          message: "This club requires payment.",
        });
      }

      const finalMemberInfo = {
        clubId: club._id.toString(),
        clubName: club.clubName,
        userEmail,
        userName: memberInfo.userName,
        fee: 0,
        status: "active",
        joinedDate: new Date().toISOString(),
      };

      const result = await clubMembersCollection.insertOne(finalMemberInfo);
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

    // Get all members for a specific club (For Managers)
    app.get("/club-members/:clubId", verifyFBToken, async (req, res) => {
      const { clubId } = req.params;
      const query = { clubId: clubId };

      // Sort by newest members first
      const result = await clubMembersCollection
        .find(query)
        .sort({ joinedAt: -1 })
        .toArray();

      res.send(result);
    });

    // Add this under your other club routes
    app.patch("/clubs/:id", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;

      // Clean the data to ensure _id isn't being updated
      delete updatedData._id;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedData,
      };

      try {
        const result = await clubsCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ message: "Failed to update club", error: error.message });
      }
    });

    // Delete a club by ID
    app.delete("/clubs/:id", verifyFBToken, async (req, res) => {
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

    // --- EVENTS API ---

    app.post("/events", verifyFBToken, async (req, res) => {
      const newEvent = req.body;

      const finalEventData = {
        ...newEvent, // ✅ includes clubId
        createdAt: new Date(),
      };

      const result = await eventsCollection.insertOne(finalEventData);

      res.send(result);
    });

    app.get("/events", async (req, res) => {
      const { clubId } = req.query;

      let query = {};

      if (clubId) {
        query = { clubId };
      }

      try {
        const result = await eventsCollection
          .find(query)
          .sort({ eventDate: 1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({
          message: "Failed to fetch events",
          error: error.message,
        });
      }
    });
    // app.get("/events", async (req, res) => {
    //   const { clubId } = req.query;

    //   let query = {};

    //   if (clubId) {
    //     query = { clubId };
    //   }

    //   try {
    //     const result = await eventsCollection
    //       .find(query)
    //       .sort({ eventDate: 1 })
    //       .toArray();

    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send({
    //       message: "Failed to fetch events",
    //       error: error.message,
    //     });
    //   }
    // });

    // Add this in server.js under the events section
    app.put("/events/:id", verifyFBToken, async (req, res) => {
      const { id } = req.params;
      const updatedEvent = req.body;
      delete updatedEvent._id; // Ensure we don't try to overwrite the ID

      const query = { _id: new ObjectId(id) };
      const updateDoc = { $set: updatedEvent };

      const result = await eventsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.get("/events/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await eventsCollection.findOne(query);
      res.send(result);
    });

    app.post("/event-registrations", verifyFBToken, async (req, res) => {
      const registration = req.body;

      // Optional: Check if already registered
      const query = {
        eventId: registration.eventId,
        userEmail: registration.userEmail,
      };
      const existing = await eventRegistrationsCollection.findOne(query);

      if (existing) {
        return res
          .status(400)
          .send({ message: "You are already registered for this event!" });
      }

      const result = await eventRegistrationsCollection.insertOne(registration);
      res.send(result);
    });

    // Add this in index.js inside your run() function
    app.get("/event-registrations/check", verifyFBToken, async (req, res) => {
      const { email, eventId } = req.query;
      const query = { userEmail: email, eventId: eventId };
      const result = await db.collection("eventRegistrations").findOne(query);
      res.send(result); // Returns the doc if found, or null if not
    });
    app.delete("/event-registrations", verifyFBToken, async (req, res) => {
      const { email, eventId } = req.query;

      const query = {
        userEmail: email,
        eventId: eventId,
      };

      const result = await eventRegistrationsCollection.deleteOne(query);

      res.send(result);
    });

    // Get ALL registrations for a specific event (to show the "Joined" count)
    app.get("/event-registrations/:eventId", async (req, res) => {
      const eventId = req.params.eventId;
      const query = { eventId: eventId };
      const result = await db
        .collection("eventRegistrations")
        .find(query)
        .toArray();
      res.send(result);
    });
    app.get("/my-registered-events/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;

      const registrations = await eventRegistrationsCollection
        .find({ userEmail: email })
        .toArray();

      if (registrations.length === 0) return res.send([]);

      const eventIds = registrations.map((r) => new ObjectId(r.eventId));

      const events = await eventsCollection
        .find({ _id: { $in: eventIds } })
        .toArray();

      res.send(events);
    });
    app.get(
      "/event-registrations/:eventId",
      verifyFBToken,
      async (req, res) => {
        const { eventId } = req.params;

        const registrations = await eventRegistrationsCollection
          .find({ eventId: eventId })
          .toArray();

        res.send(registrations);
      },
    );
    // // 3. Delete an event
    // app.delete("/events/:id", verifyFBToken, async (req, res) => {
    //   const { id } = req.params;
    //   const query = { _id: new ObjectId(id) };

    //   const result = await eventsCollection.deleteOne(query);
    //   res.send(result);
    // });

    // Get all events for the clubs a specific member has joined
    app.get("/member-events/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;

      try {
        // 1. Find all clubs the user has joined
        const memberships = await db
          .collection("clubMembers")
          .find({ userEmail: email })
          .toArray();

        if (memberships.length === 0) {
          return res.send([]); // Return empty if not joined any clubs
        }

        // 2. Extract the clubIds
        const joinedClubIds = memberships.map((m) => m.clubId);

        // 3. Find events that belong to any of these clubIds
        const query = { clubId: { $in: joinedClubIds } };
        const result = await db
          .collection("events")
          .find(query)
          .sort({ eventDate: 1 }) // Sort by upcoming dates
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching member events" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!",
    // );
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

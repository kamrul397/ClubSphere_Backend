# ClubSphere Server

ClubSphere Server is the backend API for the ClubSphere MERN application. It handles authentication, user roles, club management, memberships, payments, event management, and admin operations using Express.js, MongoDB, Firebase Admin SDK, and Stripe.

---

## Live Links

- Live Site: https://clubspere-firebase.web.app
- Backend API: https://clubsphere-backend-1.onrender.com

---

## Project Purpose

The purpose of this backend is to provide secure REST APIs for managing clubs, memberships, events, payments, and role-based access control for the ClubSphere platform.

---

## Main Features

- Firebase JWT token verification
- Role-based API protection
- Member, Club Manager, and Admin roles
- Club creation and approval system
- Club membership system
- Free and paid club memberships
- Stripe payment integration
- Event creation and registration
- Club Manager application system
- Admin user management
- Secure MongoDB database integration
- Public and protected API routes
- CORS configuration for frontend access

---

# Technologies Used

## Backend Stack

- Node.js
- Express.js
- MongoDB Atlas
- Firebase Admin SDK
- Stripe
- dotenv
- cors

---

# API Features

## Authentication & Authorization

- Firebase token verification middleware
- Admin verification middleware
- Member verification middleware

---

## Users

### Features

- Save new users
- Update profile information
- Get user role
- Manage user roles

### Example Routes

```bash
POST /users
GET /users
PATCH /users/:id/role
GET /users/role/:email
PATCH /users/profile/:email
```

---

## Club Managers

### Features

- Apply for Club Manager role
- Admin approval/rejection system
- Application status tracking

### Example Routes

```bash
POST /club-managers
GET /club-managers
PATCH /club-managers/:id
GET /club-managers/my-application/:email
```

---

## Clubs

### Features

- Create clubs
- Approve or reject clubs
- Fetch approved clubs
- Update clubs
- Delete clubs
- Join clubs

### Example Routes

```bash
GET /clubs
GET /clubs/approved
POST /clubs
PATCH /clubs/:id
DELETE /clubs/:id
POST /club-members
```

---

## Membership Payments

### Features

- Stripe payment intent creation
- Membership payment verification
- Payment history
- Club payment monitoring

### Example Routes

```bash
POST /create-membership-payment-intent
POST /membership-payment-success
GET /admin/payments
GET /club-payments/:clubId
```

---

## Events

### Features

- Create events
- Update events
- Register for events
- View event participants
- Fetch member events

### Example Routes

```bash
POST /events
GET /events
PUT /events/:id
POST /event-registrations
GET /my-registered-events/:email
GET /member-events/:email
```

---

# Environment Variables

Create a `.env` file in the root directory and add:

```env
PORT=3000

DB_USER=your_mongodb_user
DB_PASSWORD=your_mongodb_password

STRIPE_SECRET_KEY=your_stripe_secret_key

FB_SERVICE_KEY=your_base64_encoded_firebase_admin_sdk
```

---

# Installation & Setup

## Clone Repository

```bash
git clone https://github.com/kamrul397/ClubSphere_Backend.git
```

## Navigate to Project

```bash
cd ClubSphere_Backend
```

## Install Dependencies

```bash
npm install
```

## Run Server

```bash
npm start
```

or

```bash
nodemon index.js
```

---

# Deployment

## Backend Deployment

- Render

## Database

- MongoDB Atlas

---

# Frontend Repository

https://github.com/kamrul397/ClubSphere_Frontend.git

---

# Backend Repository

https://github.com/kamrul397/ClubSphere_Backend.git

---

# Important Notes

- Club memberships can be free or paid
- All event registrations are free
- Firebase Authentication is required for protected routes
- Stripe is used only for paid club memberships
- MongoDB Atlas is used as the cloud database

---

# NPM Packages

## Core Packages

```bash
npm install express mongodb firebase-admin stripe cors dotenv
```

---

# Author

Developed by Kamrul Islam

```

```

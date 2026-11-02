# ShopSphere

## Multi-Vendor E-Commerce Marketplace

ShopSphere is a full-stack multi-vendor e-commerce marketplace application built using the MERN stack (MongoDB, Express.js, React, Node.js). The system enables multiple independent vendors to operate digital storefronts on a unified platform, providing customers with unified browsing, cross-vendor checkout, order status tracking, and verified reviews.

The project is structured to demonstrate advanced database design and management concepts, implementing native MongoDB features such as multi-document ACID transactions, full-text search with relevance weighting, compound indexing, TTL (Time-To-Live) index data eviction, and multi-stage aggregation pipelines for real-time analytics.

---

## Table of Contents

- [System Features](#system-features)
  - [Customer Management](#customer-management)
  - [Vendor Management](#vendor-management)
  - [Platform Administration](#platform-administration)
- [Technology Stack](#technology-stack)
- [Database Architecture and Advanced MongoDB Features](#database-architecture-and-advanced-mongodb-features)
  - [1. Multi-Document ACID Transactions](#1-multi-document-acid-transactions)
  - [2. Full-Text Search with Relevance Weighting](#2-full-text-search-with-relevance-weighting)
  - [3. Compound Index Optimization](#3-compound-index-optimization)
  - [4. Time-To-Live (TTL) Automatic Eviction](#4-time-to-live-ttl-automatic-eviction)
  - [5. Aggregation Framework Pipelines](#5-aggregation-framework-pipelines)
- [Authentication and Access Control](#authentication-and-access-control)
- [System Architecture](#system-architecture)
- [Project Directory Structure](#project-directory-structure)
- [Database Models and Relationships](#database-models-and-relationships)
- [Pre-Configured Demonstration Accounts](#pre-configured-demonstration-accounts)
- [RESTful API Specification](#restful-api-specification)
- [Installation and Setup](#installation-and-setup)
  - [Prerequisites](#prerequisites)
  - [Clone Repository](#clone-repository)
  - [Backend Configuration](#backend-configuration)
  - [Database Seeding](#database-seeding)
  - [Frontend Configuration](#frontend-configuration)
- [Environment Variables](#environment-variables)
- [Project Scripts](#project-scripts)
- [Project Objectives](#project-objectives)
- [Future Scope](#future-scope)

---

## System Features

### Customer Management

- Account registration, profile management, and authentication via JSON Web Tokens (JWT).
- Catalog exploration with search and filtering by category, vendor, price range, minimum rating, and inventory availability.
- Persistent shopping cart for authenticated users.
- Temporary guest shopping cart with automatic synchronization upon account login.
- Wishlist creation and management.
- Multi-vendor single-checkout process.
- Order history with item-level fulfillment tracking (`Processing`, `Shipped`, `Delivered`, `Cancelled`).
- Verified product review and rating submission restricted to confirmed buyers.

### Vendor Management

- Vendor registration and onboarding workflow requiring administrative verification.
- Dedicated vendor storefront page accessible via public URL slug (`/store/:slug`).
- Product catalog management including creation, modification, inventory tracking, and deletion.
- Order management filtered to line items associated specifically with the authenticated vendor.
- Independent item-level fulfillment status updating.
- Performance reporting and revenue analysis generated via native aggregation pipelines.

### Platform Administration

- Centralized management of platform users, vendor profiles, catalog items, and categories.
- Vendor verification pipeline for evaluating, approving, or rejecting new vendor applications.
- User account status governance, including suspension and reactivation capabilities.
- Category lifecycle management (creation, update, removal).
- Platform-wide reporting on Gross Merchandise Value (GMV), order volume, category sales distribution, and top-performing vendors.

---

## Technology Stack

### Frontend

- **Core Library**: React 18
- **Build Tool**: Vite
- **Routing**: React Router 7
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **Data Visualization**: Recharts
- **Icons**: Lucide React

### Backend

- **Runtime**: Node.js (v18+)
- **Application Framework**: Express.js
- **Database Modeling (ODM)**: Mongoose 8
- **Authentication**: JSON Web Tokens (jsonwebtoken), bcryptjs
- **Middleware**: CORS, dotenv

### Database and Tooling

- **Database Engine**: MongoDB (Local standalone, replica set, or MongoDB Atlas)
- **Fallback Development Database**: mongodb-memory-server
- **Development Process Monitor**: Nodemon
- **Version Control**: Git

---

## Database Architecture and Advanced MongoDB Features

### 1. Multi-Document ACID Transactions

**File Reference**: `server/controllers/checkoutController.js`

During checkout, an order may contain products sourced from multiple independent vendors. To prevent inconsistent state (such as inventory deduction without order persistence or partial inventory deduction), the checkout workflow executes within a multi-document MongoDB transaction.

The workflow coordinates the following operations:
1. Initializes a client session via `mongoose.startSession()`.
2. Starts an atomic transaction via `session.startTransaction()`.
3. Validates customer identity and queries the customer's cart.
4. Reads each product document within the transactional session to ensure authoritative inventory and pricing data.
5. Verifies stock availability; if stock is insufficient, the transaction aborts.
6. Decrements product inventory and increments units sold atomically.
7. Persists the multi-vendor `Order` document.
8. Flushes the customer's cart.
9. Commits the transaction via `session.commitTransaction()`.

If an error or constraint violation occurs at any stage, `session.abortTransaction()` is invoked, rolling back all modifications.

```javascript
const session = await mongoose.startSession();
session.startTransaction();

try {
  // 1. Fetch authoritative product records within the transaction session
  // 2. Validate current stock levels against requested line item quantities
  // 3. Atomically decrement stock and increment soldCount
  // 4. Create multi-vendor Order document
  // 5. Clear customer Cart document

  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

### 2. Full-Text Search with Relevance Weighting

**File References**: `server/models/Product.js`, `server/controllers/productController.js`

ShopSphere implements a MongoDB text index spanning product titles and detailed descriptions. Field weights assign higher relevance scores to title matches over description matches.

```javascript
// Index Definition in server/models/Product.js
ProductSchema.index(
  {
    name: 'text',
    description: 'text'
  },
  {
    weights: {
      name: 10,
      description: 5
    }
  }
);
```

Search queries evaluate text scores to rank returned results by relevance:

```javascript
// Query Execution in server/controllers/productController.js
const products = await Product.find(
  { $text: { $search: query } },
  { score: { $meta: 'textScore' } }
).sort({ score: { $meta: 'textScore' } });
```

### 3. Compound Index Optimization

**File Reference**: `server/models/Product.js`

Compound indexes are maintained to optimize frequently queried read paths involving filtering and sorting operations, avoiding in-memory sort stages (`SORT_KEY_GENERATOR`) and collection scans (`COLLSCAN`).

1. **Category and Price Index**:
   ```javascript
   ProductSchema.index({ category: 1, price: 1 });
   ```
   Optimizes catalog queries that filter by category and sort by price ascending or descending.

2. **Vendor and Timestamp Index**:
   ```javascript
   ProductSchema.index({ vendor: 1, createdAt: -1 });
   ```
   Optimizes vendor dashboard product queries that retrieve products created by a specific vendor ordered chronologically.

### 4. Time-To-Live (TTL) Automatic Eviction

**File Reference**: `server/models/GuestCart.js`

Unauthenticated visitors interact with a guest cart identified by a client-generated UUID session identifier. Because inactive guest carts should not persist indefinitely, MongoDB native TTL indexing is utilized to automatically purge stale records without application-level scheduled cron jobs.

```javascript
// TTL Index Definition in server/models/GuestCart.js
GuestCartSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 86400 } // Purged after 24 hours
);
```

When a guest user authenticates, the system merges line items from the active guest cart document into the persistent user cart before removing the guest document.

### 5. Aggregation Framework Pipelines

**File Reference**: `server/controllers/analyticsController.js`

Real-time metric calculations are performed inside the database engine using aggregation pipelines.

#### Vendor Monthly Revenue Pipeline

Computes monthly revenue and unit sales for a specific vendor across all completed orders:

```javascript
const monthlyRevenue = await Order.aggregate([
  {
    $unwind: '$items'
  },
  {
    $match: {
      'items.vendor': vendorId,
      'items.status': { $ne: 'Cancelled' }
    }
  },
  {
    $group: {
      _id: {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' }
      },
      revenue: {
        $sum: { $multiply: ['$items.price', '$items.quantity'] }
      },
      totalUnitsSold: {
        $sum: '$items.quantity'
      },
      orderCount: {
        $sum: 1
      }
    }
  },
  {
    $sort: {
      '_id.year': 1,
      '_id.month': 1
    }
  }
]);
```

#### Administrator Platform Performance Pipeline

Calculates marketplace-wide sales volume and cross-references vendor details using `$lookup`:

```javascript
const topVendors = await Order.aggregate([
  {
    $unwind: '$items'
  },
  {
    $match: {
      'items.status': { $ne: 'Cancelled' }
    }
  },
  {
    $group: {
      _id: '$items.vendor',
      totalSalesAmount: {
        $sum: { $multiply: ['$items.price', '$items.quantity'] }
      },
      totalUnitsSold: {
        $sum: '$items.quantity'
      }
    }
  },
  {
    $lookup: {
      from: 'vendors',
      localField: '_id',
      foreignField: '_id',
      as: 'vendorDetails'
    }
  },
  {
    $unwind: '$vendorDetails'
  },
  {
    $project: {
      _id: 1,
      storeName: '$vendorDetails.storeName',
      logo: '$vendorDetails.logo',
      rating: '$vendorDetails.rating',
      totalSalesAmount: 1,
      totalUnitsSold: 1
    }
  },
  {
    $sort: {
      totalSalesAmount: -1
    }
  },
  {
    $limit: 5
  }
]);
```

---

## Authentication and Access Control

Authentication uses stateless JSON Web Tokens (JWT). Passwords are encrypted before database insertion using `bcryptjs` with salted hashing.

The authorization layer enforces Role-Based Access Control (RBAC) through middleware guards (`server/middleware/authMiddleware.js`):
- `protect`: Validates the bearer token in the HTTP `Authorization` header and attaches the user document to `req.user`.
- `authorize(...roles)`: Verifies that `req.user.role` matches one of the permitted roles (`customer`, `vendor`, `admin`).

Protected API endpoints reject unauthorized access with standard HTTP 401 (Unauthorized) or HTTP 403 (Forbidden) response codes.

---

## System Architecture

```text
+-----------------------------------------------------------------------------------+
|                                 CLIENT TIER                                       |
|                                                                                   |
|  React Components   |   Context Providers (Auth, Cart, Wishlist)   |   Axios API  |
+-----------------------------------------------------------------------------------+
                                         |
                                HTTP / REST (JSON)
                                         |
+-----------------------------------------------------------------------------------+
|                               APPLICATION TIER                                    |
|                                                                                   |
|  Express REST Routers                                                             |
|      ├── authRoutes        ├── productRoutes     ├── cartRoutes                   |
|      ├── checkoutRoutes    ├── orderRoutes       ├── vendorRoutes                 |
|      ├── adminRoutes       ├── analyticsRoutes   ├── categoryRoutes               |
|      └── reviewRoutes      └── wishlistRoutes                                     |
|                                                                                   |
|  Middleware: Authentication (JWT) & RBAC Authorization                            |
|  Controllers: Transaction management, business validation, error handling         |
+-----------------------------------------------------------------------------------+
                                         |
                                    Mongoose ODM
                                         |
+-----------------------------------------------------------------------------------+
|                                  DATA TIER                                        |
|                                                                                   |
|  MongoDB Collections & Native Engine Capabilities:                                |
|      ├── users             ├── products (Text & Compound Indexes)                 |
|      ├── vendors           ├── categories                                         |
|      ├── orders            ├── reviews                                            |
|      ├── carts             ├── guestcarts (TTL Index - 24hr expiry)               |
|      └── wishlists                                                                |
|                                                                                   |
|  Engine Functions: Multi-Document ACID Transactions, Aggregation Pipelines        |
+-----------------------------------------------------------------------------------+
```

---

## Project Directory Structure

```text
ShopSphere/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CategoryCard.jsx
│   │   │   ├── FilterSidebar.jsx
│   │   │   ├── Footer.jsx
│   │   │   ├── Navbar.jsx
│   │   │   ├── ProductCard.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── RatingStars.jsx
│   │   │   ├── SearchBar.jsx
│   │   │   └── SkeletonLoader.jsx
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   ├── CartContext.jsx
│   │   │   └── WishlistContext.jsx
│   │   ├── pages/
│   │   │   ├── AdminDashboardPage.jsx
│   │   │   ├── CartPage.jsx
│   │   │   ├── CheckoutPage.jsx
│   │   │   ├── CustomerDashboardPage.jsx
│   │   │   ├── HomePage.jsx
│   │   │   ├── LoginPage.jsx
│   │   │   ├── ProductDetailPage.jsx
│   │   │   ├── ProductDiscoveryPage.jsx
│   │   │   ├── RegisterPage.jsx
│   │   │   ├── VendorDashboardPage.jsx
│   │   │   ├── VendorStorefrontPage.jsx
│   │   │   └── WishlistPage.jsx
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── server/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   ├── adminController.js
│   │   ├── analyticsController.js
│   │   ├── authController.js
│   │   ├── cartController.js
│   │   ├── categoryController.js
│   │   ├── checkoutController.js
│   │   ├── orderController.js
│   │   ├── productController.js
│   │   ├── reviewController.js
│   │   ├── vendorController.js
│   │   └── wishlistController.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── errorHandler.js
│   ├── models/
│   │   ├── Cart.js
│   │   ├── Category.js
│   │   ├── GuestCart.js
│   │   ├── Order.js
│   │   ├── Product.js
│   │   ├── Review.js
│   │   ├── User.js
│   │   ├── Vendor.js
│   │   └── Wishlist.js
│   ├── routes/
│   │   ├── adminRoutes.js
│   │   ├── analyticsRoutes.js
│   │   ├── authRoutes.js
│   │   ├── cartRoutes.js
│   │   ├── categoryRoutes.js
│   │   ├── checkoutRoutes.js
│   │   ├── orderRoutes.js
│   │   ├── productRoutes.js
│   │   ├── reviewRoutes.js
│   │   ├── vendorRoutes.js
│   │   └── wishlistRoutes.js
│   ├── utils/
│   │   └── generateToken.js
│   ├── package.json
│   ├── seed.js
│   └── server.js
├── .gitignore
└── README.md
```

---

## Database Models and Relationships

| Model | Primary Fields | Key Relationships | Operational Function |
| :--- | :--- | :--- | :--- |
| `User` | `name`, `email`, `password`, `role`, `addresses` | Referenced by `Vendor`, `Cart`, `Wishlist`, `Order` | Core user identity and role assignment (`customer`, `vendor`, `admin`). |
| `Vendor` | `storeName`, `storeSlug`, `description`, `status`, `rating` | `user` (`User` reference) | Merchant profile, approval status, and store configuration. |
| `Category` | `name`, `slug`, `icon`, `image`, `description` | Referenced by `Product` | Taxonomy and product grouping. |
| `Product` | `name`, `description`, `price`, `stock`, `soldCount` | `category` (`Category`), `vendor` (`Vendor`) | Inventory items with full-text and compound search indexes. |
| `Cart` | `user`, `items: [{ product, vendor, quantity, price }]` | `user`, `Product`, `Vendor` | Persistent shopping basket for registered customers. |
| `GuestCart` | `sessionId`, `items: [{ product, vendor, quantity }]` | `Product`, `Vendor` | Ephemeral cart with TTL index (24-hour lifetime). |
| `Wishlist` | `user`, `products: [Product]` | `user`, `Product` | Saved products for customer accounts. |
| `Order` | `customer`, `items`, `shippingAddress`, `totalAmount` | `customer` (`User`), `Product`, `Vendor` | Multi-vendor order containing per-item vendor tracking. |
| `Review` | `user`, `product`, `rating`, `comment` | `user`, `Product` | Verified customer reviews and ratings. |

---

## Pre-Configured Demonstration Accounts

Running the database seed script generates the following test accounts:

| Role | Email | Password | Description |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@shopsphere.com` | `adminpassword123` | Full access to moderation, category management, and platform analytics. |
| **Vendor** | `nexus@vendors.com` | `password123` | Store: *Nexus Tech Lab* (Electronics and peripherals). |
| **Vendor** | `urban@vendors.com` | `password123` | Store: *Urban Luxe Apparel* (Clothing and accessories). |
| **Vendor** | `aura@vendors.com` | `password123` | Store: *Aura Living & Decor* (Home goods and furniture). |
| **Vendor** | `botanica@vendors.com` | `password123` | Store: *Botanica Plant Co.* (Indoor plants and gardening). |
| **Vendor** | `glow@vendors.com` | `password123` | Store: *Glow Botanical Beauty* (Skincare and cosmetics). |
| **Customer** | `alex@gmail.com` | `password123` | Sample customer account with populated shipping address and order history. |
| **Customer** | `sophia@gmail.com` | `password123` | Additional customer account for testing reviews and checkout. |

---

## RESTful API Specification

### Authentication

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register a standard customer account. |
| `POST` | `/api/auth/register-vendor` | Public | Register a vendor account along with initial store profile. |
| `POST` | `/api/auth/login` | Public | Authenticate credentials and return a signed JWT. |

### Products

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | Public | Retrieve catalog with text search, compound filtering, pagination, and sorting. |
| `GET` | `/api/products/:id` | Public | Retrieve detailed product record including vendor metadata. |
| `POST` | `/api/products` | Vendor / Admin | Create a new product listing. |
| `PUT` | `/api/products/:id` | Vendor / Admin | Modify an existing product listing. |
| `DELETE` | `/api/products/:id` | Vendor / Admin | Remove a product listing from the marketplace. |

### Cart Management

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/cart` | Public / Guest | Fetch current user or guest cart. |
| `POST` | `/api/cart/add` | Public / Guest | Add product item to cart. |
| `PUT` | `/api/cart/update` | Public / Guest | Modify quantity for an existing cart item. |
| `DELETE` | `/api/cart/remove/:productId` | Public / Guest | Remove item from cart. |
| `POST` | `/api/cart/sync` | Customer | Merge guest session items into user cart on login. |

### Checkout

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/checkout` | Customer | Process multi-vendor order execution using an ACID transaction. |

### Orders

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/orders/my-orders` | Customer | Retrieve customer order history with item statuses. |
| `GET` | `/api/orders/:id` | Customer / Vendor / Admin | Retrieve individual order breakdown. |
| `GET` | `/api/vendors/orders` | Vendor | Fetch orders containing items sold by the authenticated vendor. |
| `PUT` | `/api/vendors/orders/:id/items/:itemId/status` | Vendor | Update individual order item status (`Processing`, `Shipped`, `Delivered`). |

### Analytics

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/analytics/vendor` | Vendor | Compute vendor-specific monthly revenue and top-selling products. |
| `GET` | `/api/analytics/admin` | Admin | Compute platform-wide GMV, vendor volume, and category distribution. |

### Administration and Vendors

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/vendors` | Admin | List all registered vendors and approval statuses. |
| `PUT` | `/api/admin/vendors/:id/status` | Admin | Approve or reject vendor merchant profile. |
| `GET` | `/api/admin/users` | Admin | List all registered marketplace users. |
| `PUT` | `/api/admin/users/:id/status` | Admin | Suspend or restore user account access. |
| `GET` | `/api/vendors/store/:slug` | Public | Fetch public vendor storefront information and products. |

---

## Installation and Setup

### Prerequisites

Ensure the following runtimes and tools are installed:
- **Node.js**: version 18.0.0 or higher
- **npm**: version 9.0.0 or higher
- **MongoDB**: Local MongoDB instance (v6.0+) or connection URI to MongoDB Atlas
- **Git**: Distributed version control system

### Clone Repository

```bash
git clone https://github.com/Dhee5021raj/Shopsphere.git
cd Shopsphere
```

### Backend Configuration

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install backend dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables. Create a `.env` file inside the `server/` directory:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017/shopsphere
   JWT_SECRET=shopsphere_super_secret_jwt_key_2026
   ```

### Database Seeding

Populate the database with demo users, vendors, product categories, sample inventory, and past orders:

```bash
npm run seed
```

*Note: If local MongoDB is offline or unavailable, the seed and server scripts automatically initiate an in-memory database instance (`mongodb-memory-server`) for zero-configuration testing.*

Start the backend API server:

```bash
npm run dev
```

The server binds to port `5000` (accessible at `http://localhost:5000`).

### Frontend Configuration

1. Open a new terminal window and navigate to the client directory:
   ```bash
   cd client
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Launch the Vite development server:
   ```bash
   npm run dev
   ```

The client application will start at `http://localhost:3000` with automated API proxying to `http://localhost:5000`.

---

## Environment Variables

The backend application recognizes the following configuration parameters:

| Variable | Required | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | Optional | `5000` | Port on which the Express application listens. |
| `MONGODB_URI` | Required | `mongodb://127.0.0.1:27017/shopsphere` | Connection URI for the MongoDB instance or replica set. |
| `JWT_SECRET` | Required | `default_secret_key` | Cryptographic secret used for signing and verifying JSON Web Tokens. |

---

## Project Scripts

### Server Scripts (`server/package.json`)

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `nodemon server.js` | Runs the API server with auto-restart on code changes. |
| `npm start` | `node server.js` | Starts the production server process. |
| `npm run seed` | `node seed.js` | Resets collections and seeds sample data. |

### Client Scripts (`client/package.json`)

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `npm run dev` | `vite` | Starts the local Vite development server. |
| `npm run build` | `vite build` | Compiles and bundles production static assets. |
| `npm run preview` | `vite preview` | Previews the production build locally. |

---

## Project Objectives

ShopSphere was developed to demonstrate full-stack software architecture principles and database engineering competencies:

- **Relational Data Modeling in NoSQL**: Representing one-to-many, many-to-many, and embedded subdocument relationships within a document-oriented database.
- **Data Integrity and Consistency**: Ensuring non-negative inventory balances and guaranteed checkout completion through multi-document ACID transactions.
- **Index Optimization**: Implementing text search indexing with weighting and compound indexing to optimize catalog query latency.
- **Automated Lifecycle Management**: Using TTL collections to manage temporal guest data without background daemon processes.
- **Analytical Processing**: Utilizing native aggregation framework pipelines to compute multi-dimensional metrics without offloading processing to the application tier.
- **Security & RBAC**: Enforcing cryptographic password storage and role-based access control across multiple client personas.

---

## Future Scope

- **Payment Gateway Integration**: Direct integration with payment processing providers (e.g., Stripe, PayPal, Razorpay) with webhook verification.
- **Cloud Object Storage**: S3-compatible cloud storage integration for vendor image uploads and CDN distribution.
- **Asynchronous Notifications**: Automated transactional emails and push notifications for order status transitions.
- **Caching Layer**: In-memory Redis caching for top catalog categories and frequently viewed products.
- **Containerization and Orchestration**: Docker and Docker Compose configuration for unified service deployment.

---

## mongo-pt — predicate-transfer benchmark (separate database)

This repo also contains **mongo-pt**, a predicate-transfer engine for MongoDB based on
"Debunking the Myth of Join Ordering: Toward Robust SQL Analytics" (SIGMOD 2025,
arXiv:2502.15181). It lives entirely under `server/pt/`, `server/scripts/`, and
`server/benchmarks/`, and works in a **separate database** (`shopsphere_bench`) so the
demo app is never touched.

### Real mongod only

The benchmark requires a **real, disk-backed `mongod`**. `mongodb-memory-server` is present
as a dev dependency but is used **only at `npm install` time to download the mongod
binary** — the library is never used at runtime, and `server/pt/benchDb.js` refuses any URI
whose database is not `shopsphere_bench`.

Start the bundled real server (default port 27018, data in `server/.mongo-bench-data/`):

```bash
cd server
npm run mongod            # launches the real mongod binary directly
npm run seed:bench -- --small --drop     # tiny dataset (tests/dev)
npm run test:pt           # Step 8 tests (acyclicity, schedule shape, naive==reduced)
npm run repro             # seed (default scale) + Step 4 + report
```

**Shadow logging (off by default):** set `PT_SHADOW=1` and a matching mongo-pt
run is measured in a detached process after an analytics endpoint responds — the
request is never delayed. `GET /api/admin/pt-log` (admin only) returns the last
100 records, shown at the React route `/admin/pt-log` with speedup and transfer
overhead. See `docs/predicate-transfer.md` for the log format.

Point `BENCH_URI` at your own instance if you prefer. See `docs/pt-design.md`,
`docs/er-and-schema.md`, `docs/predicate-transfer.md`, and `docs/results.md`.

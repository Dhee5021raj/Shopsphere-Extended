const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { validateJwtConfig } = require('./config/jwt');
const errorHandler = require('./middleware/errorHandler');

dotenv.config();

// Validate required security configuration at startup
validateJwtConfig();

// Connect to MongoDB Database
connectDB();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Welcome Route
app.get('/api', (req, res) => {
  res.json({
    message: 'Welcome to ShopSphere Multi-Vendor Marketplace API',
    status: 'Active',
    features: ['ACID Transactions', 'Text Indexing', 'Compound Indexing', 'TTL Indexing', 'Aggregation Analytics']
  });
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/vendors', require('./routes/vendorRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/checkout', require('./routes/checkoutRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[ShopSphere Server] Running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

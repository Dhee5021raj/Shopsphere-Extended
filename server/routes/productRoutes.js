const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  getFeaturedProducts,
  getTrendingProducts,
  getRelatedProducts,
  createProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');
const { protect, authorizeRoles, authorizeVendor } = require('../middleware/authMiddleware');
const ptShadow = require('../middleware/ptShadow');

// ptShadow fires only on real searches/category browses (see requireQuery) and
// never blocks the response.
router.get('/', ptShadow, getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/trending', getTrendingProducts);
router.get('/:id', getProductById);
router.get('/:id/related', getRelatedProducts);

router.post('/', protect, authorizeRoles('vendor', 'admin'), authorizeVendor, createProduct);
router.put('/:id', protect, authorizeRoles('vendor', 'admin'), authorizeVendor, updateProduct);
router.delete('/:id', protect, authorizeRoles('vendor', 'admin'), authorizeVendor, deleteProduct);

module.exports = router;

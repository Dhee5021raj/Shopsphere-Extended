const Cart = require('../models/Cart');
const GuestCart = require('../models/GuestCart');
const Product = require('../models/Product');
const { purgeOrphanedCartItems, populateCartItems } = require('../services/cartService');

// @desc    Get user or guest cart
// @route   GET /api/cart
const getCart = async (req, res) => {
  try {
    if (req.user) {
      let cart = await Cart.findOne({ user: req.user._id });
      if (!cart) {
        cart = await Cart.create({ user: req.user._id, items: [] });
      }
      await purgeOrphanedCartItems(cart, false);
      const cartData = await populateCartItems(cart.items);
      return res.json(cartData);
    } else {
      const sessionId = req.headers['x-session-id'];
      if (!sessionId) {
        return res.json({ items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 });
      }
      let guestCart = await GuestCart.findOne({ sessionId });
      if (!guestCart) {
        guestCart = await GuestCart.create({ sessionId, items: [] });
      }
      await purgeOrphanedCartItems(guestCart, true);
      const cartData = await populateCartItems(guestCart.items);
      return res.json(cartData);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Add item to cart
// @route   POST /api/cart/add
const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.stock < 1) {
      return res.status(400).json({ message: 'Product is currently out of stock' });
    }

    const price = product.discountPrice > 0 ? product.discountPrice : product.price;

    if (req.user) {
      let cart = await Cart.findOne({ user: req.user._id });
      if (!cart) {
        cart = await Cart.create({ user: req.user._id, items: [] });
      }
      await purgeOrphanedCartItems(cart, false);

      const existingIndex = cart.items.findIndex(
        (i) => i.product.toString() === productId
      );

      if (existingIndex > -1) {
        const newQty = cart.items[existingIndex].quantity + Number(quantity);
        if (newQty > product.stock) {
          return res.status(400).json({ message: `Cannot exceed available stock (${product.stock} units)` });
        }
        cart.items[existingIndex].quantity = newQty;
      } else {
        if (Number(quantity) > product.stock) {
          return res.status(400).json({ message: `Cannot exceed available stock (${product.stock} units)` });
        }
        cart.items.push({
          product: product._id,
          vendor: product.vendor,
          quantity: Number(quantity),
          priceAtAdd: price
        });
      }

      await cart.save();
      const updated = await populateCartItems(cart.items);
      return res.json(updated);
    } else {
      const sessionId = req.headers['x-session-id'];
      if (!sessionId) {
        return res.status(400).json({ message: 'Session ID header (x-session-id) required for guest cart' });
      }

      let guestCart = await GuestCart.findOne({ sessionId });
      if (!guestCart) {
        guestCart = await GuestCart.create({ sessionId, items: [] });
      }
      await purgeOrphanedCartItems(guestCart, true);

      const existingIndex = guestCart.items.findIndex(
        (i) => i.product.toString() === productId
      );

      if (existingIndex > -1) {
        const newQty = guestCart.items[existingIndex].quantity + Number(quantity);
        if (newQty > product.stock) {
          return res.status(400).json({ message: `Cannot exceed available stock (${product.stock} units)` });
        }
        guestCart.items[existingIndex].quantity = newQty;
      } else {
        if (Number(quantity) > product.stock) {
          return res.status(400).json({ message: `Cannot exceed available stock (${product.stock} units)` });
        }
        guestCart.items.push({
          product: product._id,
          vendor: product.vendor,
          quantity: Number(quantity),
          priceAtAdd: price
        });
      }

      await guestCart.save();
      const updated = await populateCartItems(guestCart.items);
      return res.json(updated);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update item quantity
// @route   PUT /api/cart/update
const updateCartItem = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const qty = Number(quantity);

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (qty > product.stock) {
      return res.status(400).json({ message: `Maximum available stock is ${product.stock}` });
    }

    if (req.user) {
      const cart = await Cart.findOne({ user: req.user._id });
      if (!cart) return res.status(404).json({ message: 'Cart not found' });
      await purgeOrphanedCartItems(cart, false);

      if (qty <= 0) {
        cart.items = cart.items.filter((i) => i.product.toString() !== productId);
      } else {
        const item = cart.items.find((i) => i.product.toString() === productId);
        if (item) item.quantity = qty;
      }

      await cart.save();
      const updated = await populateCartItems(cart.items);
      return res.json(updated);
    } else {
      const sessionId = req.headers['x-session-id'];
      const guestCart = await GuestCart.findOne({ sessionId });
      if (!guestCart) return res.status(404).json({ message: 'Guest cart not found' });
      await purgeOrphanedCartItems(guestCart, true);

      if (qty <= 0) {
        guestCart.items = guestCart.items.filter((i) => i.product.toString() !== productId);
      } else {
        const item = guestCart.items.find((i) => i.product.toString() === productId);
        if (item) item.quantity = qty;
      }

      await guestCart.save();
      const updated = await populateCartItems(guestCart.items);
      return res.json(updated);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Remove item from cart
// @route   DELETE /api/cart/item/:productId
const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;

    if (req.user) {
      const cart = await Cart.findOne({ user: req.user._id });
      if (cart) {
        await purgeOrphanedCartItems(cart, false);
        cart.items = cart.items.filter((i) => i.product.toString() !== productId);
        await cart.save();
        const updated = await populateCartItems(cart.items);
        return res.json(updated);
      }
    } else {
      const sessionId = req.headers['x-session-id'];
      const guestCart = await GuestCart.findOne({ sessionId });
      if (guestCart) {
        await purgeOrphanedCartItems(guestCart, true);
        guestCart.items = guestCart.items.filter((i) => i.product.toString() !== productId);
        await guestCart.save();
        const updated = await populateCartItems(guestCart.items);
        return res.json(updated);
      }
    }
    res.json({ items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Sync guest cart into logged-in user cart
// @route   POST /api/cart/sync
const syncGuestCart = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId || !req.user) {
      return res.status(400).json({ message: 'Session ID and User context required' });
    }

    const guestCart = await GuestCart.findOne({ sessionId });
    let userCart = await Cart.findOne({ user: req.user._id });
    if (!userCart) {
      userCart = await Cart.create({ user: req.user._id, items: [] });
    }

    await purgeOrphanedCartItems(userCart, false);

    if (!guestCart || guestCart.items.length === 0) {
      const updated = await populateCartItems(userCart ? userCart.items : []);
      return res.json(updated);
    }

    await purgeOrphanedCartItems(guestCart, true);

    // Look up stock for all items being merged in a single batched query
    const allProdIds = guestCart.items.map((i) => i.product);
    const products = await Product.find({ _id: { $in: allProdIds } }).select('_id stock');
    const stockMap = new Map();
    for (const p of products) {
      stockMap.set(p._id.toString(), p.stock);
    }

    for (const gItem of guestCart.items) {
      const prodIdStr = gItem.product.toString();
      const availableStock = stockMap.has(prodIdStr) ? stockMap.get(prodIdStr) : Infinity;

      const existingIndex = userCart.items.findIndex(
        (i) => i.product.toString() === prodIdStr
      );

      if (existingIndex > -1) {
        const mergedQty = userCart.items[existingIndex].quantity + gItem.quantity;
        userCart.items[existingIndex].quantity = Math.min(mergedQty, availableStock);
      } else {
        userCart.items.push({
          product: gItem.product,
          vendor: gItem.vendor,
          quantity: Math.min(gItem.quantity, availableStock),
          priceAtAdd: gItem.priceAtAdd
        });
      }
    }

    await userCart.save();
    // Delete guest cart after sync
    await GuestCart.findOneAndDelete({ sessionId });

    const updated = await populateCartItems(userCart.items);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  syncGuestCart
};

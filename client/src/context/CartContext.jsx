import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const { user } = useAuth();
  const [cart, setCart] = useState({ items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 });
  const [loading, setLoading] = useState(false);

  const fetchCart = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/cart');
      setCart(data);
    } catch (error) {
      console.error('Error fetching cart:', error);
    } finally {
      setLoading(false);
    }
  };

  // Coordinated Cart Initialization:
  // Merges guest cart upon login before displaying authenticated cart.
  // Replaces the competing separate useEffect hooks to eliminate race conditions.
  useEffect(() => {
    let isCancelled = false;

    const initializeCart = async () => {
      setLoading(true);
      try {
        if (user) {
          const guestSession = localStorage.getItem('shopsphere_guest_session');
          if (guestSession) {
            try {
              // 1. Synchronize guest cart into authenticated user cart
              const { data } = await api.post('/cart/sync', { sessionId: guestSession });
              if (!isCancelled) {
                setCart(data);
                // 2. Clear guest session ONLY after successful synchronization
                localStorage.removeItem('shopsphere_guest_session');
              }
              return; // Sync returns the fully populated updated cart; no separate fetch needed
            } catch (syncErr) {
              console.error('Error syncing guest cart:', syncErr);
              // Preserve guest session on error so cart contents are not lost and can be retried
            }
          }
        }

        // 3. If no guest session or if sync encountered an error, fetch authenticated/guest cart directly
        const { data } = await api.get('/cart');
        if (!isCancelled) {
          setCart(data);
        }
      } catch (error) {
        console.error('Error fetching cart:', error);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    initializeCart();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  const addToCart = async (productId, quantity = 1) => {
    const { data } = await api.post('/cart/add', { productId, quantity });
    setCart(data);
    return data;
  };

  const updateQuantity = async (productId, quantity) => {
    const { data } = await api.put('/cart/update', { productId, quantity });
    setCart(data);
    return data;
  };

  const removeFromCart = async (productId) => {
    const { data } = await api.delete(`/cart/item/${productId}`);
    setCart(data);
    return data;
  };

  const processCheckout = async (shippingAddress, paymentMethod) => {
    const { data } = await api.post('/checkout', { shippingAddress, paymentMethod });
    await fetchCart(); // Reset cart after successful transaction
    return data;
  };

  const totalItemCount = cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        loading,
        fetchCart,
        addToCart,
        updateQuantity,
        removeFromCart,
        processCheckout,
        totalItemCount
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);

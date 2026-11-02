import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const WishlistContext = createContext();

export const WishlistProvider = ({ children }) => {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchWishlist = async () => {
    if (!user) {
      setWishlist([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/wishlist');
      setWishlist(data || []);
    } catch (error) {
      console.error('Error fetching wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, [user]);

  const toggleWishlist = async (productId) => {
    if (!user) return false;
    const exists = wishlist.some((p) => (p._id || p) === productId);

    try {
      if (exists) {
        const { data } = await api.delete(`/wishlist/item/${productId}`);
        setWishlist(data);
      } else {
        const { data } = await api.post('/wishlist/add', { productId });
        setWishlist(data);
      }
      return true;
    } catch (error) {
      console.error('Error updating wishlist:', error);
      return false;
    }
  };

  const isInWishlist = (productId) => {
    return wishlist.some((p) => (p._id || p) === productId);
  };

  return (
    <WishlistContext.Provider
      value={{
        wishlist,
        loading,
        toggleWishlist,
        isInWishlist,
        fetchWishlist
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
};

export const useWishlist = () => useContext(WishlistContext);

import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      const token = localStorage.getItem('shopsphere_token');
      if (token) {
        try {
          const { data } = await api.get('/auth/me');
          setUser(data);
        } catch (error) {
          console.error('Failed to load user session:', error);
          localStorage.removeItem('shopsphere_token');
        }
      }
      setLoading(false);
    };
    loadUser();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('shopsphere_token', data.token);
    setUser(data);
    return data;
  };

  const registerCustomer = async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('shopsphere_token', data.token);
    setUser(data);
    return data;
  };

  const registerVendor = async (name, email, password, storeName, description) => {
    const { data } = await api.post('/auth/register-vendor', {
      name,
      email,
      password,
      storeName,
      description
    });
    localStorage.setItem('shopsphere_token', data.token);
    setUser(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('shopsphere_token');
    setUser(null);
  };

  const updateProfile = async (formData) => {
    const { data } = await api.put('/auth/profile', formData);
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        registerCustomer,
        registerVendor,
        logout,
        updateProfile,
        isAuthenticated: !!user,
        isVendor: user?.role === 'vendor',
        isAdmin: user?.role === 'admin'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

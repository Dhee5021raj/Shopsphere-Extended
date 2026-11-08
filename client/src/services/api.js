import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor to attach Auth Token and Guest Session ID
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('shopsphere_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      let sessionId = localStorage.getItem('shopsphere_guest_session');
      if (!sessionId) {
        sessionId = `guest_${Math.random().toString(36).substring(2)}_${Date.now()}`;
        localStorage.setItem('shopsphere_guest_session', sessionId);
      }
      config.headers['x-session-id'] = sessionId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token invalidation and auth resilience
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || '';
      // Only clear token if this 401 was not from an explicit login or registration attempt
      if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
        localStorage.removeItem('shopsphere_token');
      }
    }
    return Promise.reject(error);
  }
);

export default api;

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

export default api;

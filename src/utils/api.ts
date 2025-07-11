import axios from 'axios';

// Create axios instance with common base URL from environment variables
const api = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL || '/.netlify/functions',
  timeout: parseInt(process.env.REACT_APP_API_TIMEOUT || '10000', 10),
  withCredentials: true, // This is required to send cookies with cross-origin requests
  headers: {
    'Content-Type': 'application/json',
  },
});

// Optional: Add request interceptor for common behavior
api.interceptors.request.use(
  (config) => {
    // Get token from local storage
    const token = localStorage.getItem('sessionToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Optional: Add response interceptor for common error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // You can add common error handling here
    return Promise.reject(error);
  }
);

export default api; 
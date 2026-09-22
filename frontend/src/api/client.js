import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('pp_token');
      localStorage.removeItem('pp_user');
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/setup')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

export const getError = (err) =>
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  (Array.isArray(err?.response?.data?.errors) && err.response.data.errors[0]) ||
  err?.message ||
  'Something went wrong';

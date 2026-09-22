import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { getError } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState([]);

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem('pp_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
      // Admin has all permissions implicitly on backend
      if (data.role === 'ADMIN') {
        setPermissions(['*']);
      } else if (data.id) {
        try {
          const permRes = await api.get(`/users/${data.id}/permissions`);
          setPermissions(permRes.data.permissions || []);
        } catch {
          setPermissions([]);
        }
      }
    } catch {
      localStorage.removeItem('pp_token');
      localStorage.removeItem('pp_user');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('pp_token', data.token);
    if (data.user) localStorage.setItem('pp_user', JSON.stringify(data.user));
    setUser(data.user || data);
    await loadMe();
    return data;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    localStorage.removeItem('pp_token');
    localStorage.removeItem('pp_user');
    setUser(null);
    setPermissions([]);
  };

  const hasPermission = (code) => {
    if (!user) return false;
    if (user.role === 'ADMIN' || permissions.includes('*')) return true;
    return permissions.includes(code);
  };

  const hasRole = (...roles) => user && roles.includes(user.role);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        permissions,
        login,
        logout,
        loadMe,
        hasPermission,
        hasRole,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

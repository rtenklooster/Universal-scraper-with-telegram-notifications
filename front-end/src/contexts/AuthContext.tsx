import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface User {
  id: number;
  username: string;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null
});

// API basis URL configuratie
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://10.0.1.181:3001';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = window.location.pathname.split('/')[1];
        if (!token) {
          setError('No authentication token provided');
          setLoading(false);
          return;
        }

        // Configureer axios met de basis URL
        axios.defaults.baseURL = API_BASE_URL;

        // Setup axios interceptor for all requests
        axios.interceptors.request.use(config => {
          if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
          }
          return config;
        });

        const response = await axios.get(`/api/auth/${token}`);
        setUser(response.data.user);

      } catch (error) {
        console.error('Authentication error:', error);
        setError('Authentication failed');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
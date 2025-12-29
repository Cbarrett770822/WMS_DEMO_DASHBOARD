import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';

interface User {
  _id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  appPermissions?: any;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('dashboardToken');
    const storedUser = localStorage.getItem('dashboardUser');
    
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('dashboardToken');
        localStorage.removeItem('dashboardUser');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post('/.netlify/functions/auth-login', {
        email,
        password
      });

      const { user: userData, token } = response.data;

      // Check if user has access to Dashboard Generator
      if (!userData.appPermissions?.dashboardGenerator?.enabled) {
        throw new Error('Access denied to Dashboard Generator application');
      }

      localStorage.setItem('dashboardToken', token);
      localStorage.setItem('dashboardUser', JSON.stringify(userData));
      
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error: any) {
      console.error('Login error:', error);
      throw new Error(error.response?.data?.message || error.message || 'Login failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('dashboardToken');
    localStorage.removeItem('dashboardUser');
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

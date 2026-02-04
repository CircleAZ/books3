import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import ProductList from './pages/inventory/ProductList';
import AddProduct from './pages/inventory/AddProduct';
import Customers from './pages/Customers';
import Orders from './pages/Orders';
import NewOrder from './pages/NewOrder';
import Login from './pages/Login';
import Profile from './pages/Profile';
import './index.css';

// Protected Route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner-large"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

// Generic placeholder for pages not yet implemented
function PlaceholderPage({ title, phase }) {
  return (
    <div className="page-placeholder">
      <h2>{title}</h2>
      <div className="placeholder-card">
        <p>Coming in {phase}</p>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />

      {/* Protected routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <MainLayout><Dashboard /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/inventory" element={
        <ProtectedRoute>
          <MainLayout><ProductList /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/inventory/add" element={
        <ProtectedRoute>
          <MainLayout><AddProduct /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers" element={
        <ProtectedRoute>
          <MainLayout><Customers /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/orders" element={
        <ProtectedRoute>
          <MainLayout><Orders /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/orders/new" element={
        <ProtectedRoute>
          <MainLayout><NewOrder /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/account/profile" element={
        <ProtectedRoute>
          <MainLayout><Profile /></MainLayout>
        </ProtectedRoute>
      } />

      {/* Other protected routes with placeholders */}
      <Route path="/inventory/*" element={
        <ProtectedRoute>
          <MainLayout><PlaceholderPage title="Inventory" phase="Phase 5" /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers/*" element={
        <ProtectedRoute>
          <MainLayout><PlaceholderPage title="Customers" phase="Phase 7" /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/orders/*" element={
        <ProtectedRoute>
          <MainLayout><PlaceholderPage title="Orders" phase="Phase 9" /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/reports/*" element={
        <ProtectedRoute>
          <MainLayout><PlaceholderPage title="Reports" phase="Phase 12" /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/*" element={
        <ProtectedRoute>
          <MainLayout><PlaceholderPage title="Settings" phase="Phase 14" /></MainLayout>
        </ProtectedRoute>
      } />

      {/* 404 */}
      <Route path="*" element={
        <MainLayout><PlaceholderPage title="Page Not Found" phase="a future update" /></MainLayout>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

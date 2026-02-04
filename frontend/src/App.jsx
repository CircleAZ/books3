import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Customers from './pages/Customers';
import Orders from './pages/Orders';
import NewOrder from './pages/NewOrder';
import './index.css';

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

export default function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          {/* Main pages */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<NewOrder />} />

          {/* Inventory sub-routes */}
          <Route path="/inventory/add" element={<PlaceholderPage title="Add New Product" phase="Phase 5" />} />
          <Route path="/inventory/categories" element={<PlaceholderPage title="Manage Categories" phase="Phase 5" />} />
          <Route path="/inventory/vendors" element={<PlaceholderPage title="Manage Vendors" phase="Phase 5" />} />
          <Route path="/inventory/stock" element={<PlaceholderPage title="Stock Adjustments" phase="Phase 6" />} />
          <Route path="/inventory/deleted" element={<PlaceholderPage title="Deleted Products" phase="Phase 6" />} />

          {/* Customer sub-routes */}
          <Route path="/customers/add" element={<PlaceholderPage title="Add New Customer" phase="Phase 7" />} />
          <Route path="/customers/settings" element={<PlaceholderPage title="Customer Settings" phase="Phase 8" />} />

          {/* Order sub-routes */}
          <Route path="/orders/returns" element={<PlaceholderPage title="Returns & Refunds" phase="Phase 11" />} />

          {/* Reports */}
          <Route path="/reports" element={<PlaceholderPage title="Reports & Analytics" phase="Phase 12" />} />
          <Route path="/reports/sales" element={<PlaceholderPage title="Sales Reports" phase="Phase 12" />} />
          <Route path="/reports/inventory" element={<PlaceholderPage title="Inventory Reports" phase="Phase 12" />} />
          <Route path="/reports/customers" element={<PlaceholderPage title="Customer Reports" phase="Phase 12" />} />
          <Route path="/reports/profit-loss" element={<PlaceholderPage title="Profit & Loss" phase="Phase 12" />} />
          <Route path="/reports/export" element={<PlaceholderPage title="Export Data" phase="Phase 12" />} />

          {/* Settings */}
          <Route path="/settings" element={<PlaceholderPage title="Settings" phase="Phase 14" />} />
          <Route path="/settings/store" element={<PlaceholderPage title="Store Details" phase="Phase 14" />} />
          <Route path="/settings/users" element={<PlaceholderPage title="User Management" phase="Phase 14" />} />
          <Route path="/settings/payments" element={<PlaceholderPage title="Payment Methods" phase="Phase 14" />} />
          <Route path="/settings/receipts" element={<PlaceholderPage title="Receipt Customization" phase="Phase 14" />} />
          <Route path="/settings/notifications" element={<PlaceholderPage title="Notifications" phase="Phase 14" />} />
          <Route path="/settings/integrations" element={<PlaceholderPage title="Integrations" phase="Phase 14" />} />
          <Route path="/settings/data" element={<PlaceholderPage title="Data Management" phase="Phase 14" />} />

          {/* Account */}
          <Route path="/account/profile" element={<PlaceholderPage title="My Profile" phase="Phase 3" />} />

          {/* 404 */}
          <Route path="*" element={<PlaceholderPage title="Page Not Found" phase="a future update" />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}

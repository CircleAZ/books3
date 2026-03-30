import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import ProductList from './pages/inventory/ProductList';
import AddProduct from './pages/inventory/AddProduct';
import EditProduct from './pages/inventory/EditProduct';
import ProductDetails from './pages/inventory/ProductDetails';
import Categories from './pages/inventory/Categories';
import Vendors from './pages/inventory/Vendors';
import StockControl from './pages/inventory/StockControl';
import DeletedProducts from './pages/inventory/DeletedProducts';
import ProductSets from './pages/inventory/ProductSets';
import CustomerList from './pages/customers/CustomerList';
import AddCustomer from './pages/customers/AddCustomer';
import CustomerDetails from './pages/customers/CustomerDetails';
import CustomerMap from './pages/customers/CustomerMap';
import CoverageList from './pages/customers/CoverageList';
import SeasonReport from './pages/customers/SeasonReport';
import CustomerSettings from './pages/settings/CustomerSettings';
import SettingsIndex from './pages/settings/SettingsIndex';
import StoreSettings from './pages/settings/StoreSettings';
import EmployeeManagement from './pages/settings/EmployeeManagement';
import RolesPermissions from './pages/settings/RolesPermissions';
import FinancialSettings from './pages/settings/FinancialSettings';
import DataManagement from './pages/settings/DataManagement';
import SystemInfo from './pages/settings/SystemInfo';
import ReceiptSettings from './pages/settings/ReceiptSettings';
import PaymentSettings from './pages/settings/PaymentSettings';
import NotificationSettings from './pages/settings/NotificationSettings';
import IntegrationSettings from './pages/settings/IntegrationSettings';
import OrderList from './pages/orders/OrderList';
import OrderDetails from './pages/orders/OrderDetails';
import NewOrder from './pages/orders/NewOrder';
import EditOrder from './pages/orders/EditOrder';
import OrderReceipt from './pages/orders/OrderReceipt';
import ReturnsList from './pages/returns/ReturnsList';
import InitiateReturn from './pages/returns/InitiateReturn';
import ReturnDetails from './pages/returns/ReturnDetails';
import ReportsIndex from './pages/reports/ReportsIndex';
import SalesReports from './pages/reports/SalesReports';
import InventoryReports from './pages/reports/InventoryReports';
import CustomerReports from './pages/reports/CustomerReports';
import DataExport from './pages/reports/DataExport';
import ActivityLog from './pages/reports/ActivityLog';
import Login from './pages/Login';
import Profile from './pages/Profile';
import FinanceIndex from './pages/finance/FinanceIndex';
import ExpenseList from './pages/finance/ExpenseList';
import AddExpense from './pages/finance/AddExpense';
import ExpenseDetails from './pages/finance/ExpenseDetails';
import ExpenseCategories from './pages/finance/ExpenseCategories';
import EmployeeExpenses from './pages/finance/EmployeeExpenses';
import EmployeeSalaries from './pages/finance/EmployeeSalaries';
import BankAccounts from './pages/finance/BankAccounts';
import BankTransactions from './pages/finance/BankTransactions';
import RecordTransaction from './pages/finance/RecordTransaction';
import FinancialReports from './pages/finance/FinancialReports';
import ProfitLossReport from './pages/finance/ProfitLossReport';
import CashFlowReport from './pages/finance/CashFlowReport';
import BalanceSheet from './pages/finance/BalanceSheet';
import TaxReport from './pages/finance/TaxReport';
import ExpenseReport from './pages/finance/ExpenseReport';
import RecurringExpenses from './pages/finance/RecurringExpenses';
import CategoryBudgets from './pages/finance/CategoryBudgets';
import IncomeCategories from './pages/finance/IncomeCategories';
import LenderList from './pages/finance/LenderList';
import LenderDetails from './pages/finance/LenderDetails';
import LoanDetails from './pages/finance/LoanDetails';
import TripList from './pages/finance/TripList';
import CreateTrip from './pages/finance/CreateTrip';
import TripDetails from './pages/finance/TripDetails';
import MessagingIndex from './pages/messaging/MessagingIndex';
import GatewayManagement from './pages/messaging/GatewayManagement';
import MessageQueue from './pages/messaging/MessageQueue';
import MessageTemplates from './pages/messaging/MessageTemplates';
import PublicReceipt from './pages/public/PublicReceipt';
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
      <Route path="/r/:uuid" element={<PublicReceipt />} />

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
      <Route path="/inventory/categories" element={
        <ProtectedRoute>
          <MainLayout><Categories /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/inventory/vendors" element={
        <ProtectedRoute>
          <MainLayout><Vendors /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/inventory/stock" element={
        <ProtectedRoute>
          <MainLayout><StockControl /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/inventory/product/:id" element={
        <ProtectedRoute>
          <MainLayout><ProductDetails /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/inventory/edit/:id" element={
        <ProtectedRoute>
          <MainLayout><EditProduct /></MainLayout>
        </ProtectedRoute>
      } />

      {/* Customer routes */}
      <Route path="/customers" element={
        <ProtectedRoute>
          <MainLayout><CustomerList /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers/add" element={
        <ProtectedRoute>
          <MainLayout><AddCustomer /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers/settings" element={
        <ProtectedRoute>
          <MainLayout><CustomerSettings /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers/map" element={
        <ProtectedRoute>
          <MainLayout><CustomerMap /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers/coverage" element={
        <ProtectedRoute>
          <MainLayout><CoverageList /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers/report" element={
        <ProtectedRoute>
          <MainLayout><SeasonReport /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers/:id" element={
        <ProtectedRoute>
          <MainLayout><CustomerDetails /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/customers/:id/edit" element={
        <ProtectedRoute>
          <MainLayout><AddCustomer /></MainLayout>
        </ProtectedRoute>
      } />

      <Route path="/orders" element={
        <ProtectedRoute>
          <MainLayout><OrderList /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/orders/:id" element={
        <ProtectedRoute>
          <MainLayout><OrderDetails /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/orders/new" element={
        <ProtectedRoute>
          <MainLayout><NewOrder /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/orders/:id/edit" element={
        <ProtectedRoute>
          <MainLayout><EditOrder /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/orders/:id/receipt" element={
        <ProtectedRoute>
          <OrderReceipt />
        </ProtectedRoute>
      } />
      <Route path="/returns" element={
        <ProtectedRoute>
          <MainLayout><ReturnsList /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/returns/new" element={
        <ProtectedRoute>
          <MainLayout><InitiateReturn /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/returns/:id" element={
        <ProtectedRoute>
          <MainLayout><ReturnDetails /></MainLayout>
        </ProtectedRoute>
      } />

      {/* Finance Routes */}
      <Route path="/finance" element={
        <ProtectedRoute>
          <MainLayout><FinanceIndex /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/dashboard" element={
        <Navigate to="/finance" replace />
      } />
      <Route path="/finance/expenses" element={
        <ProtectedRoute>
          <MainLayout><ExpenseList /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/expenses/add" element={
        <ProtectedRoute>
          <MainLayout><AddExpense /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/expenses/:id" element={
        <ProtectedRoute>
          <MainLayout><ExpenseDetails /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/categories" element={
        <ProtectedRoute>
          <MainLayout><ExpenseCategories /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/employee-expenses" element={
        <ProtectedRoute>
          <MainLayout><EmployeeExpenses /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/salaries" element={
        <ProtectedRoute>
          <MainLayout><EmployeeSalaries /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/reports" element={
        <ProtectedRoute>
          <MainLayout><FinancialReports /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/reports/profit-loss" element={
        <ProtectedRoute>
          <MainLayout><ProfitLossReport /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/reports/balance-sheet" element={
        <ProtectedRoute>
          <MainLayout><BalanceSheet /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/reports/cash-flow" element={
        <ProtectedRoute>
          <MainLayout><CashFlowReport /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/reports/expenses" element={
        <ProtectedRoute>
          <MainLayout><ExpenseReport /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/reports/sales-tax" element={
        <ProtectedRoute>
          <MainLayout><TaxReport /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/banking" element={
        <ProtectedRoute>
          <MainLayout><BankAccounts /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/banking/transactions" element={
        <ProtectedRoute>
          <MainLayout><BankTransactions /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/banking/record" element={
        <ProtectedRoute>
          <MainLayout><RecordTransaction /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/recurring" element={
        <ProtectedRoute>
          <MainLayout><RecurringExpenses /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/budgets" element={
        <ProtectedRoute>
          <MainLayout><CategoryBudgets /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/income-categories" element={
        <ProtectedRoute>
          <MainLayout><IncomeCategories /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/lenders" element={
        <ProtectedRoute>
          <MainLayout><LenderList /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/lenders/:id" element={
        <ProtectedRoute>
          <MainLayout><LenderDetails /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/loans/:id" element={
        <ProtectedRoute>
          <MainLayout><LoanDetails /></MainLayout>
        </ProtectedRoute>
      } />

      <Route path="/finance/trips" element={
        <ProtectedRoute>
          <MainLayout><TripList /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/trips/new" element={
        <ProtectedRoute>
          <MainLayout><CreateTrip /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/finance/trips/:id" element={
        <ProtectedRoute>
          <MainLayout><TripDetails /></MainLayout>
        </ProtectedRoute>
      } />

      <Route path="/account/profile" element={
        <ProtectedRoute>
          <MainLayout><Profile /></MainLayout>
        </ProtectedRoute>
      } />

      {/* Messaging Routes */}
      <Route path="/messaging" element={
        <ProtectedRoute>
          <MainLayout><MessagingIndex /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/messaging/gateways" element={
        <ProtectedRoute>
          <MainLayout><GatewayManagement /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/messaging/queue" element={
        <ProtectedRoute>
          <MainLayout><MessageQueue /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/messaging/templates" element={
        <ProtectedRoute>
          <MainLayout><MessageTemplates /></MainLayout>
        </ProtectedRoute>
      } />

      {/* Reports Routes */}
      <Route path="/reports" element={
        <ProtectedRoute>
          <MainLayout><ReportsIndex /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/reports/sales" element={
        <ProtectedRoute>
          <MainLayout><SalesReports /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/reports/inventory" element={
        <ProtectedRoute>
          <MainLayout><InventoryReports /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/reports/customers" element={
        <ProtectedRoute>
          <MainLayout><CustomerReports /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/reports/export" element={
        <ProtectedRoute>
          <MainLayout><DataExport /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/reports/activity" element={
        <ProtectedRoute>
          <MainLayout><ActivityLog /></MainLayout>
        </ProtectedRoute>
      } />

      <Route path="/inventory/deleted" element={
        <ProtectedRoute>
          <MainLayout><DeletedProducts /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/inventory/product-sets" element={
        <ProtectedRoute>
          <MainLayout><ProductSets /></MainLayout>
        </ProtectedRoute>
      } />

      {/* Other protected routes with placeholders */}
      <Route path="/inventory/*" element={
        <ProtectedRoute>
          <MainLayout><PlaceholderPage title="Inventory" phase="Phase 5" /></MainLayout>
        </ProtectedRoute>
      } />

      {/* Settings Routes */}
      <Route path="/settings" element={
        <ProtectedRoute>
          <MainLayout><SettingsIndex /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/store" element={
        <ProtectedRoute>
          <MainLayout><StoreSettings /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/employees" element={
        <ProtectedRoute>
          <MainLayout><EmployeeManagement /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/roles" element={
        <ProtectedRoute>
          <MainLayout><RolesPermissions /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/finance" element={
        <ProtectedRoute>
          <MainLayout><FinancialSettings /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/data" element={
        <ProtectedRoute>
          <MainLayout><DataManagement /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/info" element={
        <ProtectedRoute>
          <MainLayout><SystemInfo /></MainLayout>
        </ProtectedRoute>
      } />

      <Route path="/settings/customers" element={
        <ProtectedRoute>
          <MainLayout><CustomerSettings /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/financial" element={
        <ProtectedRoute>
          <MainLayout><FinancialSettings /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/receipt" element={
        <ProtectedRoute>
          <MainLayout><ReceiptSettings /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/payments" element={
        <ProtectedRoute>
          <MainLayout><PaymentSettings /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/notifications" element={
        <ProtectedRoute>
          <MainLayout><NotificationSettings /></MainLayout>
        </ProtectedRoute>
      } />
      <Route path="/settings/integrations" element={
        <ProtectedRoute>
          <MainLayout><IntegrationSettings /></MainLayout>
        </ProtectedRoute>
      } />

      <Route path="/settings/system" element={
        <ProtectedRoute>
          <MainLayout><SystemInfo /></MainLayout>
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
        <CurrencyProvider>
          <CartProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </CartProvider>
        </CurrencyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

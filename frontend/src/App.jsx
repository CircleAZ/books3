import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { StoreProvider } from './context/StoreContext';
import PermissionRoute from './components/PermissionRoute';
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
import OTPVerification from './pages/OTPVerification';
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
import AllTransactions from './pages/finance/AllTransactions';

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
import CashManagement from './pages/finance/CashManagement';
import MessagingIndex from './pages/messaging/MessagingIndex';
import GatewayManagement from './pages/messaging/GatewayManagement';
import MessageQueue from './pages/messaging/MessageQueue';
import MessageTemplates from './pages/messaging/MessageTemplates';
import OutletsList from './pages/outlets/OutletsList';
import AddOutlet from './pages/outlets/AddOutlet';
import EditOutlet from './pages/outlets/EditOutlet';
import OutletDetails from './pages/outlets/OutletDetails';
import PublicReceipt from './pages/public/PublicReceipt';
import ElevatedAuthModal from './components/ElevatedAuthModal';
import './index.css';

// Protected Route wrapper removed, using imported PermissionRoute instead

// 404 page
function NotFoundPage() {
  return (
    <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Page Not Found</h2>
      <p style={{ color: 'var(--color-text-muted)' }}>The page you're looking for doesn't exist or has been moved.</p>
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      <ElevatedAuthModal />
      <Routes>
        {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/verify-otp" element={<OTPVerification />} />
      <Route path="/r/:uuid" element={<PublicReceipt />} />

      {/* Protected routes */}
      <Route path="/" element={
        <PermissionRoute>
          <MainLayout><Dashboard /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/inventory" element={
        <PermissionRoute permission="inventory.view_products">
          <MainLayout><ProductList /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/inventory/add" element={
        <PermissionRoute permission="inventory.manage_products">
          <MainLayout><AddProduct /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/inventory/categories" element={
        <PermissionRoute permission="inventory.view_products">
          <MainLayout><Categories /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/inventory/vendors" element={
        <PermissionRoute permission="inventory.manage_vendors">
          <MainLayout><Vendors /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/inventory/stock" element={
        <PermissionRoute permission="inventory.manage_stock">
          <MainLayout><StockControl /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/inventory/product/:id" element={
        <PermissionRoute permission="inventory.view_products">
          <MainLayout><ProductDetails /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/inventory/edit/:id" element={
        <PermissionRoute permission="inventory.manage_products">
          <MainLayout><EditProduct /></MainLayout>
        </PermissionRoute>
      } />

      {/* Customer routes */}
      <Route path="/customers" element={
        <PermissionRoute permission="customers.view_customers">
          <MainLayout><CustomerList /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/customers/add" element={
        <PermissionRoute permission="customers.manage_customers">
          <MainLayout><AddCustomer /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/customers/settings" element={
        <PermissionRoute permission="customers.manage_schools">
          <MainLayout><CustomerSettings /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/customers/map" element={
        <PermissionRoute permission="customers.view_map">
          <MainLayout><CustomerMap /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/customers/coverage" element={
        <PermissionRoute permission="customers.view_customers">
          <MainLayout><CoverageList /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/customers/report" element={
        <PermissionRoute permission="customers.view_customers">
          <MainLayout><SeasonReport /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/customers/:id" element={
        <PermissionRoute permission="customers.view_customers">
          <MainLayout><CustomerDetails /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/customers/:id/edit" element={
        <PermissionRoute permission="customers.manage_customers">
          <MainLayout><AddCustomer /></MainLayout>
        </PermissionRoute>
      } />

      <Route path="/orders" element={
        <PermissionRoute permission="orders.view_orders">
          <MainLayout><OrderList /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/orders/:id" element={
        <PermissionRoute permission="orders.view_orders">
          <MainLayout><OrderDetails /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/orders/new" element={
        <PermissionRoute permission="orders.create_orders">
          <MainLayout><NewOrder /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/orders/:id/edit" element={
        <PermissionRoute permission="orders.edit_orders">
          <MainLayout><EditOrder /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/orders/:id/receipt" element={
        <PermissionRoute permission="orders.view_orders">
          <OrderReceipt />
        </PermissionRoute>
      } />
      <Route path="/returns" element={
        <PermissionRoute permission="orders.manage_returns">
          <MainLayout><ReturnsList /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/returns/new" element={
        <PermissionRoute permission="orders.manage_returns">
          <MainLayout><InitiateReturn /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/returns/:id" element={
        <PermissionRoute permission="orders.manage_returns">
          <MainLayout><ReturnDetails /></MainLayout>
        </PermissionRoute>
      } />

      {/* Finance Routes */}
      <Route path="/finance" element={
        <PermissionRoute permission="finance.view_dashboard">
          <MainLayout><FinanceIndex /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/dashboard" element={
        <Navigate to="/finance" replace />
      } />
      <Route path="/finance/expenses" element={
        <PermissionRoute permission="finance.manage_expenses">
          <MainLayout><ExpenseList /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/expenses/add" element={
        <PermissionRoute permission="finance.manage_expenses">
          <MainLayout><AddExpense /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/expenses/:id" element={
        <PermissionRoute permission="finance.manage_expenses">
          <MainLayout><ExpenseDetails /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/categories" element={
        <PermissionRoute permission="finance.manage_expenses">
          <MainLayout><ExpenseCategories /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/employee-expenses" element={
        <PermissionRoute>
          <MainLayout><EmployeeExpenses /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/salaries" element={
        <PermissionRoute permission="finance.manage_salaries">
          <MainLayout><EmployeeSalaries /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/cash-management" element={
        <PermissionRoute permission="finance.manage_banking">
          <MainLayout><CashManagement /></MainLayout>
        </PermissionRoute>
      } />

      <Route path="/finance/reports/profit-loss" element={
        <PermissionRoute permission="finance.view_reports">
          <MainLayout><ProfitLossReport /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/reports/balance-sheet" element={
        <PermissionRoute permission="finance.view_reports">
          <MainLayout><BalanceSheet /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/reports/cash-flow" element={
        <PermissionRoute permission="finance.view_reports">
          <MainLayout><CashFlowReport /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/reports/expenses" element={
        <PermissionRoute permission="finance.view_reports">
          <MainLayout><ExpenseReport /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/reports/sales-tax" element={
        <PermissionRoute permission="finance.view_reports">
          <MainLayout><TaxReport /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/banking" element={
        <PermissionRoute permission="finance.manage_banking">
          <MainLayout><BankAccounts /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/banking/transactions" element={
        <PermissionRoute permission="finance.manage_banking">
          <MainLayout><BankTransactions /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/transactions" element={
        <PermissionRoute permission="finance.manage_banking">
          <MainLayout><AllTransactions /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/banking/record" element={
        <PermissionRoute permission="finance.manage_banking">
          <MainLayout><RecordTransaction /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/recurring" element={
        <PermissionRoute permission="finance.manage_recurring">
          <MainLayout><RecurringExpenses /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/budgets" element={
        <PermissionRoute permission="finance.manage_budgets">
          <MainLayout><CategoryBudgets /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/income-categories" element={
        <PermissionRoute permission="finance.manage_income">
          <MainLayout><IncomeCategories /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/lenders" element={
        <PermissionRoute permission="finance.manage_loans">
          <MainLayout><LenderList /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/lenders/:id" element={
        <PermissionRoute permission="finance.manage_loans">
          <MainLayout><LenderDetails /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/loans/:id" element={
        <PermissionRoute permission="finance.manage_loans">
          <MainLayout><LoanDetails /></MainLayout>
        </PermissionRoute>
      } />

      <Route path="/finance/trips" element={
        <PermissionRoute permission="finance.manage_trips">
          <MainLayout><TripList /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/trips/new" element={
        <PermissionRoute permission="finance.manage_trips">
          <MainLayout><CreateTrip /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/finance/trips/:id" element={
        <PermissionRoute permission="finance.manage_trips">
          <MainLayout><TripDetails /></MainLayout>
        </PermissionRoute>
      } />

      <Route path="/account/profile" element={
        <PermissionRoute>
          <MainLayout><Profile /></MainLayout>
        </PermissionRoute>
      } />

      {/* Messaging Routes */}
      <Route path="/messaging" element={
        <PermissionRoute permission="settings.manage_store">
          <MainLayout><MessagingIndex /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/messaging/gateways" element={
        <PermissionRoute permission="settings.manage_store">
          <MainLayout><GatewayManagement /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/messaging/queue" element={
        <PermissionRoute permission="settings.manage_store">
          <MainLayout><MessageQueue /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/messaging/templates" element={
        <PermissionRoute permission="settings.manage_store">
          <MainLayout><MessageTemplates /></MainLayout>
        </PermissionRoute>
      } />

      {/* Outlets Routes */}
      <Route path="/outlets" element={
        <PermissionRoute permission="outlets.view_outlet">
          <MainLayout><OutletsList /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/outlets/add" element={
        <PermissionRoute permission="outlets.manage_outlet">
          <MainLayout><AddOutlet /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/outlets/:id" element={
        <PermissionRoute permission="outlets.view_outlet">
          <MainLayout><OutletDetails /></MainLayout>
        </PermissionRoute>
      } />

      {/* Reports Routes */}
      <Route path="/reports" element={
        <PermissionRoute>
          <MainLayout><ReportsIndex /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/reports/sales" element={
        <PermissionRoute permission="reports.view_sales">
          <MainLayout><SalesReports /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/reports/inventory" element={
        <PermissionRoute permission="reports.view_inventory">
          <MainLayout><InventoryReports /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/reports/customers" element={
        <PermissionRoute permission="reports.view_customers">
          <MainLayout><CustomerReports /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/reports/export" element={
        <PermissionRoute permission="reports.export">
          <MainLayout><DataExport /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/reports/activity" element={
        <PermissionRoute permission="settings.view_audit_logs">
          <MainLayout><ActivityLog /></MainLayout>
        </PermissionRoute>
      } />

      <Route path="/inventory/deleted" element={
        <PermissionRoute permission="inventory.manage_products">
          <MainLayout><DeletedProducts /></MainLayout>
        </PermissionRoute>
      } />




      {/* Settings Routes */}
      <Route path="/settings" element={
        <PermissionRoute>
          <MainLayout><SettingsIndex /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/settings/store" element={
        <PermissionRoute permission="settings.manage_store">
          <MainLayout><StoreSettings /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/settings/employees" element={
        <PermissionRoute permission="settings.manage_users">
          <MainLayout><EmployeeManagement /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/settings/roles" element={
        <PermissionRoute permission="settings.manage_roles">
          <MainLayout><RolesPermissions /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/settings/finance" element={
        <PermissionRoute permission="settings.manage_taxes">
          <MainLayout><FinancialSettings /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/settings/data" element={
        <PermissionRoute permission="settings.manage_store">
          <MainLayout><DataManagement /></MainLayout>
        </PermissionRoute>
      } />

      <Route path="/settings/customers" element={
        <PermissionRoute permission="settings.manage_store">
          <MainLayout><CustomerSettings /></MainLayout>
        </PermissionRoute>
      } />

      <Route path="/settings/receipt" element={
        <PermissionRoute permission="settings.manage_receipts">
          <MainLayout><ReceiptSettings /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/settings/payments" element={
        <PermissionRoute permission="settings.manage_payments">
          <MainLayout><PaymentSettings /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/settings/notifications" element={
        <PermissionRoute permission="settings.manage_notifications">
          <MainLayout><NotificationSettings /></MainLayout>
        </PermissionRoute>
      } />
      <Route path="/settings/integrations" element={
        <PermissionRoute permission="settings.manage_integrations">
          <MainLayout><IntegrationSettings /></MainLayout>
        </PermissionRoute>
      } />

      <Route path="/settings/system" element={
        <PermissionRoute permission="settings.manage_store">
          <MainLayout><SystemInfo /></MainLayout>
        </PermissionRoute>
      } />


      {/* 404 */}
      <Route path="*" element={
        <MainLayout><NotFoundPage /></MainLayout>
      } />
    </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CurrencyProvider>
          <StoreProvider>
            <CartProvider>
              <ToastProvider>
                <AppRoutes />
              </ToastProvider>
            </CartProvider>
          </StoreProvider>
        </CurrencyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

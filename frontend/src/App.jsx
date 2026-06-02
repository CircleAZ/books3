import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { CartProvider } from './context/CartContext';
import { ToastProvider } from './context/ToastContext';
import { StoreProvider } from './context/StoreContext';
import PermissionRoute from './components/PermissionRoute';
import MainLayout from './components/layout/MainLayout';
import ErrorBoundary from './components/common/ErrorBoundary';
import PageSkeleton from './components/common/PageSkeleton';
import PWAPrompt from './components/common/PWAPrompt';
import PWAInstallPrompt from './components/common/PWAInstallPrompt';

// ── STATIC IMPORTS (Critical Path — must render instantly) ──
import Login from './pages/Login';
import OTPVerification from './pages/OTPVerification';
import PublicReceipt from './pages/public/PublicReceipt';
import ElevatedAuthModal from './components/ElevatedAuthModal';
import './index.css';

// ── LAZY IMPORTS (Route-based code splitting) ──
// Each import() creates a separate chunk that downloads on first navigation.
// Vite splits their CSS automatically alongside the JS chunk.

// Dashboard
const Dashboard = lazy(() => import('./pages/Dashboard'));

// Inventory
const ProductList = lazy(() => import('./pages/inventory/ProductList'));
const AddProduct = lazy(() => import('./pages/inventory/AddProduct'));
const EditProduct = lazy(() => import('./pages/inventory/EditProduct'));
const ProductDetails = lazy(() => import('./pages/inventory/ProductDetails'));
const Categories = lazy(() => import('./pages/inventory/Categories'));
const Vendors = lazy(() => import('./pages/inventory/Vendors'));
const StockControl = lazy(() => import('./pages/inventory/StockControl'));
const DeletedProducts = lazy(() => import('./pages/inventory/DeletedProducts'));

// Customers
const CustomerList = lazy(() => import('./pages/customers/CustomerList'));
const AddCustomer = lazy(() => import('./pages/customers/AddCustomer'));
const CustomerDetails = lazy(() => import('./pages/customers/CustomerDetails'));
const CustomerMap = lazy(() => import('./pages/customers/CustomerMap'));
const CoverageList = lazy(() => import('./pages/customers/CoverageList'));
const SeasonReport = lazy(() => import('./pages/customers/SeasonReport'));

// Orders
const OrderList = lazy(() => import('./pages/orders/OrderList'));
const OrderDetails = lazy(() => import('./pages/orders/OrderDetails'));
const NewOrder = lazy(() => import('./pages/orders/NewOrder'));
const EditOrder = lazy(() => import('./pages/orders/EditOrder'));
const OrderReceipt = lazy(() => import('./pages/orders/OrderReceipt'));

// Returns
const ReturnsList = lazy(() => import('./pages/returns/ReturnsList'));
const InitiateReturn = lazy(() => import('./pages/returns/InitiateReturn'));
const ReturnDetails = lazy(() => import('./pages/returns/ReturnDetails'));

// Finance
const FinanceIndex = lazy(() => import('./pages/finance/FinanceIndex'));

// Procurement
const ProcurementList = lazy(() => import('./pages/procurement/ProcurementList'));
const CreatePO = lazy(() => import('./pages/procurement/CreatePO'));
const PODetail = lazy(() => import('./pages/procurement/PODetail'));
const Transporters = lazy(() => import('./pages/procurement/Transporters'));
const ExpenseList = lazy(() => import('./pages/finance/ExpenseList'));
const AddExpense = lazy(() => import('./pages/finance/AddExpense'));
const ExpenseDetails = lazy(() => import('./pages/finance/ExpenseDetails'));
const ExpenseCategories = lazy(() => import('./pages/finance/ExpenseCategories'));
const EmployeeExpenses = lazy(() => import('./pages/finance/EmployeeExpenses'));
const EmployeeExpenseDetail = lazy(() => import('./pages/finance/EmployeeExpenseDetail'));
const EmployeeSalaries = lazy(() => import('./pages/finance/EmployeeSalaries'));
const BankAccounts = lazy(() => import('./pages/finance/BankAccounts'));
const BankTransactions = lazy(() => import('./pages/finance/BankTransactions'));
const RecordTransaction = lazy(() => import('./pages/finance/RecordTransaction'));
const AllTransactions = lazy(() => import('./pages/finance/AllTransactions'));
const ProfitLossReport = lazy(() => import('./pages/finance/ProfitLossReport'));
const CashFlowReport = lazy(() => import('./pages/finance/CashFlowReport'));
const BalanceSheet = lazy(() => import('./pages/finance/BalanceSheet'));
const TaxReport = lazy(() => import('./pages/finance/TaxReport'));
const ExpenseReport = lazy(() => import('./pages/finance/ExpenseReport'));
const RecurringExpenses = lazy(() => import('./pages/finance/RecurringExpenses'));
const CategoryBudgets = lazy(() => import('./pages/finance/CategoryBudgets'));
const IncomeCategories = lazy(() => import('./pages/finance/IncomeCategories'));
const OtherIncomeList = lazy(() => import('./pages/finance/OtherIncomeList'));
const AddOtherIncome = lazy(() => import('./pages/finance/AddOtherIncome'));
const LenderList = lazy(() => import('./pages/finance/LenderList'));
const LenderDetails = lazy(() => import('./pages/finance/LenderDetails'));
const LoanDetails = lazy(() => import('./pages/finance/LoanDetails'));
const TripList = lazy(() => import('./pages/finance/TripList'));
const CreateTrip = lazy(() => import('./pages/finance/CreateTrip'));
const TripDetails = lazy(() => import('./pages/finance/TripDetails'));
const CashManagement = lazy(() => import('./pages/finance/CashManagement'));
const OpeningBalance = lazy(() => import('./pages/finance/OpeningBalance'));
const LegacyDebtEntry = lazy(() => import('./pages/finance/LegacyDebtEntry'));
const LegacyDebtDashboard = lazy(() => import('./pages/finance/LegacyDebtDashboard'));

// Reports
const ReportsIndex = lazy(() => import('./pages/reports/ReportsIndex'));
const SalesReports = lazy(() => import('./pages/reports/SalesReports'));
const InventoryReports = lazy(() => import('./pages/reports/InventoryReports'));
const CustomerReports = lazy(() => import('./pages/reports/CustomerReports'));
const DataExport = lazy(() => import('./pages/reports/DataExport'));
const ActivityLog = lazy(() => import('./pages/reports/ActivityLog'));
const QueryBuilder = lazy(() => import('./pages/queries/QueryBuilder'));

// Settings
const SettingsIndex = lazy(() => import('./pages/settings/SettingsIndex'));
const StoreSettings = lazy(() => import('./pages/settings/StoreSettings'));
const EmployeeManagement = lazy(() => import('./pages/settings/EmployeeManagement'));
const RolesPermissions = lazy(() => import('./pages/settings/RolesPermissions'));
const FinancialSettings = lazy(() => import('./pages/settings/FinancialSettings'));
const DataManagement = lazy(() => import('./pages/settings/DataManagement'));
const SystemInfo = lazy(() => import('./pages/settings/SystemInfo'));
const ReceiptSettings = lazy(() => import('./pages/settings/ReceiptSettings'));
const PaymentSettings = lazy(() => import('./pages/settings/PaymentSettings'));
const NotificationSettings = lazy(() => import('./pages/settings/NotificationSettings'));
const IntegrationSettings = lazy(() => import('./pages/settings/IntegrationSettings'));
const CustomerSettings = lazy(() => import('./pages/settings/CustomerSettings'));
const GeographicBoundaries = lazy(() => import('./pages/settings/GeographicBoundaries'));

// Messaging
const MessagingIndex = lazy(() => import('./pages/messaging/MessagingIndex'));
const GatewayManagement = lazy(() => import('./pages/messaging/GatewayManagement'));
const MessageQueue = lazy(() => import('./pages/messaging/MessageQueue'));
const MessageTemplates = lazy(() => import('./pages/messaging/MessageTemplates'));

// Outlets
const OutletsList = lazy(() => import('./pages/outlets/OutletsList'));
const AddOutlet = lazy(() => import('./pages/outlets/AddOutlet'));
const EditOutlet = lazy(() => import('./pages/outlets/EditOutlet'));
const OutletDetails = lazy(() => import('./pages/outlets/OutletDetails'));

// Profile
const Profile = lazy(() => import('./pages/Profile'));

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

// ── Lazy page wrapper: ErrorBoundary + Suspense inside MainLayout ──
// Auth (PermissionRoute) and layout shell render synchronously.
// Only the page content shows a skeleton while the chunk downloads.
function LazyPage({ children }) {
  return (
    <MainLayout>
      <ErrorBoundary>
        <Suspense fallback={<PageSkeleton />}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </MainLayout>
  );
}

function AppRoutes() {
  return (
    <>
      <ElevatedAuthModal />
      <Routes>
        {/* Public routes — STATIC imports (critical path) */}
      <Route path="/login" element={<Login />} />
      <Route path="/verify-otp" element={<OTPVerification />} />
      <Route path="/r/:uuid" element={<PublicReceipt />} />

      {/* Protected routes — LAZY imports with LazyPage wrapper */}
      <Route path="/" element={
        <PermissionRoute>
          <LazyPage><Dashboard /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/inventory" element={
        <PermissionRoute permission="inventory.view_products">
          <LazyPage><ProductList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/inventory/add" element={
        <PermissionRoute permission="inventory.manage_products">
          <LazyPage><AddProduct /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/inventory/categories" element={
        <PermissionRoute permission="inventory.view_products">
          <LazyPage><Categories /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/inventory/vendors" element={
        <PermissionRoute permission="inventory.manage_vendors">
          <LazyPage><Vendors /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/inventory/stock" element={
        <PermissionRoute permission="inventory.manage_stock">
          <LazyPage><StockControl /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/inventory/product/:id" element={
        <PermissionRoute permission="inventory.view_products">
          <LazyPage><ProductDetails /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/inventory/edit/:id" element={
        <PermissionRoute permission="inventory.manage_products">
          <LazyPage><EditProduct /></LazyPage>
        </PermissionRoute>
      } />

      {/* Customer routes */}
      <Route path="/customers" element={
        <PermissionRoute permission="customers.view_customers">
          <LazyPage><CustomerList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/customers/add" element={
        <PermissionRoute permission="customers.manage_customers">
          <LazyPage><AddCustomer /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/customers/settings" element={
        <PermissionRoute permission="customers.manage_schools">
          <LazyPage><CustomerSettings /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/customers/map" element={
        <PermissionRoute permission="customers.view_map">
          <LazyPage><CustomerMap /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/customers/coverage" element={
        <PermissionRoute permission="customers.view_customers">
          <LazyPage><CoverageList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/customers/report" element={
        <PermissionRoute permission="customers.view_customers">
          <LazyPage><SeasonReport /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/customers/:id" element={
        <PermissionRoute permission="customers.view_customers">
          <LazyPage><CustomerDetails /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/customers/:id/edit" element={
        <PermissionRoute permission="customers.manage_customers">
          <LazyPage><AddCustomer /></LazyPage>
        </PermissionRoute>
      } />

      <Route path="/orders" element={
        <PermissionRoute permission="orders.view_orders">
          <LazyPage><OrderList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/orders/:id" element={
        <PermissionRoute permission="orders.view_orders">
          <LazyPage><OrderDetails /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/orders/new" element={
        <PermissionRoute permission="orders.create_orders">
          <LazyPage><NewOrder /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/orders/:id/edit" element={
        <PermissionRoute permission="orders.edit_orders">
          <LazyPage><EditOrder /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/orders/:id/receipt" element={
        <PermissionRoute permission="orders.view_orders">
          <ErrorBoundary>
            <Suspense fallback={<PageSkeleton />}>
              <OrderReceipt />
            </Suspense>
          </ErrorBoundary>
        </PermissionRoute>
      } />
      <Route path="/returns" element={
        <PermissionRoute permission="orders.manage_returns">
          <LazyPage><ReturnsList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/returns/new" element={
        <PermissionRoute permission="orders.manage_returns">
          <LazyPage><InitiateReturn /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/returns/:id" element={
        <PermissionRoute permission="orders.manage_returns">
          <LazyPage><ReturnDetails /></LazyPage>
        </PermissionRoute>
      } />

      {/* Procurement Routes */}
      <Route path="/procurement" element={
        <PermissionRoute permission="inventory.manage_stock">
          <LazyPage><ProcurementList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/procurement/new" element={
        <PermissionRoute permission="inventory.manage_stock">
          <LazyPage><CreatePO /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/procurement/:id" element={
        <PermissionRoute permission="inventory.manage_stock">
          <LazyPage><PODetail /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/procurement/transporters" element={
        <PermissionRoute permission="inventory.manage_stock">
          <LazyPage><Transporters /></LazyPage>
        </PermissionRoute>
      } />

      {/* Finance Routes */}
      <Route path="/finance" element={
        <PermissionRoute permission="finance.view_dashboard">
          <LazyPage><FinanceIndex /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/dashboard" element={
        <Navigate to="/finance" replace />
      } />
      <Route path="/finance/expenses" element={
        <PermissionRoute permission="finance.manage_expenses">
          <LazyPage><ExpenseList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/expenses/add" element={
        <PermissionRoute permission="finance.manage_expenses">
          <LazyPage><AddExpense /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/expenses/:id" element={
        <PermissionRoute permission="finance.manage_expenses">
          <LazyPage><ExpenseDetails /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/categories" element={
        <PermissionRoute permission="finance.manage_expenses">
          <LazyPage><ExpenseCategories /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/employee-expenses" element={
        <PermissionRoute>
          <LazyPage><EmployeeExpenses /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/employee-expenses/:id" element={
        <PermissionRoute>
          <LazyPage><EmployeeExpenseDetail /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/salaries" element={
        <PermissionRoute permission="finance.manage_salaries">
          <LazyPage><EmployeeSalaries /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/cash-management" element={
        <PermissionRoute permission="finance.manage_banking">
          <LazyPage><CashManagement /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/opening-balance" element={
        <PermissionRoute permission="finance.manage_banking">
          <LazyPage><OpeningBalance /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/legacy-debt" element={
        <PermissionRoute permission="finance.manage_banking">
          <LazyPage><LegacyDebtEntry /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/legacy-debt-dashboard" element={
        <PermissionRoute permission="finance.view_reports">
          <LazyPage><LegacyDebtDashboard /></LazyPage>
        </PermissionRoute>
      } />

      <Route path="/finance/reports/profit-loss" element={
        <PermissionRoute permission="finance.view_reports">
          <LazyPage><ProfitLossReport /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/reports/balance-sheet" element={
        <PermissionRoute permission="finance.view_reports">
          <LazyPage><BalanceSheet /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/reports/cash-flow" element={
        <PermissionRoute permission="finance.view_reports">
          <LazyPage><CashFlowReport /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/reports/expenses" element={
        <PermissionRoute permission="finance.view_reports">
          <LazyPage><ExpenseReport /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/reports/sales-tax" element={
        <PermissionRoute permission="finance.view_reports">
          <LazyPage><TaxReport /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/banking" element={
        <PermissionRoute permission="finance.manage_banking">
          <LazyPage><BankAccounts /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/banking/transactions" element={
        <PermissionRoute permission="finance.manage_banking">
          <LazyPage><BankTransactions /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/transactions" element={
        <PermissionRoute permission="finance.manage_banking">
          <LazyPage><AllTransactions /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/banking/record" element={
        <PermissionRoute permission="finance.manage_banking">
          <LazyPage><RecordTransaction /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/recurring" element={
        <PermissionRoute permission="finance.manage_recurring">
          <LazyPage><RecurringExpenses /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/budgets" element={
        <PermissionRoute permission="finance.manage_budgets">
          <LazyPage><CategoryBudgets /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/income-categories" element={
        <PermissionRoute permission="finance.manage_income">
          <LazyPage><IncomeCategories /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/other-income" element={
        <PermissionRoute permission="finance.manage_income">
          <LazyPage><OtherIncomeList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/other-income/add" element={
        <PermissionRoute permission="finance.manage_income">
          <LazyPage><AddOtherIncome /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/lenders" element={
        <PermissionRoute permission="finance.manage_loans">
          <LazyPage><LenderList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/lenders/:id" element={
        <PermissionRoute permission="finance.manage_loans">
          <LazyPage><LenderDetails /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/loans/:id" element={
        <PermissionRoute permission="finance.manage_loans">
          <LazyPage><LoanDetails /></LazyPage>
        </PermissionRoute>
      } />

      <Route path="/finance/trips" element={
        <PermissionRoute permission="finance.manage_trips">
          <LazyPage><TripList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/trips/new" element={
        <PermissionRoute permission="finance.manage_trips">
          <LazyPage><CreateTrip /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/finance/trips/:id" element={
        <PermissionRoute permission="finance.manage_trips">
          <LazyPage><TripDetails /></LazyPage>
        </PermissionRoute>
      } />

      <Route path="/account/profile" element={
        <PermissionRoute>
          <LazyPage><Profile /></LazyPage>
        </PermissionRoute>
      } />

      {/* Messaging Routes */}
      <Route path="/messaging" element={
        <PermissionRoute permission="settings.manage_store">
          <LazyPage><MessagingIndex /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/messaging/gateways" element={
        <PermissionRoute permission="settings.manage_store">
          <LazyPage><GatewayManagement /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/messaging/queue" element={
        <PermissionRoute permission="settings.manage_store">
          <LazyPage><MessageQueue /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/messaging/templates" element={
        <PermissionRoute permission="settings.manage_store">
          <LazyPage><MessageTemplates /></LazyPage>
        </PermissionRoute>
      } />

      {/* Outlets Routes */}
      <Route path="/outlets" element={
        <PermissionRoute permission="outlets.view_outlet">
          <LazyPage><OutletsList /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/outlets/add" element={
        <PermissionRoute permission="outlets.manage_outlet">
          <LazyPage><AddOutlet /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/outlets/:id/edit" element={
        <PermissionRoute permission="outlets.manage_outlet">
          <LazyPage><EditOutlet /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/outlets/:id" element={
        <PermissionRoute permission="outlets.view_outlet">
          <LazyPage><OutletDetails /></LazyPage>
        </PermissionRoute>
      } />

      {/* Reports Routes */}
      <Route path="/reports" element={
        <PermissionRoute>
          <LazyPage><ReportsIndex /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/reports/sales" element={
        <PermissionRoute permission="reports.view_sales">
          <LazyPage><SalesReports /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/reports/inventory" element={
        <PermissionRoute permission="reports.view_inventory">
          <LazyPage><InventoryReports /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/reports/customers" element={
        <PermissionRoute permission="reports.view_customers">
          <LazyPage><CustomerReports /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/reports/export" element={
        <PermissionRoute permission="reports.export">
          <LazyPage><DataExport /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/reports/activity" element={
        <PermissionRoute permission="settings.view_audit_logs">
          <LazyPage><ActivityLog /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/queries" element={
        <PermissionRoute permission="reports.manage_queries">
          <LazyPage><QueryBuilder /></LazyPage>
        </PermissionRoute>
      } />

      <Route path="/inventory/deleted" element={
        <PermissionRoute permission="inventory.manage_products">
          <LazyPage><DeletedProducts /></LazyPage>
        </PermissionRoute>
      } />

      {/* Settings Routes */}
      <Route path="/settings" element={
        <PermissionRoute>
          <LazyPage><SettingsIndex /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/settings/store" element={
        <PermissionRoute permission="settings.manage_store">
          <LazyPage><StoreSettings /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/settings/employees" element={
        <PermissionRoute permission="settings.manage_users">
          <LazyPage><EmployeeManagement /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/settings/roles" element={
        <PermissionRoute permission="settings.manage_roles">
          <LazyPage><RolesPermissions /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/settings/finance" element={
        <PermissionRoute permission="settings.manage_taxes">
          <LazyPage><FinancialSettings /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/settings/data" element={
        <PermissionRoute permission="settings.manage_store">
          <LazyPage><DataManagement /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/settings/boundaries" element={
        <PermissionRoute permission="settings.manage_store">
          <LazyPage><GeographicBoundaries /></LazyPage>
        </PermissionRoute>
      } />

      <Route path="/settings/customers" element={
        <PermissionRoute permission="settings.manage_store">
          <LazyPage><CustomerSettings /></LazyPage>
        </PermissionRoute>
      } />

      <Route path="/settings/receipt" element={
        <PermissionRoute permission="settings.manage_receipts">
          <LazyPage><ReceiptSettings /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/settings/payments" element={
        <PermissionRoute permission="settings.manage_payments">
          <LazyPage><PaymentSettings /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/settings/notifications" element={
        <PermissionRoute permission="settings.manage_notifications">
          <LazyPage><NotificationSettings /></LazyPage>
        </PermissionRoute>
      } />
      <Route path="/settings/integrations" element={
        <PermissionRoute permission="settings.manage_integrations">
          <LazyPage><IntegrationSettings /></LazyPage>
        </PermissionRoute>
      } />

      <Route path="/settings/system" element={
        <PermissionRoute permission="settings.manage_store">
          <LazyPage><SystemInfo /></LazyPage>
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
                <PWAPrompt />
                <PWAInstallPrompt />
                <AppRoutes />
              </ToastProvider>
            </CartProvider>
          </StoreProvider>
        </CurrencyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

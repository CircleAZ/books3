import { NavLink, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useCurrency } from '../../context/CurrencyContext';
import './BottomNavBar.css';

const navItems = [
    { path: '/', icon: 'home', label: 'Dashboard' },
    { path: '/inventory', icon: 'package', label: 'Inventory' },
    { path: '/orders/new', icon: 'plus', label: 'New Order', isMain: true },
    { path: '/customers', icon: 'users', label: 'Customers' },
    { path: '/orders', icon: 'list', label: 'Orders' },
];

const icons = {
    home: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9,22 9,12 15,12 15,22" />
        </svg>
    ),
    package: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
    ),
    plus: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v8M8 12h8" />
        </svg>
    ),
    cart: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
    ),
    users: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    ),
    list: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="8" y1="8" x2="12" y2="8" />
            <line x1="8" y1="16" x2="14" y2="16" />
        </svg>
    ),
};

export default function BottomNavBar({ hidden = false }) {
    const location = useLocation();
    const { itemCount, total, toggleDrawer } = useCart();
    const { currency } = useCurrency();

    if (hidden) return null;

    const isCartPage = location.pathname === '/orders/new' || (location.pathname.startsWith('/orders/') && location.pathname.endsWith('/edit'));

    return (
        <nav className="bottom-nav" role="navigation" aria-label="Bottom navigation">
            {navItems.map(item => {
                // When on New/Edit Order page, replace center button with cart button
                if (item.isMain && isCartPage) {
                    return (
                        <button
                            key={item.path}
                            className={`bottom-nav-item main-action active cart-mode`}
                            onClick={toggleDrawer}
                            type="button"
                        >
                            <span className="nav-icon">
                                {icons.cart}
                                {itemCount > 0 && (
                                    <span className="cart-badge">{itemCount}</span>
                                )}
                            </span>
                            <span className="nav-label cart-total-label">
                                {itemCount > 0 ? `${currency}${total.toFixed(2)}` : 'Cart'}
                            </span>
                        </button>
                    );
                }

                return (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `bottom-nav-item ${item.isMain ? 'main-action' : ''} ${isActive ? 'active' : ''}`
                        }
                        end={item.path === '/'}
                    >
                        <span className="nav-icon">{icons[item.icon]}</span>
                        <span className="nav-label">{item.label}</span>
                    </NavLink>
                );
            })}
        </nav>
    );
}

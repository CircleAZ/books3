import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS, API_BASE } from '../../config/api';
import Pagination from '../../components/common/Pagination';
import GuardedAction from '../../components/GuardedAction';
import './ProductList.css';

const MEDIA_BASE = API_BASE.replace(/\/api\/?$/, '');

export default function ProductList() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const location = useLocation();

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    // LENS-03: Search loading indicator
    const [isSearching, setIsSearching] = useState(false);
    const [category, setCategory] = useState('');
    const [vendor, setVendor] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [count, setCount] = useState(0);
    const [ordering, setOrdering] = useState('display_id');

    // Filter options
    const [categories, setCategories] = useState([]);
    const [vendors, setVendors] = useState([]);

    // Debounced search state
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        setIsSearching(true);
        const timer = setTimeout(() => {
            setDebouncedSearch(search);
            setIsSearching(false);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page,
                search: debouncedSearch,
                category,
                vendor,
                ordering
            });

            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}?${queryParams.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setProducts(data.results || []);
                setCount(data.count || 0);
                // Synchronize with DRF settings.PAGE_SIZE (20)
                setTotalPages(Math.ceil((data.count || 0) / 20));
            } else {
                console.error('Failed to fetch products');
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, page, debouncedSearch, category, vendor, ordering]);

    const fetchFilters = useCallback(async () => {
        try {
            const [catRes, vendRes] = await Promise.all([
                fetchWithAuth(ENDPOINTS.INVENTORY_CATEGORIES),
                fetchWithAuth(ENDPOINTS.INVENTORY_VENDORS)
            ]);

            if (catRes.ok) {
                const data = await catRes.json();
                setCategories(data.results || data || []);
            }
            if (vendRes.ok) {
                const data = await vendRes.json();
                setVendors(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching filters:', error);
        }
    }, [fetchWithAuth]);

    // Unified fetch execution: fires precisely when filters/pages or location.key changes
    useEffect(() => {
        fetchProducts();
    }, [fetchProducts, location.key]);

    // Initial load for filters
    useEffect(() => {
        fetchFilters();
    }, [fetchFilters]);

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handleCategoryChange = (e) => {
        setCategory(e.target.value);
        setPage(1);
    };

    const handleVendorChange = (e) => {
        setVendor(e.target.value);
        setPage(1);
    };

    const toggleSort = (column) => {
        if (ordering === column) {
            setOrdering(`-${column}`);
        } else {
            setOrdering(column);
        }
        setPage(1);
    };

    const clearFilters = () => {
        setSearch('');
        setCategory('');
        setVendor('');
        setPage(1);
    };

    const isFilterActive = category !== '' || vendor !== '' || search !== '';

    const getStatus = (product) => {
        if (product.stock_quantity <= 0) return 'out-of-stock';
        if (product.stock_quantity <= (product.low_stock_threshold || 5)) return 'low-stock';
        return 'in-stock';
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'out-of-stock': return 'Out of Stock';
            case 'low-stock': return 'Low Stock';
            case 'in-stock': return 'In Stock';
            default: return 'Unknown';
        }
    };

    return (
        <div className="inventory-container fade-in">
            <div className="inventory-header">
                <div className="inventory-actions">
                    <GuardedAction permission="inventory.manage_products">
                        <button className="btn btn-primary" onClick={() => navigate('/inventory/add')}>
                            + Add Product
                        </button>
                    </GuardedAction>
                </div>
            </div>

            <div className="inventory-controls">
                <div className="search-container">
                    <input
                        type="text"
                        placeholder="Search products..."
                        className={`search-input ${isSearching ? 'searching' : ''}`}
                        value={search}
                        onChange={handleSearchChange}
                    />
                </div>

                <select className="filter-select" value={category} onChange={handleCategoryChange}>
                    <option value="">All Categories</option>
                    {categories.map(cat => (
                        <option key={cat.id || cat.name} value={cat.id || cat.name}>{cat.name}</option>
                    ))}
                </select>

                <select className="filter-select" value={vendor} onChange={handleVendorChange}>
                    <option value="">All Vendors</option>
                    {vendors.map(vend => (
                        <option key={vend.id || vend.name} value={vend.id || vend.name}>{vend.name}</option>
                    ))}
                </select>

                {isFilterActive && (
                    <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}>
                        Clear
                    </button>
                )}
            </div>

            <div className="total-qty-indicator" style={{ fontWeight: 'bold', color: 'var(--color-primary)', fontSize: '1.1rem', marginBottom: '8px' }}>
                Total Qty: {count}
            </div>

            <div className="inventory-table-container">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner-large"></div>
                    </div>
                ) : (
                    <>
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>Image</th>
                                    <th onClick={() => toggleSort('display_id')} className="sortable" style={{ cursor: 'pointer' }}>
                                        ID {ordering.includes('display_id') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('name')} className="sortable" style={{ cursor: 'pointer' }}>
                                        Name {ordering.includes('name') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('category__name')} className="sortable" style={{ cursor: 'pointer' }}>
                                        Category {ordering.includes('category__name') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('vendor__name')} className="sortable" style={{ cursor: 'pointer' }}>
                                        Vendor {ordering.includes('vendor__name') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('cost_price')} className="sortable" style={{ cursor: 'pointer' }}>
                                        Cost {ordering.includes('cost_price') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('selling_price')} className="sortable" style={{ cursor: 'pointer' }}>
                                        Selling {ordering.includes('selling_price') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('stock_quantity')} className="sortable" style={{ cursor: 'pointer' }}>
                                        Available {ordering.includes('stock_quantity') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('physical_stock')} className="sortable" style={{ cursor: 'pointer' }}>
                                        Physical {ordering.includes('physical_stock') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('owed_quantity')} className="sortable" style={{ cursor: 'pointer', color: 'var(--color-warning)' }}>
                                        Owed {ordering.includes('owed_quantity') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th onClick={() => toggleSort('delivered_quantity')} className="sortable" style={{ cursor: 'pointer', color: 'var(--color-success)' }}>
                                        Delivered {ordering.includes('delivered_quantity') && (ordering.startsWith('-') ? '↓' : '↑')}
                                    </th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.length > 0 ? (
                                    products.map(product => {
                                        const status = getStatus(product);
                                        return (
                                            <tr key={product.id} onClick={() => navigate(`/inventory/product/${product.id}`)} style={{ cursor: 'pointer' }}>
                                                <td className="product-image-cell">
                                                    {product.primary_image_url ? (
                                                        <img 
                                                            src={product.primary_image_url.startsWith('http') ? product.primary_image_url : `${MEDIA_BASE}${product.primary_image_url}`} 
                                                            alt={product.name} 
                                                            className="product-image" 
                                                        />
                                                    ) : (
                                                        <div className="product-image" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>IMG</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td>{product.display_id || product.id.substring(0, 8)}</td>
                                                <td>{product.name}</td>
                                                <td>{product.category_name || product.category || '-'}</td>
                                                <td>{product.vendor_name || product.vendor || '-'}</td>
                                                <td>{currency}{Number(product.cost_price).toFixed(2)}</td>
                                                <td>{currency}{Number(product.selling_price).toFixed(2)}</td>
                                                <td>{product.stock_quantity}</td>
                                                <td>{product.physical_stock}</td>
                                                <td style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>{product.owed_quantity || 0}</td>
                                                <td style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>{product.delivered_quantity || 0}</td>
                                                <td>
                                                    <span className={`status-badge status-${status}`}>
                                                        {getStatusLabel(status)}
                                                    </span>
                                                </td>
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <GuardedAction permission="inventory.manage_products">
                                                        <button
                                                            className="btn btn-sm btn-ghost"
                                                            onClick={() => navigate(`/inventory/edit/${product.id}`)}
                                                        >
                                                            Edit
                                                        </button>
                                                    </GuardedAction>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="13" style={{ textAlign: 'center', padding: '2rem' }}>
                                            No products found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </>
                )}

                <div className="pagination-bar">
                    <Pagination 
                        currentPage={page} 
                        totalPages={totalPages} 
                        onPageChange={setPage} 
                    />
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './ProductList.css';

export default function ProductList() {
    const { fetchWithAuth } = useAuth();
    const navigate = useNavigate();

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [vendor, setVendor] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    
    // Filter options
    const [categories, setCategories] = useState([]);
    const [vendors, setVendors] = useState([]);

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page,
                search,
                category,
                vendor
            });
            
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}?${queryParams.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setProducts(data.results || []);
                setTotalPages(Math.ceil((data.count || 0) / (data.page_size || 10)));
            } else {
                console.error('Failed to fetch products');
            }
        } catch (error) {
            console.error('Error fetching products:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, page, search, category, vendor]);

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

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProducts();
        }, 500);
        return () => clearTimeout(timer);
    }, [fetchProducts, search]);

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
                <h1 className="inventory-title">Inventory</h1>
                <div className="inventory-actions">
                    <button className="btn btn-primary" onClick={() => navigate('/inventory/add')}>
                        + Add Product
                    </button>
                </div>
            </div>

            <div className="inventory-controls">
                <div className="search-container">
                    <input
                        type="text"
                        placeholder="Search products..."
                        className="search-input"
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
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Category</th>
                                    <th>Vendor</th>
                                    <th>Cost</th>
                                    <th>Selling</th>
                                    <th>Stock</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.length > 0 ? (
                                    products.map(product => {
                                        const status = getStatus(product);
                                        return (
                                            <tr key={product.id}>
                                                <td className="product-image-cell">
                                                    {product.image ? (
                                                        <img src={product.image} alt={product.name} className="product-image" />
                                                    ) : (
                                                        <div className="product-image" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                                                            <span style={{fontSize: '0.7rem', color: 'var(--color-text-muted)'}}>IMG</span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td>{product.id}</td>
                                                <td>{product.name}</td>
                                                <td>{product.category_name || product.category || '-'}</td>
                                                <td>{product.vendor_name || product.vendor || '-'}</td>
                                                <td>${Number(product.cost_price).toFixed(2)}</td>
                                                <td>${Number(product.selling_price).toFixed(2)}</td>
                                                <td>{product.stock_quantity}</td>
                                                <td>
                                                    <span className={`status-badge status-${status}`}>
                                                        {getStatusLabel(status)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="9" style={{textAlign: 'center', padding: '2rem'}}>
                                            No products found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </>
                )}
                
                <div className="pagination-controls">
                    <span className="page-info">
                        Page {page} of {totalPages || 1}
                    </span>
                    <button 
                        className="btn btn-ghost" 
                        disabled={page <= 1} 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                    >
                        Previous
                    </button>
                    <button 
                        className="btn btn-ghost" 
                        disabled={page >= totalPages} 
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}

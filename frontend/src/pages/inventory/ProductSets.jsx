import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import './ProductSets.css';

export default function ProductSets() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { showToast } = useToast();
    const location = useLocation();

    // List state
    const [sets, setSets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState('');
    const [filterSchool, setFilterSchool] = useState('');

    // Dropdown options
    const [classTemplates, setClassTemplates] = useState([]);
    const [schools, setSchools] = useState([]);
    const [divisionTemplates, setDivisionTemplates] = useState([]);
    const [subdivisionTemplates, setSubdivisionTemplates] = useState([]);

    // Form modal state
    const [showForm, setShowForm] = useState(false);
    const [editingSet, setEditingSet] = useState(null);
    const [formData, setFormData] = useState({
        name: '', description: '', class_name: '',
        school: '', division_name: '', subdivision_name: '',
        is_active: true,
    });
    const [formItems, setFormItems] = useState([]);
    const [saving, setSaving] = useState(false);

    // Product search
    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [searchingProducts, setSearchingProducts] = useState(false);
    const searchTimerRef = useRef(null);

    // Fetch sets
    const fetchSets = useCallback(async () => {
        setLoading(true);
        try {
            let url = ENDPOINTS.PRODUCT_SETS + '?';
            if (filterClass) url += `class_name=${encodeURIComponent(filterClass)}&`;
            if (filterSchool) url += `school=${filterSchool}&`;
            const res = await fetchWithAuth(url);
            if (res.ok) {
                const data = await res.json();
                setSets(data.results || data || []);
            }
        } catch (err) {
            console.error('Failed to load product sets:', err);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, filterClass, filterSchool]);

    // Fetch dropdown options
    useEffect(() => {
        const fetchOptions = async () => {
            try {
                const [ctRes, sRes, divRes, subdivRes] = await Promise.all([
                    fetchWithAuth(ENDPOINTS.CLASS_TEMPLATES),
                    fetchWithAuth(ENDPOINTS.SCHOOLS),
                    fetchWithAuth(ENDPOINTS.DIVISION_TEMPLATES),
                    fetchWithAuth(ENDPOINTS.SUBDIVISION_TEMPLATES),
                ]);
                if (ctRes.ok) {
                    const data = await ctRes.json();
                    const sorted = (data.results || data || []).sort((a, b) =>
                        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                    );
                    setClassTemplates(sorted);
                }
                if (sRes.ok) {
                    const data = await sRes.json();
                    setSchools(data.results || data || []);
                }
                if (divRes.ok) {
                    const data = await divRes.json();
                    setDivisionTemplates(data.results || data || []);
                }
                if (subdivRes.ok) {
                    const data = await subdivRes.json();
                    setSubdivisionTemplates(data.results || data || []);
                }
            } catch (err) {
                console.error('Failed to load options:', err);
            }
        };
        fetchOptions();
    }, [fetchWithAuth]);

    useEffect(() => { fetchSets(); }, [fetchSets, location.key]);

    // Product search with debounce
    const handleProductSearch = (query) => {
        setProductSearch(query);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        if (!query || query.length < 2) { setProductResults([]); return; }
        setSearchingProducts(true);
        searchTimerRef.current = setTimeout(async () => {
            try {
                const res = await fetchWithAuth(
                    `${ENDPOINTS.INVENTORY_PRODUCTS}?search=${encodeURIComponent(query)}&page_size=10`
                );
                if (res.ok) {
                    const data = await res.json();
                    const existingIds = formItems.map(i => i.product);
                    setProductResults(
                        (data.results || data || []).filter(p => !existingIds.includes(p.id))
                    );
                }
            } catch { } finally {
                setSearchingProducts(false);
            }
        }, 300);
    };

    // Add product to set items
    const addProduct = (product) => {
        setFormItems(prev => [...prev, {
            product: product.id,
            product_name: product.name,
            selling_price: product.selling_price,
            quantity: 1,
            notes: '',
        }]);
        setProductSearch('');
        setProductResults([]);
    };

    // Remove product from set
    const removeProduct = (idx) => {
        setFormItems(prev => prev.filter((_, i) => i !== idx));
    };

    // Update item quantity
    const updateItemQty = (idx, qty) => {
        setFormItems(prev => prev.map((item, i) =>
            i === idx ? { ...item, quantity: Math.max(1, parseInt(qty) || 1) } : item
        ));
    };

    // Open create form
    const openCreate = () => {
        setEditingSet(null);
        setFormData({
            name: '', description: '', class_name: '',
            school: '', division_name: '', subdivision_name: '',
            is_active: true,
        });
        setFormItems([]);
        setShowForm(true);
    };

    // Filter templates securely based on cascading rules
    const getValidDivisions = () => {
        if (!formData.school || !formData.class_name) return [];
        return divisionTemplates.filter(d => 
            !d.applicable_class_names || d.applicable_class_names.length === 0 || 
            d.applicable_class_names.includes(formData.class_name)
        );
    };

    const getValidSubdivisions = () => {
        if (!formData.school || !formData.division_name) return [];
        return subdivisionTemplates.filter(sd => 
            !sd.applicable_division_names || sd.applicable_division_names.length === 0 || 
            sd.applicable_division_names.includes(formData.division_name)
        );
    };

    // Open edit form
    const openEdit = (set) => {
        setEditingSet(set);
        setFormData({
            name: set.name,
            description: set.description || '',
            class_name: set.class_name,
            school: set.school || '',
            division_name: set.division_name || '',
            subdivision_name: set.subdivision_name || '',
            is_active: set.is_active,
        });
        setFormItems((set.items || []).map(i => ({
            product: i.product,
            product_name: i.product_name,
            selling_price: i.selling_price,
            quantity: i.quantity,
            notes: i.notes || '',
        })));
        setShowForm(true);
    };

    // Duplicate set
    const duplicateSet = async (set) => {
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.PRODUCT_SETS}${set.id}/duplicate/`, {
                method: 'POST',
                body: JSON.stringify({}),
            });
            if (res.ok) {
                showToast('Set duplicated! Edit the copy to customize.', 'success');
                fetchSets();
            } else {
                showToast('Failed to duplicate set', 'error');
            }
        } catch {
            showToast('Network error duplicating set', 'error');
        }
    };

    // Delete set
    const deleteSet = async (set) => {
        if (!window.confirm(`Delete "${set.name}"? This cannot be undone.`)) return;
        try {
            const res = await fetchWithAuth(`${ENDPOINTS.PRODUCT_SETS}${set.id}/`, {
                method: 'DELETE',
            });
            if (res.ok || res.status === 204) {
                showToast('Product set deleted', 'info');
                fetchSets();
            }
        } catch {
            showToast('Failed to delete set', 'error');
        }
    };

    // Save form
    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.class_name) {
            showToast('Class is required', 'error');
            return;
        }
        if (formItems.length === 0) {
            showToast('Add at least one product', 'error');
            return;
        }

        setSaving(true);
        try {
            // Auto-generate name based on scope criteria
            let generatedName = `STD ${formData.class_name}`;
            if (formData.division_name) {
                generatedName += ` ${formData.division_name}`;
            }
            if (formData.school) {
                const schoolObj = schools.find(s => s.id === parseInt(formData.school) || s.id === formData.school);
                if (schoolObj) {
                    generatedName += ` - ${schoolObj.name}`;
                } else {
                     generatedName += ` - ${formData.school}`;
                }
            }

            const payload = {
                ...formData,
                name: generatedName,
                school: formData.school || null,
                items: formItems.map(i => ({
                    product: i.product,
                    quantity: i.quantity,
                    notes: i.notes,
                })),
            };

            const url = editingSet
                ? `${ENDPOINTS.PRODUCT_SETS}${editingSet.id}/`
                : ENDPOINTS.PRODUCT_SETS;
            const method = editingSet ? 'PUT' : 'POST';

            const res = await fetchWithAuth(url, {
                method,
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                showToast(
                    editingSet ? 'Product set updated!' : 'Product set created!',
                    'success'
                );
                setShowForm(false);
                fetchSets();
            } else {
                const err = await res.json().catch(() => ({}));
                showToast(
                    Object.values(err).flat().join(', ') || 'Failed to save',
                    'error'
                );
            }
        } catch {
            showToast('Network error saving set', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Calculate set total
    const setTotal = formItems.reduce(
        (sum, i) => sum + (parseFloat(i.selling_price) || 0) * i.quantity, 0
    );

    return (
        <div className="product-sets-page fade-in">
            {/* Header */}
            <div className="ps-header">
                <div className="ps-header-left">
                    <div className="ps-filters">
                        <select
                            value={filterClass}
                            onChange={e => setFilterClass(e.target.value)}
                        >
                            <option value="">All Classes</option>
                            {classTemplates.map(ct => (
                                <option key={ct.id} value={ct.name}>{ct.name}</option>
                            ))}
                        </select>
                        <select
                            value={filterSchool}
                            onChange={e => setFilterSchool(e.target.value)}
                        >
                            <option value="">All Schools</option>
                            {schools.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={openCreate}>
                    + Create Set
                </button>
            </div>

            {/* List */}
            {loading ? (
                <div className="ps-loading">
                    <div className="loading-spinner" />
                    <span>Loading product sets...</span>
                </div>
            ) : sets.length === 0 ? (
                <div className="ps-empty">
                    <div className="ps-empty-icon">📦</div>
                    <h3>No Product Sets</h3>
                    <p>Create a product set to bundle items for specific classes.</p>
                    <button className="btn btn-primary" onClick={openCreate}>
                        Create Your First Set
                    </button>
                </div>
            ) : (
                <div className="ps-grid">
                    {sets.map(set => (
                        <div
                            key={set.id}
                            className={`ps-card ${!set.is_active ? 'ps-card-inactive' : ''}`}
                        >
                            <div className="ps-card-header">
                                <div className="ps-card-title">
                                    <h3>{set.name}</h3>
                                    {!set.is_active && (
                                        <span className="ps-badge ps-badge-inactive">Inactive</span>
                                    )}
                                </div>
                                <div className="ps-card-actions">
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        title="Duplicate & Customize"
                                        onClick={() => duplicateSet(set)}
                                    >
                                        ⧉
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        title="Edit"
                                        onClick={() => openEdit(set)}
                                    >
                                        ✎
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm ps-btn-delete"
                                        title="Delete"
                                        onClick={() => deleteSet(set)}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            <div className="ps-card-scope">
                                <span className="ps-scope-tag ps-scope-class">
                                    Class {set.class_name}
                                </span>
                                {set.school_name && (
                                    <span className="ps-scope-tag ps-scope-school">
                                        {set.school_name}
                                    </span>
                                )}
                                {set.division_name && (
                                    <span className="ps-scope-tag">
                                        Div {set.division_name}
                                    </span>
                                )}
                                {set.subdivision_name && (
                                    <span className="ps-scope-tag">
                                        {set.subdivision_name}
                                    </span>
                                )}
                                {!set.school_name && (
                                    <span className="ps-scope-tag ps-scope-default">
                                        Default
                                    </span>
                                )}
                            </div>

                            <div className="ps-card-stats">
                                <div className="ps-stat">
                                    <span className="ps-stat-value">
                                        {set.items?.length || set.item_count || 0}
                                    </span>
                                    <span className="ps-stat-label">items</span>
                                </div>
                                <div className="ps-stat">
                                    <span className="ps-stat-value">
                                        {currency}{parseFloat(set.total_value || 0).toLocaleString('en-IN')}
                                    </span>
                                    <span className="ps-stat-label">value</span>
                                </div>
                            </div>

                            {set.items && set.items.length > 0 && (
                                <div className="ps-card-items">
                                    {set.items.slice(0, 4).map((item, i) => (
                                        <div key={i} className="ps-item-row">
                                            <span className="ps-item-name">{item.product_name}</span>
                                            <span className="ps-item-qty">×{item.quantity}</span>
                                        </div>
                                    ))}
                                    {set.items.length > 4 && (
                                        <div className="ps-item-more">
                                            +{set.items.length - 4} more items
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Form Modal */}
            {showForm && (
                <div className="ps-overlay" onClick={() => setShowForm(false)}>
                    <div className="ps-modal" onClick={e => e.stopPropagation()}>
                        <form onSubmit={handleSave}>
                            <div className="ps-modal-header">
                                <h2>{editingSet ? 'Edit Product Set' : 'Create Product Set'}</h2>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setShowForm(false)}
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="ps-modal-body">
                                {/* Set Details */}
                                <div className="ps-form-section">
                                    <h3>Set Details</h3>
                                    <div className="ps-form-grid">
                                        <div className="form-group">
                                            <label>
                                                <input
                                                    type="checkbox"
                                                    checked={formData.is_active}
                                                    onChange={e => setFormData(p => ({ ...p, is_active: e.target.checked }))}
                                                    style={{ marginRight: '0.5rem' }}
                                                />
                                                Active
                                            </label>
                                        </div>
                                        <div className="form-group full-width">
                                            <label>Description</label>
                                            <textarea
                                                value={formData.description}
                                                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                                                rows={2}
                                                placeholder="Optional notes about this set"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Scope */}
                                <div className="ps-form-section">
                                    <h3>Scope</h3>
                                    <p className="ps-scope-hint">
                                        Class is required. Leave School empty for a default set that applies to all schools.
                                    </p>
                                    <div className="ps-form-grid">
                                        <div className="form-group">
                                            <label>Class <span className="required-star">*</span></label>
                                            <select
                                                value={formData.class_name}
                                                onChange={e => setFormData(p => ({ 
                                                    ...p, 
                                                    class_name: e.target.value,
                                                    division_name: '',
                                                    subdivision_name: ''
                                                }))}
                                                required
                                            >
                                                <option value="">Select Class</option>
                                                {classTemplates.map(ct => (
                                                    <option key={ct.id} value={ct.name}>{ct.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>School <span className="ps-optional">(optional override)</span></label>
                                            <select
                                                value={formData.school}
                                                onChange={e => setFormData(p => ({ 
                                                    ...p, 
                                                    school: e.target.value,
                                                    division_name: '',
                                                    subdivision_name: ''
                                                }))}
                                            >
                                                <option value="">All Schools (Default)</option>
                                                {schools.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Division <span className="ps-optional">(optional)</span></label>
                                            <select
                                                value={formData.division_name}
                                                onChange={e => setFormData(p => ({ ...p, division_name: e.target.value, subdivision_name: '' }))}
                                                disabled={!formData.school || !formData.class_name}
                                            >
                                                <option value="">Select Division (e.g. A, B)</option>
                                                {getValidDivisions().map(d => (
                                                    <option key={d.id} value={d.name}>{d.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Subdivision <span className="ps-optional">(optional)</span></label>
                                            <select
                                                value={formData.subdivision_name}
                                                onChange={e => setFormData(p => ({ ...p, subdivision_name: e.target.value }))}
                                                disabled={!formData.school || !formData.division_name}
                                            >
                                                <option value="">Select Subdivision (e.g. Gujarati Medium)</option>
                                                {getValidSubdivisions().map(sd => (
                                                    <option key={sd.id} value={sd.name}>{sd.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Products */}
                                <div className="ps-form-section">
                                    <h3>Products ({formItems.length})</h3>

                                    {/* Search */}
                                    <div className="ps-product-search" style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            value={productSearch}
                                            onChange={e => handleProductSearch(e.target.value)}
                                            placeholder="Search products to add..."
                                        />
                                        {searchingProducts && (
                                            <span className="ps-search-spinner">⟳</span>
                                        )}
                                        {productResults.length > 0 && (
                                            <div className="ps-search-dropdown">
                                                {productResults.map(p => (
                                                    <div
                                                        key={p.id}
                                                        className="ps-search-item"
                                                        onClick={() => addProduct(p)}
                                                    >
                                                        <span>{p.name}</span>
                                                        <span className="ps-search-price">
                                                            {currency}{parseFloat(p.selling_price).toLocaleString('en-IN')}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Items table */}
                                    {formItems.length > 0 ? (
                                        <div className="ps-items-table">
                                            <div className="ps-items-header">
                                                <span>Product</span>
                                                <span>Price</span>
                                                <span>Qty</span>
                                                <span>Total</span>
                                                <span></span>
                                            </div>
                                            {formItems.map((item, idx) => (
                                                <div key={idx} className="ps-items-row">
                                                    <span className="ps-items-name">{item.product_name}</span>
                                                    <span>{currency}{parseFloat(item.selling_price).toLocaleString('en-IN')}</span>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={item.quantity}
                                                        onChange={e => updateItemQty(idx, e.target.value)}
                                                        className="ps-qty-input"
                                                    />
                                                    <span className="ps-items-total">
                                                        {currency}{(parseFloat(item.selling_price) * item.quantity).toLocaleString('en-IN')}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm ps-btn-delete"
                                                        onClick={() => removeProduct(idx)}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ))}
                                            <div className="ps-items-footer">
                                                <span>Total: {formItems.length} items</span>
                                                <span className="ps-items-grand-total">
                                                    {currency}{setTotal.toLocaleString('en-IN')}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="ps-no-items">
                                            Search and add products above
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="ps-modal-footer">
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    onClick={() => setShowForm(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={saving}
                                >
                                    {saving ? 'Saving...' : (editingSet ? 'Update Set' : 'Create Set')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import usePermissions from '../../utils/usePermissions';
import { useCurrency } from '../../context/CurrencyContext';
import CategoryModal from './CategoryModal';
import VendorModal from './VendorModal';
import { compressImage } from '../../utils/imageCompression';
import './ProductForm.css';

export default function ProductForm({ initialData = null, isEdit = false }) {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const { hasPermission } = usePermissions();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const canViewCost = hasPermission('finance.manage_expenses') || hasPermission('finance.view_reports');

    // LENS-02/10/01: Validation & feedback state
    const [fieldErrors, setFieldErrors] = useState({});
    const [submitError, setSubmitError] = useState(null);
    const [submitSuccess, setSubmitSuccess] = useState(null);

    // Dropdown data
    const [categories, setCategories] = useState([]);
    const [vendors, setVendors] = useState([]);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        category: '',
        vendor: '',
        cost_price: '0',
        selling_price: '',
        default_commission_type: 'percent',
        default_commission_value: '0',
        stock_quantity: '',
        low_stock_threshold: '5',
        is_additional: false
    });

    const [tags, setTags] = useState([]);
    const [tagInput, setTagInput] = useState('');
    const [images, setImages] = useState([]);
    const [thumbnails, setThumbnails] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [existingImages, setExistingImages] = useState([]); // For edit mode

    // Modal State
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                description: initialData.description || '',
                category: initialData.category?.id || initialData.category || '',
                vendor: initialData.vendor?.id || initialData.vendor || '',
                cost_price: initialData.cost_price || '',
                selling_price: initialData.selling_price || '',
                default_commission_type: initialData.default_commission_type || 'percent',
                default_commission_value: initialData.default_commission_value ?? '0',
                stock_quantity: initialData.stock_quantity || '',
                low_stock_threshold: initialData.low_stock_threshold || '5',
                is_additional: initialData.is_additional || false
            });
            setTags(initialData.tags ? initialData.tags.map(t => t.name || t) : []);
            setExistingImages(initialData.images || []);
        }
    }, [initialData]);

    useEffect(() => {
        const fetchDropdowns = async () => {
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
                console.error('Error fetching dropdowns:', error);
            }
        };
        fetchDropdowns();
    }, [fetchWithAuth]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        // Clear field error when user starts fixing it
        if (fieldErrors[name]) {
            setFieldErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    const handleCommissionChange = (type, value) => {
        setFormData(prev => ({
            ...prev,
            default_commission_type: type,
            default_commission_value: value
        }));
        if (fieldErrors.default_commission_value) {
            setFieldErrors(prev => ({ ...prev, default_commission_value: null }));
        }
    };

    // LENS-02 + LENS-10: Client-side validation
    const validate = () => {
        const errors = {};
        if (!formData.name.trim()) {
            errors.name = 'Product name is required';
        }
        if (!formData.selling_price && formData.selling_price !== 0) {
            errors.selling_price = 'Selling price is required';
        } else if (Number(formData.selling_price) < 0) {
            errors.selling_price = 'Selling price cannot be negative';
        }
        if (formData.cost_price && Number(formData.cost_price) < 0) {
            errors.cost_price = 'Cost price cannot be negative';
        }
        if (!isEdit && formData.stock_quantity && Number(formData.stock_quantity) < 0) {
            errors.stock_quantity = 'Stock quantity cannot be negative';
        }
        if (formData.low_stock_threshold && Number(formData.low_stock_threshold) < 0) {
            errors.low_stock_threshold = 'Threshold cannot be negative';
        }
        
        const sp = Number(formData.selling_price) || 0;
        const cp = Number(formData.cost_price) || 0;
        const marginVal = Math.max(0, sp - cp);
        const cVal = Number(formData.default_commission_value) || 0;
        
        if (formData.default_commission_type === 'fixed') {
            if (cVal > sp) {
                errors.default_commission_value = `Fixed commission (${currency}${cVal.toFixed(2)}) cannot exceed selling price (${currency}${sp.toFixed(2)})`;
            }
        } else {
            // Percent mode: cap at 100% of margin
            if (cVal > 100) {
                errors.default_commission_value = 'Commission percentage cannot exceed 100%';
            }
            const computedAmount = marginVal > 0 ? (cVal / 100 * marginVal) : 0;
            if (computedAmount > sp) {
                errors.default_commission_value = `Resulting commission (${currency}${computedAmount.toFixed(2)}) exceeds selling price (${currency}${sp.toFixed(2)})`;
            }
        }

        return errors;
    };

    const handleTagKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const newTag = tagInput.trim();
            if (newTag && !tags.includes(newTag)) {
                setTags([...tags, newTag]);
                setTagInput('');
            }
        }
    };

    const removeTag = (tagToRemove) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
    };

    const handleImageChange = async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        
        // Show loading state while compressing
        setLoading(true);
        try {
            const compressedResults = await Promise.all(
                files.map(f => compressImage(f))
            );
            
            const optimizedFiles = compressedResults.map(r => r.file);
            const thumbFiles = compressedResults.map(r => r.thumbnail);
            const newPreviews = compressedResults.map(r => r.previewUrl);
            
            setImages(prev => [...prev, ...optimizedFiles]);
            setThumbnails(prev => [...prev, ...thumbFiles]);
            setImagePreviews(prev => [...prev, ...newPreviews]);
        } catch (error) {
            console.error('Image compression failed:', error);
            setSubmitError('Failed to process one or more images. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCategoryAdded = (newCategory) => {
        setCategories(prev => [...prev, newCategory]);
        setFormData(prev => ({ ...prev, category: newCategory.id }));
    };

    const handleVendorAdded = (newVendor) => {
        setVendors(prev => [...prev, newVendor]);
        setFormData(prev => ({ ...prev, vendor: newVendor.id }));
    };

    const removeImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
        setThumbnails(prev => prev.filter((_, i) => i !== index));
        setImagePreviews(prev => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    const removeExistingImage = async (imageId) => {
        if (!isEdit || !initialData?.id || !imageId) return;
        
        try {
            setLoading(true);
            const url = `${ENDPOINTS.INVENTORY_PRODUCTS}${initialData.id}/remove_image/`;
            const response = await fetchWithAuth(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_id: imageId })
            });

            if (response.ok) {
                setExistingImages(prev => prev.filter(img => img.id !== imageId));
                setSubmitSuccess('Image removed successfully.');
                setTimeout(() => setSubmitSuccess(null), 3000);
            } else {
                setSubmitError('Failed to remove image from server.');
                setTimeout(() => setSubmitError(null), 3000);
            }
        } catch (error) {
            console.error('Error removing image:', error);
            setSubmitError('Error removing image.');
            setTimeout(() => setSubmitError(null), 3000);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (addAnother = false) => {
        // LENS-02: Run client-side validation first
        const errors = validate();
        setFieldErrors(errors);
        setSubmitError(null);
        setSubmitSuccess(null);

        if (Object.keys(errors).length > 0) {
            // Scroll to first error
            const firstErrorField = document.querySelector('.field-error');
            if (firstErrorField) firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        setLoading(true);
        try {
            const submitData = new FormData();

            Object.keys(formData).forEach(key => {
                if (key === 'cost_price' && !canViewCost) return; // Prevent overwriting cost_price if restricted
                submitData.append(key, formData[key] === null ? '' : formData[key]);
            });

            tags.forEach(tag => {
                submitData.append('tags', tag);
            });

            images.forEach(image => {
                submitData.append('images', image);
            });

            thumbnails.forEach(thumb => {
                submitData.append('thumbnails', thumb);
            });

            const url = isEdit && initialData?.id
                ? `${ENDPOINTS.INVENTORY_PRODUCTS}${initialData.id}/`
                : ENDPOINTS.INVENTORY_PRODUCTS;

            const method = isEdit ? 'PATCH' : 'POST';

            const response = await fetchWithAuth(url, {
                method: method,
                headers: {},
                body: submitData
            });

            if (response.ok) {
                if (addAnother && !isEdit) {
                    setFormData({
                        name: '',
                        description: '',
                        category: '',
                        vendor: '',
                        cost_price: '0',
                        selling_price: '',
                        default_commission_type: 'percent',
                        default_commission_value: '0',
                        stock_quantity: '',
                        low_stock_threshold: '5',
                        is_additional: false
                    });
                    setTags([]);
                    setImages([]);
                    setThumbnails([]);
                    setImagePreviews([]);
                    setTagInput('');
                    setFieldErrors({});
                    setSubmitSuccess('Product saved successfully!');
                    window.scrollTo(0, 0);
                    // Auto-clear success message after 3s
                    setTimeout(() => setSubmitSuccess(null), 3000);
                } else {
                    navigate('/inventory');
                }
            } else {
                // LENS-01: Inline error instead of alert()
                try {
                    const errorData = await response.json();
                    // Map server-side field errors to field-level display
                    const serverFieldErrors = {};
                    Object.keys(errorData).forEach(key => {
                        if (key !== 'detail' && key !== 'non_field_errors') {
                            serverFieldErrors[key] = Array.isArray(errorData[key]) ? errorData[key][0] : errorData[key];
                        }
                    });
                    if (Object.keys(serverFieldErrors).length > 0) {
                        setFieldErrors(serverFieldErrors);
                    }
                    const message = errorData.detail || errorData.non_field_errors?.[0] || 'Failed to save product. Please check the form.';
                    setSubmitError(message);
                } catch {
                    setSubmitError('Failed to save product. Please check the form.');
                }
            }
        } catch (error) {
            console.error('Error saving product:', error);
            // LENS-01: Inline error instead of alert()
            setSubmitError('A network error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Calculate derived commission values for live converter
    const sp = Number(formData.selling_price) || 0;
    const cp = Number(formData.cost_price) || 0;
    const margin = Math.max(0, sp - cp);
    const cType = formData.default_commission_type;
    const cVal = Number(formData.default_commission_value) || 0;

    let displayPercent = '';
    let displayFixed = '';
    let commissionAmount = 0;

    if (cType === 'percent') {
        displayPercent = formData.default_commission_value;
        commissionAmount = margin > 0 ? (cVal / 100 * margin) : 0;
        displayFixed = commissionAmount.toFixed(2);
    } else {
        displayFixed = formData.default_commission_value;
        commissionAmount = cVal;
        displayPercent = margin > 0 ? ((cVal / margin) * 100).toFixed(2) : '0.00';
    }

    const commissionWarning = commissionAmount > margin ? `Warning: Commission (${currency}${commissionAmount.toFixed(2)}) exceeds margin (${currency}${margin.toFixed(2)})` : null;

    return (
        <div className="product-form-container">
            <div className="card product-form">
                <div className="form-section">
                    <h3>Basic Information</h3>
                    <div className="form-group">
                        <label>Product Name <span className="required-mark">*</span></label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            className={fieldErrors.name ? 'input-error' : ''}
                        />
                        {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleInputChange}
                            rows="3"
                        />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Category</label>
                            <div className="input-with-action">
                                <select
                                    name="category"
                                    required
                                    value={formData.category}
                                    onChange={handleInputChange}
                                >
                                    <option value="">Select Category</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <button type="button" className="btn-icon-add" onClick={() => setIsCategoryModalOpen(true)} title="Add Category">+</button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Vendor</label>
                            <div className="input-with-action">
                                <select
                                    name="vendor"
                                    value={formData.vendor}
                                    onChange={handleInputChange}
                                >
                                    <option value="">Select Vendor</option>
                                    {vendors.map(v => (
                                        <option key={v.id} value={v.id}>{v.name}</option>
                                    ))}
                                </select>
                                <button type="button" className="btn-icon-add" onClick={() => setIsVendorModalOpen(true)} title="Add Vendor">+</button>
                            </div>
                        </div>
                    </div>
                    <div className="form-group checkbox-group">
                        <input
                            type="checkbox"
                            name="is_additional"
                            id="is_additional"
                            checked={formData.is_additional}
                            onChange={handleInputChange}
                        />
                        <label htmlFor="is_additional">This is a service or add-on (not a physical product)</label>
                        <small className="helper-text">Services and add-ons won't track stock levels</small>
                    </div>
                </div>

                <div className="form-section">
                    <h3>Pricing & Inventory</h3>
                    <div className="form-row">
                        {canViewCost && (
                            <div className="form-group">
                                <label>Cost Price ({currency})</label>
                                <input
                                    type="number"
                                    name="cost_price"
                                    value={formData.cost_price}
                                    onChange={handleInputChange}
                                    min="0"
                                    step="0.01"
                                    className={fieldErrors.cost_price ? 'input-error' : ''}
                                />
                                {fieldErrors.cost_price && <span className="field-error">{fieldErrors.cost_price}</span>}
                                <small className="helper-text">What you paid the supplier</small>
                            </div>
                        )}
                        <div className="form-group">
                            <label>Selling Price ({currency}) <span className="required-mark">*</span></label>
                            <input
                                type="number"
                                name="selling_price"
                                value={formData.selling_price}
                                onChange={handleInputChange}
                                min="0"
                                step="0.01"
                                className={fieldErrors.selling_price ? 'input-error' : ''}
                            />
                            {fieldErrors.selling_price && <span className="field-error">{fieldErrors.selling_price}</span>}
                            <small className="helper-text">What the customer pays</small>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group" style={{ flex: '1 1 100%' }}>
                            <label>Default Commission (Live Converter)</label>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div className="input-with-action" style={{ flex: 1 }}>
                                    <span style={{ padding: '0 10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRight: 'none', borderRadius: '4px 0 0 4px', display: 'flex', alignItems: 'center' }}>%</span>
                                    <input
                                        type="number"
                                        value={displayPercent}
                                        onChange={(e) => handleCommissionChange('percent', e.target.value)}
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        style={{ borderRadius: '0 4px 4px 0' }}
                                        className={fieldErrors.default_commission_value && cType === 'percent' ? 'input-error' : ''}
                                        placeholder="0.00"
                                    />
                                </div>
                                <span>⇌</span>
                                <div className="input-with-action" style={{ flex: 1 }}>
                                    <span style={{ padding: '0 10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRight: 'none', borderRadius: '4px 0 0 4px', display: 'flex', alignItems: 'center' }}>{currency}</span>
                                    <input
                                        type="number"
                                        value={displayFixed}
                                        onChange={(e) => handleCommissionChange('fixed', e.target.value)}
                                        min="0"
                                        step="0.01"
                                        style={{ borderRadius: '0 4px 4px 0' }}
                                        className={fieldErrors.default_commission_value && cType === 'fixed' ? 'input-error' : ''}
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            {fieldErrors.default_commission_value && <span className="field-error">{fieldErrors.default_commission_value}</span>}
                            {commissionWarning && <span className="field-warning" style={{ color: 'var(--color-warning, #f59e0b)', display: 'block', marginTop: '4px', fontSize: '0.875rem' }}>{commissionWarning}</span>}
                            <small className="helper-text">Commission retained by outlets on consignment sales. Edit either field to sync.</small>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Initial Stock</label>
                            <input
                                type="number"
                                name="stock_quantity"
                                value={formData.stock_quantity}
                                onChange={handleInputChange}
                                min="0"
                                disabled={isEdit}
                                className={fieldErrors.stock_quantity ? 'input-error' : ''}
                            />
                            {fieldErrors.stock_quantity && <span className="field-error">{fieldErrors.stock_quantity}</span>}
                            {isEdit && <small className="helper-text">Use Stock Control for adjustments</small>}
                        </div>
                        <div className="form-group">
                            <label>Low Stock Threshold</label>
                            <input
                                type="number"
                                name="low_stock_threshold"
                                value={formData.low_stock_threshold}
                                onChange={handleInputChange}
                                min="0"
                                className={fieldErrors.low_stock_threshold ? 'input-error' : ''}
                            />
                            {fieldErrors.low_stock_threshold && <span className="field-error">{fieldErrors.low_stock_threshold}</span>}
                            <small className="helper-text">You'll see an alert when stock drops below this number</small>
                        </div>
                    </div>
                </div>

                <div className="form-section">
                    <h3>Organization & Media</h3>
                    <div className="form-group">
                        <label>Tags</label>
                        <div className="tags-input-container">
                            {tags.map((tag, index) => (
                                <span key={index} className="tag-chip">
                                    {tag}
                                    <button type="button" className="tag-remove" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>×</button>
                                </span>
                            ))}
                            <input
                                type="text"
                                className="tags-input"
                                placeholder="Type and press Enter..."
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                            />
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Images</label>
                        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                            <label className="image-upload-container" style={{ flex: 1, cursor: 'pointer', margin: 0, padding: 'var(--space-lg) var(--space-sm)' }}>
                                <span style={{ fontSize: '2rem' }}>📁</span>
                                <p style={{ marginTop: '8px' }}>Upload Images</p>
                                <input
                                    type="file"
                                    multiple
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={handleImageChange}
                                />
                            </label>
                            <label className="image-upload-container" style={{ flex: 1, cursor: 'pointer', margin: 0, padding: 'var(--space-lg) var(--space-sm)' }}>
                                <span style={{ fontSize: '2rem' }}>📷</span>
                                <p style={{ marginTop: '8px' }}>Take Photo</p>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: 'none' }}
                                    onChange={handleImageChange}
                                />
                            </label>
                        </div>

                        {/* Existing Images (Edit Mode) */}
                        {existingImages.length > 0 && (
                            <div className="image-previews existing">
                                <h4>Current Images:</h4>
                                <div className="preview-grid">
                                    {existingImages.map((img, index) => (
                                        <div key={index} className="image-preview">
                                            <img src={img.thumbnail || img.image || img} alt={`Existing ${index}`} />
                                            {img.id && (
                                                <button 
                                                    type="button" 
                                                    className="remove-image" 
                                                    onClick={() => removeExistingImage(img.id)}
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* New Upload Previews */}
                        {imagePreviews.length > 0 && (
                            <div className="image-previews">
                                <h4>New Uploads:</h4>
                                <div className="preview-grid">
                                    {imagePreviews.map((src, index) => (
                                        <div key={index} className="image-preview">
                                            <img src={src} alt={`Preview ${index}`} />
                                            <button className="remove-image" onClick={() => removeImage(index)}>×</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* LENS-01: Inline submit feedback — at bottom near buttons */}
                {submitError && (
                    <div className="form-error-banner" role="alert">
                        <span>⚠️ {submitError}</span>
                        <button type="button" className="banner-dismiss" onClick={() => setSubmitError(null)}>×</button>
                    </div>
                )}
                {submitSuccess && (
                    <div className="form-success-banner" role="status">
                        <span>✓ {submitSuccess}</span>
                    </div>
                )}

                <div className="form-actions">
                    <button className="btn btn-ghost" onClick={() => navigate('/inventory')} disabled={loading}>
                        Cancel
                    </button>
                    {!isEdit && (
                        <button className="btn btn-secondary" onClick={() => handleSubmit(true)} disabled={loading}>
                            {loading ? 'Saving...' : 'Save & Add Another'}
                        </button>
                    )}
                    <button className="btn btn-primary" onClick={() => handleSubmit(false)} disabled={loading}>
                        {loading ? 'Saving...' : (isEdit ? 'Update Product' : 'Save Product')}
                    </button>
                </div>
            </div>
            {loading && <div className="loading-overlay">Saving...</div>}

            <CategoryModal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                onSuccess={handleCategoryAdded}
            />
            <VendorModal
                isOpen={isVendorModalOpen}
                onClose={() => setIsVendorModalOpen(false)}
                onSuccess={handleVendorAdded}
            />
        </div>
    );
}

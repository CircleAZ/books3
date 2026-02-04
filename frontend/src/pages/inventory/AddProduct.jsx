import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './AddProduct.css';

export default function AddProduct() {
    const { fetchWithAuth } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    
    // Dropdown data
    const [categories, setCategories] = useState([]);
    const [vendors, setVendors] = useState([]);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        category: '',
        vendor: '',
        cost_price: '',
        selling_price: '',
        stock_quantity: '',
        low_stock_threshold: '5',
        is_additional: false
    });

    const [tags, setTags] = useState([]);
    const [tagInput, setTagInput] = useState('');
    const [images, setImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);

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

    const handleImageChange = (e) => {
        const files = Array.from(e.target.files);
        setImages(prev => [...prev, ...files]);

        const newPreviews = files.map(file => URL.createObjectURL(file));
        setImagePreviews(prev => [...prev, ...newPreviews]);
    };

    const removeImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
        setImagePreviews(prev => {
            // Revoke URL to avoid memory leaks
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSubmit = async (addAnother = false) => {
        setLoading(true);
        try {
            const submitData = new FormData();
            
            // Append basic fields
            Object.keys(formData).forEach(key => {
                submitData.append(key, formData[key]);
            });

            // Append tags (handling as list or string depending on backend, sending as multiple keys usually works for lists in FormData)
            tags.forEach(tag => {
                submitData.append('tags', tag);
            });

            // Append images
            images.forEach(image => {
                submitData.append('images', image);
            });

            const response = await fetchWithAuth(ENDPOINTS.INVENTORY_PRODUCTS, {
                method: 'POST',
                // Content-Type header should be left undefined for FormData so browser sets boundary
                headers: {}, 
                body: submitData
            });

            if (response.ok) {
                if (addAnother) {
                    // Reset form
                    setFormData({
                        name: '',
                        description: '',
                        category: '',
                        vendor: '',
                        cost_price: '',
                        selling_price: '',
                        stock_quantity: '',
                        low_stock_threshold: '5',
                        is_additional: false
                    });
                    setTags([]);
                    setImages([]);
                    setImagePreviews([]);
                    setTagInput('');
                    window.scrollTo(0, 0);
                } else {
                    navigate('/inventory');
                }
            } else {
                const errorData = await response.json();
                console.error('Failed to create product:', errorData);
                alert('Failed to create product. Please check the form.');
            }
        } catch (error) {
            console.error('Error creating product:', error);
            alert('An error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="add-product-container fade-in">
            <div className="add-product-header">
                <h2>Add New Product</h2>
            </div>

            <div className="card add-product-form">
                <div className="form-section">
                    <h3>Basic Information</h3>
                    <div className="form-group">
                        <label>Product Name</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            required
                        />
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
                            <select
                                name="category"
                                value={formData.category}
                                onChange={handleInputChange}
                            >
                                <option value="">Select Category</option>
                                {categories.map(cat => (
                                    <option key={cat.id || cat.name} value={cat.id || cat.name}>{cat.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Vendor</label>
                            <select
                                name="vendor"
                                value={formData.vendor}
                                onChange={handleInputChange}
                            >
                                <option value="">Select Vendor</option>
                                {vendors.map(vend => (
                                    <option key={vend.id || vend.name} value={vend.id || vend.name}>{vend.name}</option>
                                ))}
                            </select>
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
                        <label htmlFor="is_additional">Is Additional Product (e.g. Service/Add-on)</label>
                    </div>
                </div>

                <div className="form-section">
                    <h3>Pricing & Inventory</h3>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Cost Price ($)</label>
                            <input
                                type="number"
                                name="cost_price"
                                value={formData.cost_price}
                                onChange={handleInputChange}
                                min="0"
                                step="0.01"
                            />
                        </div>
                        <div className="form-group">
                            <label>Selling Price ($)</label>
                            <input
                                type="number"
                                name="selling_price"
                                value={formData.selling_price}
                                onChange={handleInputChange}
                                min="0"
                                step="0.01"
                                required
                            />
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
                            />
                        </div>
                        <div className="form-group">
                            <label>Low Stock Threshold</label>
                            <input
                                type="number"
                                name="low_stock_threshold"
                                value={formData.low_stock_threshold}
                                onChange={handleInputChange}
                                min="0"
                            />
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
                                    <span className="tag-remove" onClick={() => removeTag(tag)}>×</span>
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
                        <div className="image-upload-container" onClick={() => document.getElementById('image-input').click()}>
                            <p>Click to upload images</p>
                            <input
                                type="file"
                                id="image-input"
                                multiple
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={handleImageChange}
                            />
                        </div>
                        {imagePreviews.length > 0 && (
                            <div className="image-previews">
                                {imagePreviews.map((src, index) => (
                                    <div key={index} className="image-preview">
                                        <img src={src} alt={`Preview ${index}`} />
                                        <button className="remove-image" onClick={() => removeImage(index)}>×</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="form-actions">
                    <button className="btn btn-ghost" onClick={() => navigate('/inventory')} disabled={loading}>
                        Cancel
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleSubmit(true)} disabled={loading}>
                        {loading ? 'Saving...' : 'Save & Add Another'}
                    </button>
                    <button className="btn btn-primary" onClick={() => handleSubmit(false)} disabled={loading}>
                        {loading ? 'Saving...' : 'Save Product'}
                    </button>
                </div>
            </div>
        </div>
    );
}

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../context/CurrencyContext';
import { ENDPOINTS } from '../../config/api';
import './AddExpense.css';

export default function AddExpense() {
    const { fetchWithAuth } = useAuth();
    const { currency } = useCurrency();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    // Dropdown data
    const [categories, setCategories] = useState([]);

    // Form State
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        category: '',
        payee_type: 'vendor',
        payee_name: '',
        amount: '',
        tax_amount: '0',
        description: '',
        payment_status: 'unpaid'
    });

    const [errors, setErrors] = useState({});

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const response = await fetchWithAuth(ENDPOINTS.FINANCE_EXPENSE_CATEGORIES);
                if (response.ok) {
                    const data = await response.json();
                    setCategories(data.results || data || []);
                }
            } catch (error) {
                console.error('Error fetching categories:', error);
            }
        };
        fetchCategories();
    }, [fetchWithAuth]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        // Clear error when field is modified
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const totalAmount = useMemo(() => {
        const amt = parseFloat(formData.amount) || 0;
        const tax = parseFloat(formData.tax_amount) || 0;
        return (amt + tax).toFixed(2);
    }, [formData.amount, formData.tax_amount]);

    const validateForm = () => {
        const newErrors = {};
        if (!formData.date) newErrors.date = 'Date is required';
        if (!formData.category) newErrors.category = 'Category is required';
        if (!formData.payee_name) newErrors.payee_name = 'Payee name is required';
        if (!formData.amount || parseFloat(formData.amount) <= 0) {
            newErrors.amount = 'Valid amount is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setLoading(true);
        try {
            const totalAmt = parseFloat(totalAmount);
            const submitData = {
                ...formData,
                amount: parseFloat(formData.amount),
                tax_amount: parseFloat(formData.tax_amount),
                total_amount: totalAmt,
                paid_amount: formData.payment_status === 'paid' ? totalAmt : 0
            };

            const response = await fetchWithAuth(ENDPOINTS.FINANCE_EXPENSES, {
                method: 'POST',
                body: JSON.stringify(submitData)
            });

            if (response.ok) {
                navigate('/finance/expenses');
            } else {
                const errorData = await response.json();
                setErrors(errorData);
                console.error('Failed to create expense:', errorData);
            }
        } catch (error) {
            console.error('Error creating expense:', error);
            alert('An error occurred while saving the expense.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="add-expense-container fade-in">
            <div className="add-expense-header">
                <h2>Record New Expense</h2>
                <p>Enter details of the business expenditure</p>
            </div>

            <form className="glass-card add-expense-form" onSubmit={handleSubmit}>
                <div className="form-grid">
                    <div className="form-section">
                        <h3>General Details</h3>

                        <div className="form-group">
                            <label>Date *</label>
                            <input
                                type="date"
                                name="date"
                                value={formData.date}
                                onChange={handleInputChange}
                                className={errors.date ? 'error' : ''}
                            />
                            {errors.date && <span className="error-text">{errors.date}</span>}
                        </div>

                        <div className="form-group">
                            <label>Category *</label>
                            <select
                                name="category"
                                value={formData.category}
                                onChange={handleInputChange}
                                className={errors.category ? 'error' : ''}
                            >
                                <option value="">Select Category</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                            {errors.category && <span className="error-text">{errors.category}</span>}
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Payee Type</label>
                                <select
                                    name="payee_type"
                                    value={formData.payee_type}
                                    onChange={handleInputChange}
                                >
                                    <option value="vendor">Vendor</option>
                                    <option value="employee">Employee</option>
                                    <option value="customer">Customer</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Payee Name *</label>
                                <input
                                    type="text"
                                    name="payee_name"
                                    placeholder="Enter payee name"
                                    value={formData.payee_name}
                                    onChange={handleInputChange}
                                    className={errors.payee_name ? 'error' : ''}
                                />
                                {errors.payee_name && <span className="error-text">{errors.payee_name}</span>}
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <h3>Financial Details</h3>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Amount ({currency}) *</label>
                                <input
                                    type="number"
                                    name="amount"
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                    value={formData.amount}
                                    onChange={handleInputChange}
                                    className={errors.amount ? 'error' : ''}
                                />
                                {errors.amount && <span className="error-text">{errors.amount}</span>}
                            </div>
                            <div className="form-group">
                                <label>Tax Amount ({currency})</label>
                                <input
                                    type="number"
                                    name="tax_amount"
                                    placeholder="0.00"
                                    step="0.01"
                                    min="0"
                                    value={formData.tax_amount}
                                    onChange={handleInputChange}
                                />
                            </div>
                        </div>

                        <div className="total-display">
                            <span>Total Expenditure:</span>
                            <span className="amount">{currency}{totalAmount}</span>
                        </div>

                        <div className="form-group">
                            <label>Payment Status</label>
                            <div className="status-selector">
                                <label className={`status-option ${formData.payment_status === 'paid' ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="payment_status"
                                        value="paid"
                                        checked={formData.payment_status === 'paid'}
                                        onChange={handleInputChange}
                                    />
                                    Paid
                                </label>
                                <label className={`status-option ${formData.payment_status === 'partial' ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="payment_status"
                                        value="partial"
                                        checked={formData.payment_status === 'partial'}
                                        onChange={handleInputChange}
                                    />
                                    Partial
                                </label>
                                <label className={`status-option ${formData.payment_status === 'unpaid' ? 'active' : ''}`}>
                                    <input
                                        type="radio"
                                        name="payment_status"
                                        value="unpaid"
                                        checked={formData.payment_status === 'unpaid'}
                                        onChange={handleInputChange}
                                    />
                                    Unpaid
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="form-section full-width">
                    <label>Description / Notes</label>
                    <textarea
                        name="description"
                        rows="3"
                        placeholder="Additional details about this expense..."
                        value={formData.description}
                        onChange={handleInputChange}
                    ></textarea>
                </div>

                <div className="form-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => navigate('/finance/expenses')} disabled={loading}>
                        Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                        {loading ? 'Saving...' : 'Save Expense'}
                    </button>
                </div>
            </form>
        </div>
    );
}

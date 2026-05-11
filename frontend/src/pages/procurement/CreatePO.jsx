import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPurchaseOrder } from '../../services/procurementService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';

export default function CreatePO() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    // Extremely basic form state just to prevent crash
    const [formData, setFormData] = useState({
        vendor_id: '',
        expected_delivery_date: '',
        notes: '',
        items: []
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Note: In a real implementation this needs a vendor select and product search.
            const po = await createPurchaseOrder(formData);
            navigate(`/procurement/${po.id}`);
        } catch (error) {
            console.error("Failed to create PO", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container">
            <PageHeader 
                title="Create Purchase Order" 
                showBack={true}
            />

            <div className="content-area">
                <Card>
                    <div className="card-header">
                        <h3>PO Details</h3>
                    </div>
                    <div className="card-body">
                        <p className="text-muted">This interface requires the Vendor Selection and Product Search components to be wired up. Phase 4 UI development is pending.</p>
                        
                        <form onSubmit={handleSubmit} className="standard-form mt-4">
                            <div className="form-group">
                                <label>Vendor ID (Temporary)</label>
                                <input 
                                    type="number" 
                                    className="form-control"
                                    value={formData.vendor_id}
                                    onChange={(e) => setFormData({...formData, vendor_id: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="form-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Creating...' : 'Create PO'}
                                </button>
                            </div>
                        </form>
                    </div>
                </Card>
            </div>
        </div>
    );
}

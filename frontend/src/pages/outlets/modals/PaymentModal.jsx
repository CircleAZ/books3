import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ENDPOINTS } from '../../../config/api';
import { useToast } from '../../../context/ToastContext';

import '../../../styles/components/page-layout.css';
import '../../../styles/components/form-layout.css';
import '../../../styles/components/modal-system.css';
import UniversalPaymentEngine from '../../../components/common/UniversalPaymentEngine';

export default function PaymentModal({ isOpen, onClose, outletId, outstandingBalance, onPaymentComplete }) {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    
    const [paymentPayload, setPaymentPayload] = useState(null);
    
    const [formData, setFormData] = useState({
        outlet: outletId,
        date: new Date().toISOString().split('T')[0],
        reference_id: '',
        notes: ''
    });

    useEffect(() => {
        if (isOpen) {
            setFormData({
                outlet: outletId,
                date: new Date().toISOString().split('T')[0],
                reference_id: '',
                notes: ''
            });
            setPaymentPayload(null);
        }
    }, [isOpen, outletId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!paymentPayload) return;

        setLoading(true);
        try {
            const payload = { ...formData, ...paymentPayload };

            // The backend ViewSet / Serializer should handle the link to bank_transaction/wallet_transaction.
            // We pass extra context fields.
            const response = await fetchWithAuth(ENDPOINTS.OUTLETS_PAYMENTS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                showToast("Payment recorded and injected into finance ledger", "success");
                onPaymentComplete();
                onClose();
            } else {
                showToast("Failed to record payment", "error");
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to record payment", "error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content" style={contentStyle}>
                <h2>Log Outlet Payment</h2>
                <p className="page-subtitle mb-4">Outstanding Balance: ₹{outstandingBalance}</p>

                <form onSubmit={handleSubmit} className="form-layout">
                    <div className="form-row">
                        <div className="form-group">
                            <label>Payment Date *</label>
                            <input 
                                type="date" 
                                required 
                                className="form-input"
                                value={formData.date}
                                onChange={e => setFormData({...formData, date: e.target.value})}
                            />
                        </div>
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <UniversalPaymentEngine
                            transactionType="inflow"
                            allowedMethods={['cash', 'bank', 'cheque', 'upi']}
                            maxAmount={outstandingBalance}
                            initialAmount={outstandingBalance}
                            onValidPayload={setPaymentPayload}
                        />
                    </div>
                    </div>

                    <div className="form-group">
                        <label>Reference Number (UTR/Cheque No.)</label>
                        <input 
                            type="text" 
                            className="form-input"
                            value={formData.reference_id}
                            onChange={e => setFormData({...formData, reference_id: e.target.value})}
                        />
                    </div>

                    <div className="form-group">
                        <label>Internal Notes</label>
                        <textarea 
                            className="form-input"
                            rows="2"
                            value={formData.notes}
                            onChange={e => setFormData({...formData, notes: e.target.value})}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-success" disabled={loading || !paymentPayload}>
                            {loading ? 'Processing...' : 'Record Payment'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
    display: 'flex', justifyContent: 'center', alignItems: 'center'
};
const contentStyle = {
    backgroundColor: 'var(--color-bg-primary)', padding: '2rem',
    borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '600px',
    boxShadow: 'var(--shadow-xl)'
};

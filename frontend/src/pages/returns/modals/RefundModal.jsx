import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ENDPOINTS } from '../../../config/api';
import { useToast } from '../../../context/ToastContext';
import { useCurrency } from '../../../context/CurrencyContext';

import '../../../styles/components/page-layout.css';
import '../../../styles/components/form-layout.css';
import '../../../styles/components/modal-system.css';
import UniversalPaymentEngine from '../../../components/common/UniversalPaymentEngine';

export default function RefundModal({ isOpen, onClose, returnId, orderId, orderDisplayId, outstandingBalance, maxRefundable, onRefundComplete }) {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const { currency } = useCurrency();
    const [loading, setLoading] = useState(false);
    
    const [refundPayload, setRefundPayload] = useState(null);
    
    const [formData, setFormData] = useState({
        return_request: returnId,
        order: orderId,
        transaction_id: '',
        note: ''
    });

    useEffect(() => {
        if (isOpen) {
            setFormData({
                return_request: returnId,
                order: orderId,
                transaction_id: '',
                note: ''
            });
            setRefundPayload(null);
        }
    }, [isOpen, returnId, orderId]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!refundPayload) return;

        setLoading(true);
        try {
            const payload = { ...formData, ...refundPayload };
            
            // MAP UPE OUTPUT TO LEGACY SCHEMA
            if (payload.payment_method === 'store_credit') {
                payload.method = 'customer_wallet';
            } else if (payload.payment_method) {
                payload.method = payload.payment_method;
            }
            delete payload.payment_method;

            const response = await fetchWithAuth(ENDPOINTS.ORDERS_REFUNDS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                showToast("Refund recorded successfully", "success");
                onRefundComplete();
                onClose();
            } else {
                const errorData = await response.json();
                const errorMsg = errorData.amount ? errorData.amount[0] : errorData.non_field_errors?.[0] || "Failed to record refund";
                showToast(errorMsg, "error");
            }
        } catch (error) {
            console.error(error);
            showToast("Failed to record refund", "error");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const maxRefundAllowed = maxRefundable !== undefined ? Math.min(Number(outstandingBalance), Number(maxRefundable)) : outstandingBalance;

    return (
        <div className="modal-overlay" style={overlayStyle}>
            <div className="modal-content" style={contentStyle}>
                <h2>Record Refund for Order #{orderDisplayId}</h2>
                <p className="page-subtitle mb-4">
                    Recommended: {currency}{outstandingBalance} 
                    {maxRefundable !== undefined && <span style={{color: 'var(--color-danger)', marginLeft: '10px'}}>(Max Cap: {currency}{maxRefundable})</span>}
                </p>
                
                {maxRefundable !== undefined && Number(maxRefundable) < Number(outstandingBalance) && (
                    <div style={{
                        padding: '0.75rem', 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        color: 'var(--color-danger)', 
                        borderRadius: '8px', 
                        marginBottom: '1rem',
                        fontSize: '0.85rem',
                        lineHeight: '1.5'
                    }}>
                        <strong>Why is the cap lower than the return value?</strong><br/>
                        The customer underpaid the original order. The maximum refund is mathematically limited to what they actually overpaid relative to the new effective total.
                    </div>
                )}

                <form onSubmit={handleSubmit} className="form-layout">
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <UniversalPaymentEngine
                            transactionType="outflow"
                            allowedMethods={['store_credit', 'cash', 'bank', 'cheque', 'upi']}
                            maxAmount={maxRefundAllowed}
                            initialAmount={maxRefundAllowed}
                            onValidPayload={setRefundPayload}
                        >
                            <div className="form-group" style={{ marginTop: '10px' }}>
                                <label>Reference Number / ID</label>
                                <input 
                                    type="text" 
                                    className="form-input"
                                    value={formData.transaction_id}
                                    onChange={e => setFormData({...formData, transaction_id: e.target.value})}
                                    placeholder="Optional / UTR"
                                />
                            </div>
                        </UniversalPaymentEngine>
                    </div>

                    <div className="form-group">
                        <label>Internal Notes</label>
                        <textarea 
                            className="form-input"
                            rows="2"
                            value={formData.note}
                            onChange={e => setFormData({...formData, note: e.target.value})}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-success" disabled={loading || !refundPayload}>
                            {loading ? 'Processing...' : 'Issue Refund'}
// fallow-ignore-next-line code-duplication
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

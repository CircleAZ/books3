import React from 'react';
import '../../../styles/components/modal-system.css';
import '../../../styles/components/data-table.css';

export default function TransferDetailsModal({ isOpen, onClose, transfer }) {
// fallow-ignore-next-line code-duplication
    if (!isOpen || !transfer) return null;

    return (
        <div className="modal-overlay" style={overlayStyle} onClick={onClose}>
            <div className="modal-content" style={contentStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2>Transfer Details <span className="text-muted">#{transfer.display_id}</span></h2>
                    <span className={`badge badge-${transfer.status === 'dispatched' ? 'success' : 'warning'}`}>
                        {transfer.status.toUpperCase()}
                    </span>
                </div>
                
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '2rem' }}>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>DATE</strong>
                        <span>{transfer.date}</span>
                    </div>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>REFERENCE</strong>
                        <span>{transfer.reference_number || '-'}</span>
                    </div>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>ITEMS</strong>
// fallow-ignore-next-line code-duplication
                        <span>{transfer.items ? transfer.items.length : 0}</span>
                    </div>
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Cost Price</th>
                                <th>Locked Commission</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfer.items && transfer.items.length > 0 ? (
// fallow-ignore-next-line code-duplication
                                transfer.items.map(item => (
                                    <tr key={item.id}>
                                        <td>
                                            {item.product_details?.name}
                                            <br/>
                                            <small className="text-muted">#{item.product_details?.display_id}</small>
                                        </td>
                                        <td>{item.quantity}</td>
                                        <td>{item.frozen_cost_price ? `₹${item.frozen_cost_price}` : '-'}</td>
                                        <td>
                                            {item.frozen_commission_value 
                                                ? `${item.frozen_commission_value}${item.frozen_commission_type === 'percent' ? '%' : '₹'}` 
                                                : <span className="text-muted italic">Legacy (Not Locked)</span>}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="4" className="text-center text-muted">No items in this transfer.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {transfer.notes && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>NOTES</strong>
                        <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
// fallow-ignore-next-line code-duplication
                            {transfer.notes}
                        </div>
                    </div>
                )}

// fallow-ignore-next-line code-duplication
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
                </div>
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
    borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '800px',
    boxShadow: 'var(--shadow-xl)'
};

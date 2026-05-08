import React from 'react';
import '../../../styles/components/modal-system.css';
import '../../../styles/components/data-table.css';

const REASON_LABELS = {
    unsold: 'Unsold', damage: 'Damaged', recall: 'Recalled',
    overstock: 'Overstock / Rebalancing', expired: 'Expired',
    defective: 'Defective / Manufacturing Fault',
    wrong_shipment: 'Wrong Shipment', discontinued: 'Discontinued',
    season_end: 'Season End / Clearance', other: 'Other'
};

export default function ReturnDetailsModal({ isOpen, onClose, returnRecord }) {
    if (!isOpen || !returnRecord) return null;

    return (
        <div className="modal-overlay" style={overlayStyle} onClick={onClose}>
            <div className="modal-content" style={contentStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2>Return Details <span className="text-muted">#{returnRecord.display_id}</span></h2>
                    <span className={`badge badge-${returnRecord.status === 'received' ? 'success' : 'warning'}`}>
                        {returnRecord.status.toUpperCase()}
                    </span>
                </div>
                
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>DATE</strong>
                        <span>{returnRecord.date}</span>
                    </div>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>REASON</strong>
                        <span>{REASON_LABELS[returnRecord.reason] || returnRecord.reason}</span>
                    </div>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>ITEMS</strong>
                        <span>{returnRecord.items ? returnRecord.items.length : 0}</span>
                    </div>
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1.5rem' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Quantity Returned</th>
                            </tr>
                        </thead>
                        <tbody>
                            {returnRecord.items && returnRecord.items.length > 0 ? (
                                returnRecord.items.map(item => (
                                    <tr key={item.id}>
                                        <td>
                                            {item.product_details?.name}
                                            <br/>
                                            <small className="text-muted">#{item.product_details?.display_id}</small>
                                        </td>
                                        <td>{item.quantity}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="2" className="text-center text-muted">No items in this return.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {returnRecord.notes && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>NOTES</strong>
                        <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                            {returnRecord.notes}
                        </div>
                    </div>
                )}

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

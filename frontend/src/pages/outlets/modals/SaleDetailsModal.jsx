import React from 'react';
import '../../../styles/components/modal-system.css';
import '../../../styles/components/data-table.css';

export default function SaleDetailsModal({ isOpen, onClose, sale }) {
// fallow-ignore-next-line code-duplication
    if (!isOpen || !sale) return null;

    return (
        <div className="modal-overlay" style={overlayStyle} onClick={onClose}>
            <div className="modal-content" style={contentStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2>Sale Details <span className="text-muted">#{sale.display_id}</span></h2>
                    <span className="badge badge-success">COMPLETED</span>
                </div>
                
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '2rem' }}>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>DATE</strong>
                        <span>{sale.date}</span>
                    </div>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>GROSS TOTAL</strong>
                        <span>₹{sale.gross_total}</span>
                    </div>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>COMMISSION</strong>
                        <span style={{ color: 'var(--color-danger)' }}>₹{sale.commission_amount}</span>
                    </div>
                    <div>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem' }}>NET TOTAL</strong>
{/* fallow-ignore-next-line code-duplication */}
                        <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>₹{sale.net_total}</span>
                    </div>
                </div>

{/* fallow-ignore-next-line code-duplication */}
                <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1.5rem' }}>
{/* fallow-ignore-next-line code-duplication */}
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Product</th>
                                <th>Quantity</th>
                                <th>Unit Price</th>
                                <th>Commission Type</th>
                                <th>Commission Val</th>
                                <th>Line Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sale.items && sale.items.length > 0 ? (
                                sale.items.map(item => (
                                    <tr key={item.id}>
                                        <td>
                                            {item.product_details?.name}
                                            <br/>
                                            <small className="text-muted">#{item.product_details?.display_id}</small>
                                        </td>
                                        <td>{item.quantity}</td>
                                        <td>₹{item.unit_price}</td>
                                        <td style={{textTransform: 'capitalize'}}>{item.commission_type}</td>
                                        <td>{item.commission_value}{item.commission_type === 'percent' ? '%' : '₹'}</td>
                                        <td>₹{item.line_total}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="6" className="text-center text-muted">No items in this sale.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {sale.notes && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <strong className="text-muted" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>NOTES</strong>
                        <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                            {sale.notes}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button 
                        type="button" 
                        className="btn btn-danger" 
                        onClick={() => {
                            if (window.confirm('Are you sure you want to void this sale? This will restore the stock to the outlet.')) {
                                sale.onVoid(sale.id);
                            }
                        }}
                    >
                        Void Sale
{/* fallow-ignore-next-line code-duplication */}
                    </button>
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
    borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '900px',
    boxShadow: 'var(--shadow-xl)'
};

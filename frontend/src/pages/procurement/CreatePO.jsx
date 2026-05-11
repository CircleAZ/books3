import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function CreatePO() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    return (
        <div className="page-container">
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button
                    className="btn btn-ghost"
                    onClick={() => navigate(-1)}
                    style={{ padding: '6px' }}
                >
                    ← Back
                </button>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Create Purchase Order</h1>
            </div>

            <div className="content-area">
                <div className="card" style={{ padding: '2rem' }}>
                    <h3 style={{ margin: '0 0 0.5rem' }}>PO Details</h3>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', margin: '0 0 1.5rem' }}>
                        This interface requires the Vendor Selection and Product Search components to be wired up. Phase 4 UI development is pending.
                    </p>

                    <div className="form-actions" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
                        <button className="btn btn-primary" disabled>
                            Create PO (Coming Soon)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

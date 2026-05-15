import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import { getPurchaseOrderUrl, getReceiveUrl, PROCUREMENT_ENDPOINTS } from '../../services/procurementService';

export default function PODetail() {
    const { id } = useParams();
    const { fetchWithAuth, user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [po, setPo] = useState(null);
    const [loading, setLoading] = useState(true);

    // Receive modal
    const [showReceive, setShowReceive] = useState(false);
    const [receiveItems, setReceiveItems] = useState([]);
    const [isReceiving, setIsReceiving] = useState(false);

    // Add Charge
    const [showCharge, setShowCharge] = useState(false);
    const [chargeType, setChargeType] = useState('transport');
    const [chargeAmount, setChargeAmount] = useState('');
    const [chargeDesc, setChargeDesc] = useState('');

    // Record Payment
    const [showPayment, setShowPayment] = useState(false);
    const [payMethod, setPayMethod] = useState('cash');
    const [payAmount, setPayAmount] = useState('');
    const [wallets, setWallets] = useState([]);
    const [banks, setBanks] = useState([]);
    const [selectedWallet, setSelectedWallet] = useState('');
    const [selectedBank, setSelectedBank] = useState('');

    // Bypasses
    const [bypassInventoryVolume, setBypassInventoryVolume] = useState(false);
    const [bypassInventoryWac, setBypassInventoryWac] = useState(false);
    const [showAdvancedReceiveBypass, setShowAdvancedReceiveBypass] = useState(false);
    
    const [bypassFinanceExpense, setBypassFinanceExpense] = useState(false);
    const [bypassFinanceLedger, setBypassFinanceLedger] = useState(false);
    const [showAdvancedPaymentBypass, setShowAdvancedPaymentBypass] = useState(false);

    useEffect(() => {
        // Enforce math: bypassing volume MUST bypass WAC
        if (bypassInventoryVolume) {
            setBypassInventoryWac(true);
        }
    }, [bypassInventoryVolume]);

    const fetchPO = useCallback(async () => {
        try {
            const res = await fetchWithAuth(getPurchaseOrderUrl(id));
            if (res.ok) {
                const data = await res.json();
                setPo(data);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [id, fetchWithAuth]);

    useEffect(() => { fetchPO(); }, [fetchPO]);

    // Fetch wallets + banks for payment form
    useEffect(() => {
        if (!showPayment) return;
        Promise.allSettled([
            fetchWithAuth(ENDPOINTS.FINANCE_CASH_WALLETS + '?active_only=true'),
            fetchWithAuth(ENDPOINTS.FINANCE_BANK_ACCOUNTS + '?active_only=true'),
        ]).then(([wRes, bRes]) => {
            if (wRes.status === 'fulfilled' && wRes.value.ok) wRes.value.json().then(d => { setWallets(d.results || d); });
            if (bRes.status === 'fulfilled' && bRes.value.ok) bRes.value.json().then(d => { setBanks(d.results || d); });
        });
    }, [showPayment, fetchWithAuth]);

    const openReceiveModal = () => {
        // S5: Auto-fill with remaining packs
        setReceiveItems((po?.items || []).map(item => ({
            item_id: item.id,
            product_name: item.product_name,
            purchased_packs: item.purchased_packs,
            received_packs_before: item.received_packs,
            remaining: item.purchased_packs - item.received_packs,
            received_packs: item.purchased_packs - item.received_packs, // auto-fill
        })));
        setShowReceive(true);
    };

    const handleReceive = async () => {
        setIsReceiving(true);
        // M2: Fresh-fetch PO state before submit
        try {
            const freshRes = await fetchWithAuth(getPurchaseOrderUrl(id));
            if (!freshRes.ok) { showToast('Failed to verify PO state', 'error'); setIsReceiving(false); return; }
            const freshPO = await freshRes.json();
            if (freshPO.status === 'received' || freshPO.status === 'cancelled') {
                showToast(`PO is already ${freshPO.status}. Refreshing...`, 'warning');
                setPo(freshPO); setShowReceive(false); setIsReceiving(false); return;
            }

            const payload = {
                items: receiveItems.filter(i => i.received_packs > 0).map(i => ({
                    item_id: i.item_id,
                    received_packs: parseInt(i.received_packs),
                })),
                bypass_inventory_volume: bypassInventoryVolume,
                bypass_inventory_wac: bypassInventoryWac
            };
            const res = await fetchWithAuth(getReceiveUrl(id), { method: 'POST', body: JSON.stringify(payload) });
            if (res.ok) {
                const data = await res.json();
                setPo(data); setShowReceive(false);
                showToast('Items received successfully', 'success');
            } else {
                const err = await res.json();
                showToast('Error: ' + (err.detail || JSON.stringify(err)), 'error');
            }
        } catch (e) { showToast('Receive failed', 'error'); }
        finally { setIsReceiving(false); }
    };
    
    const closeReceiveModal = () => {
        setShowReceive(false);
        setBypassInventoryVolume(false);
        setBypassInventoryWac(false);
        setShowAdvancedReceiveBypass(false);
    };

    const handleAddCharge = async () => {
        try {
            const res = await fetchWithAuth(PROCUREMENT_ENDPOINTS.CHARGES, {
                method: 'POST',
                body: JSON.stringify({ purchase_order: id, charge_type: chargeType, amount: chargeAmount, description: chargeDesc }),
            });
            if (res.ok) { showToast('Charge added', 'success'); setShowCharge(false); setChargeAmount(''); setChargeDesc(''); fetchPO(); }
            else { const e = await res.json(); showToast('Error: ' + (e.detail || JSON.stringify(e)), 'error'); }
        } catch (e) { showToast('Failed to add charge', 'error'); }
    };

    const handleRecordPayment = async () => {
        const payload = { 
            purchase_order: id, 
            amount: payAmount, 
            payment_method: payMethod,
            bypass_finance_expense: bypassFinanceExpense,
            bypass_finance_ledger: bypassFinanceLedger
        };
        if (payMethod === 'cash' && selectedWallet) payload.source_wallet = selectedWallet;
        if (payMethod === 'bank' && selectedBank) payload.source_bank = selectedBank;

        try {
            const res = await fetchWithAuth(PROCUREMENT_ENDPOINTS.PAYMENTS, { method: 'POST', body: JSON.stringify(payload) });
            if (res.ok) { showToast('Payment recorded', 'success'); setShowPayment(false); setPayAmount(''); fetchPO(); }
            else { const e = await res.json(); showToast('Error: ' + (e.detail || JSON.stringify(e)), 'error'); }
        } catch (e) { showToast('Failed to record payment', 'error'); }
    };

    const closePaymentModal = () => {
        setShowPayment(false);
        setBypassFinanceExpense(false);
        setBypassFinanceLedger(false);
        setShowAdvancedPaymentBypass(false);
    };

    const handleCancel = async () => {
        if (!window.confirm('Cancel this PO? This cannot be undone.')) return;
        try {
            const res = await fetchWithAuth(getPurchaseOrderUrl(id), { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
            if (res.ok) { const data = await res.json(); setPo(data); showToast('PO cancelled', 'info'); }
            else { const e = await res.json(); showToast('Error: ' + (e.detail || JSON.stringify(e)), 'error'); }
        } catch (e) { showToast('Cancel failed', 'error'); }
    };

    const statusColor = (s) => ({ draft: '#6b7280', ordered: '#3b82f6', partially_received: '#f59e0b', received: '#10b981', cancelled: '#ef4444' }[s] || '#6b7280');
    const payStatusColor = (s) => ({ pending: '#f59e0b', partial: '#3b82f6', paid: '#10b981' }[s] || '#6b7280');
    const isTerminal = po && (po.status === 'received' || po.status === 'cancelled');
    const canReceive = po && !isTerminal;
    const canAddCharge = po && po.status !== 'cancelled';
    const canPay = po && parseFloat(po.amount_paid) < parseFloat(po.total_amount);
    const canCancel = po && (po.status === 'draft' || po.status === 'ordered');
    const balanceDue = po ? (parseFloat(po.total_amount) - parseFloat(po.amount_paid)) : 0;

    // Overpayment warning (M6)
    const isPaidButNotReceived = po && po.payment_status === 'paid' && po.status !== 'received';

    if (loading) return <div className="page-container"><p style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>Loading...</p></div>;
    if (!po) return <div className="page-container"><p>PO not found.</p></div>;

    const badgeStyle = (color) => ({ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: '12px', background: color + '22', color });

    return (
        <div className="page-container">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                    <button onClick={() => navigate('/procurement')} className="btn btn-ghost btn-sm" style={{ marginBottom: '4px' }}>← Back</button>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>PO #{po.display_id}</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Vendor: {po.vendor_name}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {po.is_historical_bypass && <span style={badgeStyle('#ef4444')} title="This PO bypassed standard inventory or financial logic">HISTORICAL BYPASS</span>}
                    <span style={badgeStyle(statusColor(po.status))}>{po.status?.replace(/_/g, ' ')}</span>
                    <span style={badgeStyle(payStatusColor(po.payment_status))}>{po.payment_status}</span>
                </div>
            </div>

            {isPaidButNotReceived && (
                <div style={{ background: '#f59e0b22', border: '1px solid #f59e0b55', borderRadius: '8px', padding: '10px 14px', marginBottom: '1rem', fontSize: '0.85rem', color: '#f59e0b' }}>
                    ⚠ Payment complete but items not fully received. If vendor doesn't deliver, reconcile the overpayment.
                </div>
            )}

            {/* Items */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Items</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead><tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Product</th>
                            <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Ordered</th>
                            <th style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Received</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Unit Cost</th>
                            <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Total</th>
                        </tr></thead>
                        <tbody>
                            {po.items?.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <td style={{ padding: '8px 6px' }}>{item.product_name} {item.is_pack && <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '1px 5px', borderRadius: '3px', background: '#3b82f622', color: '#3b82f6' }}>PACK</span>}</td>
                                    <td style={{ textAlign: 'center', padding: '8px 6px' }}>{item.purchased_packs} pks ({item.ordered_quantity} u)</td>
                                    <td style={{ textAlign: 'center', padding: '8px 6px', color: item.received_packs >= item.purchased_packs ? '#10b981' : '#f59e0b' }}>{item.received_packs} / {item.purchased_packs} pks</td>
                                    <td style={{ textAlign: 'right', padding: '8px 6px' }}>₹{parseFloat(item.unit_cost_price).toFixed(2)}</td>
                                    <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>₹{parseFloat(item.line_total).toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {canReceive && <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={openReceiveModal}>Receive Items</button>}
            </div>

            {/* Charges */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Charges</h3>
                    {canAddCharge && <button className="btn btn-ghost btn-sm" onClick={() => setShowCharge(true)}>+ Add</button>}
                </div>
                {po.status === 'received' && <p style={{ fontSize: '0.8rem', color: '#f59e0b', margin: '0 0 8px', background: '#f59e0b11', padding: '6px 10px', borderRadius: '6px' }}>⚡ Retroactive mode: charges added here will trigger a WAC correction on the product cost.</p>}
                {po.status === 'cancelled' && <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0 0 8px' }}>Charges locked after cancellation.</p>}
                {po.charges?.length === 0 ? <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No charges added.</p> : (
                    po.charges.map(c => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
                            <span>{c.charge_type}{c.transporter_name ? ` — ${c.transporter_name}` : ''}{c.description ? ` (${c.description})` : ''}</span>
                            <span style={{ fontWeight: 600 }}>₹{parseFloat(c.amount).toFixed(2)}</span>
                        </div>
                    ))
                )}
            </div>

            {/* Payments */}
            <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Payments</h3>
                    {canPay && <button className="btn btn-ghost btn-sm" onClick={() => setShowPayment(true)}>+ Record</button>}
                </div>
                {po.payments?.length === 0 ? <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No payments recorded.</p> : (
                    po.payments.map(p => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
                            <span>{p.payment_method} {p.source_wallet_name || p.source_bank_name || ''}</span>
                            <span style={{ fontWeight: 600 }}>₹{parseFloat(p.amount).toFixed(2)}</span>
                        </div>
                    ))
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: '8px', borderTop: '2px solid var(--color-border)', fontSize: '0.9rem' }}>
                    <span>Total: ₹{parseFloat(po.total_amount).toFixed(2)}</span>
                    <span>Paid: ₹{parseFloat(po.amount_paid).toFixed(2)}</span>
                    <span style={{ fontWeight: 700, color: balanceDue > 0 ? '#ef4444' : '#10b981' }}>Due: ₹{balanceDue.toFixed(2)}</span>
                </div>
            </div>

            {canCancel && <button className="btn btn-ghost" style={{ color: '#ef4444' }} onClick={handleCancel}>Cancel PO</button>}

            {/* Receive Modal */}
            {showReceive && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={closeReceiveModal}>
                    <div style={{ background: 'var(--color-bg-primary)', borderRadius: '12px', padding: '1.5rem', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 1rem' }}>Receive Items</h3>
                        {receiveItems.map((ri, idx) => (
                            <div key={ri.item_id} style={{ marginBottom: '12px', padding: '10px', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
                                <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.9rem' }}>{ri.product_name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                                    Ordered: {ri.purchased_packs} | Already received: {ri.received_packs_before} | Remaining: {ri.remaining}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontSize: '0.8rem' }}>Receiving now:</label>
                                    <input type="number" min="0" max={ri.remaining} value={ri.received_packs}
                                        onChange={e => { const v = Math.min(parseInt(e.target.value) || 0, ri.remaining); setReceiveItems(prev => prev.map((r, i) => i === idx ? { ...r, received_packs: v } : r)); }}
                                        className="form-control" style={{ width: '80px', textAlign: 'center' }} />
                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>packs</span>
                                </div>
                            </div>
                        ))}
                        
                        {user?.is_superuser && (
                            <div style={{ marginTop: '1rem', padding: '1rem', background: '#ef444411', border: '1px solid #ef444444', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <input type="checkbox" id="masterInvBypass" 
                                        checked={bypassInventoryVolume && bypassInventoryWac} 
                                        onChange={e => {
                                            setBypassInventoryVolume(e.target.checked);
                                            setBypassInventoryWac(e.target.checked);
                                        }} 
                                    />
                                    <label htmlFor="masterInvBypass" style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.9rem' }}>Master Inventory Bypass (Historical Migration)</label>
                                </div>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }} onClick={() => setShowAdvancedReceiveBypass(!showAdvancedReceiveBypass)}>
                                    {showAdvancedReceiveBypass ? 'Hide Advanced' : 'Show Advanced Granular Controls'}
                                </button>
                                {showAdvancedReceiveBypass && (
                                    <div style={{ marginTop: '8px', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input type="checkbox" id="bypassVol" checked={bypassInventoryVolume} onChange={e => setBypassInventoryVolume(e.target.checked)} />
                                            <label htmlFor="bypassVol" style={{ fontSize: '0.85rem' }}>Bypass Volume Injection</label>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input type="checkbox" id="bypassWac" checked={bypassInventoryWac} disabled={bypassInventoryVolume} onChange={e => setBypassInventoryWac(e.target.checked)} />
                                            <label htmlFor="bypassWac" style={{ fontSize: '0.85rem', color: bypassInventoryVolume ? 'var(--color-text-secondary)' : 'inherit' }}>
                                                Bypass WAC Recalculation {bypassInventoryVolume && '(Required when Volume bypassed)'}
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1rem' }}>
                            <button className="btn btn-ghost" onClick={closeReceiveModal}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleReceive} disabled={isReceiving}>{isReceiving ? 'Processing...' : 'Confirm Receive'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Charge Modal */}
            {showCharge && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowCharge(false)}>
                    <div style={{ background: 'var(--color-bg-primary)', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 1rem' }}>Add Charge</h3>
                        <select className="form-control" value={chargeType} onChange={e => setChargeType(e.target.value)} style={{ width: '100%', marginBottom: '10px' }}>
                            <option value="transport">Transport</option><option value="packing">Packing</option><option value="handling">Handling</option><option value="other">Other</option>
                        </select>
                        <input type="number" min="0.01" step="0.01" placeholder="Amount (₹)" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} className="form-control" style={{ width: '100%', marginBottom: '10px' }} />
                        <input type="text" placeholder="Description (optional)" value={chargeDesc} onChange={e => setChargeDesc(e.target.value)} className="form-control" style={{ width: '100%', marginBottom: '10px' }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn btn-ghost" onClick={() => setShowCharge(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleAddCharge} disabled={!chargeAmount}>Add Charge</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Record Payment Modal */}
            {showPayment && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={closePaymentModal}>
                    <div style={{ background: 'var(--color-bg-primary)', borderRadius: '12px', padding: '1.5rem', maxWidth: '400px', width: '100%' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 1rem' }}>Record Payment</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>Balance due: ₹{balanceDue.toFixed(2)}</p>
                        <select className="form-control" value={payMethod} onChange={e => setPayMethod(e.target.value)} style={{ width: '100%', marginBottom: '10px' }}>
                            <option value="cash">Cash</option><option value="bank">Bank Transfer</option><option value="employee_expense">Employee Expense</option>
                        </select>
                        {payMethod === 'cash' && wallets.length > 0 && (
                            <select className="form-control" value={selectedWallet} onChange={e => setSelectedWallet(e.target.value)} style={{ width: '100%', marginBottom: '10px' }}>
                                <option value="">Select wallet...</option>
                                {wallets.map(w => <option key={w.id} value={w.id}>{w.name} (₹{parseFloat(w.balance).toFixed(2)})</option>)}
                            </select>
                        )}
                        {payMethod === 'bank' && banks.length > 0 && (
                            <select className="form-control" value={selectedBank} onChange={e => setSelectedBank(e.target.value)} style={{ width: '100%', marginBottom: '10px' }}>
                                <option value="">Select bank...</option>
                                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        )}
                        <input type="number" min="0.01" step="0.01" placeholder="Amount (₹)" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="form-control" style={{ width: '100%', marginBottom: '10px' }} />
                        
                        {user?.is_superuser && (
                            <div style={{ marginTop: '0.5rem', marginBottom: '1rem', padding: '1rem', background: '#ef444411', border: '1px solid #ef444444', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <input type="checkbox" id="masterFinBypass" 
                                        checked={bypassFinanceExpense && bypassFinanceLedger} 
                                        onChange={e => {
                                            setBypassFinanceExpense(e.target.checked);
                                            setBypassFinanceLedger(e.target.checked);
                                        }} 
                                    />
                                    <label htmlFor="masterFinBypass" style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.9rem' }}>Master Finance Bypass (Historical Migration)</label>
                                </div>
                                <button className="btn btn-ghost btn-sm" style={{ padding: '0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }} onClick={() => setShowAdvancedPaymentBypass(!showAdvancedPaymentBypass)}>
                                    {showAdvancedPaymentBypass ? 'Hide Advanced' : 'Show Advanced Granular Controls'}
                                </button>
                                {showAdvancedPaymentBypass && (
                                    <div style={{ marginTop: '8px', paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input type="checkbox" id="bypassExp" checked={bypassFinanceExpense} onChange={e => setBypassFinanceExpense(e.target.checked)} />
                                            <label htmlFor="bypassExp" style={{ fontSize: '0.85rem' }}>Bypass Expense Ledger Generation</label>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input type="checkbox" id="bypassLedg" checked={bypassFinanceLedger} onChange={e => setBypassFinanceLedger(e.target.checked)} />
                                            <label htmlFor="bypassLedg" style={{ fontSize: '0.85rem' }}>Bypass Cash/Bank Withdrawal</label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn btn-ghost" onClick={closePaymentModal}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleRecordPayment} disabled={!payAmount}>Record Payment</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

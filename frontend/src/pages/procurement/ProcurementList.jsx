import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPurchaseOrders } from '../../services/procurementService';
import { useCurrency } from '../../context/CurrencyContext';
import { Plus, Package, Truck, CreditCard } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';

export default function ProcurementList() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const { formatCurrency } = useCurrency();

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            const data = await getPurchaseOrders();
            setOrders(data);
        } catch (error) {
            console.error("Failed to load purchase orders", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container">
            <PageHeader 
                title="Procurement" 
                subtitle="Manage Purchase Orders & Receiving"
                action={{
                    label: "Create PO",
                    icon: Plus,
                    onClick: () => navigate('/procurement/new')
                }}
            />

            <div className="content-area">
                {loading ? (
                    <p>Loading purchase orders...</p>
                ) : (
                    <div className="list-grid">
                        {orders.length === 0 ? (
                            <Card className="empty-state">
                                <Package size={48} className="empty-icon" />
                                <h3>No Purchase Orders</h3>
                                <p>Create your first purchase order to start tracking procurement.</p>
                            </Card>
                        ) : (
                            orders.map(order => (
                                <Card key={order.id} className="list-card" onClick={() => navigate(`/procurement/${order.id}`)}>
                                    <div className="card-header">
                                        <h4>{order.display_id}</h4>
                                        <span className={`status-badge status-${order.status}`}>{order.status}</span>
                                    </div>
                                    <div className="card-body">
                                        <p><strong>Vendor:</strong> {order.vendor_name}</p>
                                        <p><strong>Total:</strong> {formatCurrency(order.total_amount)}</p>
                                        <p><strong>Status:</strong> {order.payment_status}</p>
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

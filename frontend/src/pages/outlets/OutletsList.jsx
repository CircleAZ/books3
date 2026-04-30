import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../../config/api';
import { useCurrency } from '../../context/CurrencyContext';
import { useToast } from '../../context/ToastContext';

export default function OutletsList() {
    const [outlets, setOutlets] = useState([]);
    const [loading, setLoading] = useState(true);
    const { formatCurrency } = useCurrency();
    const { showToast } = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        fetchOutlets();
    }, []);

    const fetchOutlets = async () => {
        try {
            const response = await axios.get(`${API_BASE}/outlets/outlets/`);
            setOutlets(response.data);
        } catch (error) {
            console.error("Failed to fetch outlets:", error);
            showToast("Failed to load outlets", "error");
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="page-loading">Loading Outlets...</div>;

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Outlets & Consignment</h1>
                    <p className="page-subtitle">Manage B2B wholesale locations and their ledgers</p>
                </div>
                <button 
                    className="btn btn-primary"
                    onClick={() => navigate('/outlets/add')}
                >
                    + Add Outlet
                </button>
            </div>

            <div className="table-card">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Outlet Name</th>
                            <th>Contact Person</th>
                            <th>Commission</th>
                            <th className="text-right">Outstanding Balance</th>
                            <th className="text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {outlets.map(outlet => (
                            <tr 
                                key={outlet.id} 
                                onClick={() => navigate(`/outlets/${outlet.id}`)}
                                style={{ cursor: 'pointer' }}
                            >
                                <td>#{outlet.display_id}</td>
                                <td className="font-medium">{outlet.name}</td>
                                <td>{outlet.contact_person || '-'}</td>
                                <td>{outlet.commission_percentage}%</td>
                                <td className={`text-right font-bold ${parseFloat(outlet.outstanding_balance) > 0 ? 'text-danger' : 'text-success'}`}>
                                    {formatCurrency(outlet.outstanding_balance)}
                                </td>
                                <td className="text-center">
                                    <span className={`status-badge ${outlet.is_active ? 'status-active' : 'status-inactive'}`}>
                                        {outlet.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                        {outlets.length === 0 && (
                            <tr>
                                <td colSpan="6" className="text-center py-8 text-muted">
                                    No outlets found. Add one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

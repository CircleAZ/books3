import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './GatewayManagement.css';

const GatewayManagement = () => {
    const { fetchWithAuth } = useAuth();
    const [gateways, setGateways] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchGateways();
    }, []);

    const fetchGateways = async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.MESSAGING_GATEWAYS}`);
            if (response.ok) {
                const data = await response.json();
                setGateways(data.results || data);
            }
        } catch (error) {
            console.error('Error fetching gateways:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleGateway = async (id) => {
        try {
            await fetchWithAuth(`${ENDPOINTS.MESSAGING_GATEWAYS}${id}/toggle/`, { method: 'POST' });
            fetchGateways();
        } catch (error) {
            console.error('Error toggling gateway:', error);
        }
    };

    if (loading) return <div>Loading Gateways...</div>;

    return (
        <div className="gateway-management">
            <header>
{/* fallow-ignore-next-line code-duplication */}
                <button className="btn btn-primary">+ Add Gateway</button>
{/* fallow-ignore-next-line code-duplication */}
            </header>
{/* fallow-ignore-next-line code-duplication */}
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>API URL</th>
                        <th>Status</th>
                        <th>Heartbeat</th>
                        <th>Success Rate</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {gateways.map(g => (
                        <tr key={g.id}>
                            <td>{g.name}</td>
                            <td>{g.api_url}</td>
                            <td>
                                <span className={`badge ${g.is_online ? 'success' : 'danger'}`}>
                                    {g.is_online ? 'Online' : 'Offline'}
                                </span>
                            </td>
                            <td>{new Date(g.last_heartbeat).toLocaleString()}</td>
                            <td>{g.success_rate}%</td>
                            <td>
                                <button onClick={() => toggleGateway(g.id)} className="btn-sm">
                                    {g.is_active ? 'Disable' : 'Enable'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default GatewayManagement;

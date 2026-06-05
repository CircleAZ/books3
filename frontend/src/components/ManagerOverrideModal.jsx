/**
 * ManagerOverrideModal Component
 * 
 * Modal requesting a Manager's username + password to bypass
 * a restricted action for a cashier. Uses the backend 
 * /api/core/manager-override/ endpoint.
 * 
 * This replaces the rejected 4-digit PIN approach.
 * Uses django.contrib.auth.authenticate() on the backend.
 */
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

function ManagerOverrideModal({ permission, actionDescription, onClose, onSuccess }) {
    const { fetchWithAuth } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetchWithAuth(`${API_BASE}/core/manager-override/`, {
                method: 'POST',
                body: JSON.stringify({
                    manager_username: username,
                    manager_password: password,
                    required_permission: permission,
                    action_description: actionDescription || `Override for ${permission}`,
                }),
            });

            const data = await response.json();

            if (response.ok && data.authorized) {
                onSuccess();
            } else {
                setError(data.error || 'Authorization failed.');
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div style={styles.header}>
                    <span style={styles.lockIcon}>🔐</span>
                    <h3 style={styles.title}>Manager Authorization Required</h3>
                </div>
                
                <p style={styles.description}>
                    This action requires <strong>{permission}</strong> permission. 
                    Please ask a manager to enter their credentials below.
                </p>

                <form onSubmit={handleSubmit}>
                    <div style={styles.fieldGroup}>
                        <label style={styles.label}>Manager Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            style={styles.input}
                            placeholder="Enter manager username"
                            autoFocus
                            required
                        />
                    </div>

                    <div style={styles.fieldGroup}>
                        <label style={styles.label}>Manager Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={styles.input}
                            placeholder="Enter manager password"
                            required
                        />
                    </div>

                    {error && (
                        <div style={styles.error}>
                            ⚠️ {error}
                        </div>
                    )}

                    <div style={styles.actions}>
                        <button 
                            type="button" 
                            onClick={onClose} 
                            style={styles.cancelBtn}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            style={styles.submitBtn}
                            disabled={loading || !username || !password}
                        >
                            {loading ? 'Verifying...' : 'Authorize'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)',
    },
    modal: {
        backgroundColor: 'var(--bg-primary, #1a1a2e)',
        borderRadius: '12px',
        padding: '28px',
        width: '400px',
        maxWidth: '90vw',
        border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '16px',
    },
    lockIcon: {
        fontSize: '24px',
    },
    title: {
        margin: 0,
        fontSize: '18px',
        fontWeight: 600,
        color: 'var(--text-primary, #e0e0e0)',
    },
    description: {
        fontSize: '13px',
        color: 'var(--text-secondary, #aaa)',
        marginBottom: '20px',
        lineHeight: '1.5',
    },
    fieldGroup: {
        marginBottom: '14px',
    },
    label: {
        display: 'block',
        fontSize: '12px',
        fontWeight: 500,
        color: 'var(--text-secondary, #bbb)',
        marginBottom: '6px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        backgroundColor: 'var(--bg-secondary, rgba(255,255,255,0.05))',
        border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
        borderRadius: '8px',
        color: 'var(--text-primary, #e0e0e0)',
        fontSize: '14px',
        outline: 'none',
        boxSizing: 'border-box',
    },
    error: {
        backgroundColor: 'rgba(255, 50, 50, 0.1)',
        border: '1px solid rgba(255, 50, 50, 0.3)',
        borderRadius: '8px',
        padding: '10px 12px',
        fontSize: '13px',
        color: '#ff6b6b',
        marginBottom: '14px',
    },
    actions: {
        display: 'flex',
        gap: '10px',
        justifyContent: 'flex-end',
        marginTop: '20px',
    },
    cancelBtn: {
        padding: '10px 20px',
        backgroundColor: 'transparent',
        border: '1px solid var(--border-color, rgba(255,255,255,0.2))',
        borderRadius: '8px',
        color: 'var(--text-secondary, #aaa)',
        cursor: 'pointer',
        fontSize: '14px',
    },
    submitBtn: {
        padding: '10px 24px',
        backgroundColor: 'var(--accent-color, #6c5ce7)',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 600,
    },
};

export default ManagerOverrideModal;

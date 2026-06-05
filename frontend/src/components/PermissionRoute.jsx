import React, { useState, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import usePermissions from '../utils/usePermissions';

function AccessDenied() {
    const [countdown, setCountdown] = useState(5);
    const navigate = useNavigate();

    useEffect(() => {
        if (countdown <= 0) {
            navigate('/', { replace: true });
            return;
        }

        const timer = setInterval(() => {
            setCountdown(prev => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [countdown, navigate]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            textAlign: 'center',
            padding: '2rem'
        }}>
            <h1 style={{ color: 'var(--color-danger)', marginBottom: '1rem', fontSize: '2rem' }}>
                403 Access Denied
            </h1>
            <p style={{ fontSize: '1.2rem', color: 'var(--color-text-muted)', marginBottom: '2rem' }}>
                You do not have permission to access this page.
            </p>
            <p style={{ marginBottom: '2rem' }}>
                Redirecting to dashboard in {countdown} seconds...
            </p>
            <button 
                onClick={() => navigate('/', { replace: true })}
                className="btn btn-primary"
            >
                Go Back to Dashboard
            </button>
        </div>
    );
}

function PermissionRoute({ children, permission }) {
    const { isAuthenticated, loading } = useAuth();
    const { hasPermission } = usePermissions();
    const location = useLocation();

    if (loading) {
        return (
            <div className="loading-screen">
                <div className="spinner-large"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (permission && !hasPermission(permission)) {
        return <AccessDenied />;
    }

    return children;
}

export default PermissionRoute;

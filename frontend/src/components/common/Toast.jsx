import { useEffect, useState } from 'react';
import './Toast.css';

const ICONS = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
};

export default function Toast({ id, message, type = 'info', undo, onDismiss }) {
    const [exiting, setExiting] = useState(false);

    const handleDismiss = () => {
        setExiting(true);
        setTimeout(() => onDismiss(id), 250);
    };

    const handleUndo = () => {
        if (undo) undo();
        handleDismiss();
    };

    // Auto-exit animation
    useEffect(() => {
        return () => setExiting(false);
    }, []);

    return (
        <div className={`toast toast-${type} ${exiting ? 'toast-exit' : 'toast-enter'}`}>
            <span className="toast-icon">{ICONS[type]}</span>
            <span className="toast-message">{message}</span>
            {undo && (
                <button className="toast-undo" onClick={handleUndo}>
                    Undo
                </button>
            )}
            <button className="toast-close" onClick={handleDismiss}>×</button>
        </div>
    );
}

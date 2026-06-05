import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';
import { secureStorage } from '../utils/secureStorage';
import './ElevatedAuthModal.css';

import '../styles/components/modal-system.css';
export default function ElevatedAuthModal() {
    const { elevatedAuthRequest, setElevatedAuthRequest } = useAuth();
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);
    
    const inputRefs = useRef([]);

    useEffect(() => {
        if (elevatedAuthRequest && !sent) {
            requestElevatedOtp();
        }
    }, [elevatedAuthRequest]);

// fallow-ignore-next-line code-duplication
    const requestElevatedOtp = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE}/account/request-elevated-otp/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${secureStorage.getItem('access_token')}`
                }
            });
            if (!response.ok) {
                throw new Error('Failed to send OTP.');
            }
            setSent(true);
            setTimeout(() => inputRefs.current[0]?.focus(), 100);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (index, value) => {
        if (value && !/^\d$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);
        setError('');

        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
        if (value && index === 5 && newOtp.every(d => d !== '')) {
// fallow-ignore-next-line code-duplication
            verifyElevatedOtp(newOtp.join(''));
        }
    };

    const handleKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pastedData.length === 6) {
            const newOtp = pastedData.split('');
            setOtp(newOtp);
            inputRefs.current[5]?.focus();
            verifyElevatedOtp(pastedData);
        }
    };

    const verifyElevatedOtp = async (code) => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${API_BASE}/account/verify-elevated-otp/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${secureStorage.getItem('access_token')}`
                },
                body: JSON.stringify({ code })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Verification failed.');
            }

            // Success! Resolve the intercepted promise
            elevatedAuthRequest.resolve();
            resetState();
        } catch (err) {
            setError(err.message);
            setOtp(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        if (elevatedAuthRequest) {
            elevatedAuthRequest.reject();
        }
        resetState();
    };

    const resetState = () => {
        setOtp(['', '', '', '', '', '']);
        setError('');
        setSent(false);
        setElevatedAuthRequest(null);
    };

    if (!elevatedAuthRequest) return null;

    return (
        <div className="modal-overlay elevated-auth-modal">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>High-Risk Action Detected</h2>
                    <p>This action requires an elevated security session.</p>
                </div>
                
                <div className="modal-body">
                    {error && <div className="error-message">{error}</div>}
                    
                    {!sent ? (
                        <div className="loading-state">
                            <span className="spinner"></span>
                            <p>Sending verification code to your email...</p>
                        </div>
                    ) : (
                        <>
// fallow-ignore-next-line code-duplication
                            <p className="helper-text">Enter the 6-digit code sent to your email to unlock elevated permissions for 1 hour.</p>
                            <div className="otp-inputs" onPaste={handlePaste}>
                                {otp.map((digit, index) => (
                                    <input
                                        key={index}
                                        ref={el => inputRefs.current[index] = el}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleChange(index, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(index, e)}
                                        disabled={loading}
                                        className={digit ? 'filled' : ''}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="modal-actions">
                    <button type="button" className="btn btn-ghost" onClick={handleCancel} disabled={loading}>
                        Cancel
                    </button>
                    {sent && (
                        <button 
                            type="button" 
                            className="btn btn-primary" 
                            onClick={() => verifyElevatedOtp(otp.join(''))}
                            disabled={loading || otp.some(d => d === '')}
                        >
                            {loading ? 'Verifying...' : 'Verify & Continue'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

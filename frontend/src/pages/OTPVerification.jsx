import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './OTPVerification.css';

export default function OTPVerification() {
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(30);
    const [expirySeconds, setExpirySeconds] = useState(300); // 5 minutes
    const [otpSession, setOtpSession] = useState('');

    const inputRefs = useRef([]);
    const { verifyOtp, resendOtp } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const { email, requires_email_verification, from } = location.state || {};

    useEffect(() => {
        // If no OTP session in state, redirect to login
        if (!location.state?.otp_session) {
            navigate('/login', { replace: true });
            return;
        }
        setOtpSession(location.state.otp_session);
        // Focus first input
        inputRefs.current[0]?.focus();
    }, [location.state, navigate]);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown(prev => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // OTP expiry countdown
    useEffect(() => {
        if (expirySeconds <= 0) return;
        const timer = setInterval(() => {
            setExpirySeconds(prev => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [expirySeconds]);

    const handleChange = (index, value) => {
        // Only allow digits
        if (value && !/^\d$/.test(value)) return;

        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);
        setError('');

        // Auto-focus next input
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits are entered
        if (value && index === 5 && newOtp.every(d => d !== '')) {
            handleSubmit(newOtp.join(''));
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
            handleSubmit(pastedData);
        }
    };

    const handleSubmit = async (code) => {
        if (!code || code.length !== 6) {
            setError('Please enter all 6 digits.');
            return;
        }

        setLoading(true);
        setError('');

        const result = await verifyOtp(otpSession, code);

        setLoading(false);

        if (result.success) {
            navigate(from || '/', { replace: true });
        } else {
            setError(result.error);
            setOtp(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;

        const result = await resendOtp(otpSession);
        if (result.success) {
            setOtpSession(result.otp_session);
            setResendCooldown(30);
            setExpirySeconds(300);
            setOtp(['', '', '', '', '', '']);
            setError('');
            inputRefs.current[0]?.focus();
        } else {
            setError(result.error);
        }
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="otp-page">
            <div className="otp-container">
                <div className="otp-header">
                    <div className="otp-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="3" />
                            <path d="M22 7l-10 7L2 7" />
                        </svg>
                    </div>
                    <h1>{requires_email_verification ? 'Verify Your Email' : 'Enter Verification Code'}</h1>
                    <p className="otp-subtitle">
                        {requires_email_verification
                            ? 'We sent a verification code to your email to confirm your account.'
                            : 'We sent a 6-digit code to your email for security verification.'
                        }
                    </p>
                    {email && <p className="otp-email">{email}</p>}
                </div>

                {error && (
                    <div className="otp-error">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                        {error}
                    </div>
                )}

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
                            className={`otp-input ${digit ? 'filled' : ''} ${error ? 'error' : ''}`}
                            disabled={loading || expirySeconds <= 0}
                            autoComplete="one-time-code"
                        />
                    ))}
                </div>

                {expirySeconds > 0 ? (
                    <p className="otp-timer">
                        Code expires in <span className={expirySeconds <= 60 ? 'urgent' : ''}>{formatTime(expirySeconds)}</span>
                    </p>
                ) : (
                    <p className="otp-timer expired">Code has expired. Please request a new one.</p>
                )}

                <button
                    className="otp-verify-btn"
                    onClick={() => handleSubmit(otp.join(''))}
                    disabled={loading || otp.some(d => d === '') || expirySeconds <= 0}
                >
                    {loading ? <span className="spinner"></span> : 'Verify'}
                </button>

                <div className="otp-footer">
                    <p>
                        Didn't receive the code?{' '}
                        {resendCooldown > 0 ? (
                            <span className="resend-wait">Resend in {resendCooldown}s</span>
                        ) : (
                            <button className="resend-btn" onClick={handleResend}>
                                Resend Code
                            </button>
                        )}
                    </p>
                    <button className="back-btn" onClick={() => navigate('/login', { replace: true })}>
                        ← Back to Login
                    </button>
                </div>
            </div>
        </div>
    );
}

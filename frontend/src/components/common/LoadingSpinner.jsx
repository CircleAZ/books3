import './LoadingSpinner.css';

const LoadingSpinner = ({ message = 'Loading...', size = 32 }) => (
    <div className="loading-state" role="status" aria-label={message}>
        <div
            className="loading-spinner"
            style={size !== 32 ? { width: size, height: size } : undefined}
        />
        {message && <p className="loading-message">{message}</p>}
    </div>
);

export default LoadingSpinner;

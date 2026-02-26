import './StatCard.css';

export default function StatCard({ title, value, subtext, icon, type = 'default' }) {
    return (
        <div className={`stat-card ${type}`}>
            <div className={`stat-icon ${type}`}>
                {icon}
            </div>
            <div className="stat-info">
                <p className="stat-value">{value}</p>
                <p className="stat-label">{title}</p>
                {subtext && <p className="stat-subtext">{subtext}</p>}
            </div>
        </div>
    );
}

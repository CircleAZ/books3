import { Link } from 'react-router-dom';
import './Breadcrumbs.css';

export default function Breadcrumbs({ items }) {
    if (!items || items.length <= 1) return null;

    return (
        <nav className="breadcrumbs" aria-label="Breadcrumb">
            <ol>
                {items.map((crumb, i) => {
                    const isLast = i === items.length - 1;
                    return (
                        <li key={crumb.path + i}>
                            {isLast ? (
                                <span className="breadcrumb-current" aria-current="page">
                                    {crumb.label}
                                </span>
                            ) : (
                                <>
                                    <Link to={crumb.path} className="breadcrumb-link">
                                        {i === 0 ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                            </svg>
                                        ) : crumb.label}
                                    </Link>
                                    <svg className="breadcrumb-separator" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

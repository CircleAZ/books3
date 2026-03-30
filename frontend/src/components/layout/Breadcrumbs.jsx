import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Breadcrumbs.css';

export default function Breadcrumbs({ items }) {
    const [openDropdown, setOpenDropdown] = useState(null);
    const dropdownRef = useRef(null);
    const location = useLocation();

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpenDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Close on route change
    useEffect(() => {
        setOpenDropdown(null);
    }, [location.pathname]);

    if (!items || items.length <= 1) return null;

    const toggleDropdown = (index, e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpenDropdown(prev => prev === index ? null : index);
    };

    return (
        <nav className="breadcrumbs" aria-label="Breadcrumb" ref={dropdownRef}>
            <ol>
                {items.map((crumb, i) => {
                    const isLast = i === items.length - 1;
                    const hasChildren = crumb.children && crumb.children.length > 0;
                    const isOpen = openDropdown === i;

                    return (
                        <li key={crumb.path + i} className={hasChildren ? 'has-dropdown' : ''}>
                            {isLast ? (
                                hasChildren ? (
                                    /* Last crumb WITH children: clickable dropdown trigger */
                                    <span className="breadcrumb-current breadcrumb-trigger" aria-current="page">
                                        <button
                                            className="breadcrumb-dropdown-btn"
                                            onClick={(e) => toggleDropdown(i, e)}
                                            aria-expanded={isOpen}
                                            aria-haspopup="true"
                                        >
                                            {crumb.label}
                                            <svg className={`breadcrumb-chevron ${isOpen ? 'open' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        </button>
                                        {isOpen && (
                                            <div className="breadcrumb-dropdown">
                                                {crumb.children.map(child => (
                                                    <Link
                                                        key={child.path}
                                                        to={child.path}
                                                        className={`breadcrumb-dropdown-item ${location.pathname === child.path ? 'active' : ''}`}
                                                        onClick={() => setOpenDropdown(null)}
                                                    >
                                                        {child.title || child.label}
                                                    </Link>
                                                ))}
                                            </div>
                                        )}
                                    </span>
                                ) : (
                                    <span className="breadcrumb-current" aria-current="page">
                                        {crumb.label}
                                    </span>
                                )
                            ) : (
                                <>
                                    {hasChildren ? (
                                        /* Non-last crumb WITH children: link + dropdown trigger */
                                        <span className="breadcrumb-with-dropdown">
                                            <Link to={crumb.path} className="breadcrumb-link">
                                                {i === 0 ? (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                                    </svg>
                                                ) : crumb.label}
                                            </Link>
                                            <button
                                                className="breadcrumb-expand-btn"
                                                onClick={(e) => toggleDropdown(i, e)}
                                                aria-label={`Navigate ${crumb.label} sections`}
                                                aria-expanded={isOpen}
                                            >
                                                <svg className={`breadcrumb-chevron ${isOpen ? 'open' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </button>
                                            {isOpen && (
                                                <div className="breadcrumb-dropdown">
                                                    {crumb.children.map(child => (
                                                        <Link
                                                            key={child.path}
                                                            to={child.path}
                                                            className={`breadcrumb-dropdown-item ${location.pathname === child.path ? 'active' : ''}`}
                                                            onClick={() => setOpenDropdown(null)}
                                                        >
                                                            {child.title || child.label}
                                                        </Link>
                                                    ))}
                                                </div>
                                            )}
                                        </span>
                                    ) : (
                                        <Link to={crumb.path} className="breadcrumb-link">
                                            {i === 0 ? (
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                                </svg>
                                            ) : crumb.label}
                                        </Link>
                                    )}
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

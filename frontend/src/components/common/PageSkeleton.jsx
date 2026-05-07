import './PageSkeleton.css';

/**
 * PageSkeleton — Suspense fallback for lazy-loaded route chunks.
 * 
 * Renders inside MainLayout's content area while a route chunk downloads.
 * Uses the app's pulse animation and dark theme colors for visual consistency.
 */
export default function PageSkeleton() {
    return (
        <div className="page-skeleton" role="status" aria-label="Loading page">
            <div className="page-skeleton__header" />
            <div className="page-skeleton__row" />
            <div className="page-skeleton__row" />
            <div className="page-skeleton__row" />
            <div className="page-skeleton__row" />
        </div>
    );
}

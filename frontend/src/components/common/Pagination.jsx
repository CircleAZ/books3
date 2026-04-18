import './Pagination.css';

export default function Pagination({ currentPage, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        let pages = [];
        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, currentPage + 2);

        // Adjust window if we're near the beginning
        if (currentPage <= 3) {
            endPage = Math.min(totalPages, 5);
        }
        // Adjust window if we're near the end
        if (currentPage >= totalPages - 2) {
            startPage = Math.max(1, totalPages - 4);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        return pages;
    };

    return (
        <div className="modern-pagination-container">
            <div className="modern-pagination">
                <button 
                    className="pagination-btn" 
                    disabled={currentPage === 1} 
                    onClick={() => onPageChange(1)}
                    title="First Page"
                >
                    «
                </button>
                <button 
                    className="pagination-btn" 
                    disabled={currentPage === 1} 
                    onClick={() => onPageChange(currentPage - 1)}
                    title="Previous Page"
                >
                    ‹
                </button>
                
                {getPageNumbers().map(p => (
                    <button
                        key={p}
                        className={`pagination-btn numeric-btn ${p === currentPage ? 'active' : ''}`}
                        onClick={() => onPageChange(p)}
                    >
                        {p}
                    </button>
                ))}

                <button 
                    className="pagination-btn" 
                    disabled={currentPage === totalPages} 
                    onClick={() => onPageChange(currentPage + 1)}
                    title="Next Page"
                >
                    ›
                </button>
                <button 
                    className="pagination-btn" 
                    disabled={currentPage === totalPages} 
                    onClick={() => onPageChange(totalPages)}
                    title="Last Page"
                >
                    »
                </button>
            </div>
        </div>
    );
}

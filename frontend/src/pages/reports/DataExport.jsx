import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import './DataExport.css';

export default function DataExport() {
    const { fetchWithAuth } = useAuth();
    const [exporting, setExporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [format, setFormat] = useState('csv');

    const handleExport = async (type) => {
        setExporting(true);
        setProgress(10);

        try {
            let endpoint = '';
            let filename = '';
            const formatParam = format === 'xlsx' ? '&file_format=xlsx' : '';
            const formatSuffix = format === 'xlsx' ? '.xlsx' : '.csv';

            switch (type) {
                case 'Products':
                    endpoint = `${ENDPOINTS.REPORTS_INVENTORY}export/?type=all${formatParam}`;
                    filename = `inventory_export${formatSuffix}`;
                    break;
                case 'Customers':
                    endpoint = `${ENDPOINTS.REPORTS_CUSTOMERS}export/?_=1${formatParam}`;
                    filename = `customers_export${formatSuffix}`;
                    break;
                case 'Orders':
                    endpoint = `${ENDPOINTS.REPORTS_SALES}export/?period=all${formatParam}`;
                    filename = `orders_export${formatSuffix}`;
                    break;
                default:
                    throw new Error('Unknown export type');
            }

            setProgress(40);
            const response = await fetchWithAuth(endpoint);

            if (response.ok) {
                setProgress(80);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                setProgress(100);
                setTimeout(() => setExporting(false), 1000);
            } else {
                throw new Error('Export failed');
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export data. Please try again.');
            setExporting(false);
        }
    };

    return (
        <div className="data-export-page animate-fade-in">
            <header className="export-header">
                <p>Download your store data for backups or external analysis.</p>
            </header>

            <div className="export-config-card glass">
                <h3>Export Settings</h3>
                <div className="format-selector">
                    <label>Select Format:</label>
                    <div className="radio-group">
                        <label className={`radio-item ${format === 'csv' ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name="format"
                                value="csv"
                                checked={format === 'csv'}
                                onChange={(e) => setFormat(e.target.value)}
                            />
                            <span>CSV (.csv)</span>
                        </label>
                        <label className={`radio-item ${format === 'xlsx' ? 'active' : ''}`}>
                            <input
                                type="radio"
                                name="format"
                                value="xlsx"
                                checked={format === 'xlsx'}
                                onChange={(e) => setFormat(e.target.value)}
                            />
                            <span>Excel (.xlsx)</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="export-options-grid">
                <div className="export-option-card">
                    <div className="option-icon">📦</div>
                    <div className="option-details">
                        <h4>Products & Inventory</h4>
                        <p>All product details, categories, and current stock levels.</p>
                    </div>
                    <button
                        className="btn btn-primary"
                        disabled={exporting}
                        onClick={() => handleExport('Products')}
                    >
                        Export Products
                    </button>
                </div>

                <div className="export-option-card">
                    <div className="option-icon">👥</div>
                    <div className="option-details">
                        <h4>Customer Database</h4>
                        <p>Customer contact info, purchase history, and segments.</p>
                    </div>
                    <button
                        className="btn btn-primary"
                        disabled={exporting}
                        onClick={() => handleExport('Customers')}
                    >
                        Export Customers
                    </button>
                </div>

                <div className="export-option-card">
                    <div className="option-icon">🧾</div>
                    <div className="option-details">
                        <h4>Orders & Transactions</h4>
                        <p>Complete history of orders, payments, and refunds.</p>
                    </div>
                    <button
                        className="btn btn-primary"
                        disabled={exporting}
                        onClick={() => handleExport('Orders')}
                    >
                        Export Orders
                    </button>
                </div>
            </div>

            {exporting && (
                <div className="export-overlay">
                    <div className="progress-container glass">
                        <h3>Generating Export File...</h3>
                        <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                        </div>
                        <p>{progress}% Complete</p>
                    </div>
                </div>
            )}
        </div>
    );
}

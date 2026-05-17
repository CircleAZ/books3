import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ENDPOINTS } from '../../config/api';
import VendorModal from '../../components/inventory/VendorModal';
import './ProductList.css';

import '../../styles/components/modal-system.css';
export default function Vendors() {
    const { fetchWithAuth } = useAuth();
    const { showToast } = useToast();
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [currentVendor, setCurrentVendor] = useState(null);

    const fetchVendors = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetchWithAuth(ENDPOINTS.INVENTORY_VENDORS);
            if (response.ok) {
                const data = await response.json();
                setVendors(data.results || data || []);
            }
        } catch (error) {
            console.error('Error fetching vendors:', error);
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => {
        fetchVendors();
    }, [fetchVendors]);

    const handleOpenModal = (vendor = null) => {
        setCurrentVendor(vendor);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentVendor(null);
    };

    const handleSuccess = () => {
        fetchVendors();
    };

    const handleDeleteClick = (vendor) => {
        setCurrentVendor(vendor);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        try {
            const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_VENDORS}${currentVendor.id}/`, {
                method: 'DELETE'
            });

            if (response.ok) {
                fetchVendors();
                setIsDeleteModalOpen(false);
                setCurrentVendor(null);
            } else {
                showToast('Failed to delete vendor', 'error');
            }
        } catch (err) {
            showToast('Error deleting vendor', 'error');
        }
    };

    return (
        <div className="inventory-container fade-in">
            <div className="inventory-header">

                <div className="inventory-actions">
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        + Add Vendor
                    </button>
                </div>
            </div>

            <div className="inventory-table-container">
                {loading ? (
                    <div className="loading-container">
                        <div className="spinner-large"></div>
                    </div>
                ) : (
                    <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Phone</th>
                                <th>Description</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {vendors.map(vendor => (
                                <tr key={vendor.id}>
                                    <td>{vendor.name}</td>
                                    <td>{vendor.contact_email || '-'}</td>
                                    <td>{vendor.contact_phone || '-'}</td>
                                    <td>{vendor.description}</td>
                                    <td>
                                        <button className="btn btn-sm btn-ghost" onClick={() => handleOpenModal(vendor)}>Edit</button>
                                        <button className="btn btn-sm btn-danger-ghost" onClick={() => handleDeleteClick(vendor)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                            {vendors.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No vendors found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add/Edit Modal */}
            <VendorModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                vendor={currentVendor}
                onSuccess={handleSuccess}
            />

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Confirm Delete</h2>
                        <p>Are you sure you want to delete vendor "{currentVendor?.name}"?</p>
                        <div className="modal-actions">
                            <button className="btn btn-ghost" onClick={() => setIsDeleteModalOpen(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

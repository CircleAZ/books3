import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ENDPOINTS } from '../../config/api';
import ProductForm from '../../components/inventory/ProductForm';

export default function EditProduct() {
    const { id } = useParams();
    const { fetchWithAuth } = useAuth();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProduct = async () => {
            try {
                const response = await fetchWithAuth(`${ENDPOINTS.INVENTORY_PRODUCTS}${id}/`);
                if (response.ok) {
                    const data = await response.json();
                    setProduct(data);
                } else {
                    console.error('Failed to fetch product');
                    navigate('/inventory');
                }
            } catch (error) {
                console.error('Error fetching product:', error);
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchProduct();
    }, [id, fetchWithAuth, navigate]);

    if (loading) return <div className="loading-container"><div className="spinner-large"></div></div>;
    if (!product) return null;

    return (
        <div className="edit-product-page fade-in">
            <div className="page-header">
                <h2>Edit Product: {product.name}</h2>
            </div>
            <ProductForm initialData={product} isEdit={true} />
        </div>
    );
}

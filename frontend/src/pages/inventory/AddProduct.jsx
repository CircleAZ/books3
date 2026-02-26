import ProductForm from '../../components/inventory/ProductForm';
import './AddProduct.css'; // Keep if there are specific page styles, or remove if unused

export default function AddProduct() {
    return (
        <div className="add-product-page fade-in">
            <div className="page-header">
                <h2>Add New Product</h2>
            </div>
            <ProductForm />
        </div>
    );
}

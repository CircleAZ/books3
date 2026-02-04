# Critic Report: Phase 5 - Inventory Core

**Date:** 2026-02-04
**Reviewer:** Gemini CLI Agent
**Verdict:** REJECTED

## Summary
The basic CRUD structure for a generic inventory system is present, but it fails to meet the specific requirements of a *bookstore* (missing ISBN, Author). Furthermore, there are critical functional bugs in the API implementation regarding file uploads (images) and Many-to-Many relationships (tags), meaning the "Add Product" feature will likely fail or partially fail (no images, no tags) in its current state.

## Critical Issues (Must Fix)

### 1. Functional: Image Uploads Not Implemented in Backend
*   **Location:** `inventory/serializers.py` (`ProductCreateUpdateSerializer`) and `inventory/views.py`.
*   **Problem:** The `ProductCreateUpdateSerializer` does not list `images` in its `fields`. Furthermore, `ProductImage` is a separate model. DRF's default `create()` method on `ProductSerializer` will not automatically handle `request.FILES` to create related `ProductImage` objects. The frontend sends the data, but the backend ignores it.
*   **Recommendation:**
    *   Update `ProductCreateUpdateSerializer` to include an `images` field (e.g., `serializers.ListField(child=serializers.ImageField(), write_only=True)`).
    *   Override the `create` method in `ProductCreateUpdateSerializer` (or the `perform_create` in `ProductViewSet`) to pop the images from validated data and create `ProductImage` instances linked to the new product.

### 2. Functional: Tag Handling Mismatch
*   **Location:** `frontend/src/pages/inventory/AddProduct.jsx` vs `inventory/serializers.py`.
*   **Problem:**
    *   **Frontend:** Sends tags as a list of strings (names): `['Fiction', 'Thriller']`.
    *   **Backend:** `tags = models.ManyToManyField(Tag)`. The default `ModelSerializer` expects a list of *Primary Keys* (integers/UUIDs) for M2M fields, not strings.
    *   **Result:** The API will reject the payload with validation errors (e.g., "Expected pk value, received str").
*   **Recommendation:**
    *   Modify `ProductCreateUpdateSerializer` to handle tag names.
    *   Use a custom field for `tags` or override `create()` to `get_or_create` tags by name and then set the relationship.

### 3. Domain: Missing Book-Specific Fields
*   **Location:** `inventory/models.py`.
*   **Problem:** The project is "AZ Books", but the `Product` model is generic.
    *   Missing `ISBN` (Critical for books).
    *   Missing `Author`.
    *   Missing `Publisher`.
    *   Missing `Publication Date`.
*   **Recommendation:** Add these fields to the `Product` model.

## Major Issues

### 1. Frontend: Error Handling UX
*   **Location:** `AddProduct.jsx`.
*   **Problem:** `alert('Failed to create product. Please check the form.');` provides no feedback on *why* it failed. If the backend returns validation errors (which it will for tags), the user won't know what to fix.
*   **Recommendation:** Parse the JSON response from a 400 Bad Request and display specific field errors near the inputs.

## Minor Issues
1.  **Pagination:** `ProductList.jsx` implements basic pagination but hardcodes `page_size` assumption (10) for total page calculation, which might drift from backend settings. Ideally, the backend should return `total_pages` or the frontend should rely solely on `next/previous` links or the `count`.
2.  **Hardcoded URLs:** `api.js` falls back to `http://localhost:8000/api`. Ensure this matches the actual dev environment port.

## Code Quality
*   **Structure:** Backend code is well-structured using ViewSets and Serializers.
*   **Security:** `IsAuthenticated` is applied correctly.
*   **Frontend:** Clean React code, good use of hooks (`useAuth`).

## Next Steps
1.  **Update Models:** Add `isbn`, `author`, `publisher`. Run migrations.
2.  **Fix Serializer:** Implement `create` method to handle:
    *   `get_or_create` for Tags (by name).
    *   Creation of `ProductImage` objects from uploaded files.
3.  **Frontend Update:** Ensure form sends correct field names matching the updated serializer expectations.

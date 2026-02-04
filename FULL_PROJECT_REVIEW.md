# AZ Books - Full Project Review

**Date:** 2026-02-04
**Reviewer:** Senior Code Critic
**Target:** Backend (Django) & Frontend (React/Vite)

## 1. Overall Verdict
**Status:** **NEEDS_WORK** (Approaching Beta)
**Score:** 7.5/10

The project foundation is solid with a clean architecture in both Django and React. The authentication flow is well-implemented (JWT), and the inventory management data models are robust. However, the Dashboard is currently powering a "Potemkin Village" — it displays mock data instead of real database aggregations. Security is generally good for a dev environment but requires tightening for production.

---

## 2. Key Findings by Severity

### 🔴 Critical (Immediate Action Required)
1.  **Mock Data in Dashboard:** The `dashboard` app views (`DashboardStatsView`, `TopProductsView`, etc.) return hardcoded static data. This means the beautiful dashboard UI is disconnected from the actual sales and inventory activity.
    *   *Fix:* Implement aggregation queries (using `Django.db.models.Sum`, `Count`) over `Order` and `Product` models to return real data.
2.  **JWT Storage:** Tokens are stored in `localStorage` (`AuthContext.jsx`). This makes the application vulnerable to XSS attacks.
    *   *Fix:* Move to `HttpOnly` cookies for storing the `refresh_token`, or implementing a BFF (Backend for Frontend) pattern if high security is required. At minimum, ensure strict XSS mitigation.

### 🟡 Major (Address before Launch)
1.  **CORS Configuration:** `azbooks/settings.py` sets `CORS_ALLOW_ALL_ORIGINS = True` when `DEBUG` is on. If a production deployment accidentally leaves `DEBUG=True`, the API is wide open.
    *   *Fix:* Explicitly define `CORS_ALLOWED_ORIGINS` even in development or ensure `DEBUG` management is foolproof in CI/CD.
2.  **Alerts Logic:** `AlertsView` also returns static data.
    *   *Fix:* Implement a real alert system checking `Product.stock_quantity <= low_stock_threshold`.
3.  **Frontend Error Handling:** `AddProduct.jsx` uses `alert('Failed to create product...')`.
    *   *Fix:* Replace browser alerts with a proper Toast notification system (e.g., `react-hot-toast` or `react-toastify`) for better UX.

### 🟢 Minor (Optimization/Polish)
1.  **Tag Duplication:** `ProductCreateUpdateSerializer` creates new tags on the fly. Without case-insensitive validation ("Fiction" vs "fiction"), this will pollute the tag database.
    *   *Fix:* Normalize tags to lowercase or title-case before `get_or_create`.
2.  **Hardcoded Defaults:** `low_stock_threshold` defaults to '5' in the frontend form (`AddProduct.jsx`) but is also defined in the model.
    *   *Fix:* Fetch the system default configuration from an API endpoint to keep a Single Source of Truth.

---

## 3. Detailed Component Review

### 🛡️ Security
*   **Authentication:** `rest_framework_simplejwt` is correctly configured with rotation and blacklisting.
*   **Permissions:** `IsAuthenticated` is the default globally, which is excellent. `AllowAny` is correctly used only for Login.
*   **Input Sanitization:** Django REST Framework handles most SQL injection risks. Frontend `dangerouslySetInnerHTML` was not found (Good).

### 🏗️ Backend Architecture (Django)
*   **Models:** `inventory` models are well-designed.
    *   Use of `SoftDeleteModel` and `UUIDPrimaryKeyModel` shows foresight for enterprise features.
    *   `Product` model cleanly separates `cost_price` and `selling_price`.
*   **Serializers:** Good separation of concerns. `ProductListSerializer` optimizes read performance (computed fields), while `ProductCreateUpdateSerializer` handles complex nested writes (Images/Tags).
*   **Views:** `ProductViewSet` correctly filters deleted items but allows restoring them via a custom action.

### 🎨 Frontend Architecture (React)
*   **Structure:** Clean separation of `pages`, `components`, `context`, and `config`.
*   **State Management:** `AuthContext` effectively manages global auth state.
*   **API Client:** `fetchWithAuth` wrapper in `AuthContext` provides a centralized place to handle 401 token refreshes. This is a very strong pattern.
*   **Performance:** `ProductList.jsx` implements server-side pagination and debounced search.

---

## 4. Recommendations

### Immediate Next Steps
1.  **Wire up the Dashboard:**
    *   Modify `DashboardStatsView` to import `Order` and `Product` models.
    *   Replace `Decimal("24500.00")` with `Order.objects.filter(created_at__date=today).aggregate(Sum('total'))`.
2.  **Refine "Add Product":**
    *   Add validation for negative numbers on the frontend.
    *   Implement image compression on the frontend before upload to save bandwidth/storage.

### Future Roadmap
1.  **Role-Based Access Control (RBAC):** `UserProfile` has a `role` field, but it currently isn't enforced in permissions (e.g., only Managers should delete products).
    *   *Action:* Create a custom permission class `IsManagerOrOwner`.
2.  **Testing:** The `tester_from_hell` directory implies existence of tests, but standard unit tests should be added to `dashboard` once the real logic is implemented.

---

**Signed,**
*Senior Code Critic*

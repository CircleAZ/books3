# EU-03: Account Identity, Authentication & Resend OTP

## 1. Architectural Role & Boundary Overview

`EU-03` encompasses identity management, multi-step challenge-response authentication, JSON Web Token (JWT) lifecycle orchestration, and audit trails for AZ Books 3.0. It eliminates legacy external profile tables by consolidating user identity into an enterprise custom model (`account.User`), enforces cryptographic email OTP validation via Resend HTTP / SMTP, integrates an offline-ready JWT claim injection pipeline, and manages elevated session escalation for high-risk operations.

```mermaid
flowchart TD
    Client["Client Browser / POS Terminal"] --> LoginEndpoint["POST /api/account/login/ (account/views.py)"]
    
    subgraph "Authentication & Lockout Barrier"
        LoginEndpoint --> ThrottleCheck{"Rate Limit Exceeded?<br/>(10 req / min)"}
        ThrottleCheck -->|Yes| ThrottleErr["HTTP 429 Too Many Requests"]
        ThrottleCheck -->|No| LockoutCheck{"Account Locked?<br/>(5 failures = 5 min lock)"}
        LockoutCheck -->|Yes| LockoutErr["HTTP 429 Account Locked"]
        LockoutCheck -->|No| Authenticate["django.contrib.auth.authenticate()"]
    end

    subgraph "OTP Challenge Decision Matrix"
        Authenticate -->|Credentials Invalid| RecordFailure["Increment Failed Count in Cache"]
        Authenticate -->|Valid User| EmailVerifiedCheck{"user.email_verified == True?"}
        
        EmailVerifiedCheck -->|No| ForceVerifyOTP["Generate Verify Email OTP (EmailOTP)"]
        EmailVerifiedCheck -->|Yes| DeviceTokenCheck{"Valid Signed Device Token?<br/>(<24 hours old)"}
        
        DeviceTokenCheck -->|Yes| IssueTokens["Issue JWT Directly (_build_token_response)"]
        DeviceTokenCheck -->|No| ForceLoginOTP["Generate Login OTP (EmailOTP)"]
    end

    subgraph "Dispatch & Delivery Layer"
        ForceVerifyOTP --> SendMail["_send_otp_email via Resend / Anymail"]
        ForceLoginOTP --> SendMail
        SendMail --> ReturnSession["Return HTTP 200 {requires_otp: true, otp_session: UUID}"]
    end

    subgraph "Token Generation & Claim Injection"
        IssueTokens --> Serializer["CustomTokenObtainPairSerializer"]
        Serializer --> RBACQuery["Fetch Roles & Permissions from settings_app"]
        RBACQuery --> JWT["Inject Claims: roles, role, permissions into Access Token"]
        JWT --> ClientResponse["Return HTTP 200 {access, refresh, user, device_token}"]
    end

    classDef barrier fill:#1e293b,stroke:#f43f5e,stroke-width:2px,color:#f8fafc;
    classDef decision fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef token fill:#1e1e2e,stroke:#a855f7,stroke-width:2px,color:#f8fafc;

    class LoginEndpoint,ThrottleCheck,ThrottleErr,LockoutCheck,LockoutErr,Authenticate,RecordFailure barrier;
    class EmailVerifiedCheck,DeviceTokenCheck,ForceVerifyOTP,ForceLoginOTP,SendMail,ReturnSession decision;
    class IssueTokens,Serializer,RBACQuery,JWT,ClientResponse token;
```

---

## 2. Source File Inventory & Structural Ownership

| Source File Path | Architectural Responsibilities |
| :--- | :--- |
| [`account/__init__.py`](file:///z:/books3/account/__init__.py) | Package initialization. |
| [`account/apps.py`](file:///z:/books3/account/apps.py) | Application configuration and metadata. |
| [`account/admin.py`](file:///z:/books3/account/admin.py) | Django Admin registration for custom `User`, `EmailOTP`, and `ActivityLog` entities. |
| [`account/models.py`](file:///z:/books3/account/models.py) | Custom `User` model, `EmailOTP` with automatic single-use invalidation, `ActivityLog` audit table, and in-app `Notification` model. |
| [`account/serializers.py`](file:///z:/books3/account/serializers.py) | JWT serializers (`CustomTokenObtainPairSerializer`, `CustomTokenRefreshSerializer`) injecting RBAC claims, password validators, and OTP payload schemas. |
| [`account/views.py`](file:///z:/books3/account/views.py) | Login challenge view, OTP verification/resend endpoints, token revocation logout, elevated authentication flow, and user profile management. |
| [`account/urls.py`](file:///z:/books3/account/urls.py) | Routing table for authentication, notification, and profile management endpoints. |
| [`account/management/__init__.py`](file:///z:/books3/account/management/__init__.py) | Management command package root. |
| [`account/management/commands/__init__.py`](file:///z:/books3/account/management/commands/__init__.py) | Command package. |
| [`account/management/commands/cleanup_expired_otps.py`](file:///z:/books3/account/management/commands/cleanup_expired_otps.py) | Scheduled purge routine cleaning consumed OTPs older than 7 days and expired tokens. |

---

## 3. Custom User Model & Identity Structure

The application replaces Django's default integer-keyed auth model with `account.User`, unifying profile details directly on the primary identity entity:

```mermaid
classDiagram
    class AbstractUser {
        +String username
        +String first_name
        +String last_name
        +Boolean is_staff
        +Boolean is_active
        +DateTimeField date_joined
    }
    class UUIDPrimaryKeyModel {
        +UUID id [PK]
    }
    class User {
        +EmailField email [unique=True]
        +CharField phone
        +ImageField profile_picture
        +CharField role [TextChoices: owner, manager, cashier, staff]
        +BooleanField remember_me_enabled
        +GenericIPAddressField last_login_ip
        +BooleanField email_verified
        +full_name() String
        +initials() String
        +masked_email() String
    }
    class EmailOTP {
        +UUID id [PK]
        +ForeignKey user [CASCADE]
        +CharField code [6 Digits]
        +CharField purpose [login, verify_email, elevated_auth]
        +DateTimeField created_at
        +DateTimeField expires_at
        +BooleanField is_used
        +is_expired() Boolean
        +is_valid() Boolean
        +generate(user, purpose, lifetime_minutes) EmailOTP
    }
    class ActivityLog {
        +UUID id [PK]
        +ForeignKey user [SET_NULL]
        +CharField action [login, logout, password_change, etc.]
        +CharField description
        +GenericIPAddressField ip_address
        +CharField user_agent
        +JSONField metadata
        +log_action() ActivityLog
    }

    AbstractUser <|-- User
    UUIDPrimaryKeyModel <|-- User
    User "1" -- "*" EmailOTP : generates
    User "1" -- "*" ActivityLog : records
```

### Identity Invariants

1. **Email Uniqueness Mandate**: `AbstractUser.email` is overridden to enforce `unique=True` and non-null validation, establishing email as the canonical communication channel for OTP delivery.
2. **Masked Email Privacy Guard**: `User.masked_email` dynamically formats email addresses (e.g. `m***k@gmail.com`) for unauthenticated API responses, preventing email enumeration or full address leakage to unauthorized observers.
3. **RBAC Decoupling**: While `User.role` exists for baseline display, true authorization permissions are resolved exclusively through `settings_app.models.Role` and `UserRole` relationships.

---

## 4. Multi-Step Challenge Authentication & OTP Protocol

Login executes as a multi-step challenge-response flow designed to secure terminal logins while eliminating repetitive 2FA friction for recognized devices:

```mermaid
sequenceDiagram
    autonumber
    participant Client as Web / Mobile PWA Client
    participant API as LoginView (account/views.py)
    participant OTPStore as EmailOTP Database Table
    participant Mailer as Resend / Anymail Backend
    participant VerifyAPI as OTPVerifyView (account/views.py)

    Client->>API: POST /api/account/login/<br/>{username, password, remember_me, device_token}
    API->>API: Verify credentials via authenticate()
    
    alt Device Token Valid & User Verified
        Note over API: Fast Path: Device verified < 24h ago
        API->>Client: Return JWT Tokens directly
    else First login on device OR unverified email
        API->>OTPStore: EmailOTP.generate(user, purpose='login')
        Note over OTPStore: Invalidates all previous unused OTPs for user+purpose
        API->>Mailer: _send_otp_email(user, otp)
        API->>API: Cache remember_me preference under otp_remember_{otp.id}
        API-->>Client: HTTP 200 {requires_otp: true, otp_session: otp.id, email: masked_email}
    end

    Client->>VerifyAPI: POST /api/account/verify-otp/<br/>{otp_session: UUID, code: "123456"}
    VerifyAPI->>OTPStore: Fetch EmailOTP by ID
    alt OTP Expired, Already Used, or Code Mismatch
        VerifyAPI-->>Client: HTTP 400 Bad Request
    else Valid OTP Code
        VerifyAPI->>OTPStore: Set is_used = True
        VerifyAPI->>VerifyAPI: Generate signed device_token via TimestampSigner (valid 24h)
        VerifyAPI->>VerifyAPI: Fetch remember_me from cache
        VerifyAPI-->>Client: HTTP 200 {access, refresh, device_token, user, profile}
    end
```

### Rate Limiting & Lockout Parameters

- **Login Throttling (`LoginRateThrottle`)**: 10 requests per minute per IP.
- **Account Lockout (`MAX_FAILED_ATTEMPTS`)**: 5 consecutive failed credential attempts triggers an automatic 5-minute lockout (`LOCKOUT_DURATION = 300s`) keyed by username in Redis (`login_lockout_{username}`).
- **OTP Resend Throttle (`ResendOTPThrottle`)**: Stricter rate limit of 3 requests per 5 minutes per IP to prevent email spamming and API exhaustion.

---

## 5. JWT Claim Injection & Offline PWA Optimization

Books3 utilizes `django-rest-framework-simplejwt` customized via `CustomTokenObtainPairSerializer` and `CustomTokenRefreshSerializer`. This embeds the entire active RBAC authorization matrix into the signed JWT token:

```mermaid
sequenceDiagram
    autonumber
    participant Client as React SPA / PWA
    participant RefreshAPI as TokenRefreshView
    participant Serializer as CustomTokenRefreshSerializer
    participant RBAC as settings_app Database
    participant Token as JWT Access & Refresh Token

    Client->>RefreshAPI: POST /api/token/refresh/<br/>{refresh: "eyJhbGci..."}
    RefreshAPI->>Serializer: validate(attrs)
    
    Serializer->>Token: Decode refresh token to extract user_id
    Serializer->>RBAC: Query Role & RolePermission for user_id
    
    alt User is superuser
        Serializer->>Token: access['role'] = 'Admin'<br/>access['roles'] = ['Admin']<br/>access['permissions'] = ['all']
    else Standard Employee
        Serializer->>Token: access['role'] = primary_role_name<br/>access['roles'] = [role1, role2]<br/>access['permissions'] = [codename1, codename2, ...]
    end

    opt User has remember_me_enabled = True
        Note over Serializer: Reinstate 7-day extended lifespans
        Serializer->>Token: refresh.set_exp(7 days)<br/>access.set_exp(4 hours)
    end

    Serializer-->>Client: HTTP 200 {access: "...", refresh: "..."}
    Note over Client: Frontend decodes access token via jwt-decode.<br/>All route guards evaluate offline without network round-trips!
```

### Token Lifespan & Performance Matrix

| Token Type | Standard Lifespan | Remember-Me Lifespan | Injected Claims |
| :--- | :--- | :--- | :--- |
| **Access Token** | 30 minutes | 4 hours | `user_id`, `username`, `is_staff`, `is_superuser`, `role`, `roles`, `permissions` |
| **Refresh Token** | 1 day | 7 days | `user_id`, `token_type` |

*Design Rationale*: The 30-minute access token accommodates Render free/starter container cold starts (30–60s spin-up) without causing premature logout, while `BLACKLIST_AFTER_ROTATION = False` eliminates unnecessary database writes on every token refresh under PgBouncer transaction pooling.

---

## 6. Elevated Authentication Escalation Protocol

Operations that alter user credentials, affect store configuration, or perform sensitive financial modifications require an elevated authentication session:

```mermaid
sequenceDiagram
    autonumber
    participant Client as User Browser
    participant API as RequestElevatedOTPView
    participant Mailer as Resend SMTP
    participant VerifyAPI as VerifyElevatedOTPView
    participant Cache as Redis Cache Engine
    participant GuardedView as ChangePasswordView (HasElevatedAuth)

    Client->>GuardedView: POST /api/account/change-password/
    GuardedView->>Cache: Check cache.get('elevated_auth_{user.id}')
    Cache-->>GuardedView: None (Expired or Missing)
    GuardedView-->>Client: HTTP 403 {code: "requires_elevated_otp", message: "OTP required"}

    Client->>API: POST /api/account/request-elevated-otp/
    API->>API: Generate EmailOTP (purpose='elevated_auth', TTL: 5 min)
    API->>Mailer: Dispatch OTP code to user.email
    API-->>Client: HTTP 200 {"message": "Elevated OTP sent"}

    Client->>VerifyAPI: POST /api/account/verify-elevated-otp/<br/>{code: "654321"}
    VerifyAPI->>VerifyAPI: Validate OTP code & assert is_used == False
    VerifyAPI->>VerifyAPI: Mark OTP as used
    VerifyAPI->>Cache: Set elevated_auth_{user.id} = True (TTL: 3600 seconds)
    VerifyAPI-->>Client: HTTP 200 {"message": "Elevated access granted"}

    Client->>GuardedView: POST /api/account/change-password/ (Retried)
    GuardedView->>Cache: Check cache.get('elevated_auth_{user.id}')
    Cache-->>GuardedView: True (Session Active)
    GuardedView->>GuardedView: Update Password & Revoke All Outstanding Tokens
    GuardedView-->>Client: HTTP 200 {"message": "Password changed successfully"}
```

---

## 7. Audit Logging & Background Maintenance

### Activity Logging Architecture (`ActivityLog`)

Every critical user action logs an immutable event through `ActivityLog.log_action`:
```python
ActivityLog.log_action(
    user=request.user,
    action=ActivityLog.ActionType.LOGIN,
    description="User logged in",
    request=request,
    metadata={"client_version": "3.0.0"}
)
```
- **Real IP Extraction**: Inspects `HTTP_X_FORWARDED_FOR` (first IP from proxy chain) before falling back to `REMOTE_ADDR`.
- **User Agent Truncation**: Truncates browser user agent strings to 255 characters to prevent database column overflows.

### Scheduled OTP Cleanup Command (`cleanup_expired_otps`)

Over time, ephemeral OTPs clutter the database. The scheduled management command in `account/management/commands/cleanup_expired_otps.py` executes periodic maintenance:
```python
otps_to_delete = EmailOTP.objects.filter(
    Q(is_used=True, created_at__lt=used_threshold) |  # Consumed OTPs older than 7 days
    Q(is_used=False, expires_at__lt=timezone.now())   # Abandoned expired OTPs
)
count, _ = otps_to_delete.delete()
```
This ensures the `account_emailotp` table remains lean and index-optimized.

---

## 8. Failure Modes & Recovery Matrix

| Failure Mode | Detection Mechanism | Immediate System Response | Recovery / Corrective Action |
| :--- | :--- | :--- | :--- |
| **Brute-Force Password Attack** | 5 consecutive bad credential attempts on `LoginView`. | `login_lockout_{username}` set in Redis; returns HTTP 429 for 5 minutes. | Automatic expiration after 300 seconds; administrator can manually purge cache key if user is blocked. |
| **Resend OTP Flood Attack** | Client hits `/api/account/resend-otp/` repeatedly. | `ResendOTPThrottle` halts requests exceeding 3 per 5 minutes per IP. | Returns HTTP 429 Too Many Requests; protects outbound email quota and prevents SMS/email abuse. |
| **Stale JWT Token During RBAC Reassignment** | User role modified in `settings_app`, but user possesses unexpired access token. | Access token valid for up to 30 minutes. | Immediate mitigation: Trigger token refresh on client, which forces fresh DB permission query in `CustomTokenRefreshSerializer`. |
| **Elevated Auth Expiration Mid-Transaction** | User takes >1 hour to submit sensitive form. | `HasElevatedAuth` returns 403 `requires_elevated_otp`. | Frontend captures error interceptor, prompts for a new elevated OTP, and retries the submission. |
| **Resend / SMTP Delivery Failure** | Network timeout or invalid API credentials during `_send_otp_email()`. | Exception caught; client receives error without leaking SMTP stack traces. | Check `RESEND_API_KEY` in environment; development falls back gracefully to `console.EmailBackend`. |
| **Device Token Tampering / Expiry** | Invalid signature or token age > 24 hours in `_validate_device_token()`. | `TimestampSigner.unsign()` raises `BadSignature` or `SignatureExpired`. | System falls back seamlessly to mandatory OTP challenge flow. |

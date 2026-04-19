"""
Account app views for AZ Books
JWT authentication, OTP verification, and user profile management
"""
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken, OutstandingToken, BlacklistedToken
from django.contrib.auth import authenticate, get_user_model
from django.core.cache import cache
from core.permissions import HasElevatedAuth
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from django.core.signing import TimestampSigner, SignatureExpired, BadSignature

from .models import ActivityLog, Notification, EmailOTP
from .serializers import (
    UserSerializer, LoginSerializer, ChangePasswordSerializer,
    ActivityLogSerializer, ProfilePictureSerializer, NotificationSerializer,
    OTPVerifySerializer, ResendOTPSerializer
)

User = get_user_model()


# SEC-3: Rate limit login attempts
class LoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'


# SEC-4: Account lockout helper
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = 300  # 5 minutes



def _send_otp_email(user, otp):
    """Send OTP email synchronously via Gmail SMTP."""
    subject = f'Your AZ Books verification code: {otp.code}'
    message = (
        f'Hi {user.first_name or user.username},\n\n'
        f'Your verification code is: {otp.code}\n\n'
        f'This code expires in 5 minutes.\n'
        f'If you did not request this, please ignore this email.\n\n'
        f'— CircleAZ'
    )
    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )


from .serializers import CustomTokenObtainPairSerializer

def _generate_device_token(user):
    """Generate a signed token proving this device verified an OTP."""
    signer = TimestampSigner()
    return signer.sign(str(user.id))

def _validate_device_token(token, user):
    """Validate sign token and ensure it's < 24h old and belongs to user."""
    if not token:
        return False
    signer = TimestampSigner()
    try:
        user_id = signer.unsign(token, max_age=86400) # 24 hours
        return str(user_id) == str(user.id)
    except (SignatureExpired, BadSignature):
        return False

def _build_token_response(user, remember_me, request, device_token=None):
    """Generate JWT tokens and return the full login response payload."""
    refresh = CustomTokenObtainPairSerializer.get_token(user)

    if remember_me:
        refresh.set_exp(lifetime=timedelta(days=7))
        access_token = refresh.access_token
        access_token.set_exp(lifetime=timedelta(hours=4))
    else:
        access_token = refresh.access_token

    # Update user settings
    user.remember_me_enabled = remember_me
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        user.last_login_ip = x_forwarded_for.split(',')[0].strip()
    else:
        user.last_login_ip = request.META.get('REMOTE_ADDR')
    user.save(update_fields=['remember_me_enabled', 'last_login_ip'])

    # Log activity
    ActivityLog.log_action(
        user=user,
        action=ActivityLog.ActionType.LOGIN,
        description='User logged in',
        request=request
    )

    profile_data = UserSerializer(user, context={'request': request}).data

    # Resolve RBAC role name from UserRole table (not the deprecated User.role CharField)
    from settings_app.models import Role
    rbac_roles = Role.objects.filter(role_users__user=user)
    rbac_role_name = rbac_roles.first().name if rbac_roles.exists() else None

    return Response({
        'access': str(access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': rbac_role_name,
        },
        'profile': profile_data,
        **({'device_token': device_token} if device_token else {})
    })


class LoginView(APIView):
    """
    POST /api/account/login/
    Step 1: Validate credentials. If OTP is required, generates and emails it.
    Returns either JWT tokens (if OTP is skipped) or an otp_session UUID.
    """
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data['username']
        password = serializer.validated_data['password']
        remember_me = serializer.validated_data.get('remember_me', False)

        # SEC-4: Check account lockout
        lockout_key = f'login_lockout_{username}'
        attempts_key = f'login_attempts_{username}'

        if cache.get(lockout_key):
            return Response(
                {'error': 'Account temporarily locked. Try again in a few minutes.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )

        user = authenticate(username=username, password=password)

        if user is None:
            attempts = cache.get(attempts_key, 0) + 1
            cache.set(attempts_key, attempts, timeout=LOCKOUT_DURATION)

            if attempts >= MAX_FAILED_ATTEMPTS:
                cache.set(lockout_key, True, timeout=LOCKOUT_DURATION)
                return Response(
                    {'error': 'Too many failed attempts. Account locked for 5 minutes.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )

            return Response(
                {'error': 'Invalid username or password'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {'error': 'Invalid username or password'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # SEC-4: Clear failed attempts on successful credential check
        cache.delete(attempts_key)
        cache.delete(lockout_key)

        # --- OTP Decision Logic ---
        device_token = serializer.validated_data.get('device_token')

        # Case 1: Email not verified → force email verification OTP
        if not user.email_verified:
            otp = EmailOTP.generate(user, purpose='verify_email')
            try:
                _send_otp_email(user, otp)
            except Exception:
                pass  # Don't leak SMTP errors to client

            # Store remember_me preference in cache for Step 2
            cache.set(f'otp_remember_{otp.id}', remember_me, timeout=600)

            return Response({
                'requires_email_verification': True,
                'requires_otp': True,
                'otp_session': str(otp.id),
                'email': user.masked_email,
            })

        # Case 2: Remember Me ON + active session (token refresh handles it) → skip OTP
        # Case 3: Valid Device Token (verified within last 24h) → skip OTP
        if _validate_device_token(device_token, user):
            return _build_token_response(user, remember_me, request, device_token)

        # Case 4: OTP required (first login on this device today)
        otp = EmailOTP.generate(user, purpose='login')
        try:
            _send_otp_email(user, otp)
        except Exception:
            pass

        cache.set(f'otp_remember_{otp.id}', remember_me, timeout=600)

        return Response({
            'requires_otp': True,
            'otp_session': str(otp.id),
            'email': user.masked_email,
        })


class OTPVerifyView(APIView):
    """
    POST /api/account/verify-otp/
    Step 2: Validate OTP code and issue JWT tokens.
    """
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        otp_session = serializer.validated_data['otp_session']
        code = serializer.validated_data['code']

        try:
            otp = EmailOTP.objects.get(id=otp_session)
        except EmailOTP.DoesNotExist:
            return Response(
                {'error': 'Invalid OTP session.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if otp.is_used:
            return Response(
                {'error': 'This OTP has already been used.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if otp.is_expired:
            return Response(
                {'error': 'OTP has expired. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if otp.code != code:
            return Response(
                {'error': 'Invalid OTP code.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Mark OTP as used
        otp.is_used = True
        otp.save(update_fields=['is_used'])

        user = otp.user

        # If this was an email verification OTP, mark email as verified
        if otp.purpose == EmailOTP.Purpose.VERIFY_EMAIL:
            user.email_verified = True

        user.save(update_fields=['email_verified'])

        # Generate new device token to skip OTP on this device for next 24h
        device_token = _generate_device_token(user)

        # Retrieve remember_me preference from cache
        remember_me = cache.get(f'otp_remember_{otp.id}', False)
        cache.delete(f'otp_remember_{otp.id}')

        return _build_token_response(user, remember_me, request, device_token)


# Rate limiter for OTP resend (stricter: 3 per 5 minutes)
class ResendOTPThrottle(AnonRateThrottle):
    rate = '3/minute'  # placeholder — overridden below

    def parse_rate(self, rate):
        # Custom: 3 requests per 5 minutes (300 seconds)
        return (3, 300)


class ResendOTPView(APIView):
    """
    POST /api/account/resend-otp/
    Invalidate previous OTP and send a new one.
    """
    permission_classes = [AllowAny]
    throttle_classes = [ResendOTPThrottle]

    def post(self, request):
        serializer = ResendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        otp_session = serializer.validated_data['otp_session']

        try:
            old_otp = EmailOTP.objects.get(id=otp_session)
        except EmailOTP.DoesNotExist:
            return Response(
                {'error': 'Invalid OTP session.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = old_otp.user
        purpose = old_otp.purpose

        # Generate new OTP (invalidates old ones automatically)
        new_otp = EmailOTP.generate(user, purpose=purpose)
        try:
            _send_otp_email(user, new_otp)
        except Exception:
            pass

        # Transfer remember_me preference to new OTP session
        remember_me = cache.get(f'otp_remember_{old_otp.id}', False)
        cache.delete(f'otp_remember_{old_otp.id}')
        cache.set(f'otp_remember_{new_otp.id}', remember_me, timeout=600)

        return Response({
            'message': 'A new OTP has been sent to your email.',
            'otp_session': str(new_otp.id),
        })


class LogoutView(APIView):
    """
    POST /api/account/logout/
    Blacklist refresh token
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            
            # Clear elevated auth cache on logout
            cache.delete(f'elevated_auth_{request.user.id}')
            
            # Log activity
            ActivityLog.log_action(
                user=request.user,
                action=ActivityLog.ActionType.LOGOUT,
                description='User logged out',
                request=request
            )
            
            return Response({'message': 'Logged out successfully'})
        except Exception as e:
            return Response({'message': 'Logged out'})


class ProfileView(generics.RetrieveUpdateAPIView):
    """
    GET /api/account/profile/ - Get current user's profile
    PUT/PATCH /api/account/profile/ - Update profile
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    
    def get_object(self):
        return self.request.user
    
    def perform_update(self, serializer):
        serializer.save()
        
        # Log activity
        ActivityLog.log_action(
            user=self.request.user,
            action=ActivityLog.ActionType.PROFILE_UPDATE,
            description='Profile updated',
            request=self.request
        )


class ProfilePictureView(APIView):
    """
    POST /api/account/profile/picture/ - Upload profile picture
    DELETE /api/account/profile/picture/ - Remove profile picture
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    
    def post(self, request):
        serializer = ProfilePictureSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user = request.user
        
        # Delete old picture if exists
        if user.profile_picture:
            user.profile_picture.delete(save=False)
        
        user.profile_picture = serializer.validated_data['profile_picture']
        user.save()
        
        # Log activity
        ActivityLog.log_action(
            user=request.user,
            action=ActivityLog.ActionType.PROFILE_UPDATE,
            description='Profile picture updated',
            request=request
        )
        
        return Response({
            'message': 'Profile picture updated',
            'profile_picture_url': request.build_absolute_uri(user.profile_picture.url)
        })
    
    def delete(self, request):
        user = request.user
        if user.profile_picture:
            user.profile_picture.delete()
        
        return Response({'message': 'Profile picture removed'})


class ChangePasswordView(APIView):
    """
    POST /api/account/change-password/
    Change user's password
    """
    permission_classes = [IsAuthenticated, HasElevatedAuth]
    
    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, 
            context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        
        user = request.user
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        
        # SEC-5: Invalidate all existing refresh tokens after password change
        try:
            tokens = OutstandingToken.objects.filter(user=user)
            for token_obj in tokens:
                try:
                    BlacklistedToken.objects.get_or_create(token=token_obj)
                except Exception:
                    pass
        except Exception:
            pass  # Don't fail password change if blacklisting has issues
        
        # Log activity
        ActivityLog.log_action(
            user=user,
            action=ActivityLog.ActionType.PASSWORD_CHANGE,
            description='Password changed',
            request=request
        )
        
        return Response({'message': 'Password changed successfully. Please log in again.'})


class ActivityLogView(generics.ListAPIView):
    """
    GET /api/account/activity/
    List user's recent activity
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ActivityLogSerializer
    
    def get_queryset(self):
        return ActivityLog.objects.filter(user=self.request.user)[:20]


class NotificationListView(APIView):
    """
    GET  /api/account/notifications/ — list recent notifications
    POST /api/account/notifications/ — mark all as read
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = Notification.objects.filter(user=request.user)[:30]

        # Seed sample notifications for first-time users
        if not notifications.exists():
            Notification.notify(
                user=request.user,
                title='Welcome to AZ Books!',
                message='Your store is set up and ready to go.',
                notification_type='success',
                link='/'
            )
            notifications = Notification.objects.filter(user=request.user)[:30]

        serializer = NotificationSerializer(notifications, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Mark all notifications as read"""
        count = Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=True)
        return Response({'marked_read': count})


class NotificationCountView(APIView):
    """
    GET /api/account/notifications/count/ — unread notification count
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Seed welcome notification for first-time users
        if not Notification.objects.filter(user=request.user).exists():
            Notification.notify(
                user=request.user,
                title='Welcome to AZ Books!',
                message='Your store is set up and ready to go.',
                notification_type='success',
                link='/'
            )

        count = Notification.objects.filter(
            user=request.user, is_read=False
        ).count()
        return Response({'unread_count': count})


class NotificationReadView(APIView):
    """
    PATCH /api/account/notifications/<id>/read/ — mark single notification as read
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            notification = Notification.objects.get(id=pk, user=request.user)
            notification.is_read = True
            notification.save(update_fields=['is_read'])
            return Response({'status': 'ok'})
        except Notification.DoesNotExist:
            return Response(
                {'error': 'Notification not found'},
                status=status.HTTP_404_NOT_FOUND
            )

class RequestElevatedOTPView(APIView):
    """
    POST /api/account/request-elevated-otp/
    Request an OTP to activate elevated authentication session for high-risk actions.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        otp = EmailOTP.generate(user, purpose=EmailOTP.Purpose.ELEVATED_AUTH)
        try:
            _send_otp_email(user, otp)
            return Response({'message': 'Elevated OTP sent to your email.'})
        except Exception as e:
            return Response(
                {'error': 'Failed to send OTP email.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class VerifyElevatedOTPView(APIView):
    """
    POST /api/account/verify-elevated-otp/
    Verify the elevated OTP and grant a 10-minute elevated auth window.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        code = request.data.get('code')
        if not code:
            return Response({'error': 'Code is required.'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        try:
            # Get latest unused elevated OTP
            otp = EmailOTP.objects.filter(
                user=user, 
                purpose=EmailOTP.Purpose.ELEVATED_AUTH,
                is_used=False
            ).latest('created_at')
        except EmailOTP.DoesNotExist:
            return Response({'error': 'No active OTP found. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

        if otp.is_expired:
            return Response({'error': 'OTP has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

        if otp.code != code:
            return Response({'error': 'Invalid OTP code.'}, status=status.HTTP_400_BAD_REQUEST)

        # Success
        otp.is_used = True
        otp.save(update_fields=['is_used'])

        # Set 1-hour elevated session in cache
        cache.set(f'elevated_auth_{user.id}', True, timeout=3600)

        # Log the elevated auth event
        ActivityLog.log_action(
            user=user,
            action=ActivityLog.ActionType.OTHER,
            description='Elevated authentication granted (1 hour)',
            request=request
        )

        return Response({'message': 'Elevated access granted.'})

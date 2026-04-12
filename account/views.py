"""
Account app views for AZ Books
JWT authentication and user profile management
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
from datetime import timedelta

from .models import ActivityLog, Notification
from .serializers import (
    UserSerializer, LoginSerializer, ChangePasswordSerializer,
    ActivityLogSerializer, ProfilePictureSerializer, NotificationSerializer
)

User = get_user_model()


# SEC-3: Rate limit login attempts
class LoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'


# SEC-4: Account lockout helper
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION = 300  # 5 minutes


class LoginView(APIView):
    """
    POST /api/account/login/
    Authenticate user and return JWT tokens
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
            # SEC-4: Track failed attempts
            attempts = cache.get(attempts_key, 0) + 1
            cache.set(attempts_key, attempts, timeout=LOCKOUT_DURATION)
            
            if attempts >= MAX_FAILED_ATTEMPTS:
                cache.set(lockout_key, True, timeout=LOCKOUT_DURATION)
                return Response(
                    {'error': 'Too many failed attempts. Account locked for 5 minutes.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS
                )
            
            # SEC-9: Use same generic error for invalid user AND invalid password
            return Response(
                {'error': 'Invalid username or password'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        if not user.is_active:
            # SEC-9: Same generic error — don't reveal account exists but is disabled
            return Response(
                {'error': 'Invalid username or password'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # SEC-4: Clear failed attempts on successful login
        cache.delete(attempts_key)
        cache.delete(lockout_key)
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        
        # Extend token lifetime if "remember me" is checked
        if remember_me:
            refresh.set_exp(lifetime=timedelta(days=7))
            access_token = refresh.access_token
            # SEC-8: Reduced from 7 days to 4 hours — still long but not dangerous
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
        user.save()
        
        # Log activity
        ActivityLog.log_action(
            user=user,
            action=ActivityLog.ActionType.LOGIN,
            description=f'User logged in',
            request=request
        )
        
        # Get profile data (now part of User)
        profile_data = UserSerializer(user, context={'request': request}).data
        
        return Response({
            'access': str(access_token),
            'refresh': str(refresh),
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'role': user.role,
            },
            'profile': profile_data
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
    permission_classes = [IsAuthenticated]
    
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

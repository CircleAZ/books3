"""
Account app views for AZ Books
JWT authentication and user profile management
"""
from rest_framework import status, generics
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model
from datetime import timedelta

from .models import ActivityLog
from .serializers import (
    UserSerializer, LoginSerializer, ChangePasswordSerializer,
    ActivityLogSerializer, ProfilePictureSerializer
)

User = get_user_model()

class LoginView(APIView):
    """
    POST /api/account/login/
    Authenticate user and return JWT tokens
    """
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        username = serializer.validated_data['username']
        password = serializer.validated_data['password']
        remember_me = serializer.validated_data.get('remember_me', False)
        
        user = authenticate(username=username, password=password)
        
        if user is None:
            return Response(
                {'error': 'Invalid username or password'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        if not user.is_active:
            return Response(
                {'error': 'Account is disabled'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        
        # Extend token lifetime if "remember me" is checked
        if remember_me:
            refresh.set_exp(lifetime=timedelta(days=30))
            access_token = refresh.access_token
            access_token.set_exp(lifetime=timedelta(days=7))
        else:
            access_token = refresh.access_token
        
        # Update user settings
        user.remember_me_enabled = remember_me
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            user.last_login_ip = x_forwarded_for.split(',')[0]
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
                'role': user.role, # Added role here for convenience
            },
            'profile': profile_data # Kept 'profile' key for frontend compatibility, but it contains user data
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
    serializer_class = UserSerializer # Changed from ProfileSerializer
    
    def get_object(self):
        return self.request.user # Directly return the user
    
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
        
        # Log activity
        ActivityLog.log_action(
            user=user,
            action=ActivityLog.ActionType.PASSWORD_CHANGE,
            description='Password changed',
            request=request
        )
        
        return Response({'message': 'Password changed successfully'})


class ActivityLogView(generics.ListAPIView):
    """
    GET /api/account/activity/
    List user's recent activity
    """
    permission_classes = [IsAuthenticated]
    serializer_class = ActivityLogSerializer
    
    def get_queryset(self):
        return ActivityLog.objects.filter(user=self.request.user)[:20]

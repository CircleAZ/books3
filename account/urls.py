"""
Account app URL configuration
"""
from django.urls import path
from .views import (
    LoginView, LogoutView, ProfileView, 
    ProfilePictureView, ChangePasswordView, ActivityLogView,
    NotificationListView, NotificationCountView, NotificationReadView
)

app_name = 'account'

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('profile/picture/', ProfilePictureView.as_view(), name='profile-picture'),
    path('change-password/', ChangePasswordView.as_view(), name='change-password'),
    path('activity/', ActivityLogView.as_view(), name='activity-log'),
    path('notifications/', NotificationListView.as_view(), name='notifications'),
    path('notifications/count/', NotificationCountView.as_view(), name='notification-count'),
    path('notifications/<uuid:pk>/read/', NotificationReadView.as_view(), name='notification-read'),
]

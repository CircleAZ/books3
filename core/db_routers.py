import threading
from functools import wraps

# Thread-local storage to track routing state
_thread_local = threading.local()

class ReportReplicaRouter:
    """
    Database router to dynamically route heavy reporting read queries
    to the 'reports' database replica, while keeping all writes on 'default'.
    """
    def db_for_read(self, model, **hints):
        from django.conf import settings
        if getattr(settings, 'IS_TESTING', False):
            # Bypass replica routing during test suites to avoid DDL/connection conflicts
            return 'default'
        if getattr(_thread_local, 'use_read_replica', False):
            return 'reports'
        return 'default'

    def db_for_write(self, model, **hints):
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        # Allow any relations since reports and default are identical replicas of the same DB
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # All migrations must run strictly on the default primary database
        return db == 'default'


def use_read_replica(func):
    """
    Robust decorator that handles both class method actions and standalone view functions.
    Forces read routing to the replica for the duration of the execution context.
    """
    @wraps(func)
    def _wrapped(*args, **kwargs):
        setattr(_thread_local, 'use_read_replica', True)
        try:
            return func(*args, **kwargs)
        finally:
            setattr(_thread_local, 'use_read_replica', False)
    return _wrapped

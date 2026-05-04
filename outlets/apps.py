from django.apps import AppConfig


class OutletsConfig(AppConfig):
    name = 'outlets'

    def ready(self):
        import outlets.signals

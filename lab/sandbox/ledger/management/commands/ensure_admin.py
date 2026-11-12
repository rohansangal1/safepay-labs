import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create the admin console user from SANDBOX_ADMIN_PASSWORD, if it is set."

    def handle(self, *args, **options):
        password = os.environ.get("SANDBOX_ADMIN_PASSWORD")
        if not password:
            self.stdout.write("SANDBOX_ADMIN_PASSWORD not set; no admin user")
            return
        User = get_user_model()
        user, _ = User.objects.get_or_create(
            username="admin", defaults={"is_staff": True, "is_superuser": True}
        )
        user.set_password(password)
        user.save()
        self.stdout.write("admin user ready")

"""Settings for the payments sandbox.

The sandbox holds synthetic data only and runs inside a disposable Docker stack (ADR 011). The
database URL is read from SANDBOX_DATABASE_URL, never DATABASE_URL (that name belongs to the
portal's Neon database), and only local or compose-internal hosts are accepted.
"""

import os
import secrets
from pathlib import Path
from urllib.parse import unquote, urlsplit

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("SANDBOX_SECRET_KEY") or secrets.token_urlsafe(50)
DEBUG = os.environ.get("SANDBOX_DEBUG") == "1"
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "sandbox"]

# Hosts the sandbox may use for its database: loopback and the compose service names.
LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1", "db", "postgres"}


def database_from_url(url: str) -> dict:
    parts = urlsplit(url)
    if parts.scheme not in {"postgres", "postgresql"}:
        raise ImproperlyConfigured("SANDBOX_DATABASE_URL must be a postgres:// URL")
    if parts.hostname not in LOCAL_DB_HOSTS:
        raise ImproperlyConfigured(
            f"SANDBOX_DATABASE_URL host {parts.hostname!r} is not local; the sandbox only runs "
            "against a loopback or compose-internal Postgres"
        )
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parts.path.lstrip("/"),
        "USER": unquote(parts.username or ""),
        "PASSWORD": unquote(parts.password or ""),
        "HOST": parts.hostname,
        "PORT": str(parts.port or 5432),
    }


DATABASES = {
    "default": database_from_url(
        os.environ.get("SANDBOX_DATABASE_URL", "postgres://sandbox:sandbox@127.0.0.1:5432/sandbox")
    )
}

# How the API treats the Idempotency-Key header: "off" ignores it, "optional" honours it when
# sent, "required" rejects money-moving requests without one. B1 design levels build on this.
IDEMPOTENCY_MODE = os.environ.get("SANDBOX_IDEMPOTENCY", "optional")
if IDEMPOTENCY_MODE not in {"off", "optional", "required"}:
    raise ImproperlyConfigured("SANDBOX_IDEMPOTENCY must be off, optional or required")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "ledger",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "sandbox.urls"
WSGI_APPLICATION = "sandbox.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

AUTH_PASSWORD_VALIDATORS = []
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

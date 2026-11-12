from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from ledger.views import healthz

urlpatterns = [
    path("healthz", healthz),
    path("admin/", admin.site.urls),
    path("v1/", include("ledger.urls")),
    # The admin's CSS and JS, served by Django itself: a local inspection console needs no CDN
    # or extra web server.
    re_path(r"^static/(?P<path>.*)$", serve, {"document_root": settings.STATIC_ROOT}),
]

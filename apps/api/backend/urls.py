from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/lastro/", include("lastro.urls")),
    path("api/", include("api.urls")),
]
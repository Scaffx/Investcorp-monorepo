from django.contrib import admin
from .models import ScrapeJob, JobLog

@admin.register(ScrapeJob)
class ScrapeJobAdmin(admin.ModelAdmin):
    list_display = ("id", "status", "created_at", "started_at", "finished_at", "total_rows")
    list_filter = ("status",)
    search_fields = ("id",)

@admin.register(JobLog)
class JobLogAdmin(admin.ModelAdmin):
    list_display = ("id", "job", "created_at", "message")
    list_filter = ("created_at",)
    search_fields = ("job__id", "message")

from django.contrib import admin
from .models_rules import RuleSet, RuleRevision


@admin.register(RuleSet)
class RuleSetAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "report_type", "is_active", "current_revision", "updated_at")
    list_filter = ("report_type", "is_active")
    search_fields = ("name",)


@admin.register(RuleRevision)
class RuleRevisionAdmin(admin.ModelAdmin):
    list_display = ("id", "rule_set", "numbers_count", "created_by", "created_at")
    list_filter = ("rule_set__report_type",)
    search_fields = ("rule_set__name",)

from rest_framework import serializers

from .models_gestao import (
    Team,
    UserProfile,
    TaskTemplate,
    TaskTemplateItem,
    DailyPlan,
    DailyTask,
    Goal,
)


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "manager",
            "created_at",
            "updated_at",
        ]


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            "id",
            "external_id",
            "display_name",
            "role",
            "company_email",
            "personal_email",
            "username",
            "is_manager",
            "team",
            "created_at",
            "updated_at",
        ]


class TaskTemplateItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskTemplateItem
        fields = [
            "id",
            "template",
            "title",
            "description",
            "target_value",
            "unit",
            "sort_order",
        ]


class TaskTemplateSerializer(serializers.ModelSerializer):
    items = TaskTemplateItemSerializer(many=True, read_only=True)

    class Meta:
        model = TaskTemplate
        fields = [
            "id",
            "team",
            "name",
            "is_active",
            "created_by_external_id",
            "created_at",
            "updated_at",
            "items",
        ]


class DailyTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyTask
        fields = [
            "id",
            "plan",
            "title",
            "description",
            "target_value",
            "actual_value",
            "unit",
            "status",
            "sort_order",
        ]


class DailyPlanSerializer(serializers.ModelSerializer):
    tasks = DailyTaskSerializer(many=True, read_only=True)

    class Meta:
        model = DailyPlan
        fields = [
            "id",
            "user",
            "date",
            "template",
            "notes",
            "status",
            "created_by_external_id",
            "updated_by_external_id",
            "created_at",
            "updated_at",
            "tasks",
        ]


class GoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Goal
        fields = [
            "id",
            "scope",
            "user",
            "team",
            "name",
            "target_value",
            "current_value",
            "unit",
            "period",
            "start_date",
            "end_date",
            "created_by_external_id",
            "updated_at",
        ]


class DashboardSerializer(serializers.Serializer):
    team = serializers.DictField()
    date = serializers.DateField()
    users = serializers.ListField(child=serializers.DictField())
    team_totals = serializers.DictField()
    goals = serializers.ListField(child=serializers.DictField())

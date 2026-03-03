from rest_framework import serializers

from .models_areas import Deal, DealGoal, Employee, Vacancy, Appointment


class DealSerializer(serializers.ModelSerializer):
    class Meta:
        model = Deal
        fields = [
            "id",
            "name",
            "company",
            "value",
            "stage",
            "status",
            "probability",
            "responsible",
            "responsible_name",
            "created_by",
            "created_at",
            "updated_at",
        ]


class DealGoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = DealGoal
        fields = [
            "id",
            "name",
            "target_value",
            "current_value",
            "unit",
            "created_by",
            "created_at",
            "updated_at",
        ]


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = [
            "id",
            "name",
            "role_title",
            "area",
            "manager",
            "manager_name",
            "status",
            "start_date",
            "created_at",
            "updated_at",
        ]


class VacancySerializer(serializers.ModelSerializer):
    class Meta:
        model = Vacancy
        fields = [
            "id",
            "title",
            "area",
            "candidates_count",
            "status",
            "created_at",
            "updated_at",
        ]


class AppointmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = [
            "id",
            "client",
            "location",
            "date",
            "time",
            "responsible",
            "responsible_name",
            "status",
            "notes",
            "created_at",
            "updated_at",
        ]


class IndicatorRowSerializer(serializers.Serializer):
    name = serializers.CharField()
    total = serializers.IntegerField()
    extra = serializers.DictField(required=False)

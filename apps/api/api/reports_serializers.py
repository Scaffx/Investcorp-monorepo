from rest_framework import serializers
from .models_rules import RuleSet, RuleRevision


class RuleRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RuleRevision
        fields = ["id", "numbers_count", "created_by", "created_at", "raw_text", "normalized_text"]
        read_only_fields = ["id", "numbers_count", "created_by", "created_at", "normalized_text"]


class RuleSetSerializer(serializers.ModelSerializer):
    current_revision_id = serializers.IntegerField(source="current_revision.id", read_only=True)
    current_numbers_count = serializers.IntegerField(source="current_revision.numbers_count", read_only=True)

    class Meta:
        model = RuleSet
        fields = ["id", "name", "report_type", "is_active", "current_revision_id", "current_numbers_count", "updated_at"]
        read_only_fields = ["id", "updated_at", "current_revision_id", "current_numbers_count"]

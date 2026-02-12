from django.conf import settings
from django.db import models


class RuleSet(models.Model):
    REPORT_TYPES = [
        ("tim", "TIM"),
        ("bradesco", "Bradesco"),
        ("claro_renovacao", "Claro Renovação"),
        ("claro_distrato", "Claro Distrato"),
        ("claro_merge", "Claro Merge"),
    ]

    name = models.CharField(max_length=120)
    report_type = models.CharField(max_length=30, choices=REPORT_TYPES)
    is_active = models.BooleanField(default=True)

    current_revision = models.ForeignKey(
        "RuleRevision",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name", "report_type"], name="uniq_ruleset_name_type")
        ]

    def __str__(self):
        return f"{self.get_report_type_display()} - {self.name}"


class RuleRevision(models.Model):
    rule_set = models.ForeignKey(RuleSet, on_delete=models.CASCADE, related_name="revisions")

    # O que o usuário colou/digitou
    raw_text = models.TextField()

    # Só números, um por linha (pronto pra virar .txt no job)
    normalized_text = models.TextField()

    numbers_count = models.PositiveIntegerField(default=0)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

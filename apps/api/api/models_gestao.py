from __future__ import annotations

from django.db import models


class Team(models.Model):
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    manager = models.ForeignKey(
        "UserProfile",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="managed_teams",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name or f"Team #{self.pk}"


class UserProfile(models.Model):
    external_id = models.CharField(max_length=120, unique=True)
    display_name = models.CharField(max_length=120, blank=True, default="")
    role = models.CharField(max_length=30, blank=True, default="")
    company_email = models.CharField(max_length=160, blank=True, default="")
    personal_email = models.CharField(max_length=160, blank=True, default="")
    username = models.CharField(max_length=80, blank=True, default="")
    is_manager = models.BooleanField(default=False)
    team = models.ForeignKey(
        Team,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="members",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.display_name or self.external_id


class TaskTemplate(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="templates")
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    created_by_external_id = models.CharField(max_length=120, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class TaskTemplateItem(models.Model):
    template = models.ForeignKey(TaskTemplate, on_delete=models.CASCADE, related_name="items")
    title = models.CharField(max_length=140)
    description = models.TextField(blank=True, default="")
    target_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=40, blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.title


class DailyPlan(models.Model):
    STATUS_CHOICES = [
        ("open", "Open"),
        ("closed", "Closed"),
    ]

    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="daily_plans")
    date = models.DateField()
    template = models.ForeignKey(
        TaskTemplate,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="daily_plans",
    )
    notes = models.TextField(blank=True, default="")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="open")
    created_by_external_id = models.CharField(max_length=120, blank=True, default="")
    updated_by_external_id = models.CharField(max_length=120, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "date"], name="uniq_dailyplan_user_date")
        ]

    def __str__(self) -> str:
        return f"{self.user} - {self.date}"


class DailyTask(models.Model):
    STATUS_CHOICES = [
        ("todo", "Todo"),
        ("doing", "Doing"),
        ("done", "Done"),
        ("blocked", "Blocked"),
    ]

    plan = models.ForeignKey(DailyPlan, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=140)
    description = models.TextField(blank=True, default="")
    target_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    actual_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=40, blank=True, default="")
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="todo")
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.title


class Goal(models.Model):
    SCOPE_CHOICES = [
        ("user", "User"),
        ("team", "Team"),
    ]
    PERIOD_CHOICES = [
        ("daily", "Daily"),
        ("weekly", "Weekly"),
        ("monthly", "Monthly"),
        ("custom", "Custom"),
    ]

    scope = models.CharField(max_length=12, choices=SCOPE_CHOICES)
    user = models.ForeignKey(
        UserProfile,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="goals",
    )
    team = models.ForeignKey(
        Team,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="goals",
    )
    name = models.CharField(max_length=140)
    target_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    current_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=40, blank=True, default="")
    period = models.CharField(max_length=12, choices=PERIOD_CHOICES, default="monthly")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    created_by_external_id = models.CharField(max_length=120, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name

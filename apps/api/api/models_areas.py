from __future__ import annotations

from django.db import models

from .models_gestao import UserProfile


class Deal(models.Model):
    STAGE_CHOICES = [
        ("prospeccao", "Prospeccao"),
        ("qualificacao", "Qualificacao"),
        ("proposta", "Proposta"),
        ("negociacao", "Negociacao"),
        ("fechado", "Fechado"),
    ]
    STATUS_CHOICES = [
        ("andamento", "Em andamento"),
        ("ganho", "Ganho"),
        ("perdido", "Perdido"),
    ]

    name = models.CharField(max_length=160)
    company = models.CharField(max_length=160, blank=True, default="")
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stage = models.CharField(max_length=20, choices=STAGE_CHOICES, default="prospeccao")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="andamento")
    probability = models.PositiveSmallIntegerField(default=0)

    responsible = models.ForeignKey(
        UserProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deals",
    )
    responsible_name = models.CharField(max_length=120, blank=True, default="")
    created_by = models.ForeignKey(
        UserProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deals_created",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class DealGoal(models.Model):
    name = models.CharField(max_length=160)
    target_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    current_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=40, blank=True, default="")
    created_by = models.ForeignKey(
        UserProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deal_goals",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class Employee(models.Model):
    STATUS_CHOICES = [
        ("ativo", "Ativo"),
        ("ferias", "Ferias"),
        ("afastado", "Afastado"),
    ]

    name = models.CharField(max_length=160)
    role_title = models.CharField(max_length=120, blank=True, default="")
    area = models.CharField(max_length=120, blank=True, default="")
    manager = models.ForeignKey(
        UserProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="employees_managed",
    )
    manager_name = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ativo")
    start_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class Vacancy(models.Model):
    STATUS_CHOICES = [
        ("aberta", "Aberta"),
        ("triagem", "Triagem"),
        ("entrevista", "Entrevista"),
        ("final", "Final"),
        ("fechada", "Fechada"),
    ]

    title = models.CharField(max_length=160)
    area = models.CharField(max_length=120, blank=True, default="")
    candidates_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="aberta")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.title


class Appointment(models.Model):
    STATUS_CHOICES = [
        ("pendente", "Pendente"),
        ("confirmado", "Confirmado"),
        ("concluido", "Concluido"),
        ("cancelado", "Cancelado"),
    ]

    client = models.CharField(max_length=160)
    location = models.CharField(max_length=200, blank=True, default="")
    date = models.DateField()
    time = models.TimeField()
    responsible = models.ForeignKey(
        UserProfile,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="appointments",
    )
    responsible_name = models.CharField(max_length=120, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pendente")
    notes = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.client} - {self.date}"

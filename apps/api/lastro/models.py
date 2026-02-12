from __future__ import annotations

from django.db import models

class ScrapeJob(models.Model):
    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("done", "Done"),
        ("error", "Error"),
        ("canceled", "Canceled"),
    ]

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default="queued")
    payload = models.JSONField(default=dict)  # filtros ou URL
    error_message = models.TextField(blank=True, default="")

    # Onde foi salvo o resultado temporário (NÃO é o banco central)
    result_path = models.TextField(blank=True, default="")

    # cancelamento cooperativo
    cancel_requested = models.BooleanField(default=False)

    # metadados úteis
    total_rows = models.IntegerField(default=0)

    def __str__(self) -> str:
        return f"ScrapeJob #{self.pk} ({self.status})"


class JobLog(models.Model):
    job = models.ForeignKey(ScrapeJob, on_delete=models.CASCADE, related_name="logs")
    created_at = models.DateTimeField(auto_now_add=True)
    message = models.TextField()

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"JobLog #{self.pk} (job={self.job_id})"

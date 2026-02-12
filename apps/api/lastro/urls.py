from django.urls import path
from . import views

urlpatterns = [
    path("jobs/", views.create_job, name="lastro_create_job"),
    path("jobs/latest/", views.job_latest, name="lastro_job_latest"),
    path("jobs/<int:job_id>/", views.job_status, name="lastro_job_status"),
    path("jobs/<int:job_id>/logs/", views.job_logs, name="lastro_job_logs"),
    path("jobs/<int:job_id>/cancel/", views.job_cancel, name="lastro_job_cancel"),
    path("jobs/<int:job_id>/export.xlsx", views.job_export_xlsx, name="lastro_job_export_xlsx"),
]

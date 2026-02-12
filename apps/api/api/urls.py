from django.urls import path

from .reports_views import (
    RuleSetListCreateAPIView,
    RuleSetDetailAPIView,
    RuleSetRevisionsAPIView,
    ActivateRevisionAPIView,
    GenerateReportAPIView,
)

urlpatterns = [
    path("rulesets/", RuleSetListCreateAPIView.as_view()),
    path("rulesets/<int:pk>/", RuleSetDetailAPIView.as_view()),
    path("rulesets/<int:pk>/revisions/", RuleSetRevisionsAPIView.as_view()),
    path("rulesets/<int:pk>/activate/", ActivateRevisionAPIView.as_view()),
    path("reports/generate/", GenerateReportAPIView.as_view()),
]

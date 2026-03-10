from django.urls import path
from . import views

from .reports_views import (
    RuleSetListCreateAPIView,
    RuleSetDetailAPIView,
    RuleSetRevisionsAPIView,
    ActivateRevisionAPIView,
    GenerateReportAPIView,
)
from .gestao_views import (
    UserSyncAPIView,
    UserListAPIView,
    UserDetailAPIView,
    TeamListCreateAPIView,
    TeamDetailAPIView,
    TemplateListCreateAPIView,
    TemplateDetailAPIView,
    TemplateItemListCreateAPIView,
    TemplateItemDetailAPIView,
    TemplateApplyAPIView,
    DailyPlanListAPIView,
    DailyPlanDetailAPIView,
    DailyTaskDetailAPIView,
    GoalListCreateAPIView,
    GoalDetailAPIView,
    DashboardAPIView,
)
from .areas_views import (
    EmployeeListCreateAPIView,
    EmployeeDetailAPIView,
    VacancyListCreateAPIView,
    VacancyDetailAPIView,
    RhIndicatorsAPIView,
    RhReportXlsxAPIView,
    RhReportPdfAPIView,
)

urlpatterns = [
    path("rulesets/", RuleSetListCreateAPIView.as_view()),
    path("rulesets/<int:pk>/", RuleSetDetailAPIView.as_view()),
    path("rulesets/<int:pk>/revisions/", RuleSetRevisionsAPIView.as_view()),
    path("rulesets/<int:pk>/activate/", ActivateRevisionAPIView.as_view()),
    path("reports/generate/", GenerateReportAPIView.as_view()),

    path("gestao/users/sync/", UserSyncAPIView.as_view()),
    path("gestao/users/", UserListAPIView.as_view()),
    path("gestao/users/<int:pk>/", UserDetailAPIView.as_view()),

    path("gestao/teams/", TeamListCreateAPIView.as_view()),
    path("gestao/teams/<int:pk>/", TeamDetailAPIView.as_view()),

    path("gestao/templates/", TemplateListCreateAPIView.as_view()),
    path("gestao/templates/<int:pk>/", TemplateDetailAPIView.as_view()),
    path("gestao/templates/<int:pk>/items/", TemplateItemListCreateAPIView.as_view()),
    path("gestao/templates/items/<int:item_id>/", TemplateItemDetailAPIView.as_view()),
    path("gestao/templates/<int:pk>/apply/", TemplateApplyAPIView.as_view()),

    path("gestao/daily-plans/", DailyPlanListAPIView.as_view()),
    path("gestao/daily-plans/<int:pk>/", DailyPlanDetailAPIView.as_view()),
    path("gestao/daily-tasks/<int:pk>/", DailyTaskDetailAPIView.as_view()),

    path("gestao/goals/", GoalListCreateAPIView.as_view()),
    path("gestao/goals/<int:pk>/", GoalDetailAPIView.as_view()),

    path("gestao/dashboard/", DashboardAPIView.as_view()),

    path("rh/colaboradores/", EmployeeListCreateAPIView.as_view()),
    path("rh/colaboradores/<int:pk>/", EmployeeDetailAPIView.as_view()),
    path("rh/vagas/", VacancyListCreateAPIView.as_view()),
    path("rh/vagas/<int:pk>/", VacancyDetailAPIView.as_view()),
    path("rh/indicators/", RhIndicatorsAPIView.as_view()),
    path("rh/report.xlsx", RhReportXlsxAPIView.as_view()),
    path("rh/report.pdf", RhReportPdfAPIView.as_view()),

    path("health", views.health_check, name="health_check"),
    #path("scrape", views.run_scraper, name="run_scraper"),
    path("excel", views.get_excel, name="get_excel"),
    
]

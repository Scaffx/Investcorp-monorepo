from django.contrib import admin

from .models_gestao import Team, UserProfile, TaskTemplate, TaskTemplateItem, DailyPlan, DailyTask, Goal
from .models_areas import Deal, DealGoal, Employee, Vacancy, Appointment

# Register your models here.
admin.site.register(Team)
admin.site.register(UserProfile)
admin.site.register(TaskTemplate)
admin.site.register(TaskTemplateItem)
admin.site.register(DailyPlan)
admin.site.register(DailyTask)
admin.site.register(Goal)
admin.site.register(Deal)
admin.site.register(DealGoal)
admin.site.register(Employee)
admin.site.register(Vacancy)
admin.site.register(Appointment)

from __future__ import annotations

from datetime import date as date_cls
from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models_gestao import (
    Team,
    UserProfile,
    TaskTemplate,
    TaskTemplateItem,
    DailyPlan,
    DailyTask,
    Goal,
)
from .gestao_serializers import (
    TeamSerializer,
    UserProfileSerializer,
    TaskTemplateSerializer,
    TaskTemplateItemSerializer,
    DailyPlanSerializer,
    DailyTaskSerializer,
    GoalSerializer,
    DashboardSerializer,
)


ADMIN_ROLES = {"admin", "ceo"}


def _parse_date(value) -> date_cls | None:
    if isinstance(value, date_cls):
        return value
    if not value:
        return None
    return parse_date(str(value))


def _parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def get_actor(request) -> UserProfile | None:
    external_id = request.headers.get("X-Actor-Id") or request.META.get("HTTP_X_ACTOR_ID")
    if not external_id:
        return None
    return UserProfile.objects.filter(external_id=str(external_id)).first()


def is_admin(actor: UserProfile | None) -> bool:
    if not actor:
        return False
    return (actor.role or "").lower() in ADMIN_ROLES


def can_manage_team(actor: UserProfile | None, team: Team | None) -> bool:
    if not actor or not team:
        return False
    if is_admin(actor):
        return True
    if team.manager_id and team.manager_id == actor.id:
        return True
    return bool(actor.is_manager and actor.team_id == team.id)


def can_manage_user(actor: UserProfile | None, user: UserProfile | None) -> bool:
    if not actor or not user:
        return False
    if is_admin(actor):
        return True
    if actor.external_id == user.external_id:
        return True
    if user.team and user.team.manager_id == actor.id:
        return True
    return bool(actor.is_manager and actor.team_id and actor.team_id == user.team_id)


def _display_name_from_payload(payload: dict) -> str:
    for key in ("display_name", "displayName", "name"):
        raw = str(payload.get(key) or "").strip()
        if raw:
            return raw
    for key in ("company_email", "companyEmail", "personal_email", "personalEmail", "username"):
        raw = str(payload.get(key) or "").strip()
        if raw:
            if "@" in raw:
                raw = raw.split("@")[0]
            cleaned = raw.replace(".", " ").replace("_", " ").replace("-", " ").strip()
            parts = [p for p in cleaned.split(" ") if p]
            return " ".join([p[:1].upper() + p[1:] for p in parts]) or raw
    return ""


class UserSyncAPIView(APIView):
    def post(self, request):
        users = request.data.get("users") or []
        if not isinstance(users, list):
            return Response({"error": "users deve ser lista"}, status=status.HTTP_400_BAD_REQUEST)

        updated = []
        deduped = {}
        for payload in users:
            if not isinstance(payload, dict):
                continue
            external_id = str(
                payload.get("external_id")
                or payload.get("externalId")
                or payload.get("id")
                or payload.get("user_id")
                or ""
            ).strip()
            if not external_id:
                continue
            deduped[external_id] = payload

        for external_id, payload in deduped.items():
            defaults = {}
            display_name = _display_name_from_payload(payload)
            if display_name:
                defaults["display_name"] = display_name
            role = str(payload.get("role") or "").strip()
            if role:
                defaults["role"] = role
            company_email = str(payload.get("company_email") or payload.get("companyEmail") or "").strip()
            if company_email:
                defaults["company_email"] = company_email
            personal_email = str(payload.get("personal_email") or payload.get("personalEmail") or "").strip()
            if personal_email:
                defaults["personal_email"] = personal_email
            username = str(payload.get("username") or "").strip()
            if username:
                defaults["username"] = username
            if "is_manager" in payload or "isManager" in payload:
                raw_is_manager = payload.get("is_manager") if "is_manager" in payload else payload.get("isManager")
                defaults["is_manager"] = _parse_bool(raw_is_manager)

            team_id = payload.get("team_id") or payload.get("teamId")
            if team_id:
                team = Team.objects.filter(id=team_id).first()
                if team:
                    defaults["team"] = team

            try:
                profile, _ = UserProfile.objects.update_or_create(
                    external_id=external_id,
                    defaults=defaults,
                )
            except Exception:
                profile = UserProfile.objects.filter(external_id=external_id).first()
                if not profile:
                    profile = UserProfile.objects.create(external_id=external_id, **defaults)
                else:
                    for key, value in defaults.items():
                        setattr(profile, key, value)
                    profile.save()

            updated.append(profile)

        return Response(UserProfileSerializer(updated, many=True).data)


class UserListAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        qs = UserProfile.objects.all().order_by("display_name", "external_id")
        team_id = request.query_params.get("team_id")
        if team_id:
            qs = qs.filter(team_id=team_id)

        if not is_admin(actor):
            if actor.is_manager:
                managed_ids = list(Team.objects.filter(manager=actor).values_list("id", flat=True))
                if actor.team_id:
                    managed_ids.append(actor.team_id)
                if managed_ids:
                    qs = qs.filter(team_id__in=managed_ids)
                else:
                    qs = qs.filter(id=actor.id)
            else:
                qs = qs.filter(id=actor.id)

        return Response(UserProfileSerializer(qs, many=True).data)


class UserDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        user = get_object_or_404(UserProfile, pk=pk)
        if not can_manage_user(actor, user):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        display_name = str(data.get("display_name") or data.get("displayName") or "").strip()
        if display_name:
            user.display_name = display_name

        if is_admin(actor):
            if "is_manager" in data or "isManager" in data:
                user.is_manager = _parse_bool(data.get("is_manager") or data.get("isManager"))
            team_id = data.get("team") or data.get("team_id") or data.get("teamId")
            if team_id is not None:
                if team_id == "" or team_id is False:
                    user.team = None
                else:
                    team = Team.objects.filter(id=team_id).first()
                    if team:
                        user.team = team

        user.save()
        return Response(UserProfileSerializer(user).data)


class TeamListCreateAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        qs = Team.objects.filter(is_active=True).order_by("name")
        if not is_admin(actor):
            if actor.is_manager:
                managed_ids = list(Team.objects.filter(manager=actor).values_list("id", flat=True))
                if actor.team_id:
                    managed_ids.append(actor.team_id)
                if managed_ids:
                    qs = qs.filter(id__in=managed_ids)
                else:
                    qs = qs.none()
            elif actor.team_id:
                qs = qs.filter(id=actor.team_id)
            else:
                qs = qs.none()
        return Response(TeamSerializer(qs, many=True).data)

    def post(self, request):
        actor = get_actor(request)
        if not actor or not is_admin(actor):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        ser = TeamSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        team = Team.objects.create(**ser.validated_data)
        return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)


class TeamDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        team = get_object_or_404(Team, pk=pk)
        if not can_manage_team(actor, team):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        if "name" in data:
            team.name = str(data.get("name") or "").strip() or team.name
        if "description" in data:
            team.description = str(data.get("description") or "")
        if "is_active" in data:
            team.is_active = _parse_bool(data.get("is_active"))

        if "manager" in data and is_admin(actor):
            manager_id = data.get("manager")
            if manager_id:
                manager = UserProfile.objects.filter(id=manager_id).first()
                if manager:
                    team.manager = manager
            else:
                team.manager = None

        team.save()
        return Response(TeamSerializer(team).data)


class TemplateListCreateAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        qs = TaskTemplate.objects.select_related("team").prefetch_related("items").order_by("-updated_at")
        team_id = request.query_params.get("team_id")
        if team_id:
            qs = qs.filter(team_id=team_id)
        elif not is_admin(actor):
            if actor.is_manager:
                managed_ids = list(Team.objects.filter(manager=actor).values_list("id", flat=True))
                if actor.team_id:
                    managed_ids.append(actor.team_id)
                if managed_ids:
                    qs = qs.filter(team_id__in=managed_ids)
                else:
                    qs = qs.none()
            elif actor.team_id:
                qs = qs.filter(team_id=actor.team_id)
            else:
                qs = qs.none()

        return Response(TaskTemplateSerializer(qs, many=True).data)

    def post(self, request):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        ser = TaskTemplateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        team = ser.validated_data.get("team")
        if not can_manage_team(actor, team):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        template = TaskTemplate.objects.create(
            team=team,
            name=ser.validated_data.get("name"),
            is_active=ser.validated_data.get("is_active", True),
            created_by_external_id=actor.external_id,
        )
        return Response(TaskTemplateSerializer(template).data, status=status.HTTP_201_CREATED)


class TemplateDetailAPIView(APIView):
    def get(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        template = get_object_or_404(TaskTemplate, pk=pk)
        if not can_manage_team(actor, template.team) and not (actor.team_id == template.team_id):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)
        return Response(TaskTemplateSerializer(template).data)

    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        template = get_object_or_404(TaskTemplate, pk=pk)
        if not can_manage_team(actor, template.team):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        if "name" in data:
            template.name = str(data.get("name") or "").strip() or template.name
        if "is_active" in data:
            template.is_active = _parse_bool(data.get("is_active"))
        template.save()
        return Response(TaskTemplateSerializer(template).data)

    def delete(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        template = get_object_or_404(TaskTemplate, pk=pk)
        if not can_manage_team(actor, template.team):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TemplateItemListCreateAPIView(APIView):
    def get(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        template = get_object_or_404(TaskTemplate, pk=pk)
        if not can_manage_team(actor, template.team) and actor.team_id != template.team_id:
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        items = template.items.order_by("sort_order", "id")
        return Response(TaskTemplateItemSerializer(items, many=True).data)

    def post(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        template = get_object_or_404(TaskTemplate, pk=pk)
        if not can_manage_team(actor, template.team):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        serializer = TaskTemplateItemSerializer(data={**data, "template": template.id})
        serializer.is_valid(raise_exception=True)
        item = TaskTemplateItem.objects.create(**serializer.validated_data)
        return Response(TaskTemplateItemSerializer(item).data, status=status.HTTP_201_CREATED)


class TemplateItemDetailAPIView(APIView):
    def patch(self, request, item_id: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        item = get_object_or_404(TaskTemplateItem, pk=item_id)
        if not can_manage_team(actor, item.template.team):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        for field in ("title", "description", "unit"):
            if field in data:
                setattr(item, field, str(data.get(field) or ""))
        if "target_value" in data:
            try:
                item.target_value = Decimal(str(data.get("target_value") or 0))
            except Exception:
                pass
        if "sort_order" in data:
            try:
                item.sort_order = int(data.get("sort_order") or 0)
            except Exception:
                pass
        item.save()
        return Response(TaskTemplateItemSerializer(item).data)

    def delete(self, request, item_id: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        item = get_object_or_404(TaskTemplateItem, pk=item_id)
        if not can_manage_team(actor, item.template.team):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TemplateApplyAPIView(APIView):
    def post(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        template = get_object_or_404(TaskTemplate, pk=pk)
        if not can_manage_team(actor, template.team):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        apply_date = _parse_date(data.get("date")) or date_cls.today()
        overwrite = _parse_bool(data.get("overwrite"))
        team_id = data.get("team_id") or data.get("teamId")
        user_ids = data.get("user_ids") or data.get("userIds") or []

        targets = []
        if user_ids:
            targets = list(UserProfile.objects.filter(id__in=user_ids))
        elif team_id:
            targets = list(UserProfile.objects.filter(team_id=team_id))
        elif actor.team_id:
            targets = list(UserProfile.objects.filter(team_id=actor.team_id))

        if not targets:
            return Response({"error": "Nenhum usuario para aplicar"}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        updated_count = 0
        with transaction.atomic():
            for user in targets:
                if not can_manage_user(actor, user):
                    continue
                plan, created = DailyPlan.objects.get_or_create(
                    user=user,
                    date=apply_date,
                    defaults={
                        "template": template,
                        "created_by_external_id": actor.external_id,
                        "updated_by_external_id": actor.external_id,
                    },
                )
                if not created and not overwrite:
                    continue
                if not created and overwrite:
                    plan.template = template
                    plan.notes = ""
                    plan.status = "open"
                    plan.updated_by_external_id = actor.external_id
                    plan.save()
                    plan.tasks.all().delete()

                items = template.items.order_by("sort_order", "id")
                for item in items:
                    DailyTask.objects.create(
                        plan=plan,
                        title=item.title,
                        description=item.description,
                        target_value=item.target_value,
                        actual_value=0,
                        unit=item.unit,
                        status="todo",
                        sort_order=item.sort_order,
                    )
                if created:
                    created_count += 1
                else:
                    updated_count += 1

        return Response({"created": created_count, "updated": updated_count})


class DailyPlanListAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        user_id = request.query_params.get("user_id") or request.query_params.get("user")
        external_id = request.query_params.get("external_id")
        target_user = None
        if user_id:
            target_user = UserProfile.objects.filter(id=user_id).first()
        elif external_id:
            target_user = UserProfile.objects.filter(external_id=external_id).first()
        else:
            target_user = actor

        if not target_user or not can_manage_user(actor, target_user):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        target_date = _parse_date(request.query_params.get("date")) or date_cls.today()
        plan = (
            DailyPlan.objects.filter(user=target_user, date=target_date)
            .prefetch_related("tasks")
            .first()
        )
        if not plan:
            return Response({"plan": None})
        return Response({"plan": DailyPlanSerializer(plan).data})


class DailyPlanDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        plan = get_object_or_404(DailyPlan, pk=pk)
        if not can_manage_user(actor, plan.user):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        if "notes" in data:
            plan.notes = str(data.get("notes") or "")
        if "status" in data:
            plan.status = str(data.get("status") or plan.status)
        plan.updated_by_external_id = actor.external_id
        plan.save()
        return Response(DailyPlanSerializer(plan).data)


class DailyTaskDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        task = get_object_or_404(DailyTask, pk=pk)
        if not can_manage_user(actor, task.plan.user):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        if "status" in data:
            task.status = str(data.get("status") or task.status)
        if "actual_value" in data:
            try:
                task.actual_value = Decimal(str(data.get("actual_value") or 0))
            except Exception:
                pass
        task.save()
        return Response(DailyTaskSerializer(task).data)


class GoalListCreateAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        scope = request.query_params.get("scope") or "user"
        user_id = request.query_params.get("user_id")
        team_id = request.query_params.get("team_id")

        qs = Goal.objects.all().order_by("-updated_at")
        if scope:
            qs = qs.filter(scope=scope)
        if user_id:
            qs = qs.filter(user_id=user_id)
        if team_id:
            qs = qs.filter(team_id=team_id)

        if not is_admin(actor):
            if scope == "team":
                if actor.is_manager:
                    managed_ids = list(Team.objects.filter(manager=actor).values_list("id", flat=True))
                    if actor.team_id:
                        managed_ids.append(actor.team_id)
                    if managed_ids:
                        qs = qs.filter(team_id__in=managed_ids)
                    else:
                        qs = qs.none()
                elif actor.team_id:
                    qs = qs.filter(team_id=actor.team_id)
                else:
                    qs = qs.none()
            else:
                qs = qs.filter(user_id=actor.id)

        return Response(GoalSerializer(qs, many=True).data)

    def post(self, request):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        data = request.data or {}
        serializer = GoalSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        scope = serializer.validated_data.get("scope")
        user = serializer.validated_data.get("user")
        team = serializer.validated_data.get("team")

        if scope == "team":
            if not team:
                return Response({"error": "team obrigatorio"}, status=status.HTTP_400_BAD_REQUEST)
            if not can_manage_team(actor, team):
                return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)
        else:
            if not user:
                return Response({"error": "user obrigatorio"}, status=status.HTTP_400_BAD_REQUEST)
            if not can_manage_user(actor, user):
                return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        goal = Goal.objects.create(
            scope=scope,
            user=user,
            team=team,
            name=serializer.validated_data.get("name"),
            target_value=serializer.validated_data.get("target_value"),
            current_value=serializer.validated_data.get("current_value"),
            unit=serializer.validated_data.get("unit", ""),
            period=serializer.validated_data.get("period"),
            start_date=serializer.validated_data.get("start_date"),
            end_date=serializer.validated_data.get("end_date"),
            created_by_external_id=actor.external_id,
        )
        return Response(GoalSerializer(goal).data, status=status.HTTP_201_CREATED)


class GoalDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        goal = get_object_or_404(Goal, pk=pk)
        if goal.scope == "team":
            if not can_manage_team(actor, goal.team):
                return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)
        else:
            if not can_manage_user(actor, goal.user):
                return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        data = request.data or {}
        for field in ("name", "unit", "period"):
            if field in data:
                setattr(goal, field, str(data.get(field) or ""))
        if "target_value" in data:
            try:
                goal.target_value = Decimal(str(data.get("target_value") or 0))
            except Exception:
                pass
        if "current_value" in data:
            try:
                goal.current_value = Decimal(str(data.get("current_value") or 0))
            except Exception:
                pass
        if "start_date" in data:
            parsed = _parse_date(data.get("start_date"))
            if parsed:
                goal.start_date = parsed
        if "end_date" in data:
            parsed = _parse_date(data.get("end_date"))
            goal.end_date = parsed
        goal.save()
        return Response(GoalSerializer(goal).data)


class DashboardAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not actor:
            return Response({"error": "Actor nao informado"}, status=status.HTTP_401_UNAUTHORIZED)

        team_id = request.query_params.get("team_id") or actor.team_id
        if not team_id:
            return Response({"error": "team_id obrigatorio"}, status=status.HTTP_400_BAD_REQUEST)
        team = get_object_or_404(Team, pk=team_id)
        if is_admin(actor):
            pass
        elif actor.is_manager:
            if not can_manage_team(actor, team):
                return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)
        else:
            if not actor.team_id or str(actor.team_id) != str(team_id):
                return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        target_date = _parse_date(request.query_params.get("date")) or date_cls.today()
        if is_admin(actor) or actor.is_manager:
            members = UserProfile.objects.filter(team=team)
        else:
            members = UserProfile.objects.filter(id=actor.id)

        rows = []
        team_tasks_total = 0
        team_tasks_done = 0
        team_target_total = Decimal("0")
        team_actual_total = Decimal("0")

        for member in members:
            plan = (
                DailyPlan.objects.filter(user=member, date=target_date)
                .prefetch_related("tasks")
                .first()
            )
            tasks = list(plan.tasks.all()) if plan else []
            tasks_total = len(tasks)
            tasks_done = len([t for t in tasks if t.status == "done"])
            target_total = sum((t.target_value for t in tasks), Decimal("0"))
            actual_total = sum((t.actual_value for t in tasks), Decimal("0"))
            tasks_pct = (tasks_done / tasks_total * 100) if tasks_total else 0
            target_pct = (float(actual_total / target_total * 100) if target_total else 0)

            team_tasks_total += tasks_total
            team_tasks_done += tasks_done
            team_target_total += target_total
            team_actual_total += actual_total

            rows.append(
                {
                    "user_id": member.id,
                    "external_id": member.external_id,
                    "display_name": member.display_name,
                    "role": member.role,
                    "tasks_total": tasks_total,
                    "tasks_done": tasks_done,
                    "tasks_pct": round(tasks_pct, 1),
                    "target_total": float(target_total),
                    "actual_total": float(actual_total),
                    "target_pct": round(target_pct, 1),
                }
            )

        team_tasks_pct = (team_tasks_done / team_tasks_total * 100) if team_tasks_total else 0
        team_target_pct = (
            float(team_actual_total / team_target_total * 100) if team_target_total else 0
        )

        goals = Goal.objects.filter(scope="team", team=team).order_by("-updated_at")
        payload = {
            "team": {"id": team.id, "name": team.name},
            "date": target_date,
            "users": rows,
            "team_totals": {
                "tasks_total": team_tasks_total,
                "tasks_done": team_tasks_done,
                "tasks_pct": round(team_tasks_pct, 1),
                "target_total": float(team_target_total),
                "actual_total": float(team_actual_total),
                "target_pct": round(team_target_pct, 1),
            },
            "goals": GoalSerializer(goals, many=True).data,
        }

        serializer = DashboardSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.data)

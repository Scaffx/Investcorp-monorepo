from __future__ import annotations

from datetime import date as date_cls
from decimal import Decimal
from io import BytesIO

import pandas as pd

from django.http import FileResponse
from django.utils.dateparse import parse_date, parse_time
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .areas_serializers import (
    DealSerializer,
    DealGoalSerializer,
    EmployeeSerializer,
    VacancySerializer,
    AppointmentSerializer,
    IndicatorRowSerializer,
)
from .models_areas import Deal, DealGoal, Employee, Vacancy, Appointment
from .models_gestao import UserProfile
from .gestao_views import get_actor, is_admin

ROLE_NOVOS_NEGOCIOS = {"gestor_novos_negocios"}
ROLE_RH = {"gestor_financeiro_rh"}
ROLE_AGENDAMENTO = {"gestor_agendamento"}

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
except Exception:
    colors = None
    A4 = None
    getSampleStyleSheet = None
    SimpleDocTemplate = None
    Table = None
    TableStyle = None
    Paragraph = None
    Spacer = None


def _parse_date(value):
    if isinstance(value, date_cls):
        return value
    if not value:
        return None
    return parse_date(str(value))


def _parse_decimal(value) -> Decimal:
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def _can_access(actor: UserProfile | None, roles: set[str]) -> bool:
    if not actor:
        return False
    if is_admin(actor):
        return True
    return (actor.role or "") in roles


def _build_xlsx_response(filename: str, sheets: list[tuple[str, list[dict]]]):
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        for name, rows in sheets:
            df = pd.DataFrame(rows)
            df.to_excel(writer, index=False, sheet_name=name[:31] or "Sheet")
    output.seek(0)
    return FileResponse(
        output,
        as_attachment=True,
        filename=filename,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _build_pdf_response(filename: str, title: str, headers: list[str], rows: list[list[str]]):
    if SimpleDocTemplate is None:
        return Response(
            {"error": "PDF indisponivel: instale reportlab."},
            status=status.HTTP_501_NOT_IMPLEMENTED,
        )
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = [Paragraph(title, styles["Heading2"]), Spacer(1, 12)]
    data = [headers] + rows
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e5bb8")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
            ]
        )
    )
    elements.append(table)
    doc.build(elements)
    buffer.seek(0)
    return FileResponse(buffer, as_attachment=True, filename=filename, content_type="application/pdf")


class DealListCreateAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_NOVOS_NEGOCIOS):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        qs = Deal.objects.select_related("responsible", "created_by").order_by("-created_at")
        stage = request.query_params.get("stage")
        status_param = request.query_params.get("status")
        if stage:
            qs = qs.filter(stage=stage)
        if status_param:
            qs = qs.filter(status=status_param)
        return Response(DealSerializer(qs, many=True).data)

    def post(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_NOVOS_NEGOCIOS):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        ser = DealSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        responsible_id = ser.validated_data.get("responsible")
        responsible_name = ser.validated_data.get("responsible_name") or ""
        deal = Deal.objects.create(
            name=ser.validated_data.get("name"),
            company=ser.validated_data.get("company", ""),
            value=ser.validated_data.get("value") or 0,
            stage=ser.validated_data.get("stage"),
            status=ser.validated_data.get("status"),
            probability=ser.validated_data.get("probability") or 0,
            responsible=responsible_id,
            responsible_name=responsible_name,
            created_by=actor,
        )
        return Response(DealSerializer(deal).data, status=status.HTTP_201_CREATED)


class DealDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_NOVOS_NEGOCIOS):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        deal = get_object_or_404(Deal, pk=pk)
        data = request.data or {}
        for field in ("name", "company", "stage", "status", "responsible_name"):
            if field in data:
                setattr(deal, field, str(data.get(field) or ""))
        if "value" in data:
            deal.value = _parse_decimal(data.get("value"))
        if "probability" in data:
            try:
                deal.probability = int(data.get("probability") or 0)
            except Exception:
                pass
        if "responsible" in data:
            responsible = UserProfile.objects.filter(id=data.get("responsible")).first()
            deal.responsible = responsible
        deal.save()
        return Response(DealSerializer(deal).data)


class DealGoalListCreateAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_NOVOS_NEGOCIOS):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)
        qs = DealGoal.objects.order_by("-created_at")
        return Response(DealGoalSerializer(qs, many=True).data)

    def post(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_NOVOS_NEGOCIOS):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        ser = DealGoalSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        goal = DealGoal.objects.create(
            name=ser.validated_data.get("name"),
            target_value=ser.validated_data.get("target_value") or 0,
            current_value=ser.validated_data.get("current_value") or 0,
            unit=ser.validated_data.get("unit", ""),
            created_by=actor,
        )
        return Response(DealGoalSerializer(goal).data, status=status.HTTP_201_CREATED)


class DealGoalDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_NOVOS_NEGOCIOS):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        goal = get_object_or_404(DealGoal, pk=pk)
        data = request.data or {}
        for field in ("name", "unit"):
            if field in data:
                setattr(goal, field, str(data.get(field) or ""))
        if "target_value" in data:
            goal.target_value = _parse_decimal(data.get("target_value"))
        if "current_value" in data:
            goal.current_value = _parse_decimal(data.get("current_value"))
        goal.save()
        return Response(DealGoalSerializer(goal).data)


class DealIndicatorsAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_NOVOS_NEGOCIOS):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        deals = Deal.objects.select_related("responsible")
        data_map = {}
        for deal in deals:
            name = deal.responsible.display_name if deal.responsible else deal.responsible_name or "Sem responsavel"
            row = data_map.setdefault(
                name,
                {"total": 0, "pipeline": Decimal("0"), "weighted": Decimal("0"), "won": Decimal("0")},
            )
            row["total"] += 1
            row["pipeline"] += deal.value
            row["weighted"] += deal.value * Decimal(deal.probability or 0) / Decimal(100)
            if deal.status == "ganho":
                row["won"] += deal.value

        rows = [
            {
                "name": name,
                "total": values["total"],
                "extra": {
                    "pipeline": float(values["pipeline"]),
                    "weighted": float(values["weighted"]),
                    "won": float(values["won"]),
                },
            }
            for name, values in data_map.items()
        ]
        serializer = IndicatorRowSerializer(rows, many=True)
        return Response(serializer.data)


class DealReportXlsxAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_NOVOS_NEGOCIOS):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        deals = Deal.objects.all().order_by("-created_at")
        rows = [
            {
                "Negocio": d.name,
                "Empresa": d.company,
                "Valor": float(d.value),
                "Etapa": d.stage,
                "Status": d.status,
                "Probabilidade": d.probability,
                "Responsavel": d.responsible.display_name if d.responsible else d.responsible_name,
                "Criado em": d.created_at.isoformat(),
            }
            for d in deals
        ]
        goals = DealGoal.objects.all().order_by("-created_at")
        goals_rows = [
            {
                "Meta": g.name,
                "Alvo": float(g.target_value),
                "Atual": float(g.current_value),
                "Unidade": g.unit,
            }
            for g in goals
        ]
        return _build_xlsx_response("novos_negocios.xlsx", [("Deals", rows), ("Metas", goals_rows)])


class DealReportPdfAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_NOVOS_NEGOCIOS):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        deals = Deal.objects.all().order_by("-created_at")[:200]
        headers = ["Negocio", "Empresa", "Valor", "Etapa", "Status", "Responsavel"]
        rows = [
            [
                d.name,
                d.company,
                f"{float(d.value):.2f}",
                d.stage,
                d.status,
                d.responsible.display_name if d.responsible else d.responsible_name,
            ]
            for d in deals
        ]
        return _build_pdf_response("novos_negocios.pdf", "Relatorio - Novos Negocios", headers, rows)


class EmployeeListCreateAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_RH):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        qs = Employee.objects.select_related("manager").order_by("-created_at")
        return Response(EmployeeSerializer(qs, many=True).data)

    def post(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_RH):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        ser = EmployeeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        employee = Employee.objects.create(
            name=ser.validated_data.get("name"),
            role_title=ser.validated_data.get("role_title", ""),
            area=ser.validated_data.get("area", ""),
            manager=ser.validated_data.get("manager"),
            manager_name=ser.validated_data.get("manager_name", ""),
            status=ser.validated_data.get("status"),
            start_date=ser.validated_data.get("start_date"),
        )
        return Response(EmployeeSerializer(employee).data, status=status.HTTP_201_CREATED)


class EmployeeDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_RH):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        employee = get_object_or_404(Employee, pk=pk)
        data = request.data or {}
        for field in ("name", "role_title", "area", "manager_name", "status"):
            if field in data:
                setattr(employee, field, str(data.get(field) or ""))
        if "manager" in data:
            employee.manager = UserProfile.objects.filter(id=data.get("manager")).first()
        if "start_date" in data:
            employee.start_date = _parse_date(data.get("start_date"))
        employee.save()
        return Response(EmployeeSerializer(employee).data)


class VacancyListCreateAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_RH):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        qs = Vacancy.objects.order_by("-created_at")
        return Response(VacancySerializer(qs, many=True).data)

    def post(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_RH):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        ser = VacancySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        vacancy = Vacancy.objects.create(
            title=ser.validated_data.get("title"),
            area=ser.validated_data.get("area", ""),
            candidates_count=ser.validated_data.get("candidates_count") or 0,
            status=ser.validated_data.get("status"),
        )
        return Response(VacancySerializer(vacancy).data, status=status.HTTP_201_CREATED)


class VacancyDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_RH):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        vacancy = get_object_or_404(Vacancy, pk=pk)
        data = request.data or {}
        for field in ("title", "area", "status"):
            if field in data:
                setattr(vacancy, field, str(data.get(field) or ""))
        if "candidates_count" in data:
            try:
                vacancy.candidates_count = int(data.get("candidates_count") or 0)
            except Exception:
                pass
        vacancy.save()
        return Response(VacancySerializer(vacancy).data)


class RhIndicatorsAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_RH):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        employees = Employee.objects.select_related("manager")
        data_map = {}
        for emp in employees:
            name = emp.manager.display_name if emp.manager else emp.manager_name or "Sem gestor"
            row = data_map.setdefault(name, {"total": 0, "ativos": 0, "ferias": 0, "afastados": 0})
            row["total"] += 1
            if emp.status == "ativo":
                row["ativos"] += 1
            if emp.status == "ferias":
                row["ferias"] += 1
            if emp.status == "afastado":
                row["afastados"] += 1

        rows = [
            {
                "name": name,
                "total": values["total"],
                "extra": {
                    "ativos": values["ativos"],
                    "ferias": values["ferias"],
                    "afastados": values["afastados"],
                },
            }
            for name, values in data_map.items()
        ]
        serializer = IndicatorRowSerializer(rows, many=True)
        return Response(serializer.data)


class RhReportXlsxAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_RH):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        employees = Employee.objects.all().order_by("-created_at")
        rows = [
            {
                "Nome": e.name,
                "Cargo": e.role_title,
                "Area": e.area,
                "Gestor": e.manager.display_name if e.manager else e.manager_name,
                "Status": e.status,
                "Entrada": e.start_date.isoformat() if e.start_date else "",
            }
            for e in employees
        ]
        vacancies = Vacancy.objects.all().order_by("-created_at")
        vacancies_rows = [
            {
                "Vaga": v.title,
                "Area": v.area,
                "Candidatos": v.candidates_count,
                "Status": v.status,
            }
            for v in vacancies
        ]
        return _build_xlsx_response("rh.xlsx", [("Colaboradores", rows), ("Vagas", vacancies_rows)])


class RhReportPdfAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_RH):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        employees = Employee.objects.all().order_by("-created_at")[:200]
        headers = ["Nome", "Cargo", "Area", "Gestor", "Status"]
        rows = [
            [
                e.name,
                e.role_title,
                e.area,
                e.manager.display_name if e.manager else e.manager_name,
                e.status,
            ]
            for e in employees
        ]
        return _build_pdf_response("rh.pdf", "Relatorio - RH", headers, rows)


class AppointmentListCreateAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_AGENDAMENTO):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        qs = Appointment.objects.select_related("responsible").order_by("date", "time")
        return Response(AppointmentSerializer(qs, many=True).data)

    def post(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_AGENDAMENTO):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        ser = AppointmentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        appointment = Appointment.objects.create(
            client=ser.validated_data.get("client"),
            location=ser.validated_data.get("location", ""),
            date=ser.validated_data.get("date"),
            time=ser.validated_data.get("time"),
            responsible=ser.validated_data.get("responsible"),
            responsible_name=ser.validated_data.get("responsible_name", ""),
            status=ser.validated_data.get("status"),
            notes=ser.validated_data.get("notes", ""),
        )
        return Response(AppointmentSerializer(appointment).data, status=status.HTTP_201_CREATED)


class AppointmentDetailAPIView(APIView):
    def patch(self, request, pk: int):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_AGENDAMENTO):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        appointment = get_object_or_404(Appointment, pk=pk)
        data = request.data or {}
        for field in ("client", "location", "status", "responsible_name", "notes"):
            if field in data:
                setattr(appointment, field, str(data.get(field) or ""))
        if "date" in data:
            appointment.date = _parse_date(data.get("date"))
        if "time" in data:
            appointment.time = parse_time(str(data.get("time")))
        if "responsible" in data:
            appointment.responsible = UserProfile.objects.filter(id=data.get("responsible")).first()
        appointment.save()
        return Response(AppointmentSerializer(appointment).data)


class AgendamentoIndicatorsAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_AGENDAMENTO):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        visits = Appointment.objects.select_related("responsible")
        data_map = {}
        for visit in visits:
            name = visit.responsible.display_name if visit.responsible else visit.responsible_name or "Sem responsavel"
            row = data_map.setdefault(name, {"total": 0, "pendente": 0, "confirmado": 0, "concluido": 0})
            row["total"] += 1
            if visit.status == "pendente":
                row["pendente"] += 1
            if visit.status == "confirmado":
                row["confirmado"] += 1
            if visit.status == "concluido":
                row["concluido"] += 1

        rows = [
            {
                "name": name,
                "total": values["total"],
                "extra": {
                    "pendente": values["pendente"],
                    "confirmado": values["confirmado"],
                    "concluido": values["concluido"],
                },
            }
            for name, values in data_map.items()
        ]
        serializer = IndicatorRowSerializer(rows, many=True)
        return Response(serializer.data)


class AgendamentoReportXlsxAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_AGENDAMENTO):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        visits = Appointment.objects.all().order_by("date", "time")
        rows = [
            {
                "Cliente": v.client,
                "Local": v.location,
                "Data": v.date.isoformat(),
                "Hora": v.time.strftime("%H:%M"),
                "Responsavel": v.responsible.display_name if v.responsible else v.responsible_name,
                "Status": v.status,
            }
            for v in visits
        ]
        return _build_xlsx_response("agendamento.xlsx", [("Agendamentos", rows)])


class AgendamentoReportPdfAPIView(APIView):
    def get(self, request):
        actor = get_actor(request)
        if not _can_access(actor, ROLE_AGENDAMENTO):
            return Response({"error": "Sem permissao"}, status=status.HTTP_403_FORBIDDEN)

        visits = Appointment.objects.all().order_by("date", "time")[:200]
        headers = ["Cliente", "Local", "Data", "Hora", "Responsavel", "Status"]
        rows = [
            [
                v.client,
                v.location,
                v.date.isoformat(),
                v.time.strftime("%H:%M"),
                v.responsible.display_name if v.responsible else v.responsible_name,
                v.status,
            ]
            for v in visits
        ]
        return _build_pdf_response("agendamento.pdf", "Relatorio - Agendamento", headers, rows)

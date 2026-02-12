from pathlib import Path

from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

from .models_rules import RuleSet, RuleRevision
from .reports_serializers import RuleSetSerializer, RuleRevisionSerializer
from .services.rules_service import create_revision
from .services.report_runners import JobPaths, save_upload, write_rules, run_bradesco, run_tim, run_claro_merge


class RuleSetListCreateAPIView(APIView):
    def get(self, request):
        qs = RuleSet.objects.filter(is_active=True).order_by("-updated_at")
        report_type = request.query_params.get("report_type")
        if report_type:
            qs = qs.filter(report_type=report_type)
        return Response(RuleSetSerializer(qs, many=True).data)

    def post(self, request):
        ser = RuleSetSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        obj = RuleSet.objects.create(**ser.validated_data)
        return Response(RuleSetSerializer(obj).data, status=status.HTTP_201_CREATED)


class RuleSetDetailAPIView(APIView):
    def get(self, request, pk: int):
        obj = get_object_or_404(RuleSet, pk=pk)
        return Response(RuleSetSerializer(obj).data)


class RuleSetRevisionsAPIView(APIView):
    def get(self, request, pk: int):
        ruleset = get_object_or_404(RuleSet, pk=pk)
        qs = ruleset.revisions.all()[:50]
        return Response(RuleRevisionSerializer(qs, many=True).data)

    def post(self, request, pk: int):
        ruleset = get_object_or_404(RuleSet, pk=pk)
        raw_text = request.data.get("raw_text", "")
        try:
            rev = create_revision(ruleset, raw_text=raw_text, user=request.user)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {"ruleset": RuleSetSerializer(ruleset).data, "revision": RuleRevisionSerializer(rev).data},
            status=status.HTTP_201_CREATED,
        )


class ActivateRevisionAPIView(APIView):
    def post(self, request, pk: int):
        ruleset = get_object_or_404(RuleSet, pk=pk)
        rev_id = request.data.get("revision_id")
        rev = get_object_or_404(RuleRevision, pk=rev_id, rule_set=ruleset)

        ruleset.current_revision = rev
        ruleset.save(update_fields=["current_revision", "updated_at"])
        return Response(RuleSetSerializer(ruleset).data)


class GenerateReportAPIView(APIView):
    """
    multipart/form-data

    Campos:
      - type: bradesco | tim | claro_merge
      - relneg: arquivo xlsx (RelNegociacao)
      - ruleset_id: para bradesco/tim
      - ruleset_id_renovacao e ruleset_id_distrato: para claro_merge

      - modelo_tim: xlsx (somente tim)
      - ref_renov e ref_distr: xlsx (somente claro_merge)
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        report_type = request.data.get("type")
        if report_type not in {"bradesco", "tim", "claro_merge"}:
            return Response({"error": "type inválido"}, status=status.HTTP_400_BAD_REQUEST)

        # cria pasta do job dentro do MEDIA_ROOT
        job = JobPaths.create(Path(settings.MEDIA_ROOT))

        # arquivo base obrigatório
        if "relneg" not in request.FILES:
            return Response({"error": "Faltou o arquivo relneg"}, status=status.HTTP_400_BAD_REQUEST)
        save_upload(request.FILES["relneg"], job.modelos / "RelNegociacao.xlsx")

        # gera conforme tipo
        if report_type in {"bradesco", "tim"}:
            ruleset = get_object_or_404(RuleSet, pk=request.data.get("ruleset_id"), is_active=True)
            if not ruleset.current_revision:
                return Response({"error": "RuleSet sem revisão ativa"}, status=status.HTTP_400_BAD_REQUEST)

            if report_type == "bradesco":
                write_rules(job.regras / "Bradesco_regras.txt", ruleset.current_revision.normalized_text)
                out_path = run_bradesco(job)

            else:  # tim
                if "modelo_tim" not in request.FILES:
                    return Response({"error": "Faltou o arquivo modelo_tim"}, status=status.HTTP_400_BAD_REQUEST)
                save_upload(request.FILES["modelo_tim"], job.modelos / "TIM_Modelo.xlsx")

                write_rules(job.regras / "Tim_regras.txt", ruleset.current_revision.normalized_text)
                out_path = run_tim(job)

        else:
            # claro_merge usa 2 rulesets + 2 templates
            ruleset_renov = get_object_or_404(RuleSet, pk=request.data.get("ruleset_id_renovacao"), is_active=True)
            ruleset_distr = get_object_or_404(RuleSet, pk=request.data.get("ruleset_id_distrato"), is_active=True)

            if not ruleset_renov.current_revision or not ruleset_distr.current_revision:
                return Response({"error": "RuleSet de claro sem revisão ativa"}, status=status.HTTP_400_BAD_REQUEST)

            for k in ("ref_renov", "ref_distr"):
                if k not in request.FILES:
                    return Response({"error": f"Faltou o arquivo {k}"}, status=status.HTTP_400_BAD_REQUEST)

            save_upload(request.FILES["ref_renov"], job.modelos / "CLARO_RENOV-Report-Invest.xlsx")
            save_upload(request.FILES["ref_distr"], job.modelos / "CLARO_DISTRATO-Report-Invest.xlsx")

            write_rules(job.regras / "Claro_Renovacao_regras.txt", ruleset_renov.current_revision.normalized_text)
            write_rules(job.regras / "Claro_Distrato_regras.txt", ruleset_distr.current_revision.normalized_text)

            out_path = run_claro_merge(job)

        # devolve o arquivo
        return FileResponse(
            open(out_path, "rb"),
            as_attachment=True,
            filename=out_path.name,
        )

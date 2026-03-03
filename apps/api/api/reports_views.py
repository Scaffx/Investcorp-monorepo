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
from .services.rules_service import create_revision, normalize_rules_text
from .services.report_runners import (
    JobPaths,
    save_upload,
    write_rules,
    run_bradesco,
    run_tim,
    run_claro_merge,
    run_casas_bahia,
    run_diversos,
)


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
      - type: bradesco | tim | claro_merge | casas_bahia | diversos
      - relneg: arquivo xlsx (RelNegociacao)
      - ruleset_id: para bradesco/tim/casas_bahia (opcional se rules_raw for informado)
      - ruleset_id_renovacao e ruleset_id_distrato: para claro_merge (opcional se rules_raw_* for informado)
      - rules_raw: regras digitadas no site (bradesco/tim)
      - rules_raw_renovacao e rules_raw_distrato: regras digitadas no site (claro_merge)

      - modelo_tim: xlsx (somente tim)
      - ref_casas: xlsx (somente casas_bahia)
      - modelo_diversos: xlsx (somente diversos, opcional)
      - ref_renov e ref_distr: xlsx (somente claro_merge)
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        report_type = request.data.get("type")
        if report_type not in {"bradesco", "tim", "claro_merge", "casas_bahia", "diversos"}:
            return Response({"error": "type inválido"}, status=status.HTTP_400_BAD_REQUEST)

        # cria pasta do job dentro do MEDIA_ROOT
        job = JobPaths.create(Path(settings.MEDIA_ROOT))

        # arquivo base obrigatório
        if "relneg" not in request.FILES:
            return Response({"error": "Faltou o arquivo relneg"}, status=status.HTTP_400_BAD_REQUEST)
        save_upload(request.FILES["relneg"], job.modelos / "RelNegociacao.xlsx")

        def _normalize_or_400(raw_text: str, label: str):
            try:
                nums = normalize_rules_text(raw_text, max_items=10000, unique=True)
            except ValueError as exc:
                return None, Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            if not nums:
                return None, Response({"error": f"Nenhum número válido em {label}."}, status=status.HTTP_400_BAD_REQUEST)
            return "\n".join(nums) + "\n", None

        # gera conforme tipo
        if report_type in {"bradesco", "tim", "casas_bahia", "diversos"}:
            raw_rules = (request.data.get("rules_raw") or "").strip()
            if report_type == "diversos":
                if not raw_rules:
                    return Response({"error": "rules_raw é obrigatório para Diversos"}, status=status.HTTP_400_BAD_REQUEST)
                write_rules(job.regras / "Diversos_Regras.txt", raw_rules)
            elif raw_rules:
                normalized, err = _normalize_or_400(raw_rules, "rules_raw")
                if err:
                    return err
                if report_type == "bradesco":
                    write_rules(job.regras / "Bradesco_regras.txt", normalized)
                elif report_type == "tim":
                    write_rules(job.regras / "Tim_regras.txt", normalized)
                elif report_type == "casas_bahia":
                    write_rules(job.regras / "Casas_Bahia_regras.txt", normalized)
            else:
                ruleset_id = request.data.get("ruleset_id")
                if not ruleset_id:
                    return Response({"error": "ruleset_id ou rules_raw é obrigatório"}, status=status.HTTP_400_BAD_REQUEST)
                ruleset = get_object_or_404(RuleSet, pk=ruleset_id, is_active=True)
                if not ruleset.current_revision:
                    return Response({"error": "RuleSet sem revisão ativa"}, status=status.HTTP_400_BAD_REQUEST)

            if report_type == "bradesco":
                if not raw_rules:
                    write_rules(job.regras / "Bradesco_regras.txt", ruleset.current_revision.normalized_text)
                out_path = run_bradesco(job)

            elif report_type == "tim":
                if "modelo_tim" not in request.FILES:
                    return Response({"error": "Faltou o arquivo modelo_tim"}, status=status.HTTP_400_BAD_REQUEST)
                save_upload(request.FILES["modelo_tim"], job.modelos / "TIM_Modelo.xlsx")

                if not raw_rules:
                    write_rules(job.regras / "Tim_regras.txt", ruleset.current_revision.normalized_text)
                out_path = run_tim(job)

            elif report_type == "casas_bahia":
                if "ref_casas" not in request.FILES:
                    return Response({"error": "Faltou o arquivo ref_casas"}, status=status.HTTP_400_BAD_REQUEST)
                save_upload(request.FILES["ref_casas"], job.modelos / "CASAS_BAHIA_SPEC.xlsx")
                if not raw_rules:
                    write_rules(job.regras / "Casas_Bahia_regras.txt", ruleset.current_revision.normalized_text)
                out_path = run_casas_bahia(job)
            else:  # diversos
                if "modelo_diversos" in request.FILES:
                    save_upload(request.FILES["modelo_diversos"], job.modelos / "Report_RelReneg.xlsx")
                out_path = run_diversos(job)

        else:
            # claro_merge usa 2 rulesets + 2 templates
            raw_renov = (request.data.get("rules_raw_renovacao") or "").strip()
            raw_distr = (request.data.get("rules_raw_distrato") or "").strip()
            if raw_renov or raw_distr:
                if not raw_renov or not raw_distr:
                    return Response(
                        {"error": "rules_raw_renovacao e rules_raw_distrato são obrigatórios juntos"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                normalized_renov, err = _normalize_or_400(raw_renov, "rules_raw_renovacao")
                if err:
                    return err
                normalized_distr, err = _normalize_or_400(raw_distr, "rules_raw_distrato")
                if err:
                    return err
                write_rules(job.regras / "Claro_Renovacao_regras.txt", normalized_renov)
                write_rules(job.regras / "Claro_Distrato_regras.txt", normalized_distr)
            else:
                ruleset_id_renov = request.data.get("ruleset_id_renovacao")
                ruleset_id_distr = request.data.get("ruleset_id_distrato")
                if not ruleset_id_renov or not ruleset_id_distr:
                    return Response(
                        {"error": "ruleset_id_renovacao e ruleset_id_distrato são obrigatórios"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                ruleset_renov = get_object_or_404(RuleSet, pk=ruleset_id_renov, is_active=True)
                ruleset_distr = get_object_or_404(RuleSet, pk=ruleset_id_distr, is_active=True)

                if not ruleset_renov.current_revision or not ruleset_distr.current_revision:
                    return Response({"error": "RuleSet de claro sem revisão ativa"}, status=status.HTTP_400_BAD_REQUEST)

            for k in ("ref_renov", "ref_distr"):
                if k not in request.FILES:
                    return Response({"error": f"Faltou o arquivo {k}"}, status=status.HTTP_400_BAD_REQUEST)

            save_upload(request.FILES["ref_renov"], job.modelos / "CLARO_RENOV-Report-Invest.xlsx")
            save_upload(request.FILES["ref_distr"], job.modelos / "CLARO_DISTRATO-Report-Invest.xlsx")

            if not raw_renov and not raw_distr:
                write_rules(job.regras / "Claro_Renovacao_regras.txt", ruleset_renov.current_revision.normalized_text)
                write_rules(job.regras / "Claro_Distrato_regras.txt", ruleset_distr.current_revision.normalized_text)

            out_path = run_claro_merge(job)

        # devolve o arquivo
        return FileResponse(
            open(out_path, "rb"),
            as_attachment=True,
            filename=out_path.name,
        )

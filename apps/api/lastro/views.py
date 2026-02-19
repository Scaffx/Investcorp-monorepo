from __future__ import annotations

import json
import threading
import tempfile
import re
import unicodedata
from pathlib import Path

from django.http import JsonResponse, HttpResponseBadRequest, HttpResponse, Http404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings
import requests

from .models import ScrapeJob, JobLog
from .result_store import load_preview, load_df
from .scraper.xlsx_utils import salva_arquivo
from .tasks import run_job


_CITIES_BY_UF_CACHE = None


def _load_cities_by_uf_local() -> dict[str, list[str]]:
    global _CITIES_BY_UF_CACHE
    if _CITIES_BY_UF_CACHE is not None:
        return _CITIES_BY_UF_CACHE

    data_path = Path(__file__).resolve().parent / "data" / "cities_by_uf.json"
    if not data_path.exists():
        _CITIES_BY_UF_CACHE = {}
        return _CITIES_BY_UF_CACHE

    try:
        raw = json.loads(data_path.read_text(encoding="utf-8"))
    except Exception:
        _CITIES_BY_UF_CACHE = {}
        return _CITIES_BY_UF_CACHE

    parsed: dict[str, list[str]] = {}
    if isinstance(raw, dict):
        for uf, cities in raw.items():
            key = str(uf or "").strip().upper()
            if not key:
                continue
            if isinstance(cities, list):
                parsed[key] = sorted(
                    {str(city).strip() for city in cities if str(city).strip()},
                    key=lambda name: name.lower(),
                )
    _CITIES_BY_UF_CACHE = parsed
    return _CITIES_BY_UF_CACHE


def _normalize_uf_input(value: str) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return ""

    normalized = unicodedata.normalize("NFKD", raw)
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    letters = re.sub(r"[^A-Z]", "", ascii_only)
    by_name = {
        "ACRE": "AC",
        "ALAGOAS": "AL",
        "AMAPA": "AP",
        "AMAZONAS": "AM",
        "BAHIA": "BA",
        "CEARA": "CE",
        "DISTRITOFEDERAL": "DF",
        "ESPIRITOSANTO": "ES",
        "GOIAS": "GO",
        "MARANHAO": "MA",
        "MATOGROSSO": "MT",
        "MATOGROSSODOSUL": "MS",
        "MINASGERAIS": "MG",
        "PARA": "PA",
        "PARAIBA": "PB",
        "PARANA": "PR",
        "PERNAMBUCO": "PE",
        "PIAUI": "PI",
        "RIODEJANEIRO": "RJ",
        "RIOGRANDEDONORTE": "RN",
        "RIOGRANDEDOSUL": "RS",
        "RONDONIA": "RO",
        "RORAIMA": "RR",
        "SANTACATARINA": "SC",
        "SAOPAULO": "SP",
        "SERGIPE": "SE",
        "TOCANTINS": "TO",
    }

    if len(letters) == 2:
        return letters
    return by_name.get(letters, "")

def _json_body(request):
    try:
        body = request.body.decode("utf-8") if request.body else "{}"
        return json.loads(body)
    except Exception:
        return None


@csrf_exempt
@require_http_methods(["POST"])
def create_job(request):
    """
    Cria um job de scraping.
    NÃO salva no banco central. Apenas cria o job + logs + resultado temporário em disco.
    Payload esperado (exemplo):
    {
      "url": "https://www.vivareal.com.br/...",
      "headless": true,
      "retry_visible": true
    }
    ou filtros:
    {
      "operacao":"venda",
      "estado":"SP",
      "cidade":"São Paulo",
      "bairro":"Moema",
      "tipo_imovel":"Apartamento",
      ...
    }
    """
    payload = _json_body(request)
    if payload is None:
        return HttpResponseBadRequest("JSON inválido.")

    job = ScrapeJob.objects.create(status="queued", payload=payload)

    use_celery = bool(getattr(settings, "LASTRO_USE_CELERY", False))
    if use_celery:
        try:
            from .tasks import run_scrape_job  # type: ignore
            # se Celery não estiver configurado, isso vai falhar e cairemos no fallback
            run_scrape_job.delay(job.id)  # type: ignore
        except Exception:
            use_celery = False

    if not use_celery:
        # fallback: roda em thread (bom para DEV). Em produção use Celery.
        t = threading.Thread(target=run_job, args=(job.id,), daemon=True)
        t.start()

    return JsonResponse({"job_id": job.id, "status": job.status})


@require_http_methods(["GET"])
def job_latest(request):
    job = ScrapeJob.objects.order_by("-created_at").first()
    if not job:
        return JsonResponse({"job": None})

    preview_limit = int(request.GET.get("preview", "20") or 20)
    preview = []
    if job.status == "done" and job.result_path:
        preview = load_preview(job.result_path, limit=preview_limit)

    return JsonResponse({
        "job_id": job.id,
        "status": job.status,
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "total_rows": job.total_rows,
        "error_message": job.error_message,
        "preview": preview,
        "payload": job.payload or {},
    })


@require_http_methods(["GET"])
def job_status(request, job_id: int):
    try:
        job = ScrapeJob.objects.get(id=job_id)
    except ScrapeJob.DoesNotExist:
        raise Http404("Job não encontrado.")

    preview_limit = int(request.GET.get("preview", "50") or 50)
    preview = []
    if job.status == "done" and job.result_path:
        preview = load_preview(job.result_path, limit=preview_limit)

    return JsonResponse({
        "job_id": job.id,
        "status": job.status,
        "created_at": job.created_at.isoformat(),
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "total_rows": job.total_rows,
        "error_message": job.error_message,
        "preview": preview,
        "payload": job.payload or {},
    })


@require_http_methods(["GET"])
def job_logs(request, job_id: int):
    try:
        job = ScrapeJob.objects.get(id=job_id)
    except ScrapeJob.DoesNotExist:
        raise Http404("Job não encontrado.")

    logs = list(job.logs.values("created_at", "message"))
    return JsonResponse({"job_id": job.id, "logs": logs})


@csrf_exempt
@require_http_methods(["POST"])
def job_cancel(request, job_id: int):
    try:
        job = ScrapeJob.objects.get(id=job_id)
    except ScrapeJob.DoesNotExist:
        raise Http404("Job não encontrado.")

    job.cancel_requested = True
    job.save(update_fields=["cancel_requested"])
    JobLog.objects.create(job=job, message="[STATUS] Cancelamento solicitado pelo usuário.")
    return JsonResponse({"job_id": job.id, "status": job.status, "cancel_requested": True})


@require_http_methods(["GET"])
def job_export_xlsx(request, job_id: int):
    """
    Gera o XLSX SOMENTE quando o usuário pedir (download).
    """
    try:
        job = ScrapeJob.objects.get(id=job_id)
    except ScrapeJob.DoesNotExist:
        raise Http404("Job não encontrado.")

    if job.status != "done" or not job.result_path:
        return HttpResponseBadRequest("Job ainda não finalizou ou não possui resultado.")

    df = load_df(job.result_path)

    filename = f"imoveis_job_{job.id}.xlsx"
    with tempfile.TemporaryDirectory() as tmpdir:
        out_path = Path(tmpdir) / filename
        salva_arquivo(df, out_path, log_cb=None, embutir_imagens=True)
        data = out_path.read_bytes()

    response = HttpResponse(
        data,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@require_http_methods(["GET"])
def cidades_por_uf(request):
    """
    Lista cidades para uma UF (ex.: SP -> cidades de Sao Paulo).
    """
    uf = _normalize_uf_input(request.GET.get("uf") or "")
    if not uf or not re.fullmatch(r"[A-Z]{2}", uf):
        return JsonResponse({"items": []})

    local_map = _load_cities_by_uf_local()
    local_cities = local_map.get(uf, [])
    if local_cities:
        return JsonResponse({"items": [{"value": name, "label": name} for name in local_cities]})

    try:
        resp = requests.get(
            f"https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios",
            timeout=10,
        )
        if not resp.ok:
            return JsonResponse({"items": []})
        payload = resp.json()
    except Exception:
        return JsonResponse({"items": []})

    items = []
    for city in payload if isinstance(payload, list) else []:
        name = str(city.get("nome") or "").strip()
        if name:
            items.append({"value": name, "label": name})

    items.sort(key=lambda row: row["label"].lower())
    return JsonResponse({"items": items})

from __future__ import annotations

import json
import threading
import tempfile
from pathlib import Path

from django.http import JsonResponse, HttpResponseBadRequest, HttpResponse, Http404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings

from .models import ScrapeJob, JobLog
from .result_store import load_preview, load_df
from .scraper.xlsx_utils import salva_arquivo
from .tasks import run_job

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
        salva_arquivo(df, out_path, log_cb=None)
        data = out_path.read_bytes()

    response = HttpResponse(
        data,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response

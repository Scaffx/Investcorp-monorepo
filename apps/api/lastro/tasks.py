from __future__ import annotations

from django.utils import timezone
from django.conf import settings
from urllib.parse import urlparse, parse_qs

from .models import ScrapeJob, JobLog
from .result_store import save_df
from .scraper.vivareal import run_scrape, build_url_from_filters

def _has_value(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True

def _pick_first(payload: dict, keys: list[str], default: str = ""):
    for key in keys:
        if key not in payload:
            continue
        value = payload.get(key)
        if not _has_value(value):
            continue
        return value
    return default

def _normalize_filters(payload: dict) -> dict:
    return {
        "operacao": _pick_first(payload, ["operacao", "operation"]),
        "estado": _pick_first(payload, ["estado", "uf", "state"]),
        "cidade": _pick_first(payload, ["cidade", "city"]),
        "regiao": _pick_first(payload, ["regiao", "zona", "region"]),
        "bairro": _pick_first(payload, ["bairro", "neighborhood"]),
        "tipo_imovel": _pick_first(payload, ["tipo_imovel", "tipoImovel", "tipo", "property_type"]),
        "quartos": _pick_first(payload, ["quartos", "bedrooms"]),
        "banheiros": _pick_first(payload, ["banheiros", "bathrooms"]),
        "area_min": _pick_first(payload, ["area_min", "areaMin", "areaMinima"]),
        "area_max": _pick_first(payload, ["area_max", "areaMax", "areaMaxima"]),
        "logradouro": _pick_first(payload, ["logradouro", "rua", "street"]),
    }

def _extract_filters_from_url(url: str) -> dict | None:
    if not url:
        return None
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    if "vivareal.com.br" not in parsed.netloc:
        return None
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) != 4:
        return None
    operacao, estado, cidade, tipo = parts
    qs = parse_qs(parsed.query)

    def qv(*names: str) -> str:
        for name in names:
            values = qs.get(name)
            if values:
                return values[0]
        return ""

    return {
        "operacao": operacao,
        "estado": estado,
        "cidade": cidade,
        "tipo_imovel": tipo,
        "regiao": qv("regiao"),
        "quartos": qv("quartos"),
        "banheiros": qv("banheiros"),
        "area_min": qv("area_min", "areaMin", "areaMinima"),
        "area_max": qv("area_max", "areaMax", "areaMaxima"),
        "logradouro": qv("logradouro"),
        "bairro": "",
    }

def run_job(job_id: int) -> None:
    """Executa o job e salva o resultado temporário em disco (JSON.gz)."""
    job = ScrapeJob.objects.get(id=job_id)
    job.status = "running"
    job.started_at = timezone.now()
    job.error_message = ""
    job.save(update_fields=["status", "started_at", "error_message"])

    def log_cb(msg: str):
        JobLog.objects.create(job=job, message=msg)

    def cancel_cb() -> bool:
        job.refresh_from_db(fields=["cancel_requested"])
        return bool(job.cancel_requested)

    try:
        payload = job.payload or {}

        url = payload.get("url") or ""
        filters = _normalize_filters(payload)
        use_explicit_url = _has_value(url)

        core_keys = ["estado", "cidade", "operacao", "tipo_imovel", "regiao", "bairro", "logradouro"]
        extra_keys = ["quartos", "banheiros", "area_min", "area_max"]
        has_core_filters = any(_has_value(filters.get(k)) for k in core_keys)
        has_any_filters = has_core_filters or any(_has_value(filters.get(k)) for k in extra_keys)

        use_filters = (not use_explicit_url) and (has_core_filters or (not url and has_any_filters))

        inferred_filters = None
        if use_filters:
            url = build_url_from_filters(
                filters.get("operacao", "venda"),
                filters.get("estado", ""),
                filters.get("cidade", ""),
                filters.get("regiao", ""),
                filters.get("bairro", ""),
                filters.get("tipo_imovel", "Apartamento"),
                filters.get("quartos", ""),
                filters.get("banheiros", ""),
                filters.get("area_min", ""),
                filters.get("area_max", ""),
                filters.get("logradouro", ""),
            )
        elif url:
            inferred_filters = _extract_filters_from_url(url)
            if inferred_filters and not use_explicit_url:
                try:
                    url = build_url_from_filters(
                        inferred_filters.get("operacao", "venda"),
                        inferred_filters.get("estado", ""),
                        inferred_filters.get("cidade", ""),
                        inferred_filters.get("regiao", ""),
                        inferred_filters.get("bairro", ""),
                        inferred_filters.get("tipo_imovel", "Apartamento"),
                        inferred_filters.get("quartos", ""),
                        inferred_filters.get("banheiros", ""),
                        inferred_filters.get("area_min", ""),
                        inferred_filters.get("area_max", ""),
                        inferred_filters.get("logradouro", ""),
                    )
                except Exception:
                    inferred_filters = None
        else:
            raise ValueError("Informe uma URL ou preencha os filtros de busca.")

        filters_source = filters if use_filters else (inferred_filters or {})
        property_label = filters.get("tipo_imovel", "")
        if not _has_value(property_label):
            property_label = (filters_source or {}).get("tipo_imovel", "")

        df = run_scrape(
            url,
            headless=bool(payload.get("headless", True)),
            retry_visible=bool(payload.get("retry_visible", True)),
            property_label=property_label,
            selected_uf=filters_source.get("estado", ""),
            log_cb=log_cb,
            cancel_cb=cancel_cb,
        )

        if cancel_cb():
            job.status = "canceled"
            job.finished_at = timezone.now()
            job.save(update_fields=["status", "finished_at"])
            return

        # Salva resultado temporário em disco (não salva amostras no banco central)
        path = save_df(job.id, df)
        job.result_path = str(path)
        job.total_rows = int(len(df)) if df is not None else 0
        job.status = "done"
        job.finished_at = timezone.now()
        job.save(update_fields=["result_path", "total_rows", "status", "finished_at"])

    except Exception as e:
        job.status = "error"
        job.error_message = str(e)
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error_message", "finished_at"])
        # re-raise para o Celery registrar traceback
        raise


# Celery (opcional)
try:
    from celery import shared_task  # type: ignore
except Exception:  # pragma: no cover
    shared_task = None  # type: ignore

if shared_task:
    @shared_task(bind=True, name="lastro.run_scrape_job")
    def run_scrape_job(self, job_id: int):
        run_job(job_id)

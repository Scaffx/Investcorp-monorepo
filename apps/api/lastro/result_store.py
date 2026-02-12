from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Iterable, Any

import pandas as pd
from django.conf import settings

def results_dir() -> Path:
    # Guarda resultados temporários em disco (não “banco central”)
    base = Path(getattr(settings, "LASTRO_RESULTS_DIR", Path(settings.MEDIA_ROOT) / "lastro_results"))
    base.mkdir(parents=True, exist_ok=True)
    return base

def job_result_path(job_id: int) -> Path:
    return results_dir() / f"job_{job_id}.json.gz"

def save_df(job_id: int, df: pd.DataFrame) -> Path:
    path = job_result_path(job_id)
    # Salva em JSON gzip (portável e sem depender de serviços externos)
    records = df.to_dict(orient="records")
    payload = {"job_id": job_id, "rows": records, "columns": list(df.columns)}
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    return path

def load_df(path: str | Path) -> pd.DataFrame:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Arquivo de resultado não encontrado: {p}")
    with gzip.open(p, "rt", encoding="utf-8") as f:
        payload = json.load(f)
    rows = payload.get("rows", [])
    return pd.DataFrame(rows)

def load_preview(path: str | Path, limit: int = 50) -> list[dict[str, Any]]:
    p = Path(path)
    if not p.exists():
        return []
    with gzip.open(p, "rt", encoding="utf-8") as f:
        payload = json.load(f)
    rows = payload.get("rows", [])
    return rows[: max(0, int(limit))]

#!/usr/bin/env python3

from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Union, Sequence, Iterable
import re

import pandas as pd
import sys
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Side

try:
    from .utils import show_generation_popup
except ImportError:  # Executado diretamente
    sys.path.append(str(Path(__file__).resolve().parent))
    from utils import show_generation_popup  # type: ignore[import-not-found]

PathLike = Union[str, Path]

DESKTOP = Path.home() / "Desktop"
REPORT_DIR = DESKTOP / "Report"
MODELOS_DIR = REPORT_DIR / "Modelos"
REGRAS_DIR = REPORT_DIR / "REGRAS"

RELNEG_DEFAULT = MODELOS_DIR / "RelNegociacao.xlsx"
MODEL_DEFAULT = MODELOS_DIR / "TIM_Modelo.xlsx"
MODEL_GLOB_PATTERN = "TIM*.xlsx"
RULES_DEFAULT = REGRAS_DIR / "Tim_regras.txt"

OUTPUT_SHEET_NAME = "TIM"
OUTPUT_PREFIX = "TIM"
DATE_FOLDER_FORMAT = "%d-%m-%Y"
DATE_FILE_FORMAT = "%d%m%Y"

DEFAULT_STATUS_COL = "DQ"
DEFAULT_X_COL = "X"
DEFAULT_EB_COL = "EB"
ALWAYS_INCLUDE_CONTRACTS = {
    "3002893",
    "3005931",
    "3006864",
}

HISTORY_HEADER_CANDIDATES = (
    "ULTIMO HISTORICO",
    "ÚLTIMO HISTORICO",
    "ULTIMO HISTÓRICO",
    "ULTIMO HIST",
    "ULTIMO HISTORICO ",
    "EC",
    "EC (ULTIMO HISTORICO)",
    "EC ULTIMO HISTORICO",
)

NSEQ_HEADER_CANDIDATES = (
    "NSEQ",
    "NSEQ SIIM",
    "NSEQ_SIIM",
    "NSEQ SIIM - TIM",
    "NSEQ ESCOLHIDO",
)
ONDA_HEADER_CANDIDATES = (
    "ONDA",
)

CONTRACT_HEADER_CANDIDATES = (
    "CONTRATO",
    "CONTRATO SAP",
    "ORDEM SAP",
    "ORDEM_SAP",
    "ORDEM SAP (OC)",
)
MODEL_SHEET_FALLBACKS: Sequence[str] = (
    "INVESTCORP",
    "BASE",
    "Planilha1",
    "Dados",
    "TIM",
)


def _find_header_row(ws) -> int:
    """Return 1-based row index containing the 'CONTRATO' header."""
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row):
        for cell in row:
            if cell.value and str(cell.value).strip().upper() == "CONTRATO":
                return cell.row
    return 1


# ---------------------------------------------------------------------------
# Helpers - paths and date tokens
# ---------------------------------------------------------------------------
def _to_path(value: Optional[PathLike]) -> Optional[Path]:
    if value is None:
        return None
    return Path(value).expanduser()


def resolve_model_path(path: Optional[PathLike]) -> Path:
    candidate = _to_path(path)
    if candidate is not None:
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"Modelo TIM nao encontrado: {candidate}")

    if MODEL_DEFAULT.exists():
        return MODEL_DEFAULT

    matches = sorted(MODELOS_DIR.glob(MODEL_GLOB_PATTERN))
    for match in matches:
        if match.name.lower() != "relnegociacao.xlsx":
            return match

    raise FileNotFoundError(
        f"Nenhum modelo TIM encontrado. Coloque um arquivo contendo 'TIM' em {MODELOS_DIR}."
    )


def resolve_relneg_path(path: Optional[PathLike]) -> Path:
    candidate = _to_path(path)
    if candidate is not None:
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"RelNegociacao nao encontrado: {candidate}")

    if RELNEG_DEFAULT.exists():
        return RELNEG_DEFAULT

    raise FileNotFoundError(
        f"RelNegociacao.xlsx nao encontrado em {MODELOS_DIR}. Coloque o arquivo exportado do SIIM nessa pasta."
    )


def resolve_rules_path(path: Optional[PathLike]) -> Path:
    candidate = _to_path(path)
    if candidate is not None:
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"Arquivo de regras nao encontrado: {candidate}")

    if RULES_DEFAULT.exists():
        return RULES_DEFAULT

    raise FileNotFoundError(
        f"Tim_regras.txt nao encontrado em {REGRAS_DIR}. Crie o arquivo com a lista de NSEQ."
    )


def compute_default_output_path(base_dir: Path = REPORT_DIR) -> tuple[Path, Path]:
    yesterday = datetime.now() - timedelta(days=1)
    folder_name = yesterday.strftime(DATE_FOLDER_FORMAT)
    file_token = yesterday.strftime(DATE_FILE_FORMAT)
    out_dir = base_dir / folder_name
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{OUTPUT_PREFIX}_{file_token}.xlsx"
    return out_path, out_dir


def resolve_output_path(
    output_path: Optional[PathLike],
    output_dir: Optional[PathLike],
) -> tuple[Path, Path]:
    if output_path and output_dir:
        raise ValueError("Use apenas --out ou --output-dir, nao ambos.")

    candidate = _to_path(output_path)
    if candidate is not None:
        candidate.parent.mkdir(parents=True, exist_ok=True)
        return candidate, candidate.parent

    dir_candidate = _to_path(output_dir)
    if dir_candidate is not None:
        dir_candidate.mkdir(parents=True, exist_ok=True)
        yesterday = datetime.now() - timedelta(days=1)
        token = yesterday.strftime(DATE_FILE_FORMAT)
        out_path = dir_candidate / f"{OUTPUT_PREFIX}_{token}.xlsx"
        return out_path, dir_candidate

    return compute_default_output_path()


# ---------------------------------------------------------------------------
# Helpers - spreadsheet handling
# ---------------------------------------------------------------------------
def _normalize_key_series(s: pd.Series) -> pd.Series:
    """
    Normalize keys for matching:
    - If a cell looks like a date (datetime or Excel serial or parsable string), convert to YYYY-MM-DD.
    - Else, cast to string and strip.
    """

    def to_norm(value):
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return ""
        if isinstance(value, (pd.Timestamp, datetime)):
            return pd.Timestamp(value).date().isoformat()
        if isinstance(value, (int, float)) and not pd.isna(value):
            try:
                ts = pd.to_datetime(value, unit="D", origin="1899-12-30", errors="raise")
                return ts.date().isoformat()
            except Exception:
                return str(value).strip()
        try:
            return pd.to_datetime(str(value), errors="raise", dayfirst=True).date().isoformat()
        except Exception:
            return str(value).strip()

    return s.apply(to_norm)


def excel_col_to_idx(col_letter: str) -> int:
    """Convert Excel column letters (e.g., 'A', 'DQ', 'EB') to 1-based index."""
    col_letter = col_letter.strip().upper()
    result = 0
    for ch in col_letter:
        if not ("A" <= ch <= "Z"):
            raise ValueError(f"Invalid column letter: {col_letter}")
        result = result * 26 + (ord(ch) - ord("A") + 1)
    return result


def ensure_width(df: pd.DataFrame, min_cols: int) -> pd.DataFrame:
    """Ensure the DataFrame has at least `min_cols` columns by appending blank columns if needed."""
    need = max(0, min_cols - df.shape[1])
    if need > 0:
        for _ in range(need):
            df[df.shape[1]] = pd.NA
    return df


def tail_after_last_hyphen(value: str) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value)
    parts = text.split(" - ") if " - " in text else text.split("-")
    return parts[-1].strip() if parts else text.strip()


def _normalize_nseq_value(value: object) -> str:
    """Normalize NSEQ values for string comparison."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    text = str(value).strip()
    if not text:
        return ""
    if text.endswith(".0"):
        text = text[:-2]
    return text


def _find_column_index_by_label(
    df: pd.DataFrame,
    candidates: Sequence[str],
    *,
    max_rows: int = 50,
) -> Optional[int]:
    """Locate column index whose label matches candidates within the first rows."""
    if df.empty:
        return None
    target_labels = {candidate.strip().upper() for candidate in candidates}
    rows_to_scan = df.head(max_rows)
    for _, row in rows_to_scan.iterrows():
        for idx, raw in enumerate(row):
            value = str(raw).strip().upper()
            if value in target_labels:
                return idx
    return None


def _load_nseq_rules(path: Path) -> set[str]:
    """Load allowed NSEQ values from Tim_regras.txt."""
    if not path.exists():
        raise FileNotFoundError(
            f"Arquivo de regras nao encontrado: {path}. Crie Tim_regras.txt com os NSEQ desejados."
        )

    allowed: set[str] = set()
    content = path.read_text(encoding="utf-8", errors="ignore")
    for raw_line in content.splitlines():
        line = raw_line.replace("\t", " ").strip()
        if not line or line.startswith("#"):
            continue
        if ":" in line:
            _, _, tail = line.partition(":")
            line = tail.strip()
            if not line:
                continue
        tokens = [token for token in re.split(r"[;,\\s]+", line) if token]
        for token in tokens:
            normalized = _normalize_nseq_value(token)
            if normalized:
                allowed.add(normalized)
    return allowed




def _normalize_label(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).replace("\n", " ").strip()


def _build_counts(series: pd.Series, empty_label: Optional[str] = None) -> dict[str, int]:
    from collections import Counter

    normalized: list[str] = []
    for value in series:
        label = _normalize_label(value)
        if not label:
            if empty_label is None:
                continue
            label = empty_label
        normalized.append(label.upper())
    counts = Counter(normalized)
    return {key: int(val) for key, val in counts.items()}


def _apply_counts_to_table(ws, header_row: int, counts: dict[str, int], total: int) -> None:
    row = header_row + 1
    while True:
        label = ws.cell(row=row, column=1).value
        normalized = _normalize_label(label)
        if not normalized:
            break
        key = normalized.upper()
        if key.startswith("TOTAL GERAL"):
            ws.cell(row=row, column=2, value=total)
            break
        ws.cell(row=row, column=2, value=int(counts.get(key, 0)))
        row += 1


def _normalize_onda_value(value: object) -> int:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0
    try:
        return int(float(str(value).strip()))
    except Exception:
        return 0

def _resolve_sheet_name(
    sheet: Optional[Union[str, int]],
    *,
    workbook_path: Optional[PathLike] = None,
    fallback_names: Sequence[str] = (),
) -> Union[str, int]:
    """Force first worksheet when sheet_name is missing, checking fallbacks if available."""
    if sheet is None:
        desired: Optional[Union[str, int]] = None
    elif isinstance(sheet, str):
        desired = sheet.strip()
    else:
        desired = sheet

    if desired not in (None, ""):
        return desired

    if workbook_path is not None and fallback_names:
        try:
            xls = pd.ExcelFile(workbook_path)
        except Exception:
            pass
        else:
            for candidate in fallback_names:
                if candidate in xls.sheet_names:
                    return candidate

    return 0




def _normalize_onda_value(value: object) -> int:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0
    try:
        return int(float(str(value).strip()))
    except Exception:
        return 0
def _build_tim_dataframe(
    modelo_path: Path,
    modelo_sheet: Optional[str],
    relneg_path: Path,
    relneg_sheet: Optional[str],
    status_col_letter: str,
    x_col_letter: str,
    eb_col_letter: str,
    allowed_nseqs: Optional[Iterable[str]] = None,
    nseq_col_letter: Optional[str] = None,
) -> pd.DataFrame:
    allowed_nseqs_norm: set[str] = set()
    if allowed_nseqs:
        for item in allowed_nseqs:
            normalized = _normalize_nseq_value(item)
            if normalized:
                allowed_nseqs_norm.add(normalized)

    modelo_sheet_name = _resolve_sheet_name(
        modelo_sheet,
        workbook_path=modelo_path,
        fallback_names=MODEL_SHEET_FALLBACKS,
    )
    relneg_sheet_name = _resolve_sheet_name(relneg_sheet)

    modelo = pd.read_excel(modelo_path, sheet_name=modelo_sheet_name, header=None, dtype=object)
    needed_cols_modelo = max(
        excel_col_to_idx("U"),
        excel_col_to_idx("W"),
        excel_col_to_idx(x_col_letter),
    )
    modelo = ensure_width(modelo, needed_cols_modelo)

    a_to_u = modelo.iloc[:, : excel_col_to_idx("U")]
    model_nseq_idx = _find_column_index_by_label(a_to_u, NSEQ_HEADER_CANDIDATES)
    model_contract_idx = _find_column_index_by_label(modelo, CONTRACT_HEADER_CANDIDATES)
    if model_contract_idx is None:
        raise ValueError(
            "Nao foi possivel localizar a coluna de contrato no modelo TIM. "
            "Verifique se o cabecalho contem 'CONTRATO' ou informe a letra correta."
        )
    w_series = modelo.iloc[:, excel_col_to_idx("W") - 1]

    rel = pd.read_excel(relneg_path, sheet_name=relneg_sheet_name, header=None, dtype=object)
    needed_cols_rel = max(excel_col_to_idx(eb_col_letter), excel_col_to_idx(status_col_letter))
    rel = ensure_width(rel, needed_cols_rel)

    nseq_idx: Optional[int] = None
    if allowed_nseqs_norm:
        if nseq_col_letter:
            nseq_idx = excel_col_to_idx(nseq_col_letter) - 1
        else:
            nseq_idx = _find_column_index_by_label(rel, NSEQ_HEADER_CANDIDATES)
        if nseq_idx is None:
            raise ValueError(
                "Nao foi possivel localizar a coluna NSEQ no RelNegociacao. "
                "Informe a letra com --nseq-col ou ajuste o cabecalho."
            )

    contract_idx = _find_column_index_by_label(rel, CONTRACT_HEADER_CANDIDATES)
    if contract_idx is None:
        raise ValueError(
            "Nao foi possivel localizar a coluna de contrato no RelNegociacao. "
            "Verifique o cabecalho do arquivo."
        )
    history_idx = _find_column_index_by_label(rel, HISTORY_HEADER_CANDIDATES)

    eb_idx = excel_col_to_idx(eb_col_letter) - 1
    dq_idx = excel_col_to_idx(status_col_letter) - 1

    rel_df = pd.DataFrame(
        {
            "EB_raw": rel.iloc[:, eb_idx],
            "EB": rel.iloc[:, eb_idx].astype(str).str.strip(),
            "DQ": rel.iloc[:, dq_idx],
            "CONTRATO_norm": rel.iloc[:, contract_idx].apply(
                lambda value: ""
                if value is None or (isinstance(value, float) and pd.isna(value))
                else str(value).strip()
            ),
        }
    )

    rel_df = rel_df.loc[rel_df["CONTRATO_norm"] != ""].copy()

    if history_idx is not None:
        rel_df["HISTORY_raw"] = rel.iloc[:, history_idx]
    else:
        rel_df["HISTORY_raw"] = pd.NA

    if nseq_idx is not None:
        rel_df["NSEQ_norm"] = rel.iloc[:, nseq_idx].apply(_normalize_nseq_value)
    else:
        rel_df["NSEQ_norm"] = ""

    if allowed_nseqs_norm and nseq_idx is not None:
        rel_df = rel_df.loc[rel_df["NSEQ_norm"].isin(allowed_nseqs_norm)].copy()

    if nseq_idx is not None:
        onda_idx = _find_column_index_by_label(rel, ONDA_HEADER_CANDIDATES)
        if onda_idx is not None:
            rel_df["ONDA_val"] = rel.iloc[:, onda_idx].apply(_normalize_onda_value)
        else:
            rel_df["ONDA_val"] = 0
        rel_df = (
            rel_df.sort_values(by=["NSEQ_norm", "ONDA_val"], ascending=[True, False])
            .drop_duplicates(subset=["NSEQ_norm"], keep="first")
        )

    rel_df["V_status_tail"] = rel_df["DQ"].apply(tail_after_last_hyphen)
    contract_status_map = (
        rel_df.loc[:, ["CONTRATO_norm", "V_status_tail"]]
        .replace({"CONTRATO_norm": ""}, pd.NA)
        .dropna(subset=["CONTRATO_norm"])
        .drop_duplicates(subset=["CONTRATO_norm"], keep="first")
        .set_index("CONTRATO_norm")["V_status_tail"]
        .to_dict()
    )
    contract_to_eb_raw = (
        rel_df.loc[:, ["CONTRATO_norm", "EB_raw"]]
        .replace({"CONTRATO_norm": ""}, pd.NA)
        .dropna(subset=["CONTRATO_norm"])
        .drop_duplicates(subset=["CONTRATO_norm"], keep="first")
        .set_index("CONTRATO_norm")["EB_raw"]
        .to_dict()
    )
    contract_history_map = (
        rel_df.loc[:, ["CONTRATO_norm", "HISTORY_raw"]]
        .replace({"CONTRATO_norm": ""}, pd.NA)
        .dropna(subset=["CONTRATO_norm"])
        .drop_duplicates(subset=["CONTRATO_norm"], keep="first")
        .set_index("CONTRATO_norm")["HISTORY_raw"]
        .to_dict()
    ) if "HISTORY_raw" in rel_df.columns else {}
    allowed_contracts = set(contract_status_map.keys())

    def _normalize_contract(value: object) -> str:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return ""
        return str(value).strip()

    contract_series = modelo.iloc[:, model_contract_idx].apply(_normalize_contract)
    always_include_contracts = {str(c).strip() for c in ALWAYS_INCLUDE_CONTRACTS}
    combined_allowed = allowed_contracts.union(always_include_contracts)

    contract_to_index: dict[str, int] = {}
    for idx, contract in enumerate(contract_series):
        if contract and contract not in contract_to_index:
            contract_to_index[contract] = idx

    rel_contract_order = [c for c in rel_df["CONTRATO_norm"] if c in allowed_contracts]
    ordered_contracts: list[str] = []
    for contract in rel_contract_order:
        if contract not in ordered_contracts:
            ordered_contracts.append(contract)
    for contract in always_include_contracts:
        if contract and contract not in ordered_contracts:
            ordered_contracts.append(contract)

    rows_a_to_u = []
    v_values: list[object] = []
    history_values: list[object] = []
    eb_values: list[object] = []

    for contract in ordered_contracts:
        idx_in_model = contract_to_index.get(contract)
        if idx_in_model is not None:
            row_series = a_to_u.iloc[idx_in_model].copy()
            fallback_history = w_series.iloc[idx_in_model]
        else:
            row_series = pd.Series(pd.NA, index=a_to_u.columns)
            row_series.iloc[model_contract_idx] = contract
            fallback_history = pd.NA
        rows_a_to_u.append(row_series)

        v_values.append(contract_status_map.get(contract, ""))
        history_value = contract_history_map.get(contract, fallback_history)
        if history_value is pd.NA or (isinstance(history_value, float) and pd.isna(history_value)):
            history_value = fallback_history
        history_values.append(history_value)
        eb_values.append(contract_to_eb_raw.get(contract, ""))

    out = pd.DataFrame(rows_a_to_u).reset_index(drop=True)
    v_series = pd.Series(v_values, name=a_to_u.shape[1])
    history_series = pd.Series(history_values, name=a_to_u.shape[1] + 1)
    eb_series = pd.Series(eb_values, name=a_to_u.shape[1] + 2)

    out = pd.concat([out, v_series, history_series, eb_series], axis=1)

    if model_nseq_idx is not None and model_nseq_idx < out.shape[1]:
        out = out.drop(out.columns[model_nseq_idx], axis=1)

    def idx_to_excel(idx: int) -> str:
        letters = ""
        while idx:
            idx, remainder = divmod(idx - 1, 26)
            letters = chr(65 + remainder) + letters
        return letters

    out.columns = [idx_to_excel(i) for i in range(1, out.shape[1] + 1)]
    return out


def build_tim_output(
    modelo_path: PathLike,
    modelo_sheet: Optional[str],
    relneg_path: PathLike,
    relneg_sheet: Optional[str],
    out_path: PathLike,
    status_col_letter: str = DEFAULT_STATUS_COL,
    x_col_letter: str = DEFAULT_X_COL,
    eb_col_letter: str = DEFAULT_EB_COL,
    allowed_nseqs: Optional[Iterable[str]] = None,
    nseq_col_letter: Optional[str] = None,
    return_df: bool = False,
) -> Optional[pd.DataFrame]:
    modelo = Path(modelo_path)
    relneg = Path(relneg_path)
    destino = Path(out_path)

    if not relneg.exists():
        raise FileNotFoundError(
            f"E necessario fornecer o arquivo RelNegociacao.xlsx para buscar DQ(Status) e filtrar por EB: {relneg}"
        )

    destino.parent.mkdir(parents=True, exist_ok=True)

    df_out = _build_tim_dataframe(
        modelo_path=modelo,
        modelo_sheet=modelo_sheet,
        relneg_path=relneg,
        relneg_sheet=relneg_sheet,
        status_col_letter=status_col_letter,
        x_col_letter=x_col_letter,
        eb_col_letter=eb_col_letter,
        allowed_nseqs=allowed_nseqs,
        nseq_col_letter=nseq_col_letter,
    )

    modelo_sheet_name = _resolve_sheet_name(
        modelo_sheet, workbook_path=modelo, fallback_names=MODEL_SHEET_FALLBACKS
    )
    wb = load_workbook(modelo)
    if modelo_sheet_name not in wb.sheetnames:
        raise ValueError(f"Planilha '{modelo_sheet_name}' nao encontrada no modelo.")
    ws = wb[modelo_sheet_name]

    header_row = _find_header_row(ws)
    data_start_row = header_row + 1
    if ws.max_row >= data_start_row:
        ws.delete_rows(data_start_row, ws.max_row - data_start_row + 1)

    values = list(df_out.itertuples(index=False, name=None))
    for row_offset, row_values in enumerate(values):
        target_row = data_start_row + row_offset
        for col_offset, value in enumerate(row_values, start=1):
            cell_value = None if pd.isna(value) else value
            ws.cell(row=target_row, column=col_offset, value=cell_value)

    ws.cell(row=2, column=2, value=datetime.now().strftime("%d/%m/%Y %H:%M"))

    total_rows = len(values)
    total_cols = df_out.shape[1] if df_out.shape[1] else ws.max_column
    last_row_for_border = (
        data_start_row + total_rows - 1 if total_rows else header_row
    )
    rows_for_formatting = range(header_row, last_row_for_border + 1)

    center_alignment = Alignment(horizontal="center", vertical="center")
    thin_side = Side(style="thin", color="000000")
    border_thin = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

    for col_idx in (1, 4):
        if col_idx <= ws.max_column:
            for row in rows_for_formatting:
                ws.cell(row=row, column=col_idx).alignment = center_alignment

    for row in rows_for_formatting:
        for col_idx in range(1, total_cols + 1):
            ws.cell(row=row, column=col_idx).border = border_thin

    header_map: dict[str, int] = {}
    for col_idx in range(1, ws.max_column + 1):
        header_value = _normalize_label(ws.cell(header_row, col_idx).value)
        if header_value:
            header_map[header_value.upper()] = col_idx

    data_rows = list(range(data_start_row, data_start_row + total_rows))
    if "resumo" in wb.sheetnames:
        ws_resumo = wb["resumo"]
        resumo_headers: list[int] = []
        for row in range(1, ws_resumo.max_row + 1):
            if _normalize_label(ws_resumo.cell(row, 1).value).upper() == "RÓTULOS DE LINHA":
                resumo_headers.append(row)

        if resumo_headers:
            col_vigencia = header_map.get("VIGÊNCIA ATUALIZADA")
            col_tipo = header_map.get("TIPO DE LOCADOR")

            if col_vigencia:
                series_vigencia = pd.Series(
                    [ws.cell(row=row, column=col_vigencia).value for row in data_rows]
                )
                counts_vigencia = _build_counts(series_vigencia)
                _apply_counts_to_table(ws_resumo, resumo_headers[0], counts_vigencia, total_rows)

            if len(resumo_headers) > 1 and col_tipo:
                series_tipo = pd.Series(
                    [ws.cell(row=row, column=col_tipo).value for row in data_rows]
                )
                counts_tipo = _build_counts(series_tipo)
                _apply_counts_to_table(ws_resumo, resumo_headers[1], counts_tipo, total_rows)

    if destino.exists():
        try:
            destino.unlink()
        except PermissionError as exc:
            raise PermissionError(
                f"Não foi possível substituir {destino} porque o arquivo está aberto. "
                "Feche o arquivo no Excel e execute novamente."
            ) from exc
        except OSError:
            pass
    try:
        wb.save(destino)
    except PermissionError as exc:
        raise PermissionError(
            f"Não foi possível salvar o arquivo em {destino}. "
            "Verifique se ele está fechado e tente novamente."
        ) from exc

    return df_out if return_df else None


def generate_report(
    modelo_path: Optional[PathLike] = None,
    modelo_sheet: Optional[str] = None,
    relneg_path: Optional[PathLike] = None,
    relneg_sheet: Optional[str] = None,
    status_col_letter: str = DEFAULT_STATUS_COL,
    x_col_letter: str = DEFAULT_X_COL,
    eb_col_letter: str = DEFAULT_EB_COL,
    output_path: Optional[PathLike] = None,
    output_dir: Optional[PathLike] = None,
    rules_path: Optional[PathLike] = None,
    nseq_col_letter: Optional[str] = None,
) -> tuple[Path, int, Path]:
    modelo = resolve_model_path(modelo_path)
    relneg = resolve_relneg_path(relneg_path)
    rules_file = resolve_rules_path(rules_path)
    allowed_nseqs = _load_nseq_rules(rules_file)
    destino, destino_dir = resolve_output_path(output_path, output_dir)

    df = build_tim_output(
        modelo_path=modelo,
        modelo_sheet=modelo_sheet,
        relneg_path=relneg,
        relneg_sheet=relneg_sheet,
        out_path=destino,
        status_col_letter=status_col_letter,
        x_col_letter=x_col_letter,
        eb_col_letter=eb_col_letter,
        allowed_nseqs=allowed_nseqs,
        nseq_col_letter=nseq_col_letter,
        return_df=True,
    )

    row_count = int(df.shape[0]) if df is not None else 0
    return destino, row_count, destino_dir


def gerar_excel() -> Path:
    out_path, row_count, out_dir = generate_report()
    summary = [(out_path.name, row_count, str(out_path))]
    show_generation_popup(summary, str(out_dir))
    return out_path


def run() -> Path:
    return gerar_excel()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Gera o report TIM usando a estrutura padrao de pastas.")
    parser.add_argument("--modelo", help="Caminho para o modelo TIM (default: busca em Desktop/Report/Modelos).")
    parser.add_argument(
        "--modelo-sheet",
        default=None,
        help="Nome da aba dentro do arquivo modelo (default: primeira aba).",
    )
    parser.add_argument(
        "--relneg",
        help="Caminho para RelNegociacao.xlsx (default: Desktop/Report/Modelos/RelNegociacao.xlsx).",
    )
    parser.add_argument(
        "--relneg-sheet",
        default=None,
        help="Nome da aba no arquivo RelNegociacao (default: primeira aba).",
    )
    parser.add_argument("--out", help="Caminho completo do arquivo de saida (opcional).")
    parser.add_argument(
        "--output-dir",
        help="Pasta onde o arquivo sera salvo (nome padrao TIM_<data>.xlsx). Ignorado se --out for utilizado.",
    )
    parser.add_argument(
        "--rules",
        help="Caminho para Tim_regras.txt (default: Desktop/Report/REGRAS/Tim_regras.txt).",
    )
    parser.add_argument(
        "--status-col",
        default=DEFAULT_STATUS_COL,
        help="Letra da coluna de status no RelNeg (default: DQ).",
    )
    parser.add_argument(
        "--x-col",
        default=DEFAULT_X_COL,
        help="Letra da coluna X no modelo (default: X).",
    )
    parser.add_argument(
        "--eb-col",
        default=DEFAULT_EB_COL,
        help="Letra da coluna EB no RelNeg (default: EB).",
    )
    parser.add_argument(
        "--nseq-col",
        help="Letra da coluna NSEQ no RelNeg (detectada automaticamente se ausente).",
    )
    parser.add_argument(
        "--no-popup",
        action="store_true",
        help="Nao exibe a popup de sucesso ao final.",
    )

    args = parser.parse_args(argv)

    try:
        out_path, row_count, out_dir = generate_report(
            modelo_path=args.modelo,
            modelo_sheet=args.modelo_sheet,
            relneg_path=args.relneg,
            relneg_sheet=args.relneg_sheet,
            status_col_letter=args.status_col,
            x_col_letter=args.x_col,
            eb_col_letter=args.eb_col,
            output_path=args.out,
            output_dir=args.output_dir,
            rules_path=args.rules,
            nseq_col_letter=args.nseq_col,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[ERRO] {exc}", file=sys.stderr)
        return 1

    print(f"[OK] Arquivo gerado: {out_path}")
    summary = [(out_path.name, row_count, str(out_path))]
    if not args.no_popup:
        show_generation_popup(summary, str(out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

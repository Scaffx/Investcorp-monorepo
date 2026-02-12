from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Optional

import pandas as pd

def preco_format(preco_str: Optional[str]) -> float:
    """
    Converte strings como 'R$ 1.200.000' ou '1.200.000,50' para float.
    Retorna 0.0 se não conseguir converter.
    """
    if preco_str is None:
        return 0.0
    if isinstance(preco_str, (int, float)):
        try:
            return float(preco_str)
        except Exception:
            return 0.0

    s = str(preco_str).strip()
    if not s:
        return 0.0

    # remove moeda e espaços
    s = s.replace("R$", "").replace("\xa0", " ").strip()
    # remove tudo que não for dígito, ponto ou vírgula
    s = re.sub(r"[^0-9.,-]", "", s)

    # Se tem vírgula e ponto, assume padrão BR: ponto milhar e vírgula decimal
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s and "." not in s:
        # só vírgula => decimal
        s = s.replace(",", ".")
    # só ponto => já decimal ou milhar; tenta converter direto
    try:
        return float(s)
    except Exception:
        return 0.0


def aplica_formato_monetario_excel(path: Path, column_name: str = "Valor Oferta (R$)") -> None:
    """Aplica formato monetário (R$) na coluna informada do XLSX."""
    if path.suffix.lower() != ".xlsx":
        return
    try:
        from openpyxl import load_workbook
    except Exception:
        return
    try:
        wb = load_workbook(path)
        ws = wb.active
        col_idx = None
        for cell in ws[1]:
            if cell.value == column_name:
                col_idx = cell.column
                break
        if not col_idx:
            return
        for row in range(2, ws.max_row + 1):
            cell = ws.cell(row=row, column=col_idx)
            if cell.value is None or cell.value == "":
                continue
            if isinstance(cell.value, str):
                if not re.search(r"\d", cell.value):
                    continue
                cell.value = preco_format(cell.value)
            if isinstance(cell.value, (int, float)):
                cell.number_format = '"R$" #,##0.00'
        wb.save(path)
    except Exception:
        return


def salva_arquivo(df: pd.DataFrame, excel_path: Path, log_cb=None, salvar_csv: bool = False) -> Path:
    """
    Salva DataFrame em Excel (e opcionalmente CSV). Trata arquivo ocupado.
    (adaptado do seu script original: agora é usado apenas quando o usuário pedir exportar)
    """
    excel_path.parent.mkdir(parents=True, exist_ok=True)
    path_to_save = excel_path
    if path_to_save.exists():
        try:
            path_to_save.unlink()
        except PermissionError:
            timestamped = path_to_save.with_name(f"{path_to_save.stem}_{int(time.time())}{path_to_save.suffix}")
            if log_cb:
                log_cb("Arquivo estava aberto. Salvando com outro nome...")
            path_to_save = timestamped
    try:
        df.to_excel(path_to_save, index=False)
        aplica_formato_monetario_excel(path_to_save, "Valor Oferta (R$)")
        if log_cb:
            log_cb(f"? {len(df)} linhas salvas em {path_to_save}")
    except PermissionError:
        alt = path_to_save.with_name(f"{path_to_save.stem}_{int(time.time())}{path_to_save.suffix}")
        if log_cb:
            log_cb("Arquivo bloqueado. Tentando salvar com outro nome...")
        df.to_excel(alt, index=False)
        aplica_formato_monetario_excel(alt, "Valor Oferta (R$)")
        path_to_save = alt
    except ModuleNotFoundError as exc:
        if "openpyxl" in str(exc).lower():
            fallback_csv = path_to_save.with_suffix(".csv")
            try:
                df.to_csv(fallback_csv, index=False, sep=";", encoding="utf-8-sig")
            except PermissionError:
                alt = fallback_csv.with_name(f"{fallback_csv.stem}_{int(time.time())}{fallback_csv.suffix}")
                if log_cb:
                    log_cb("Arquivo CSV bloqueado. Salvando com outro nome...")
                df.to_csv(alt, index=False, sep=";", encoding="utf-8-sig")
                fallback_csv = alt
            path_to_save = fallback_csv
            if log_cb:
                log_cb("Biblioteca 'openpyxl' não encontrada. Arquivo salvo em CSV como alternativa.")
                log_cb("Instale com 'pip install openpyxl' dentro do ambiente virtual para gerar XLSX.")
        else:
            raise

    if salvar_csv and path_to_save.suffix.lower() != ".csv":
        csv_path = path_to_save.with_suffix(".csv")
        try:
            df.to_csv(csv_path, index=False, sep=";", encoding="utf-8-sig")
        except PermissionError:
            csv_path = csv_path.with_name(f"{csv_path.stem}_{int(time.time())}{csv_path.suffix}")
            if log_cb:
                log_cb("CSV bloqueado. Salvando com outro nome...")
            df.to_csv(csv_path, index=False, sep=";", encoding="utf-8-sig")
        if log_cb:
            log_cb(f"? CSV salvo em {csv_path}")

    return path_to_save

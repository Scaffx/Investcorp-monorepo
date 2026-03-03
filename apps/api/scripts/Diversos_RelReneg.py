#!/usr/bin/env python3
r"""
Diversos_RelReneg.py
- Le RelNegociacao.xlsx e o modelo Report_RelReneg.xlsx na pasta Desktop\Report\Modelos
- Le regras em Desktop\Report\REGRAS\Diversos_Regras.txt (cria modelo se não existir)
- Regras flexiveis: OutputName@BANDEIRA:1,2,3  ou BANDEIRA:1,2,3  ou OutputName:1,2,3
- Gera arquivos por regra na subpasta Desktop\Report\DD-MM-YYYY
- Substitui/atualiza a sheet "Base" do modelo preservando "Report" e tabelas
- Exibe popup com resumo e abre a pasta no Explorer apos OK
"""

import os
import sys
import unicodedata
from datetime import datetime, timedelta
import pandas as pd
import tkinter as tk
from tkinter import messagebox
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo
import numbers
import subprocess

try:
    from .utils import apply_app_icon, show_generation_popup
except ImportError:
    # Permite rodar o script diretamente (python Diversos_RelReneg.py) sem python -m.
    SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
    if SCRIPT_DIR not in sys.path:
        sys.path.insert(0, SCRIPT_DIR)
    from utils import apply_app_icon, show_generation_popup

# ------------------------
# CONFIGURAÇÕES (Desktop\Report)
# ------------------------
REPORT_DIR = os.path.join(os.path.expanduser("~"), "Desktop", "Report")
os.makedirs(REPORT_DIR, exist_ok=True)

MODELOS_DIR = os.path.join(REPORT_DIR, "Modelos")
os.makedirs(MODELOS_DIR, exist_ok=True)

REGRAS_DIR = os.path.join(REPORT_DIR, "REGRAS")
os.makedirs(REGRAS_DIR, exist_ok=True)

EXCEL_FILENAME = os.path.join(MODELOS_DIR, "RelNegociacao.xlsx")
REGRAS_FILENAME = os.path.join(REGRAS_DIR, "Diversos_Regras.txt")
MODELO_FILENAME = os.path.join(MODELOS_DIR, "Report_RelReneg.xlsx")  # modelo fixo, deve conter sheet "Report"

# colunas que queremos no output (ajuste se necessário)
COLUNAS_DESEJADAS = [
    'NSEQ','ONDA','NOME LOTE','DATA LOTE CLIENTE','DATA LOTE INVEST','BANDEIRA','Empresa',
    'DENOMINACAO/ NOME','CONTRATO','CENTRO DE CUSTO','Solicitante','ENDEREÇO CLIENTE',
    'INICIO CONTRATO','TERMINO CONTRATO','ALUGUEL DEVIDO','DATA PRÓX. REAJUSTE','INDICE',
    'Valor CTO','M² AREA TERRENO','M² AREA CONSTRUIDA','M² AREA TOTAL','DADOS LOCADOR (A)',
    'DADOS FAVORECIDO (A)','Data Início Negociação','Data Fim Negociação','Data Solicitação Minuta',
    'Data Recebimento Minuta','Data Envio Locador','Data Entrega Formalizada','Data Conclusão',
    'Data Cancelamento','Motivo Cancelamento','Proposta','Contra Proposta','Motivadores sem Exito',
    'Descrição Motivadores sem Exito','Alterou Mês Reajuste','Nova Data de Reajuste','RENOVACAO?',
    'NOVO FIM DE VIGENCIA','PRAZO RENOVADO','RETROATIVO','VALOR DEB. DE RETROATIVOS','VALOR NEGOCIADO',
    'Indicador - da Sub. De ind','SUBSTITUICAO INDICE BASE','NOVO INDICE DE REAJUSTE',
    'Indicador - Isenção do Indice','ISENCAO INDICE','% Desconto Índice','REDUÇÃO / DESCONTO / MAJORAÇÃO',
    'VALOR - RED / DES / MAJ','% Red / Des / Maj','Início Captura','Fim Captura','Distrato','Data Distrato',
    'valor DRS','Data início(DRS)','Data fim(DRS)','Alteração Cadastral',
    'Economia até  12 meses - Substituição Índice','Economia até  12 meses Desconto/Redução',
    'Economia até  12 meses - Isenção Indice','Economia até  12 meses - Limitador do índice',
    'Economia Fim do Contrato - Substituição Índice','Economia Fim do Contrato -  Desconto/Redução',
    'Economia Fim do Contrato -  Isenção Indice','Economia Fim do Contrato -  Limitador do índice',
    'Status','Situação','Negociador','Resp. Adm.','Data Historico','Ultimo Historico'
]

# nomes longos para saída (opcional - mas regra de Regras.txt tem prioridade)
BAND_DISPLAY_NAME = {
    "BRADESCO": "Bradesco Distrato",
    "CLARO": "Claro Imóveis e Sites"
}

DATE_FORMAT = "%d-%m-%Y"

REGRAS_TEMPLATE = (
    "# Arquivo de regras para Diversos (Renegociação)\n"
    "# Formatos aceitos:\n"
    "# OutputName@BANDEIRA:1,2,3\n"
    "# BANDEIRA:1,2,3\n"
    "# OutputName:1,2,3\n"
    "# Exemplo:\n"
    "IMC:4400,1999,5092\n"
)

# ------------------------
# UTILITÁRIOS
# ------------------------
def normalize_text(s: str) -> str:
    s = "" if s is None else str(s)
    nfkd = unicodedata.normalize("NFKD", s)
    only_ascii = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return only_ascii.upper().strip()

def sanitize_filename(name: str) -> str:
    return "".join(c if (c.isalnum() or c in (" ", "-", "_")) else "_" for c in name).strip()

def show_popup(title: str, message: str, level: str = "warning") -> None:
    try:
        root = tk.Tk()
        apply_app_icon(root)
        root.withdraw()
        root.lift()
        root.attributes("-topmost", True)
        root.focus_force()
        if level == "error":
            messagebox.showerror(title, message)
        elif level == "info":
            messagebox.showinfo(title, message)
        else:
            messagebox.showwarning(title, message)
        root.destroy()
    except Exception:
        print(message)

def open_folder(path: str) -> None:
    try:
        if os.name == "nt":
            os.startfile(path)
        elif sys.platform == "darwin":
            subprocess.call(["open", path])
        else:
            subprocess.call(["xdg-open", path])
    except Exception:
        pass

def rules_file_has_content(path: str) -> bool:
    try:
        with open(path, "r", encoding="utf-8") as f:
            for ln in f:
                if ln.strip() and not ln.strip().startswith("#"):
                    return True
    except Exception:
        return False
    return False

def ensure_rules_file_ready(rules_path: str, rules_dir: str) -> bool:
    if not os.path.exists(rules_path):
        try:
            os.makedirs(rules_dir, exist_ok=True)
            with open(rules_path, "w", encoding="utf-8") as f:
                f.write(REGRAS_TEMPLATE)
        except Exception as e:
            show_popup("Erro", f"Não foi possível criar o arquivo de regras:\n{e}", level="error")
            return False

        show_popup(
            "Regras não encontradas",
            (
                "Arquivo de regras criado automaticamente.\n\n"
                f"Preencha o arquivo:\n{rules_path}\n\n"
                "Depois execute o programa novamente."
            ),
        )
        open_folder(rules_dir)
        return False

    if not rules_file_has_content(rules_path):
        show_popup(
            "Regras vazias",
            (
                "O arquivo de regras está vazio.\n\n"
                f"Preencha o arquivo:\n{rules_path}\n\n"
                "Depois execute o programa novamente."
            ),
        )
        open_folder(rules_dir)
        return False

    return True

def ensure_excel_exists_or_prompt(excel_path: str, modelos_dir: str) -> bool:
    if os.path.exists(excel_path):
        return True

    msg = (
        "Arquivo Excel 'RelNegociacao.xlsx' não encontrado.\n\n"
        f"Por favor, coloque 'RelNegociacao.xlsx' na pasta:\n{modelos_dir}\n\n"
        "O Explorer será aberto. Quando o arquivo estiver na pasta, execute o programa novamente."
    )
    show_popup("Arquivo não encontrado", msg)
    open_folder(modelos_dir)
    return False

def ensure_model_exists_or_prompt(model_path, report_dir):
    """
    Se o modelo não existir: mostra popup informando onde colocar o arquivo,
    abre a pasta no Explorer e encerra o script (retorna False).
    """
    if os.path.exists(model_path):
        return True

    msg = (
        "Arquivo de modelo 'Report_RelReneg.xlsx' não encontrado.\n\n"
        f"Por favor, coloque 'Report_RelReneg.xlsx' na pasta:\n{report_dir}\n\n"
        "O Explorer será aberto. Quando o arquivo estiver na pasta, execute o programa novamente."
    )
    show_popup("Modelo não encontrado", msg)
    open_folder(report_dir)
    return False

# ------------------------
# REGRAS FLEXÍVEIS
# ------------------------
def carregar_regras_flex(filepath: str) -> list:
    """
    Lê Regras.txt aceitando linhas:
      - BANDEIRA:4400,1999,...
      - OutputName@BANDEIRA:4400,1999,...
      - OutputName:4400,1999,...   (tentativa de inferir bandeira)
    Retorna lista de dicts:
      { "output_name_raw", "output_fname", "tentativa_bandeira", "nseqs" }
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Arquivo de regras não encontrado em: {filepath}")

    regras = []
    with open(filepath, "r", encoding="utf-8") as f:
        for ln in f:
            ln = ln.strip()
            if not ln or ln.startswith("#"):
                continue

            # separar OutputName@Bandeira ou apenas left:rest
            output_name_raw = None
            tentativa_bandeira = None
            rest = ln

            if "@" in ln:
                out_part, rest = ln.split("@", 1)
                output_name_raw = out_part.strip()

            if ":" not in rest:
                print(f"[WARN] Linha ignorada (formato inválido): {ln}")
                continue

            left, nseqs_str = rest.split(":", 1)
            left = left.strip()
            tentativa_bandeira = left

            if output_name_raw is None:
                output_name_raw = left

            parts = [p.strip() for p in nseqs_str.replace(";", ",").split(",") if p.strip() != ""]
            nums = []
            for p in parts:
                try:
                    nums.append(int(float(p)))
                except Exception:
                    continue

            if not nums:
                print(f"[WARN] Nenhum NSEQ válido na linha: {ln}")
                continue

            regra = {
                "output_name_raw": output_name_raw,
                "output_fname": sanitize_filename(output_name_raw),
                "tentativa_bandeira": tentativa_bandeira,
                "nseqs": nums
            }
            regras.append(regra)
    return regras

def resolve_bandeira_para_regra(regra: dict, df_bandeiras_norm_set: set) -> str:
    """
    Tenta resolver a bandeira (valor normalizado) que a regra deve aplicar.
    Retorna bandeira_key normalizada (ex: 'CLARO') ou None se não encontrar.
    """
    tb = regra.get("tentativa_bandeira", "")
    if not tb:
        return None
    tb_norm = normalize_text(tb)

    # 1) exata
    if tb_norm in df_bandeiras_norm_set:
        return tb_norm

    # 2) primeira palavra
    first = tb_norm.split()[0] if tb_norm.split() else tb_norm
    if first in df_bandeiras_norm_set:
        return first

    # 3) substring matching
    for b in df_bandeiras_norm_set:
        if b in tb_norm or tb_norm in b:
            return b

    return None

# ------------------------
# ESCRITA SEGURA (preserva modelo)
# ------------------------
def salvar_df_no_modelo_com_table(df_salvar: pd.DataFrame, output_path: str, modelo_path: str, remove_report: bool = False):
    """
    Carrega modelo (modelo_path), substitui o conteúdo da sheet 'Base' pelo df_salvar
    (mantendo a sheet 'Report' e demais), recria/atualiza uma Excel Table cobrindo o intervalo,
    e salva em output_path.
    """
    if os.path.exists(modelo_path):
        try:
            wb = load_workbook(modelo_path)

            if remove_report and "Report" in wb.sheetnames:
                del wb["Report"]

            # garantir que exista a sheet Base (se não, criamos)
            if "Base" not in wb.sheetnames:
                ws = wb.create_sheet("Base")
            else:
                ws = wb["Base"]
                # limpar conteúdo (todas as linhas)
                if ws.max_row > 0:
                    ws.delete_rows(1, ws.max_row)

            # escreve header
            for col_idx, col_name in enumerate(df_salvar.columns, start=1):
                ws.cell(row=1, column=col_idx, value=col_name)

            # helper para normalizar valores
            def _to_python_value(v):
                try:
                    if pd.isna(v):
                        return None
                except Exception:
                    pass
                try:
                    if isinstance(v, pd.Timestamp):
                        return v.to_pydatetime()
                except Exception:
                    pass
                if isinstance(v, (numbers.Integral, numbers.Real, int, float)):
                    return v
                if isinstance(v, bool):
                    return v
                return v

            # escreve linhas
            for r_idx, row in enumerate(df_salvar.itertuples(index=False, name=None), start=2):
                for c_idx, cell_value in enumerate(row, start=1):
                    val = _to_python_value(cell_value)
                    ws.cell(row=r_idx, column=c_idx, value=val)

            # atualizar/gerar table na Base
            nrows = df_salvar.shape[0] + 1  # inclui header
            ncols = df_salvar.shape[1] if df_salvar.shape[1] > 0 else 1
            last_col = get_column_letter(ncols)
            ref = f"A1:{last_col}{nrows}"

            # preservar displayName anterior se existir
            existing_table_name = None
            if hasattr(ws, "_tables") and ws._tables:
                try:
                    existing_table_name = ws._tables[0].displayName
                except Exception:
                    existing_table_name = None
                ws._tables = []

            table_name = existing_table_name or "BaseTable"
            table_name = table_name.replace(" ", "_")
            tbl = Table(displayName=table_name, ref=ref)
            style = TableStyleInfo(name="TableStyleMedium9", showFirstColumn=False,
                                   showLastColumn=False, showRowStripes=True, showColumnStripes=False)
            tbl.tableStyleInfo = style
            ws.add_table(tbl)

            wb.save(output_path)
            return True, None
        except Exception as e:
            return False, f"Erro ao usar modelo: {e}"
    else:
        # se não há modelo, criar arquivo simples com Base e uma sheet Report placeholder
        try:
            with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
                df_salvar.to_excel(writer, index=False, sheet_name="Base")
                if not remove_report:
                    report_df = pd.DataFrame([["Coloque aqui seu modelo de Report que puxa da Base"]], columns=["Nota"])
                    report_df.to_excel(writer, index=False, sheet_name="Report")
            return True, None
        except Exception as e:
            return False, f"Erro ao salvar sem modelo: {e}"

# ------------------------
# GERAÇÃO PRINCIPAL (usa regras flex)
# ------------------------
def gerar_reports_com_regras_flex(df: pd.DataFrame, regras: list):
    """
    Retorna summary (lista de (output_filename, qtd_linhas, output_path)) e output_dir criado.
    """
    summary = []
    if not regras:
        print("[INFO] Nenhuma regra encontrada — nada a gerar.")
        return summary, None

    ontem = datetime.today() - timedelta(days=1)
    hoje = ontem.strftime(DATE_FORMAT)
    output_dir = os.path.join(REPORT_DIR, hoje)
    os.makedirs(output_dir, exist_ok=True)

    if 'BANDEIRA' not in df.columns or 'NSEQ' not in df.columns:
        raise ValueError("O arquivo Excel deve conter colunas 'BANDEIRA' e 'NSEQ'.")

    # preparar df para filtros (normalização)
    df = df.copy()
    df['_BANDEIRA_NORM'] = df['BANDEIRA'].astype(str).apply(normalize_text)
    df['_NSEQ_INT'] = pd.to_numeric(df['NSEQ'], errors='coerce').astype('Int64')

    # conjunto de bandeiras únicas existentes na base (normalizadas)
    df_bandeiras_norm_set = set(df['_BANDEIRA_NORM'].dropna().unique())

    for regra in regras:
        output_name_raw = regra["output_name_raw"]
        fname_base = regra["output_fname"]
        nseqs = set(int(x) for x in regra["nseqs"])

        bandeira_key = resolve_bandeira_para_regra(regra, df_bandeiras_norm_set)
        if bandeira_key is None:
            print(f"[WARN] Não foi possível resolver BANDEIRA para regra '{output_name_raw}'. Pulando.")
            continue

        df_filtrado = df[(df['_BANDEIRA_NORM'] == bandeira_key) & (df['_NSEQ_INT'].isin(nseqs))]
        if df_filtrado.empty:
            print(f"[INFO] Nenhum registro para '{output_name_raw}' (BANDEIRA resolvida: {bandeira_key}). Pulando.")
            continue

        df_salvar = df_filtrado[[c for c in COLUNAS_DESEJADAS if c in df_filtrado.columns]].copy()

        if bandeira_key == "BRADESCO":
            output_filename = f"{fname_base}_{hoje}_distrato.xlsx"
        else:
            output_filename = f"{fname_base}_{hoje}_report.xlsx"

        output_path = os.path.join(output_dir, output_filename)

        remove_report_sheet = bandeira_key in {"BRADESCO", "CLARO"}
        ok, err = salvar_df_no_modelo_com_table(
            df_salvar,
            output_path,
            MODELO_FILENAME,
            remove_report=remove_report_sheet
        )
        if not ok:
            print(f"[ERRO] Falha ao salvar {output_filename}: {err}")
            # tentar fallback simples
            try:
                with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
                    df_salvar.to_excel(writer, index=False, sheet_name="Base")
                print(f"[OK] Gerado (fallback): {output_path}")
            except Exception as e:
                print(f"[ERRO] Fallback também falhou: {e}")
                continue
        else:
            print(f"[OK] Gerado: {output_path}")

        qtd = len(df_salvar)
        summary.append((output_filename, qtd, output_path))

    return summary, output_dir

# ------------------------
# POPUP (em primeiro plano) E ABRIR PASTA
# ------------------------
# ------------------------
# MAIN
# ------------------------
def main():
    # garantir folders
    os.makedirs(REPORT_DIR, exist_ok=True)
    os.makedirs(MODELOS_DIR, exist_ok=True)
    os.makedirs(REGRAS_DIR, exist_ok=True)

    if not ensure_rules_file_ready(REGRAS_FILENAME, REGRAS_DIR):
        sys.exit(1)

    if not ensure_excel_exists_or_prompt(EXCEL_FILENAME, MODELOS_DIR):
        sys.exit(1)

    # checar modelo (se não existir, pedir para o usuário colocar e abrir a pasta)
    if not ensure_model_exists_or_prompt(MODELO_FILENAME, MODELOS_DIR):
        sys.exit(1)

    # carregar regras
    try:
        regras = carregar_regras_flex(REGRAS_FILENAME)
    except Exception as e:
        print(f"[ERRO] Ao carregar regras: {e}")
        sys.exit(1)

    if not os.path.exists(EXCEL_FILENAME):
        print(f"[ERRO] Arquivo Excel não encontrado em: {EXCEL_FILENAME}")
        sys.exit(1)

    try:
        df = pd.read_excel(EXCEL_FILENAME, engine="openpyxl")
    except Exception as e:
        print(f"[ERRO] Ao ler Excel: {e}")
        sys.exit(1)

    try:
        summary, output_dir = gerar_reports_com_regras_flex(df, regras)
    except Exception as e:
        print(f"[ERRO] Durante geração dos reports: {e}")
        sys.exit(1)

    show_generation_popup(summary, output_dir)
if __name__ == "__main__":
    main()

def gerar_excel():
    os.makedirs(REPORT_DIR, exist_ok=True)
    os.makedirs(MODELOS_DIR, exist_ok=True)
    os.makedirs(REGRAS_DIR, exist_ok=True)

    if not ensure_rules_file_ready(REGRAS_FILENAME, REGRAS_DIR):
        return

    if not ensure_excel_exists_or_prompt(EXCEL_FILENAME, MODELOS_DIR):
        return

    if not ensure_model_exists_or_prompt(MODELO_FILENAME, MODELOS_DIR):
        return

    try:
        regras = carregar_regras_flex(REGRAS_FILENAME)
    except Exception as e:
        root = tk.Tk()
        apply_app_icon(root)
        root.withdraw()
        messagebox.showerror("Erro", f"Erro ao carregar regras: {e}")
        root.destroy()
        return

    if not os.path.exists(EXCEL_FILENAME):
        root = tk.Tk()
        apply_app_icon(root)
        root.withdraw()
        messagebox.showerror("Erro", f"Arquivo Excel não encontrado em: {EXCEL_FILENAME}")
        root.destroy()
        return

    try:
        df = pd.read_excel(EXCEL_FILENAME, engine="openpyxl")
    except Exception as e:
        root = tk.Tk()
        apply_app_icon(root)
        root.withdraw()
        messagebox.showerror("Erro", f"Erro ao ler Excel: {e}")
        root.destroy()
        return

    try:
        summary, output_dir = gerar_reports_com_regras_flex(df, regras)
    except Exception as e:
        root = tk.Tk()
        apply_app_icon(root)
        root.withdraw()
        messagebox.showerror("Erro", f"Erro durante geração dos reports: {e}")
        root.destroy()
        return

    show_generation_popup(summary, output_dir)

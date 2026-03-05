#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Diversos_RelReneg.py adaptado para rodar como API no Django/Railway.
"""

import os
import sys
import unicodedata
from datetime import datetime, timedelta
import pandas as pd
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo
import numbers
from pathlib import Path

# ====== CONFIGURAÇÕES DE CAMINHOS PARA SERVIDOR ======
BASE_DIR = Path(__file__).resolve().parent.parent
REPORT_DIR = BASE_DIR / "reports_gerados"
MODELOS_DIR = BASE_DIR / "modelos"

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

DATE_FORMAT = "%d-%m-%Y"

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

# ------------------------
# ESCRITA SEGURA (preserva modelo)
# ------------------------
def salvar_df_no_modelo_com_table(df_salvar: pd.DataFrame, output_path: str, modelo_path: str, remove_report: bool = False):
    if os.path.exists(modelo_path):
        try:
            wb = load_workbook(modelo_path)
            if remove_report and "Report" in wb.sheetnames:
                del wb["Report"]

            if "Base" not in wb.sheetnames:
                ws = wb.create_sheet("Base")
            else:
                ws = wb["Base"]
                if ws.max_row > 0:
                    ws.delete_rows(1, ws.max_row)

            for col_idx, col_name in enumerate(df_salvar.columns, start=1):
                ws.cell(row=1, column=col_idx, value=col_name)

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

            for r_idx, row in enumerate(df_salvar.itertuples(index=False, name=None), start=2):
                for c_idx, cell_value in enumerate(row, start=1):
                    val = _to_python_value(cell_value)
                    ws.cell(row=r_idx, column=c_idx, value=val)

            nrows = df_salvar.shape[0] + 1
            ncols = df_salvar.shape[1] if df_salvar.shape[1] > 0 else 1
            last_col = get_column_letter(ncols)
            ref = f"A1:{last_col}{nrows}"

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
        try:
            with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
                df_salvar.to_excel(writer, index=False, sheet_name="Base")
                if not remove_report:
                    report_df = pd.DataFrame([["Coloque aqui seu modelo de Report que puxa da Base"]], columns=["Nota"])
                    report_df.to_excel(writer, index=False, sheet_name="Report")
            return True, None
        except Exception as e:
            return False, f"Erro ao salvar sem modelo: {e}"

# ====== NÚCLEO ADAPTADO PARA API ======
def run(nseq_list: list[str], negociacao_file_path: str | Path, modelo_file_path: str | Path | None = None) -> Path:
    """
    Função principal adaptada para receber dados da API.
    Nota: O script original do Diversos gerava vários arquivos. Para a API, 
    vamos gerar um único arquivo consolidado com os NSEQs fornecidos, 
    ou o primeiro arquivo gerado se houver lógica de separação.
    """
    if not nseq_list:
        raise ValueError("Nenhum NSEQ fornecido para processamento.")

    caminho_base = Path(negociacao_file_path)
    if not caminho_base.exists():
        raise FileNotFoundError(f"Arquivo base não encontrado: {caminho_base}")

    # Lógica de definição do modelo
    if modelo_file_path and Path(modelo_file_path).exists():
        reference_path = Path(modelo_file_path)
    else:
        reference_path = MODELOS_DIR / "Report_RelReneg.xlsx"

    # Carrega a base
    df = pd.read_excel(caminho_base, engine="openpyxl")

    if 'BANDEIRA' not in df.columns or 'NSEQ' not in df.columns:
        raise ValueError("O arquivo Excel deve conter colunas 'BANDEIRA' e 'NSEQ'.")

    # Limpa os NSEQs recebidos
    nseqs_int = set()
    for n in nseq_list:
        try:
            nseqs_int.add(int(float(str(n).strip())))
        except ValueError:
            continue

    if not nseqs_int:
        raise ValueError("Nenhum NSEQ válido fornecido.")

    # Prepara df para filtros
    df = df.copy()
    df['_BANDEIRA_NORM'] = df['BANDEIRA'].astype(str).apply(normalize_text)
    df['_NSEQ_INT'] = pd.to_numeric(df['NSEQ'], errors='coerce').astype('Int64')

    # Filtra pelos NSEQs fornecidos (ignora bandeira para simplificar na API, já que o usuário escolheu os NSEQs)
    df_filtrado = df[df['_NSEQ_INT'].isin(nseqs_int)]

    if df_filtrado.empty:
        raise ValueError("Nenhum registro encontrado para os NSEQs informados.")

    df_salvar = df_filtrado[[c for c in COLUNAS_DESEJADAS if c in df_filtrado.columns]].copy()

    # Cria pasta de saída
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    agora = datetime.now()
    output_filename = f"Diversos_{agora.strftime('%d%m%Y_%H%M%S')}_report.xlsx"
    output_path = REPORT_DIR / output_filename

    # Salva o arquivo
    ok, err = salvar_df_no_modelo_com_table(
        df_salvar,
        str(output_path),
        str(reference_path),
        remove_report=False # Mantém a aba report padrão do diversos
    )

    if not ok:
        # Fallback simples
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            df_salvar.to_excel(writer, index=False, sheet_name="Base")

    return output_path
    
    # Chama a função passando: Lista de NSEQ, Arquivo feito Upload, Arquivo Modelo
    caminho_arquivo = gerar_diversos(nseq_list, temp_path, caminho_modelo)
    show_generation_popup(summary, output_dir)

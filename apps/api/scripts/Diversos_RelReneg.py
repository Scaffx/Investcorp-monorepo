#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Diversos_RelReneg.py adaptado para rodar como API no Django/Railway.
"""

import os
import unicodedata
from datetime import datetime
from pathlib import Path
import pandas as pd
import numbers

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

# === Configurações de Caminhos para Servidor ===
BASE_DIR = Path(__file__).resolve().parent.parent
REPORT_DIR = BASE_DIR / "reports_gerados"

# Colunas que queremos no output (mantidas do original)
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
                    if pd.isna(v): return None
                except Exception: pass
                try:
                    if isinstance(v, pd.Timestamp): return v.to_pydatetime()
                except Exception: pass
                if isinstance(v, (numbers.Integral, numbers.Real, int, float)): return v
                if isinstance(v, bool): return v
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

# ------------------------
# FUNÇÃO PRINCIPAL ADAPTADA
# ------------------------
def run(nseq_list: list[str], negociacao_file_path: str | Path, modelo_file_path: str | Path, report_name: str = "Diversos") -> Path:
    """
    Recebe a lista de NSEQs, o arquivo base enviado pelo usuário e o arquivo de modelo.
    """
    caminho_base = Path(negociacao_file_path)
    caminho_modelo = Path(modelo_file_path)

    if not caminho_base.exists():
        raise FileNotFoundError(f"Arquivo base não encontrado: {caminho_base}")
    
    if not nseq_list:
        raise ValueError("Nenhum NSEQ fornecido para processamento.")

    # Limpa os NSEQs recebidos
    nseqs_limpos = [str(n).strip() for n in nseq_list if str(n).strip()]

    df = pd.read_excel(caminho_base, engine="openpyxl")

    if 'NSEQ' not in df.columns:
        raise ValueError("O arquivo Excel deve conter a coluna 'NSEQ'.")

    # Normaliza a coluna NSEQ para string para garantir o match exato
    df['_NSEQ_STR'] = df['NSEQ'].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()

    # Filtra apenas os NSEQs solicitados
    df_filtrado = df[df['_NSEQ_STR'].isin(nseqs_limpos)].copy()

    if df_filtrado.empty:
        raise ValueError("Nenhum dos NSEQs informados foi encontrado na planilha base.")

    # Seleciona apenas as colunas desejadas que existem no DataFrame
    colunas_presentes = [c for c in COLUNAS_DESEJADAS if c in df_filtrado.columns]
    df_salvar = df_filtrado[colunas_presentes].copy()

    # Prepara o diretório e nome do arquivo de saída
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    agora = datetime.now()
    fname_base = sanitize_filename(report_name)
    output_filename = f"{fname_base}_{agora.strftime('%d%m%Y_%H%M%S')}_report.xlsx"
    output_path = REPORT_DIR / output_filename

    # Salva usando a função que preserva o modelo
    ok, err = salvar_df_no_modelo_com_table(
        df_salvar,
        str(output_path),
        str(caminho_modelo),
        remove_report=False
    )

    if not ok:
        # Fallback de segurança caso o modelo falhe
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            df_salvar.to_excel(writer, index=False, sheet_name="Base")

    return output_path⚠️ Ponto de Atenção para o views.py (Django)Para esse script funcionar, ele precisa do arquivo Report_RelReneg.xlsx (o modelo).
Lembre-se de colocar esse arquivo dentro da pasta apps/api/modelos/ no seu projeto do GitHub.Quando você for chamar esse script lá no seu views.py, vai ficar assim:python1234567891011from scripts.diversos import run as gerar_diversos
import os
from django.conf import settings

# ... dentro do seu get_excel ...
elif report_type == 'diversos':
    # Caminho fixo do modelo no servidor
    caminho_modelo = os.path.join(settings.BASE_DIR, 'modelos', 'Report_RelReneg.xlsx')
    
    # Chama a função passando: Lista de NSEQ, Arquivo feito Upload, Arquivo Modelo
    caminho_arquivo = gerar_diversos(nseq_list, temp_path, caminho_modelo)from scripts.diversos import run as gerar_diversos
import os
from django.conf import settings

# ... dentro do seu get_excel ...
elif report_type == 'diversos':
    # Caminho fixo do modelo no servidor
    caminho_modelo = os.path.join(settings.BASE_DIR, 'modelos', 'Report_RelReneg.xlsx')
    
    # Chama a função passando: Lista de NSEQ, Arquivo feito Upload, Arquivo Modelo
    caminho_arquivo = gerar_diversos(nseq_list, temp_path, caminho_modelo)
    show_generation_popup(summary, output_dir)

import os
from django.http import HttpResponse
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

# 1. Importando os seus scripts (descomente conforme for criando os arquivos .py)
from scripts.bradesco import processar_relatorio_bradesco
#from scripts.casas_bahia_report import processar_relatorio_casas_bahia
#from scripts.tim import processar_relatorio_tim
#from scripts.claro_distrato_report import processar_relatorio_claro_distrato
#from scripts.claro_renovacao_report import processar_relatorio_claro_renovacao
#from scripts.Diversos_RelReneg import processar_relatorio_diversos

@api_view(['GET'])
def health_check(request):
    return Response({"status": "ok", "message": "API Django rodando!"})

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def get_excel(request):
    print("=== REQUISIÇÃO CHEGOU NO DJANGO ===")
    print("DADOS (Texto):", request.data)
    print("ARQUIVOS:", request.FILES)
    """Recebe a planilha do frontend, roteia para o script correto e devolve o Excel"""
    
    try:
        # Captura os dados enviados pelo Lovable e padroniza para minúsculo
        report_type = request.data.get('report_type', '').strip().lower()
        nseq = request.data.get('nseq', '')
        planilha_renegociacao = request.FILES.get('planilha_renegociacao')
        
        print(f"Tipo: {report_type} | NSEQ: {nseq} | Planilha: {planilha_renegociacao}")
        
        # Validações iniciais
        if not planilha_renegociacao:
            print("ERRO: Planilha não encontrada no request.FILES")
            return Response({"error": "A planilha de renegociação não foi enviada."}, status=400)
        
        if not nseq:
            print("ERRO: NSEQ vazio")
            return Response({"error": "Nenhum NSEQ foi informado."}, status=400)

        # ==========================================
        # ROTEAMENTO (O Maestro)
        # ==========================================
        arquivo_processado = None
        nome_arquivo_saida = "Relatorio_Gerado.xlsx"

        if report_type == 'bradesco':
            arquivo_processado = processar_relatorio_bradesco(planilha_renegociacao, nseq)
            nome_arquivo_saida = "Bradesco_Report.xlsx"
            
        elif report_type == 'casas bahia':
            arquivo_processado = processar_relatorio_casas_bahia(planilha_renegociacao, nseq, arquivo_modelo)
            nome_arquivo_saida = "CasasBahia_Report.xlsx"
            
        elif report_type == 'tim':
            arquivo_processado = processar_relatorio_tim(planilha_renegociacao, nseq, arquivo_modelo)
            nome_arquivo_saida = "TIM_Report.xlsx"
            
        elif report_type == 'claro distrato':
            arquivo_processado = processar_relatorio_claro_distrato(planilha_renegociacao, nseq, arquivo_modelo)
            nome_arquivo_saida = "ClaroDistrato_Report.xlsx"
            
        # Aceita com ou sem acento para evitar bugs de digitação no frontend
        elif report_type == 'claro renovacao'
            arquivo_processado = processar_relatorio_claro_renovacao(planilha_renegociacao, nseq, arquivo_modelo)
            nome_arquivo_saida = "ClaroRenov_Report.xlsx"
            
        elif report_type == 'diversos':
            # Descomente a importação lá no topo: from scripts.Diversos_RelReneg import processar_relatorio_diversos
            arquivo_processado = processar_relatorio_diversos(planilha_renegociacao, nseq, arquivo_modelo)
            nome_arquivo_saida = "Diversos_Report.xlsx"
            
        else:
            return Response({"error": f"O tipo de relatório '{report_type}' é inválido ou não existe."}, status=400)

        # ==========================================
        # RETORNO UNIFICADO
        # ==========================================
        if arquivo_processado:
            response = HttpResponse(
                arquivo_processado.getvalue(),
                content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
            response['Content-Disposition'] = f'attachment; filename="{nome_arquivo_saida}"'
            return response

    except ValueError as ve:
        # Captura erros de regra de negócio (ex: "NSEQ não encontrado na base")
        return Response({"error": str(ve)}, status=400)
    except Exception as e:
        # Captura erros críticos do Python/Pandas
        return Response({"error": f"Erro interno no servidor: {str(e)}"}, status=500)

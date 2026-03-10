import os
import io
import pandas as pd # Certifique-se de ter pandas e xlsxwriter no requirements.txt
from django.conf import settings
from django.http import HttpResponse
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

# 1. Endpoint GET /api/health (Mantido igual)
@api_view(['GET'])
def health_check(request):
    return Response({"status": "ok", "message": "API Django rodando perfeitamente no Railway!"})

# 2. Endpoint POST /api/scrape (Mantido igual)
@api_view(['POST'])
def run_scraper(request):
    return Response({"status": "success", "message": "Scraping iniciado/concluído com sucesso!"})

# 3. NOVO Endpoint POST /api/excel (Conectado com o Lovable)
@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser]) # CRÍTICO: Permite receber arquivos (FormData)
def get_excel(request):
    """Recebe a planilha do frontend, processa e devolve o Excel gerado"""
    
    try:
        # 1. Capturar os parâmetros de texto enviados pelo frontend Lovable
        tipo_relatorio = request.data.get('tipo_relatorio', 'Padrao')
        nseq = request.data.get('nseq', '')
        
        # 2. Capturar os arquivos enviados
        arquivo_base = request.FILES.get('arquivo_base')
        # arquivo_modelo = request.FILES.get('arquivo_modelo') # Se for usar o modelo opcional
        
        if not arquivo_base:
            return Response({"error": "Nenhuma planilha base foi enviada."}, status=400)

        # 3. Lógica de Analista de Dados: Ler o arquivo recebido em memória com Pandas
        # Como arquivo_base é um objeto em memória (InMemoryUploadedFile), o Pandas lê direto
        df = pd.read_excel(arquivo_base)
        
        # ---> AQUI VOCÊ APLICA SUAS REGRAS DE NEGÓCIO <---
        # Exemplo: Se o usuário digitou NSEQs, vamos filtrar o DataFrame
        if nseq:
            # Transforma a string "12345, 12332" em uma lista ['12345', '12332']
            lista_nseq = [n.strip() for n in nseq.split(',')]
            # Supondo que sua planilha tenha uma coluna chamada 'NSEQ'
            # df = df[df['NSEQ'].astype(str).isin(lista_nseq)] 
        
        # 4. Salvar o DataFrame processado em um buffer de memória (não salva no HD do Railway)
        output = io.BytesIO()
        
         # Mude o engine para 'openpyxl' (que já está no seu requirements.txt)
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Relatorio_Gerado')
        
        output.seek(0) # Volta o ponteiro para o início do arquivo
        
        # 5. Retornar o arquivo diretamente como binário (Blob) para forçar o download no navegador
        response = HttpResponse(
            output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="Relatorio_{tipo_relatorio}.xlsx"'
        
        return response

    except Exception as e:
        return Response({"error": f"Erro ao processar planilha: {str(e)}"}, status=500)

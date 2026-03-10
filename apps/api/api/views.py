import os
import io
import pandas as pd
from django.conf import settings
from django.http import HttpResponse
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

# ... (Mantenha seus endpoints health_check e run_scraper aqui) ...

@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def get_excel(request):
    """Recebe a planilha do frontend (via Edge Function), processa e devolve o Excel gerado"""
    
    try:
        # 1. Capturar os parâmetros com os nomes EXATOS que o Lovable está enviando
        report_type = request.data.get('report_type', 'Padrao')
        nseq = request.data.get('nseq', '')
        
        # 2. Capturar os arquivos com os nomes EXATOS
        planilha_renegociacao = request.FILES.get('planilha_renegociacao')
        modelo = request.FILES.get('modelo') # Opcional
        
        if not planilha_renegociacao:
            return Response({"error": "A planilha de renegociação não foi enviada."}, status=400)

        # 3. Lógica de Analista de Dados: Ler o arquivo recebido em memória com Pandas
        df = pd.read_excel(planilha_renegociacao)
        
        # ---> AQUI VOCÊ APLICA SUAS REGRAS DE NEGÓCIO <---
        # Exemplo: Filtro de NSEQ
        # if nseq:
        #     lista_nseq = [n.strip() for n in nseq.split(',')]
        #     df = df[df['NSEQ'].astype(str).isin(lista_nseq)] 
        
        # 4. Salvar o DataFrame processado em um buffer de memória usando openpyxl
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Relatorio_Gerado')
        
        output.seek(0)

        # 5. Retornar o arquivo diretamente como binário (Blob)
        response = HttpResponse(
            output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="Relatorio_{report_type}.xlsx"'
        
        return response

    except Exception as e:
        return Response({"error": f"Erro ao processar planilha: {str(e)}"}, status=500)

    except Exception as e:
        return Response({"error": f"Erro ao processar planilha: {str(e)}"}, status=500)

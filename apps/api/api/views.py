import os
import tempfile
import base64
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

# 1. Endpoint GET /api/health
@api_view(['GET'])
def health_check(request):
    """Retorna o status da API para o frontend saber que está online"""
    return Response({"status": "ok", "message": "API Django rodando perfeitamente no Railway!"})

# 2. Endpoint POST /api/scrape
@api_view(['POST'])
def run_scraper(request):
    """Endpoint para acionar o seu script de scraping (vivareal.py)"""
    # Aqui você pode pegar parâmetros enviados pelo frontend, ex:
    # parametros = request.data
    
    # TODO: Importar e rodar a função principal do seu vivareal.py aqui
    # ex: from scripts.vivareal import iniciar_scraping
    # iniciar_scraping()

    return Response({
        "status": "success", 
        "message": "Scraping iniciado/concluído com sucesso!"
    })

# 3. Endpoint POST /api/excel
@api_view(['POST'])
def get_excel(request):
    """Lê o arquivo Excel, converte para Base64 e envia para o frontend baixar"""
    
    # Caminho do arquivo Excel (ajuste o nome conforme o arquivo gerado pelo seu script)
    # Pela imagem anterior, vi que você tem um 'resultado.xlsx' na raiz do apps/api
    file_path = os.path.join(settings.BASE_DIR, 'resultado.xlsx')
    
    try:
        # Abre o arquivo em modo leitura binária (rb)
        with open(file_path, "rb") as excel_file:
            # Converte para base64 e depois decodifica para string (exigência do JSON)
            encoded_string = base64.b64encode(excel_file.read()).decode('utf-8')
            
        return Response({
            "file_base64": encoded_string,
            "filename": "resultado_vivareal.xlsx"
        })
        
    except FileNotFoundError:
        return Response(
            {"error": "Arquivo Excel ainda não foi gerado ou não foi encontrado."}, 
            status=404
        )

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
        
        # --- DEBUG PARA O RAILWAY ---
        # Esses prints vão aparecer na aba "Deploy Logs" do Railway. 
        # É a melhor forma de você ver o que o Lovable enviou.
        print(f"--- DEBUG RELATÓRIO ---")
        print(f"Tipo recebido: {report_type}")
        print(f"NSEQ recebido: {nseq}")
        print(f"Colunas do Excel: {df.columns.tolist()}")
        
        # ---> APLICAÇÃO DA REGRA DE NEGÓCIO (FILTRO NSEQ) <---
        if nseq:
            # 1. Transforma a string recebida (ex: "2594, 1234") em uma lista limpa de strings ['2594', '1234']
            lista_nseq = [str(n).strip() for n in nseq.split(',') if str(n).strip()]
            
            # 2. Verifica se a coluna 'NSEQ' realmente existe no Excel (Case sensitive)
            # Ajuste 'NSEQ' para o nome exato do cabeçalho da sua planilha, se for diferente
            coluna_chave = 'NSEQ' 
            
            if coluna_chave in df.columns:
                # 3. O SEGREDO: Converte a coluna do Excel para String e remove espaços em branco
                # Isso garante que "2594 " (Excel) dê match com "2594" (Frontend)
                df[coluna_chave] = df[coluna_chave].astype(str).str.strip()
                
                # 4. Aplica o filtro: Traz apenas as linhas onde o NSEQ está na lista digitada
                df = df[df[coluna_chave].isin(lista_nseq)]
                
                print(f"Linhas após o filtro: {len(df)}")
                
                # Opcional: Se o filtro zerar a base, você pode avisar o usuário
                if df.empty:
                    return Response({"error": f"Nenhum dado encontrado para os NSEQs: {nseq}"}, status=404)
            else:
                return Response({"error": f"A coluna '{coluna_chave}' não foi encontrada na planilha anexada."}, status=400)
        
        # 4. Salvar o DataFrame processado em um buffer de memória usando openpyxl
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Relatorio_Gerado')

        # 5. Retornar o arquivo diretamente como binário (Blob)
        response = HttpResponse(
            output.getvalue(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="Relatorio_{report_type}.xlsx"'
        
        return response

    except Exception as e:
        return Response({"error": f"Erro ao processar planilha: {str(e)}"}, status=500)

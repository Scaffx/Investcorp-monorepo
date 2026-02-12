# Investcorp - App de Renegociação

Aplicação React + Vite para cadastrar, acompanhar e renegociar pedidos da Investcorp. Inclui gerenciamento de SLA, agendamento de visitas (RP), controle de custos e relatórios.

## Funcionalidades
- Cadastro guiado de renegociações com dados do cliente, pedidos, agências, solicitante, SLA e responsável administrativo.
- Consulta e edição com buscas encadeadas, status editável, pílulas de SLA com cores e ações rápidas (agendar RP, custos, exclusão).
- Agendamento de RP com prospector, datas de ida/volta, cálculo de dias de viagem e SLA do prospector.
- Módulo de custos de viagem e tela de relatório (download placeholder) para consolidação.
- Persistência local via `localStorage` (registros, tema, sessão), sem backend obrigatório.

## Autenticação
- Usuário padrão: `invest`
- Senha padrão: `corpinvest`
- Botão "Pular" libera acesso rápido em ambientes de teste.
- A sessão é gravada em `localStorage` (`auth-ok`); use "Sair" para limpar.

## Configuração rápida
- Requisitos: Node.js 18+
- Instalação: `npm install`
- Ambiente de desenvolvimento: `npm run dev`
- Build de produção: `npm run build`
- Pré-visualização do build: `npm run preview`
- Testes unitários (Vitest): `npm test`

## Fluxo e dados
- Registros ficam em `localStorage` (`cad-registros`); cada entrada recebe `createdAt` e, quando concluída, `concluidoEm`.
- O SLA pode ser informado como data (ISO ou BR) ou como dias; se for numérico, o sistema soma à data de acionamento (ou `createdAt`) para projetar o prazo.
- Status suportados incluem `AGUARDANDO AGENDAMENTO`, `AGENDANDO`, `AGENDADO`, `AGUARDANDO SLA`, `CUSTOS PENDENTES` e `CONCLUIDO` (marca conclusão e recalcula SLA).
- Tema claro/escuro invertido é salvo em `localStorage` (`themeInvert`).

## Estrutura principal
- `src/pages/Cadastrar.jsx`: formulário passo a passo de criação.
- `src/pages/Consultar_editar.jsx`: tabela com filtros, edição inline e ações rápidas.
- `src/pages/AgendarRp.jsx`: agendamento de RP e SLA do prospector.
- `src/pages/CustosViagem.jsx`: custos e comprovantes da viagem.
- `src/pages/Relatorio.jsx`: ponto de entrada para relatórios.
- `src/helpers.js`: utilitários de data, SLA e opções estáticas.
- `src/ui.jsx`: componentes de UI compartilhados (barra de busca, seções, spinner).

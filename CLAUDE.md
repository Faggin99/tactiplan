# Sports Platform - Contexto Completo do Projeto

## O que e este projeto
Plataforma web para treinadores de futebol/futsal. Funcionalidades:
- Gestao de treinos semanais (microciclos com 7 sessoes, cada uma com 6 blocos de atividades)
- Gestao de jogos (escalacao, eventos ao vivo, estatisticas)
- Plantel de atletas (agrupados em G1/G2/G3/Transicao/DM)
- Multi-clube (cada usuario pode ter varios clubes)
- Quadro tatico interativo (campo 2D com jogadores, animacao, exportacao de video)
- Estatisticas e relatorios com graficos

## Stack
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + Konva.js (canvas tatico)
- **Backend**: Node.js + Express + PostgreSQL self-hosted
- **Auth**: JWT (7d), bcrypt
- **Storage**: Local filesystem + Nginx
- **Email transacional**: Brevo SMTP (dominio faggin.com.br autenticado)
- **Pagamentos**: Mercado Pago (Assinaturas)
- **Monitoramento**: Sentry
- **Desktop**: Electron (empacota frontend)

## Dominio e Infraestrutura
- **Landing**: tactiplan.faggin.com.br (servida por nginx em /var/www/sports-platform/landing/)
- **App**: app.tactiplan.faggin.com.br (SPA Vite build em /var/www/sports-platform/frontend/dist/)
- **VPS IP**: 207.246.114.192
- **Stack VPS**: Node.js 20 + PostgreSQL 16 + Nginx + PM2 + Certbot

## Arquitetura Multi-Tenant
Cada usuario e um "tenant". Todas as tabelas tem `tenant_id` que referencia `users.id`.
Isolamento feito na camada da API (WHERE tenant_id = usuario_logado).

## Banco de Dados - 16 Tabelas
O schema completo esta em MIGRATION_VPS.md secao 2.2.
Tabelas principais: users, clubs, athletes, training_microcycles, training_sessions,
training_activity_blocks, training_activities, contents, stages, activity_titles,
training_activity_contents, training_activity_stages, training_activity_files,
match_players, match_events, tactical_plays.

## Endpoints da API
Todos os endpoints estao documentados em MIGRATION_VPS.md secao "FASE 3".
Resumo: /api/auth/*, /api/clubs/*, /api/athletes/*, /api/microcycles/*,
/api/sessions/*, /api/contents, /api/stages, /api/titles/*, /api/games/*,
/api/stats/*, /api/plays/*, /api/files/*, /api/competitions/*, /api/external/*

## Multi-clube (21/10/2026: 1 clube ATIVO + arquivados sem limite)
- Plano Clube / Clube Anual: `features.max_clubs = 1` clube ATIVO. Lifetime / admin: ilimitado.
- Arquivar: `clubs.archived_at` (migration 055). Clube arquivado = só leitura (histórico e relatórios),
  some do seletor (fica em "Arquivados" na tela Cadastros › Clubes) e NÃO conta no limite.
  `POST /api/clubs/:id/archive` · `POST /api/clubs/:id/unarchive` (402 ADDON_REQUIRED sem vaga) · `GET /api/clubs/limit`.
  Trava de escrita: `src/utils/clubArquivado.js` (chamada no fim do authMiddleware) → 409 `CLUB_ARCHIVED`.
- Add-on: `subscriptions.extra_club_slots` (INT) soma clubes ATIVOS extras (R$20/mês). Sem tela de compra:
  "fale com a gente" → `UPDATE subscriptions SET extra_club_slots = 1 WHERE id = ...`
- `workspaces.tipo` ('clube' | 'comissao' | NULL): "Você é" do cadastro; só ajusta textos (`PUT /api/workspaces/:id/tipo`).
- Biblioteca da CONTA (vale pra todos os clubes): conteúdos, submomentos (stages), títulos de atividade
  e jogadas do quadro (`tactical_plays`, desde 21/10/2026). Em jogadas, `club_id` é só "criada em"
  (gravado na criação, não filtra a lista, não muda ao editar; a lista mostra "criada em <clube>").
  Clube arquivado não trava biblioteca nem jogadas (ISENTAS em `clubArquivado.js`).
- Nomes de pessoas (users.name, athletes.name) passam por `formatarNome` ao salvar
  (`backend-node/src/utils/formatarNome.js` = `frontend/src/lib/formatarNome.js`, teste de paridade).

## Integração externa de dados (api-football)
- Status: estrutura pronta, **NÃO ATIVADA**. Sem `API_FOOTBALL_KEY` no .env os
  endpoints respondem 503 e o botão "Importar jogos" não aparece no frontend.
- Pra ativar: assinar plano em https://dashboard.api-football.com (US$ 19/mês Pro),
  setar `API_FOOTBALL_KEY=<chave>` no .env do backend-node e `pm2 reload sports-api`.
- IDs úteis (Brasil): Série A=71, B=72, C=75, **D=80**, Copa do Brasil=73.
- Endpoints backend (todos exigem auth):
  - GET  /api/external/status — lista providers e flag enabled
  - GET  /api/external/api-football/teams?search=Uberlandia
  - GET  /api/external/api-football/leagues?country=Brazil&season=2026
  - GET  /api/external/api-football/preview?league_id=80&season=2026&team_id=...
  - POST /api/external/api-football/import (body: competition_id, team_id, league_id, season, event_ids[])
- Frontend: CompetitionsConfigPage detecta enabled via `externalApiService.isApiFootballEnabled()`
  e renderiza um ícone Download em cada linha de campeonato → abre `ImportFixturesModal`
  (modal de 3 passos: buscar time → liga+temporada → preview com checkbox).
- Dedup: jogos importados ficam com `external_event_id` + `external_provider`. Reimportar
  o mesmo fixture faz UPDATE no lugar de INSERT.
- `external_locked_at`: se um coach editar manualmente um jogo importado, marcar essa coluna
  via UPDATE faz o futuro sync incremental ignorar. (Hoje só dedup; sync cron diário não
  implementado — sai num sprint futuro se a feature decolar.)

## Billing (Assinaturas) — F1 (15/10/2026): SEM plano Free
- Desde 21/10/2026 SÓ o Clube é vendido: `clube` R$120/mês e `clube_annual` R$1.200/ano (migration 054;
  dono + 5 convidados, até 5 categorias, 1 clube ativo). `pro`/`pro_annual` ("Essencial") estão is_active=false:
  só exibem o nome de assinaturas antigas. Nomes em `shared/planos.json` (fonte única back+front); ids internos não mudam.
- `billing.getEffectiveSubscription({userId, workspaceId})` decide pelo DONO da workspace: admin → cortesia
  (`users.cortesia_permanente` ou `LIFETIME_EMAILS`) → assinatura paga usável → senão SÓ LEITURA
  (`plan_id='inactive'`, `read_only=true`). O plano `free` não dá mais acesso.
- `requireActiveSubscription`: escrita em conta só leitura → 402 `READ_ONLY` (exceções: auth, conta, billing, admin,
  invites, workspaces, `microcycles/ensure`, dismiss de aviso). `/api/plays` segue com 402 `PLAN_REQUIRED` por feature.
- Convites: limite por `billing.limiteConvidados` (402 `MEMBER_LIMIT`), no convite e no aceite.
- Checkout exige `conta_nome`, `responsavel_nome`, `responsavel_documento` (CPF/CNPJ com DV) → `workspaces.responsavel_*`.
- Cadastro não cria assinatura (env `SIGNUP_TRIAL_DAYS>0` ainda liga avaliação do plano de entrada).
- Admin: `POST /api/admin/users/:id/cortesia {ativo, motivo}`. Virada: `backend-node/scripts/virada-f1.js` (dry-run padrão).
- Integracao Mercado Pago (Preapproval / Assinaturas recorrentes); webhook `POST /api/billing/webhook` (HMAC SHA-256).
  IAP iOS via RevenueCat (`/api/billing/revenuecat/webhook`, SANDBOX ignorado salvo env).

## Status atual da migracao
Frontend totalmente migrado para a API Node.js. Sem referencias ativas ao Supabase.

## Convencoes
- Datas sempre em UTC no banco, formatadas em pt-BR no frontend
- Semanas identificadas como "YYYY-WW" (ISO week)
- UUIDs para todas as PKs (gen_random_uuid())
- Senhas com bcrypt
- JWT para auth (exp 7 dias)
- Upload de arquivos: max 50MB, tipos permitidos: imagens, video, PDF

## App nativo (T1, 21/10/2026): token do app também abre o web
- `authMiddleware` aceita `Bearer tpa_…` (app_sessions, migration 056) além do JWT: valida pelo hash
  (não revogado, não vencido, conta não removida, renova com o uso) e monta o MESMO `req.user`
  (`req.user.viaApp = true`, `req.appSessao`). `requireActiveSubscription` também reconhece o token
  (só leitura 402 vale no app). Token do app NÃO abre `/api/admin/*` nem `/api/billing/*` (403 ROTA_FORA_DO_APP).
  Banco fora na conferência = 503 (nunca 401: o app sai da conta em qualquer 401).
- Trocar/redefinir a senha no web (`PUT /api/auth/password`, `POST /api/auth/reset`) revoga TODAS as
  sessões do app da pessoa (`appSessoes.revogarTodasDoUsuario`).
- `POST /api/app/convites/:token/recusar` (BFF): só o dono do e-mail, só pendente; apaga o convite.
- Testes: `tests/app-token-web.test.js` (revogado/vencido 401, workspace alheia, 402 READ_ONLY, 409 CLUB_ARCHIVED).

## App nativo T3 (22/10/2026): Elenco, Staff, Estatísticas, Cadastros
- Usa as rotas do web com o token do app. Novidades no servidor: `POST /api/reports/plantel {club_id}` (athletes:view,
  PDF por grupo), `GET /api/clubs/:id/members` com `permissions` e `limite_convidados`, `POST …/members/:id/resend`.
- Paridade: `native/paridade/t3.json` gerado do web por `native/paridade/gerar-t3.mjs` (teste `paridade-app-t3`).

## Períodos do dia (22/10/2026): Manhã · Tarde · Noite
- Cada período = 1 linha de `training_sessions` (mesma data/clube/workspace) com `periodo` ('manha'|'tarde'|'noite');
  dia de período único = `periodo` NULL (todos os dados antigos). Migrations 057 (coluna + único
  `(workspace_id, date, club_id, COALESCE(periodo,'unico'))`) e 058 (larga o único antigo). Ordem pelo nome.
- Regras (`src/services/periodos.js`): máx 3; descanso é do dia inteiro (só com 1 período); 1 período de jogo por dia
  (os outros são treino — "Manhã treino + Tarde jogo"). Tipo fica em cada período (`session_type`).
- API: `POST /api/sessions/:id/periodos {novo, atual?}` (atual = nome do treino que já existia, obrigatório no 1º),
  `PUT /api/sessions/:id/periodo {periodo}` (trocar horário), `DELETE /api/sessions/:id/periodo` (apaga atividades,
  anexos e arquivos; sobrando 1, ele mantém o nome). `ensure` usa `ON CONFLICT DO NOTHING`.
- `GET /api/microcycles`: `sessions` continua 1 por dia (o 1º período) — compatível com o app T1/T2;
  dia com 2+ períodos traz `periodos` (cada um completo, com blocos).
- Estatísticas: o dia conta 1 sessão; minutos/pilares/conteúdos/predominância/distância somam os períodos.
  Relatórios: ficha com os períodos em sequência (`so_periodo: true` = só o de session_id), semana com "90+60".
- Testes: `tests/periodos.test.js` e `tests/periodos-db.test.js` (Postgres descartável via `PERIODOS_TEST_DB`;
  banco `sports_periodos_test` = schema de prod + 057/058).
- Desde 22/10 (noite): TODO dia de treino mostra o período. `periodo` NULL continua no banco (SEM migração de dados)
  e vale **Manhã** (`periodoEfetivo` no back, `lib/periodos.js` no front, Kit/Kotlin no app). `PUT …/periodo` vale
  também no dia de 1 período (não descanso); `POST …/periodos` sem `atual` usa o nome do dia (ou Manhã); remover
  período NÃO volta a NULL (o que sobra mantém o nome). Programação: "Manhã · Tático" numa linha (reticências).
  Jogo e descanso de período único: sem período (só "Jogo"/"Descanso"). Ficha de 1 período: "· Manhã" no título.

## Período de AVALIAÇÃO (22/10/2026)
- `session_type = 'assessment'` ("Avaliação"), por período como os outros tipos. Migration 059 (só ADD):
  `training_sessions.assessment_types TEXT[]` (lista fixa: fisica, tecnica, tatica, fisiologica, antropometrica,
  psicologica, outra) + `assessment_other VARCHAR(60)` (texto de "Outra"; texto implica 'outra'; 'outra' exige texto).
- Regras (`src/services/periodos.js`: `normalizarAvaliacao`, `rotulosAvaliacao`, `ehAvaliacao`): fica ao lado de treino
  ou jogo, ou sozinha; descanso segue do dia inteiro; 1 jogo por dia. SEM blocos (os 6 blocos continuam no banco,
  só não aparecem). Mostra o período como o treino ("Manhã · Avaliação").
- API: `PUT /api/sessions/:id/type {session_type:'assessment', assessment_types, assessment_other}` (outros tipos zeram
  os campos); `POST /api/sessions/:id/periodos {novo, atual?, tipo:'training'|'assessment', assessment_types?, assessment_other?}`.
  400 `AVALIACAO_INVALIDA`.
- Decisão do dono: avaliação NÃO aparece nas estatísticas (nem minutos, pilares, sessões, nem contagem própria).
  `getTrainingStats` ignora os períodos de avaliação (e atividades antigas deles); `getPeriodSessions` devolve 0 minutos.
- Aparece: Programação (estado AVALIAÇÃO + tipos na coluna, 1ª linha e carrossel), ficha do dia (card
  "Avaliação · tipos"), PDF da semana (dia com etiqueta AVALIAÇÃO e os tipos; dia misto "Treino + Avaliação"), app (Semana/Dia).
- Paridade do app: `native/paridade/avaliacao.json` gerado de `frontend/src/lib/periodos.js` por
  `native/paridade/gerar-avaliacao.mjs` (`--check`). Mexeu no lib → regere e comite o JSON.
- Divisão "90+60" (web, PDF, app) só quando 2+ períodos TÊM minutos — nunca "125+0" (`divisaoMinutos`).
- PDF de treino, MICROCICLO: barra fina horizontal empilhada pelos pilares do dia (`sessionsByDate[].pillarMinutes`,
  cada atividade no pilar do 1º conteúdo), comprimento proporcional ao maior dia, total em destaque; dia sem minutos "—".
  Períodos longos: coluna por semana empilhada pelos pilares.
- Testes: `tests/avaliacao.test.js` (puro) e `tests/avaliacao-db.test.js` (banco descartável `PERIODOS_TEST_DB`, com 059).

## App nativo T5 (22/10/2026): QUADRO TÁTICO nativo (iOS SwiftUI + Android Compose)
- Aba Quadro: jogadas da CONTA (`/api/plays` como está), busca, "criada em <clube>", criar/duplicar/renomear/excluir
  (`tactical:edit` + conta com assinatura; só leitura = só assistir). Assistir EM PÉ (play 0,5–2×, trajetórias);
  editor DEITADO (iOS: AppDelegate + `forcarOrientacao`; Android: `requestedOrientation` num Dialog de tela cheia).
- Mesmo formato do web (keyframes/elements/drawings, ids `tipo-<ms>-<n>`): o app guarda cada peça/desenho/quadro
  como JSON cru e só mexe nas chaves que o web mexe; salvar = `{...getPlayData(), name, description, club_id}`.
- Desenho nativo (CoreGraphics / android.graphics) copiado do FieldBackground/PlayerToken/BallToken/MarkerToken/
  DrawingLayer/TrajectoryLayer; o MESMO desenho gera o vídeo MP4 (AVAssetWriter / MediaCodec+MediaMuxer) no
  ritmo do web: 30 fps, 46 imagens por transição + 1 s parado (`linhaDoVideo`).
- Paridade: `native/paridade/quadro.json` gerado por `native/paridade/gerar-quadro.mjs` (executa o
  `useTacticalBoard.js` com um React mínimo + fieldDimensions/defaultFormations/interpolation + Konva); teste
  `paridade-app-quadro`. Mexeu no quadro do web → regere e rode Kit/Android.
- Migration 060: `tactical_plays.field_type` aceita `football_7` (antes o web oferecia F7 e salvar dava 500).

## Relatórios/estatísticas (24/10/2026)
- Estatísticas de jogos: filtro `competition_id` (id | 'none' = sem campeonato) em `GET /api/stats/games` e no PDF `jogos`.
- `POST /api/reports/jogo {session_id}`: relatório de UM jogo (template `templates/jogo.js`, builder `buildGameSheet`);
  no web, menu Exportar do modal do jogo ("Convocação (PDF)" + "Relatório do jogo (PDF)"). App ainda não tem.
- Plantel: o web usa o PDF do servidor (`plantel`, aceita `category_id`); jsPDF saiu. Coluna "Último clube".
- PDF da semana: dia com 2+ períodos lista cada período (conteúdo + minutos) — `sessionsByDate[].contentsByPeriod`.

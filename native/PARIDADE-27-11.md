# App nativo: paridade com o web (27/11/2026)

Spec comum a Android (native/android) e iOS (native/ios). As rotas são as do web; o app usa o próprio token (tpa_) com
`X-Workspace-Id`, como o resto do treino (ApiTreino). Textos em português do Brasil, sem window.confirm-like: confirmações com
o diálogo/alerta nativo do app, como já é feito no resto.

## 1. Treino de TRANSIÇÃO (migration 068) — número igual ao web
- `training_sessions.treino_transicao` (boolean) vem em cada dia/período do `GET /api/microcycles`. Só vale em treino.
- Regra web (`frontend/src/lib/periodos.js`): `ehTransicao(s) = tipo == treino && treino_transicao`. `minutosDaSessao` e
  `minutosGoleiro` = 0 na transição. `rotuloLinhaPeriodo` = "Manhã · Transição" (no lugar dos pilares). Fica fora do total do dia,
  da divisão "90+60" e dos pilares do dia. As atividades continuam aparecendo e editáveis.
- Paridade: `native/paridade/avaliacao.json` ganhou casos `linha` l7/l8, `divisao` d10/d11 e `minutos` m5/m6 com o campo
  `transicao` (= ehTransicao). Os testes de paridade existentes (AvaliacaoTest.kt / AvaliacaoTests.swift) devem ler
  `treino_transicao` da sessão e conferir também `transicao`.
- Marcar/desmarcar: `PUT /api/sessions/:id/type` com `{ session_type: 'training', opponent_name: null, treino_transicao: true|false }`
  (sem a chave o servidor mantém). Ao adicionar período de treino: `POST /api/sessions/:id/periodos` aceita `treino_transicao: true`.
  Na tela do dia (treino): um interruptor "Treino de transição" com a legenda "Treino de quem volta do DM. Fica fora do total do dia
  e das estatísticas." Linha da Semana: "Manhã · Transição"; detalhe mostra "Transição · fora do total".

## 2. Contagem de "atividades" (igual ao web e ao servidor)
- Academia e Ativação NÃO contam como atividade (os minutos contam); Treino de goleiro não conta nem soma.
  `ehBlocoAtivacao(nome)` = nome em {"Ativação", "Academia"} (trim, sem diferenciar maiúsculas). Usar em `resumoDoDia().atividades`
  (blocosComAtividade continua contando todos os blocos com atividade). Anexos continuam somando de todos.
- Goleiro: `resumoDoDia` ganha `minutosGoleiro` (soma do bloco Treino de goleiro; 0 em transição/avaliação). Mostrar "+N′ gol"
  ao lado do total do dia (Semana e Dia), como no web.

## 3. SESSÕES SALVAS (`/api/treinos-modelo`)
- `GET /api/treinos-modelo` → `{ data: [{ id, nome, descricao, criado_por, created_at, origem_data ('YYYY-MM-DD'|null),
  origem_periodo ('manha'|'tarde'|'noite'|null), atividades, minutos, goleiro, midias, blocos: [{ ordem, nome, titulo, conteudo,
  pilar, minutos, descricao, midias: [{ url, tipo: 'image'|'video'|'application', nome }] }] }] }` — já vem ordenado
  (dia do treino de origem, mais recente primeiro). training:view.
- `POST /api/treinos-modelo { nome (≤80), session_id }` → 201 `{id, nome}`; 400 "Esse treino ainda não tem atividades" / só treino.
- `PATCH /api/treinos-modelo/:id { nome }` renomeia. `DELETE /api/treinos-modelo/:id`.
- `POST /api/treinos-modelo/:id/aplicar { session_id, substituir? }` → 409 `{ code: 'TEM_ATIVIDADES', atividades: N }` se o
  treino já tem atividades: perguntar "Esse treino já tem N atividades. Substituir pelas da sessão salva?" e reenviar com
  `substituir: true`. Só em período de treino (o dia precisa existir: criar a semana antes com o ensure, como no salvar bloco).
- Telas: (a) na tela do Dia (período de treino com atividade, training:edit): ação "Salvar sessão" → pede o nome (padrão
  "Treino de <dia>, dd/mm") → POST; (b) ação "Usar sessão salva" no Dia (período de treino, training:edit) → lista → aplicar no
  período aberto; (c) lista "Sessões salvas" acessível pela aba Mais (e/ou um botão na Semana): cada linha com nome, origem
  ("Treino de sexta, 20/11 · Manhã"), "N atividades · N min" (+ "· +N′ gol" se goleiro > 0), barra dos pilares (pilar dos
  blocos ponderado por minutos), clique abre o detalhe (os blocos na ordem com título/conteúdo/minutos/descrição e as mídias
  abríveis pela URL do servidor) com Renomear, Excluir (confirmação) e "Usar em um dia" (escolhe a data; se o dia tiver 2+ períodos
  de treino escolhe o período; dia que não é treino → erro amigável).

## 4. ANEXOS DA SESSÃO (fora das atividades)
- `GET /api/files/session/:sessionId` (já usado) → filtrar `activity_id == null`.
- `POST /api/files/upload` multipart: `session_id` ANTES de `file` (sem `activity_id`), `title` opcional. Até 15 por treino,
  50 MB; aceita foto, vídeo, PDF, planilha, Word, PowerPoint, CSV. `DELETE /api/files/:id`, `PATCH /api/files/:id { title }`.
- Tela do Dia (por período): seção "Anexos da sessão" (lista com ícone por tipo, toque abre/compartilha como os anexos da
  atividade; enviar com o mesmo seletor de arquivos/fotos já usado; apagar com confirmação, training:delete). Texto de apoio:
  "Material extra do treino, fora das atividades. Não entra nas estatísticas; as fotos saem no fim da ficha."

## 5. ARQUIVOS DA SEMANA (comissão)
- `GET /api/arquivos-semana?week=YYYY-WW&club_id=X` → `{ data: [{ id, title, url, file_name, file_size, mime_type, created_at,
  enviado_por }] }`. `POST /api/arquivos-semana` multipart `week`, `club_id`, `title?`, `file` (campos ANTES do arquivo); 404 se a
  semana não existe → chamar o ensure (`POST /api/microcycles/ensure {week, club_id}`) antes. Até 30 por semana, 50 MB.
  `DELETE /api/arquivos-semana/:id`. Ver: training:view; enviar/apagar: training:edit.
- Tela: na Semana, ação "Arquivos da semana" (com o número quando > 0) → tela/folha com a lista (título, "tamanho · quem enviou ·
  dd/mm"), abrir, enviar, apagar. Texto: "Material da comissão para esta semana. Não entra nas estatísticas nem nos relatórios."

## 6. FOTOS DO RELATÓRIO: posição na ficha
- Opções agora (web, preferência v4): `posicao` = "esquerda" (PADRÃO) | "direita" | "fim". Rótulos: "Ao lado do bloco ·
  esquerda", "Ao lado do bloco · direita", "No final da ficha". "blocos" antigo (preferência salva) = "direita". Valor
  desconhecido/ausente = "esquerda" na ficha. A semana não tem posição (e vem SEM fotos marcadas por padrão — já é o servidor).
  Atualizar FotosRelatorio (Kit/dados) + a tela de opções + testes. O "Tamanho" vale nas três.

## 7. ESCUDOS DO JOGO na Semana
- Cada sessão de jogo do `GET /api/microcycles` traz `opponent_logo` (url relativa, pode ser null), `match_location`
  ('home'|'away'|'neutral'|null) e `match_kickoff` ("19:30"|null). Linha do dia de jogo na Semana e o cabeçalho do jogo no Dia:
  os dois escudos, MANDANTE primeiro × visitante (away = adversário primeiro), o nosso = logo do clube (se o app já tiver) ou
  iniciais/sigla; adversário sem imagem = iniciais do nome. Embaixo/ao lado: horário "19h30" quando houver (em vez de casa/fora).

## 8. GOLEIROS nas Estatísticas
- `GET /api/stats/training` já traz `goleiros: { minutes, sessions, activities, byContent: [{ content_id, name, dimension, count,
  minutes }] }`. Cartão "Treino de goleiro (paralelo)" na Estatísticas › Treino: minutos, treinos, atividades e os conteúdos
  (top 5, barra por minutos). Esconder quando minutes == 0 && activities == 0.

## 9. LADO DO ZAGUEIRO + CAMPOGRAMA no Elenco
- `athletes.lado_preferido` 'direita'|'esquerda'|'ambos'|null (GET/PUT/POST /api/athletes…; PUT só mexe quando a chave vem).
  Ficha do atleta: quando a posição é ZAG, pergunta "Joga por qual lado?" (Direita / Esquerda / Ambos / não informado). Lista:
  "ZAG · D" / "ZAG · E" / "ZAG · A".
- Campograma: no Elenco, alternar Lista | Campograma: campo em pé com os atletas (iniciais/foto, número, nome curto) empilhados
  no ponto da posição; zagueiros divididos por lado; DM (grupo DM / lesão aberta, a regra que o app já usa) em vermelho. Toque
  abre a ficha. Coordenadas: usar as do web `frontend/src/components/plantel/Campograma.jsx` / `backend-node/src/reports/campograma.js`.

## 10. EXCLUIR CONTA (exigência da Apple 5.1.1(v))
- `DELETE /api/auth/me { password }` (sem senha: conta só Google/Apple → corpo vazio). 401 "Senha incorreta". Apaga a conta e
  TODOS os clubes/dados de que o usuário é DONO; convidado só sai das equipes. Depois: sair (limpar sessão) e voltar ao login.
- Mais › Conta › "Excluir minha conta": tela/alerta com o aviso em texto claro ("Isso apaga sua conta e, se você for o dono,
  todos os clubes, atletas, treinos e jogos dela. Não dá para desfazer."), campo de senha, botão destrutivo.

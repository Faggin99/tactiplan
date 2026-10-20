# Redesign dos relatórios PDF do TactiPlan

> Documento de implementação para o Claude Code. Substitui os layouts atuais dos três relatórios exportados pela plataforma. A referência visual exata está em **`relatorios-preview.html`** (anexo, colocar em `docs/reports/`). Abra no navegador: a barra no topo troca a cor do time ao vivo e Ctrl+P gera o PDF A4.

---

## 0. Antes de começar (obrigatório)

1. **Localize o código atual dos relatórios.** Busque no repositório pelas strings que aparecem nos PDFs de hoje:
   - `DESEMPENHO EM JOGOS`, `GOLS PRÓ E CONTRA`, `DESTAQUES INDIVIDUAIS`
   - `ESTATÍSTICAS DE TREINO`, `DISTRIBUIÇÃO POR PILAR`, `TOP CONTEÚDOS POR PILAR`, `DISTÂNCIA IDEAL`
   - `Duração Total`, `Distância ideal`, `Treino -` (ficha diária)
   - `TACTIPLAN pg`, `Gerado em`
   - Também o botão **Exportar** da tela Planejamento › Estatísticas e a exportação da tela Programação.
2. **Identifique o pipeline de geração** (jsPDF desenhando à mão, `@react-pdf/renderer`, html2pdf/html2canvas, Puppeteer/Playwright no backend, `window.print()`…).
3. **Escolha a estratégia:**
   - Se o pipeline já é **HTML → PDF** (Puppeteer, Playwright, print do navegador, html2pdf): porte o HTML/CSS do protótipo diretamente para componentes.
   - Se for **jsPDF/pdfmake desenhando primitivas**: migre para **HTML → PDF** (preferência: Playwright/Puppeteer no backend com `page.pdf({ format: 'A4', printBackground: true })`; alternativa client-side: rota de impressão dedicada + `window.print()`). Rasterizar com html2canvas é o último recurso (texto vira imagem, perde nitidez e busca).
   - Se for **@react-pdf/renderer**: é aceitável manter, traduzindo o CSS do protótipo para `StyleSheet` (flex funciona; grid não — usar linhas flex). Gráficos viram `<Svg>`.
4. Os **dados já existem** (as telas mostram tudo). Reaproveite os mesmos selectors/queries das telas de Estatísticas e Programação; não duplique regra de negócio.
5. Mantenha os nomes de arquivo de download atuais (ex.: `Desempenho_<Time>_<Periodo>.pdf`).

---

## 1. O que muda e por quê

| Problema atual | Solução |
|---|---|
| Capa inteira só com título (pg 1/4) e páginas com 4 números perdidos | Header de time integrado na pág. 1; conteúdo começa imediatamente. Jogos: **4 → 2 págs**. Treino: **4 → 2 págs**. Ficha: **2 → 1 pág** |
| Gráficos vazios renderizados mesmo sem dados ("Formas de gols sofridos" em branco) | **Empty states** explícitos ("Nenhum gol sofrido no período") |
| Pizza de 100% com uma fatia | Barras horizontais com **todas as categorias** (zeros em cinza), comparáveis entre feitos/sofridos |
| Sem identidade do clube | Header, destaques e gráficos na **cor do time** (variável) |
| Ficha de sessão: lista solta + página 2 só com o total | Linha do tempo proporcional por pilar, blocos com minuto inicial/final, total no header, área de observações para campo |
| "Participação" ambígua (% de atividades) | Tabela mostra **% atividades** e **% tempo** lado a lado |
| Hierarquia tipográfica fraca | Poppins (números/títulos) + Inter (texto), números tabulares, rótulos em caixa-alta pequena |

---

## 2. Sistema visual

### 2.1 Página
- **A4 retrato** 210×297 mm, `@page { size: A4; margin: 0 }`, margens internas laterais **14 mm**.
- Cada página = `<section class="page">` com `height: 297mm; display:flex; flex-direction:column; overflow:hidden; break-after: page`.
- Estrutura: `header` → `main.body (flex:1)` → `footer`.
- `print-color-adjust: exact` e `-webkit-print-color-adjust: exact` no `body` (senão fundos coloridos somem no PDF).
- Nada de sombras/blur no PDF. Raio de borda padrão 3 mm (cards), 2–2,5 mm (blocos internos).

### 2.2 Tokens

```css
:root{
  /* ---- Derivados da cor do time (injetados em runtime, ver 2.3) ---- */
  --team:        #1B8A3E;  /* cor primária do time */
  --team-ink:    #14692F;  /* versão com contraste ≥ 4.5:1 sobre branco (textos/títulos) */
  --team-soft:   #E8F3EC;  /* team 14% sobre branco (trilhos, bordas de destaque) */
  --team-softer: #F4F9F6;  /* team 6% sobre branco (fundo de KPI destacado) */
  --on-team:     #FFFFFF;  /* texto sobre fundo --team (branco ou #0F172A) */

  /* ---- Neutros fixos ---- */
  --ink:#0F172A; --ink-2:#334155; --muted:#64748B; --faint:#94A3B8;
  --line:#E2E8F0; --line-2:#F1F5F9; --surface:#F8FAFC;

  /* ---- Semânticos fixos (NÃO variam com o time) ---- */
  --win:#16A34A; --draw:#D97706; --loss:#DC2626;

  /* ---- Pilares: tático na cor do time, demais em escala de cinza-azulado ---- */
  --p-tat: var(--team);   /* (ou --team-ink se o time for muito claro, ver 2.3) */
  --p-fis: #334155;
  --p-tec: #94A3B8;
  --p-psi: #CBD5E1;       /* 4º pilar, se existir */
}
```

Por que pilares em neutros: a cor do time é arbitrária (vermelho, amarelo, roxo…). Uma paleta categórica fixa colidiria com algum time. Tático (pilar principal) ganha a cor do clube; os demais usam slate, que nunca briga.

### 2.3 Cor do time → paleta (função obrigatória)

Criar `reports/theme/teamPalette.ts` e aplicar as variáveis no elemento raiz do relatório (`style={{'--team': ..., ...}}`). Fonte da cor: o campo de cor do time já usado na UI (o verde do breadcrumb "Uberlândia EC"). Fallback: `#1B8A3E`.

```ts
type Palette = { team: string; teamInk: string; teamSoft: string; teamSofter: string; onTeam: string; pTat: string };

const hexToRgb = (h: string): [number, number, number] => {
  h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};
const lum = (h: string) => hexToRgb(h)
  .map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
  .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a: string, b: string) => {
  const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

export function teamPalette(hex = '#1B8A3E'): Palette {
  const onTeam = contrast(hex, '#FFFFFF') >= contrast(hex, '#0F172A') ? '#FFFFFF' : '#0F172A';
  let ink = hex;
  for (let i = 0; i < 20 && contrast(ink, '#FFFFFF') < 4.5; i++) ink = mix(ink, '#000000', 0.08);
  return {
    team: hex,
    teamInk: ink,
    teamSoft: mix(hex, '#FFFFFF', 0.86),
    teamSofter: mix(hex, '#FFFFFF', 0.94),
    onTeam,
    // time muito claro (ex.: amarelo) → barras/pilar tático usam a versão escurecida
    pTat: contrast(hex, '#FFFFFF') < 2 ? ink : hex,
  };
}
```

Regras de uso:
- **Fundo** do header, dia de jogo, barras e anel → `--team`; texto sobre ele → `--on-team`.
- **Textos** coloridos (títulos de seção, tag "Treino") → sempre `--team-ink`, nunca `--team`.
- Barras de gráfico → `--p-tat` quando a cor pode ser clara demais (o protótipo usa `--team` nas barras; trocar para uma variável `--team-bar` = `pTat` é recomendado).
- Testar com: verde `#1B8A3E`, vermelho `#C8102E`, azul `#1D3C8F`, **amarelo `#FFD200`**, **preto `#111111`**, roxo `#6B2D8C` (botões no protótipo).

### 2.4 Tipografia
- **Poppins** 500/600/700/800 — títulos, números grandes, rótulos de seção.
- **Inter** 400/500/600/700 — texto, tabelas, legendas.
- `font-variant-numeric: tabular-nums` global.
- Fontes **embutidas localmente** (woff2 no bundle ou base64 no template do Puppeteer). Não depender de Google Fonts em runtime de geração; aguardar `document.fonts.ready` antes de gerar.

| Uso | Estilo |
|---|---|
| Nome do relatório (header) | Poppins 700, 19pt |
| Eyebrow do header | Inter 600, 7pt, caixa-alta, tracking .14em, opacidade .8 |
| Título de seção (`.sec`) | Poppins 600, 7.5pt, caixa-alta, tracking .1em, `--team-ink`, barrinha 1.2×3.5mm `--team` à esquerda; meta à direita em Inter 7pt `--faint` |
| Valor de KPI | Poppins 700, 17pt |
| Rótulo de KPI | Inter 600, 6.5pt, caixa-alta, `--muted` |
| Corpo / tabela | Inter 8.5pt |
| Cabeçalho de tabela | Inter 600, 6.5pt, caixa-alta, `--muted` |
| Rodapé | Inter 7pt, `--faint`; "TACTIPLAN" em 600 com tracking |

### 2.5 Componentes compartilhados

Criar em `reports/components/` (nomes sugeridos; seguir a convenção do repo):

| Componente | Descrição |
|---|---|
| `ReportPage` | Wrapper A4 com header (completo ou compacto), body e footer com paginação "n / total" |
| `ReportHeader` | **Completo (pág. 1):** faixa `--team`, escudo (logo do time se existir, senão círculo `--on-team` com sigla em `--team`), eyebrow (tipo do relatório), H1, meta (modalidade · período), badge à direita (intervalo de datas grande + contagem). Círculo decorativo `currentColor` 6% opacidade no canto superior direito. **Compacto (pág. 2+):** borda superior 3mm `--team`, escudo 8mm, nome do relatório + subtítulo da página, período à direita |
| `ReportFooter` | `TACTIPLAN · Gerado em dd/mm/aaaa, hh:mm` à esquerda, `n / total` à direita, linha superior `--line` |
| `SectionTitle` | `.sec` com meta opcional |
| `Card` | borda `--line`, raio 3mm, padding 4mm |
| `Kpi` | rótulo, valor, sub-legenda; variantes `pos` (verde), `neg` (vermelho), `nil` (valor "—" em `--faint`), `accent` (fundo `--team-softer`) |
| `ResultChip` | círculo 5.6mm V/E/D em `--win/--draw/--loss` |
| `BarRow` | rótulo 30mm · trilho `--line-2` 2mm · valor; linha com valor 0 fica toda em `--faint` |
| `RankTable` | posição, nome, barra proporcional ao líder, valor |
| `Ring` | SVG `viewBox 0 0 36 36`, `r=15.9`, `pathLength=100`, trilho `--team-soft`, arco `--team` com `stroke-dasharray="{pct} 100"`, rotacionado -90° |
| `StackBar` | barra 6mm segmentada por proporção; mostra rótulo dentro do segmento só se ≥ 12% |
| `EmptyState` | caixa tracejada `--line`, fundo `--surface`, texto `--faint` centralizado |
| `Chip` | pílula `--line-2` para grupos/submomentos |

Gráficos: **SVG inline ou divs com altura em %**. Não usar Chart.js/Recharts nos PDFs (canvas rasteriza e animações atrapalham a captura).

---

## 3. Relatório 1 — Desempenho em jogos (2 páginas)

### Contrato de dados
```ts
interface GamesReport {
  team: { name: string; shortName: string; color: string; logoUrl?: string; modality: string };
  period: { label: string; start: Date; end: Date; weekNumber?: number }; // "Microciclo", "4 Microciclos", "Semestre"...
  generatedAt: Date;
  games: Array<{ date: Date; round?: number; home: boolean; opponent: string; goalsFor: number; goalsAgainst: number; result: 'V'|'E'|'D'; videoUrl?: string }>;
  goalsForByType: Record<GoalType, number>;
  goalsAgainstByType: Record<GoalType, number>;
  goalsByPeriod: Array<{ bucket: '0-14'|'15-29'|'30-45+'|'46-59'|'60-74'|'75-90+'; for: number; against: number }>;
  firstGoalForAvgMin: number | null; firstGoalAgainstAvgMin: number | null;
  yellow: number; red: number;
  winStreak: number; unbeatenStreak: number; drawStreak: number;
  biggestWin?: { score: string; opponent: string; date: Date };
  biggestLoss?: { score: string; opponent: string; date: Date };
  scorers: Array<{ name: string; goals: number }>;
  assists: Array<{ name: string; assists: number }>;
  minutes: Array<{ name: string; minutes: number; games: number }>;
}
type GoalType = 'organizacao_ofensiva' | 'transicao' | 'bola_parada' | 'penalti' | 'outros';
```
(Ajustar aos tipos reais do projeto; os nomes acima são indicativos.)

### Página 1 — Resumo
1. **Header completo.** Eyebrow "Desempenho em jogos"; H1 nome do time; meta "Futebol 11 · {período} · Semana N"; badge "19/10 – 25/10" + "2026 · {n} jogo(s)".
2. **Hero (grid 1.15fr / 1fr):**
   - **Pontuação:** `Ring` com aproveitamento % · número grande `3/3` (pontos ganhos/disputados) · barra V/E/D proporcional (verde/âmbar/vermelho) · legenda "1 vitória · 0 empates · 0 derrotas" (singular/plural correto).
   - **Momento:** 3 linhas destacadas (fundo `--surface`): Sequência atual (vitórias; à direita "Invicto há N"), Maior vitória (placar + "vs Adversário · dd/mm"), Maior derrota (ou "Sem derrotas" em `--faint`). Abaixo: "Últimos jogos" com até 5 `ResultChip`, mais recente à direita.
3. **Números do período (grid 4×2 de `Kpi`):** Jogos (sub: "x em casa · y fora"), Gols pró (sub: média/jogo), Gols contra (sub: média/jogo), Saldo (`pos`/`neg`, com sinal), Jogos sem sofrer (sub: % dos jogos), 1º gol nosso (média em `'`), 1º gol sofrido (`nil` se nulo), Cartões ("0 · 0", sub "amarelos · vermelhos").
4. **Histórico de jogos** (card com tabela): Data · Rod. · Local · Adversário (negrito) · Placar `1 × 0` · Res. (chip). Se tiver vídeo, ícone discreto opcional. **Paginação:** se não couber, continua em página extra com header compacto e cabeçalho de tabela repetido (`thead { display: table-header-group }`, `tr { break-inside: avoid }`).

### Página 2 — Gols e destaques
1. **Header compacto** — subtítulo "Gols e destaques".
2. **Gols por tipo (grid 2):** "Gols feitos por tipo" e "Gols sofridos por tipo", cada um com `BarRow` para **todas** as 5 categorias, ordenadas por quantidade desc, zeros por último em `--faint`. Barras de feitos em `--team`, sofridos em `--loss`. Meta à direita: "{n} gols". Se total = 0 → `EmptyState` ("Nenhum gol sofrido no período" / "Nenhum gol marcado no período").
3. **Gols por período do jogo:** gráfico divergente — eixo central; colunas de feitos para cima (`--team`), sofridos para baixo (`--loss` 85%); valor sobre/sob a coluna; 6 faixas de 15'; altura proporcional ao máximo do conjunto. Altura útil ~20mm acima e ~12mm abaixo (ajustar se houver sofridos: usar a mesma escala nos dois lados).
4. **Artilharia | Assistências (grid 2):** `RankTable` top 5 cada (artilharia `--team`, assistências `--ink-2`). Vazio → `EmptyState`.
5. **Minutagem:** tabela densa top 10 (ou todos, se o filtro pedir): # · Jogador · barra (min / minutos possíveis) · Min · Jogos · % possível (min ÷ (90 × jogos do período)). Meta: "de {90×jogos} min possíveis".

---

## 4. Relatório 2 — Estatísticas de treino (2 páginas)

### Contrato de dados
```ts
interface TrainingReport {
  team: GamesReport['team']; period: GamesReport['period']; generatedAt: Date;
  sessions: number; activities: number; distinctActivities: number; totalMinutes: number;
  days: Array<{
    date: Date;
    kind: 'treino' | 'jogo' | 'descanso' | 'vazio';
    focus?: string;               // ex.: "BP Def", "Força"
    minutes: number;              // soma do dia (inclui "Não relacionados")
    game?: { opponent: string; score: string; result: 'V'|'E'|'D' };
    note?: string;                // ex.: "60' de Força com os não relacionados"
    distanceKm?: number | null;
  }>;
  pillars: Array<{ key: 'tatico'|'fisico'|'tecnico'|'psicologico'; sessions: number; activities: number; minutes: number }>;
  topContents: Record<string, Array<{ name: string; activities: number; minutes: number }>>; // por pilar
}
```

### Página 1 — Visão do período
1. **Header completo** — eyebrow "Estatísticas de treino"; badge com datas + "{n} sessões".
2. **KPIs (grid 5):** Tempo total (`accent`, "4h51", sub "291 min") · Sessões (sub "+ N jogo(s)") · Atividades (sub "N distintas") · Média/sessão (min) · Distância (km acumulados, 1 casa, vírgula).
3. **Microciclo (7 colunas, seg→dom):** cada dia mostra nome, data, tag de tipo, foco, coluna de minutos proporcional ao maior dia, total. Estados:
   - `treino`: borda `--line`, coluna `--team`.
   - `jogo`: card todo `--team`, texto `--on-team`, "vs Adversário", placar + resultado.
   - `descanso`: listras diagonais `--surface`/branco.
   - `vazio`: borda tracejada, "Sem registro", "—".
   - Notas de dia (ex.: treino de não relacionados em dia de jogo) numa linha de rodapé 6.5pt `--muted`.
   - Para períodos **maiores que 1 microciclo** (4 microciclos, semestre, ano): substituir pela barra/coluna de **minutos por semana** (uma coluna por semana), mesmo estilo.
4. **Distribuição por pilar:** `StackBar` por **tempo**; tabela Pilar (dot da cor) · Sessões · Atividades · % ativ. · Tempo (`3h06`) · % tempo. Ordenar por tempo desc.

### Página 2 — Conteúdos e carga
1. **Header compacto** — "Conteúdos e carga".
2. **Principais conteúdos por pilar (grid 3, um card por pilar com dados):** tabela Conteúdo · Ativ. · Min, ordenada por minutos desc, top 5. Pilares sem dados não aparecem (grid se ajusta a 1–4 colunas).
3. **Distância ideal:** 4 KPIs (Média/dia, Acumulado, Maior dia + data, Dias c/ registro "de N sessões") + gráfico de colunas por dia de treino com linha tracejada da média (`--loss`, rótulo "média x,x"). Nota na meta: "dias sem registro não entram na média". Sem nenhum registro → `EmptyState`.

> Se o conteúdo das duas páginas couber em uma (períodos com pouquíssimos dados não cabem; o padrão é 2 págs), não forçar. Para períodos longos, a página 2 pode crescer: permitir quebra natural entre cards (`break-inside: avoid` no card).

---

## 5. Relatório 3 — Ficha de sessão (1 página)

Gerado a partir da tela **Programação** (um dia). Também usado para imprimir e levar a campo.

### Contrato de dados
```ts
interface SessionSheet {
  team: GamesReport['team']; generatedAt: Date;
  date: Date; weekNumber: number; focus?: string;   // "BP Def"
  idealDistanceKm?: number | null;
  blocks: Array<{
    phase: string;            // "Aquecimento", "Preparatório", "Atividade 1"...,"Complementos"
    minutes: number;
    pillar: 'tatico'|'fisico'|'tecnico'|'psicologico';
    content: string;          // "Bola Parada Defensiva"
    activity?: string;        // "Escanteios" (título do bloco; fallback = content)
    subMoments?: string[];    // ["Bloco Alto", ...]
    groups?: string[];        // ["G1","G2","G3"]; vazio = "Todos"
    description?: string;
  }>;
}
```

### Layout
1. **Header completo:** eyebrow "Ficha de sessão · Semana N"; H1 "Segunda-feira, 19/10"; meta "Time · Modalidade · Foco: **BP Def**"; badge "{total} min" + "{km} km · {n} blocos".
2. **Linha do tempo:** barra 9mm segmentada, largura proporcional aos minutos, cor do pilar, gap 0.5mm; nome da fase dentro do segmento se ≥ 25 min. Abaixo, marcas de minuto acumulado (0', 10', 30', 130'…). Legenda de pilares (só os presentes) na meta do título.
3. **Blocos** (um por linha, `break-inside: avoid`):
   - Coluna esquerda 17mm (`--surface`, borda direita 3px na cor do pilar): duração grande + "min" + intervalo "30'–130'".
   - Direita: fase em caixa-alta + pílula do pilar · título (atividade) em Poppins 600 10pt · grupos como chips alinhados à direita ("Todos" se vazio) · linha "Conteúdo X · Submomentos [chips]" · descrição (se houver).
   - Blocos sem conteúdo ("Clique para editar") **não** são impressos.
4. **Observações:** área com pautas (linhas a cada 6.5mm) ocupando o espaço restante (`flex:1`, mínimo 20mm).
5. **Rodapé:** além do padrão, "Grupos: G1, G2, G3".
6. **Dias especiais:** dia de **jogo** → ficha mostra card "Jogo vs X" (e bloco "Não relacionados" se existir); **descanso** → ficha com estado "Descanso" e sem linha do tempo.
7. Se os blocos não couberem (muitos blocos/descrições longas), quebrar para pág. 2 com header compacto e manter Observações no final.

---

## 6. Regras de formatação e casos de borda

- **Locale pt-BR:** decimal com vírgula (`5,0 km`), datas `dd/mm/aa` em tabela e `dd/mm` em destaques, hora `hh:mm`.
- **Tempo:** ≥ 60 min → `4h51` (KPI) / `3h06` (tabelas, minutos com 2 dígitos); < 60 → `15 min` ou `15'`.
- **Minutos de jogo:** apóstrofo `12'`.
- **Nulos:** "—" em `--faint`, nunca "0" quando o dado não existe (ex.: 1º gol sofrido sem gols sofridos).
- **Pluralização:** "1 jogo / 2 jogos", "1 vitória / 0 empates", "1 gol / 0 gols".
- **Percentuais:** inteiro, arredondado (`64%`); a soma pode dar 99/101 — aceitar.
- **Nomes longos:** `text-overflow: ellipsis` em listas de ranking; na tabela de minutagem permitir até ~28 caracteres.
- **Sem jogos no período:** Relatório 1 gera só a pág. 1 com `EmptyState` grande ("Nenhum jogo registrado neste período") no lugar do hero.
- **Sem treinos no período:** Relatório 2 idem.
- **Escudo:** usar `logoUrl` se existir (`object-fit: contain`, fundo `--on-team`); senão sigla (até 3 letras) gerada do nome.
- **Escala de gráficos:** sempre relativa ao maior valor do próprio gráfico; gráfico divergente usa a mesma escala nos dois lados.

---

## 7. Critérios de aceite

- [ ] Os três relatórios usam o novo layout e o botão Exportar / exportação da Programação gera os novos PDFs.
- [ ] Número de páginas com os dados do exemplo: Jogos **2**, Treino **2**, Ficha **1**.
- [ ] Trocar a cor do time muda header, anel, barras, títulos de seção e dia de jogo; **amarelo `#FFD200` e preto `#111111`** continuam legíveis (texto do header escuro no amarelo; títulos com `--team-ink`).
- [ ] V/E/D mantêm verde/âmbar/vermelho independentemente da cor do time.
- [ ] Nenhum gráfico vazio é desenhado: sempre `EmptyState`.
- [ ] Fundos coloridos aparecem no PDF (print-color-adjust) e as fontes são as embutidas.
- [ ] Tabelas longas quebram de página com cabeçalho repetido; nenhum card/bloco cortado ao meio.
- [ ] Texto selecionável no PDF (não rasterizado).
- [ ] Comparar visualmente com `relatorios-preview.html` (mesmos dados de exemplo: Uberlândia EC, semana 43/2026, 1×0 vs Cruzeiro, sessão de 231 min).
- [ ] Remover o código antigo dos relatórios após a troca (sem flags paralelas, a menos que o projeto já use feature flags).

---

## 8. Dados de exemplo (para teste/storybook)

Uberlândia EC · Futebol 11 · Semana 43/2026 (19/10–25/10)
- Jogo: 20/10/26, Rod. 1, Casa, Cruzeiro, 1×0 (V). Gol aos 12', organização ofensiva, Pablo Thomaz (assist. Thomas Bastos). 0 cartões.
- Minutagem: Pablo Thomaz, Thomas Bastos, Jeferson, Samuel, Marcelo, Fumaça, Rafinha, Léo Reis, Calazans 90'; Nathan 88'.
- Seg 19/10 (foco BP Def, 5,0 km): Aquecimento 10' Aeróbio (Físico, G1, desc.: "desenvolvimento da via aeróbia por meio de ações combinadas") · Preparatório 20' Anaer. Láctico (Físico) · Atividade 1 100' Escanteios — Bola Parada Defensiva, Falta Frontal (Tático, G1–G3) · Atividade 2 56' Formação da linha defensiva — coberturas, rebatidas, tempo de bola — Organização Defensiva, Bloco Alto (Tático) · Atividade 3 30' Ataque x defesa — Organização Defensiva, Blocos Alto/Médio/Baixo (Tático) · Complementos 15' Cruzamentos e Finalizações — Finalização (Técnico). Total 231'.
- Ter 20/10: Jogo vs Cruzeiro + Não relacionados 60' Força (Físico). Qua 21/10: Descanso.
- Totais: 2 sessões, 7 atividades, 4 distintas, 291 min. Tático 186' (3 ativ.), Físico 90' (3 ativ., 2 sessões), Técnico 15' (1 ativ.).

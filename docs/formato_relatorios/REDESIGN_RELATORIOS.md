# Redesign dos relatórios PDF do TactiPlan

> Documento de implementação para o Claude Code. Substitui os layouts atuais dos **cinco** relatórios exportados pela plataforma:
>
> | # | Relatório | Formato | Págs. (antes → depois) | Referência visual |
> |---|---|---|---|---|
> | 1 | Desempenho em jogos | A4 retrato | 4 → 2 | `relatorios-preview.html` |
> | 2 | Estatísticas de treino | A4 retrato | 4 → 2 | `relatorios-preview.html` |
> | 3 | Ficha de sessão | A4 retrato | 2 → 1 | `relatorios-preview.html` |
> | 4 | Convocação | A4 **paisagem** | 3 → 1 | `convocacao-preview.html` |
> | 5 | Relatório do clube (temporada) | A4 retrato | 4 (paisagem) → 2 | `relatorios-preview.html` |
>
> Os HTMLs vão anexos; colocar em `docs/reports/`. Abra no navegador: a barra no topo troca a cor do time ao vivo e Ctrl+P gera o PDF A4.

---

## 0. Antes de começar (obrigatório)

1. **Localize o código atual dos relatórios.** Busque no repositório pelas strings que aparecem nos PDFs de hoje:
   - `DESEMPENHO EM JOGOS`, `GOLS PRÓ E CONTRA`, `DESTAQUES INDIVIDUAIS`
   - `ESTATÍSTICAS DE TREINO`, `DISTRIBUIÇÃO POR PILAR`, `TOP CONTEÚDOS POR PILAR`, `DISTÂNCIA IDEAL`
   - `Duração Total`, `Distância ideal`, `Treino -` (ficha diária)
   - `CONVOCAÇÃO`, `TITULARES (`, `RESERVAS (`, `ESCALAÇÃO ·`, `Camisas exibidas são as deste jogo`
   - `RELATÓRIO DO CLUBE`, `SESSÕES DE TREINO`, `MINUTOS TRABALHADOS`, `PLANTEL`, `SEM GRUPO (`
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
| Capa inteira só com título (pg 1/4) e páginas com 4 números perdidos | Header de time integrado na pág. 1; conteúdo começa imediatamente. Jogos **4 → 2**, Treino **4 → 2**, Ficha **2 → 1**, Convocação **3 → 1**, Clube **4 → 2** |
| Gráficos vazios renderizados mesmo sem dados ("Formas de gols sofridos" em branco) | **Empty states** explícitos ("Nenhum gol sofrido no período") |
| Pizza de 100% com uma fatia | Barras horizontais com **todas as categorias** (zeros em cinza), comparáveis entre feitos/sofridos |
| Sem identidade do clube | Header, destaques e gráficos na **cor do time** (variável) |
| Ficha de sessão: lista solta + página 2 só com o total | Linha do tempo proporcional por pilar, blocos com minuto inicial/final, total no header, área de observações para campo |
| "Participação" ambígua (% de atividades) | Tabela mostra **% atividades** e **% tempo** lado a lado |
| Coluna "Camisa" quebrando em "Camis / a", cheia de "-", e `#` que é só o índice | Coluna única de nº de camisa; nulo = "—" em cinza |
| Pilar em minúsculo e sem acento ("fisico", "tatico") vindo direto do banco | Rótulos sempre pelo mapa de exibição (`Físico`, `Tático`, `Técnico`, `Psicológico`) |
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

### 2.6 Setores de posição (compartilhado: Convocação e Relatório do clube)

| Setor | Rótulo plural | Códigos | Cor |
|---|---|---|---|
| `gol` | Goleiros | GOL | `#D97706` (`--s-gol`) |
| `def` | Defensores | ZAG, LD, LE, DEF | `#334155` (`--s-def`) |
| `mei` | Meio-campistas | VOL, MC, MD, ME, MEI, MOF | `--team-ink` (`--s-mei`) |
| `ata` | Atacantes | ED, EE, PD, PE, DD, DE, CA, ATA | `#DC2626` (`--s-ata`) |

Implementar **um único** `positionSector.ts` com esse mapa e a ordem de exibição dentro do setor (`GOL, ZAG, LD, LE, VOL, MC, MD, ME, MEI, MOF, ED, EE, PD, PE, DD, DE, CA, ATA`; empate → nome A–Z). Código desconhecido: setor "Outros", cor `--faint`. Ajustar aos códigos reais do projeto (os que aparecem hoje: GOL, ZAG, LD, LE, VOL, MEI, MOF, MD, DD, ED, CA, DEF, ATA). Componente `PositionChip`: fundo na cor do setor, texto branco, Inter 600 6.5pt, raio 1mm, largura mínima 9mm.

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

## 5b. Relatório 4 — Convocação (1 página, A4 **paisagem**)

Referência visual: **`convocacao-preview.html`** (colocar em `docs/reports/`). Substitui o PDF atual `Convocacao_<adversario>_<dd-mm-aaaa>.pdf` (hoje 3 págs: capa vazia, tabelas, campo). Na barra do topo do protótipo, o checkbox "Simular camisas cadastradas" mostra os dois estados: com e sem número de camisa.

### O que muda
| Atual | Novo |
|---|---|
| 3 páginas (capa só com título, lista, campo) | **1 página**: campo à esquerda e lista à direita, para mandar no WhatsApp ou fixar no vestiário |
| Nomes truncados no campo ("reis", "Calaza.", "Felipe") | Nome de exibição completo, com reticências só acima de ~24mm |
| Coluna "Cam." toda com "-" e "#" sendo só o índice | Coluna única com o nº da camisa; sem número, "—" na lista e iniciais no campo |
| Campo verde fixo com linhas desalinhadas | Campo em azul-marinho neutro (`--pitch`), funciona com qualquer cor de time; jogadores na cor do time |
| Titulares em lista corrida | Agrupados por setor (Goleiro, Defesa, Meio-campo, Ataque) com etiqueta de posição colorida |

### Contrato de dados
```ts
interface CallUpSheet {
  team: { name: string; shortName: string; color: string; logoUrl?: string };
  opponent: string;
  date: Date;
  kickoff?: string;        // "15:00" (opcional)
  venue?: string;          // local (opcional)
  meetTime?: string;       // horário de apresentação (opcional)
  competition?: string; round?: number; home?: boolean; // opcionais, se existirem no modelo do jogo
  formation: string;       // "4-4-2"
  starters: Array<{ name: string; pos: string; shirt?: number | null; slot: { x: number; y: number } }>;
  bench: Array<{ name: string; pos: string; shirt?: number | null }>;
  generatedAt: Date;
}
```
- `shirt`: nº de camisa **deste jogo**; se não houver, usar o nº permanente do plantel; se também não houver, `null`.
- `slot`: posição no campo em % (0–100, ataque para cima). **Usar as coordenadas que o editor de escalação já salva.** Se não houver, derivar da formação: linhas `GOL → DEF → MEI → ATA` com y = 88 / 68 / 42 / 17 % e x distribuído igualmente, `(i+1)/(n+1)`. Em formações com 4 linhas de linha (4-2-3-1, 4-1-2-1-2…), dividir o intervalo 17–68 % igualmente.

### Layout (297×210 mm, margens laterais 12 mm)
1. **Header** (faixa `--team`, ~28 mm): escudo · eyebrow "Convocação" · H1 "**Time** vs **Adversário**" (o "vs" em peso 500, opacidade .65). À direita: dia da semana em eyebrow + data `22/10` em Poppins 700 26pt · divisor vertical · bloco com Horário, Local e Apresentação. Campo vazio aparece como "—" com opacidade .55 (não esconder, para o técnico perceber que falta preencher).
2. **Corpo (grid `104mm | 1fr`, gap 9 mm):**
   - **Campo** (coluna esquerda, altura total): fundo com faixas horizontais alternadas `--pitch #16233A` / `--pitch-2 #1A2942` (10 % cada); linhas brancas 50 % em SVG `viewBox="0 0 68 105"` (medidas oficiais: áreas 40,3×16,5 e 18,3×5,5, círculo r 9,15, meias-luas). Retângulos com `preserveAspectRatio="none"`; círculos e arcos num segundo SVG com `xMidYMid meet`, para não ficarem ovais. Selo da formação no canto superior esquerdo, "Ataque ↑" no direito.
   - **Jogador no campo:** círculo 10 mm `--team` com borda branca 0,6 mm e sombra leve, texto `--on-team` (nº da camisa ou iniciais); abaixo, etiqueta branca com o nome (Inter 600, 7pt). **Goleiro:** círculo `#F1F5F9` com texto `--ink` e borda `--team`, para se diferenciar em qualquer cor de time.
   - **Coluna direita:** 4 mini-KPIs (Convocados, Titulares, Reservas, Sistema) → duas colunas: **Titulares** agrupados por setor (subtítulo com bolinha da cor do setor) e **Reservas** sem agrupamento. Linha: nº (Poppins 700, "—" em `--faint` se nulo) · nome (Inter 600, 9pt; reservas 500) · etiqueta de posição (fundo na cor do setor, texto branco).
   - Nota de rodapé da coluna (6.5pt `--faint`): "Camisas exibidas são as deste jogo (fallback: nº permanente do plantel)."
3. **Rodapé** padrão.

Cores e agrupamento de posições: ver **§2.6**.

### Casos de borda
- **Mais de 7 reservas:** a coluna de reservas continua com as linhas mais compactas (padding 1 mm); acima de 12, quebrar em 2 subcolunas.
- **Mais de 11 titulares** (futebol 7/society, usar a modalidade): o campo continua igual e os tokens diminuem para 9 mm se houver mais de 5 numa linha.
- **Sem escalação no campo:** mostrar o campo vazio com `EmptyState` sobreposto ("Escalação não definida") e manter a lista.
- **Nome do adversário longo:** H1 com `font-size: clamp` (mínimo 14pt) e reticências.
- Arquivo: manter `Convocacao_<adversario>_<dd-mm-aaaa>.pdf`.

### Aceite
- [ ] 1 página, A4 paisagem, texto selecionável.
- [ ] Com dados reais: 11 titulares 4-4-2 e 3 reservas idênticos ao protótipo.
- [ ] Testar sem camisas (iniciais / "—") e com camisas.
- [ ] Testar cores `#1B8A3E`, `#C8102E`, `#FFD200`, `#111111`: goleiro, tokens e header legíveis em todas.

---

## 5c. Relatório 5 — Relatório do clube / temporada (2 páginas, A4 retrato)

Visão consolidada do período (padrão: temporada 01/01–31/12). Hoje são 4 páginas em paisagem: capa vazia, Desempenho, Treinos e Plantel. Referência: últimas 2 páginas de `relatorios-preview.html` ("Relatório 5").

### O que muda
| Atual | Novo |
|---|---|
| Capa sem conteúdo | Header do time com período e contagens ("2 jogos · 2 sessões · 14 atletas") |
| "Sequência V / invicta 0/2", número ambíguo | KPI "Invicto há **2** jogos", com sub-legenda "0 vitórias seguidas" |
| "1·1·0" para V·E·D | Barra proporcional V/E/D + legenda por extenso |
| Tabela de conteúdos com pilar em minúsculo (`fisico`) e coluna "Atividades" sempre 1 | Conteúdos como chips agrupados sob o pilar, com total de atividades do pilar |
| "185 minutos trabalhados" solto | `3h05` com sub-legenda `185 min` e média por sessão |
| Plantel numa lista única "SEM GRUPO (14)" com a coluna "Camisa" quebrada | Barra de composição por setor + 4 cards (Goleiros, Defensores, Meio-campistas, Atacantes) ordenados por posição |

### Contrato de dados
```ts
interface ClubReport {
  team: { name: string; shortName: string; color: string; logoUrl?: string; modality: string };
  period: { start: Date; end: Date; label: string };      // "Temporada 2026"
  generatedAt: Date;
  games: GamesReport['games'];                            // mesmo tipo do Relatório 1
  goalsFor: number; goalsAgainst: number;
  winStreak: number; unbeatenStreak: number;
  training: {
    sessions: number; activities: number; minutes: number;
    pillars: Array<{ key: Pillar; activities: number; minutes?: number }>;
    contents: Array<{ name: string; pillar: Pillar; activities: number; minutes?: number }>;
  };
  squad: Array<{ name: string; pos: string; shirt?: number | null; group?: string | null;
                 stats?: { games: number; minutes: number; goals: number; assists: number } }>;
}
type Pillar = 'tatico' | 'fisico' | 'tecnico' | 'psicologico';
```

### Página 1: Desempenho + Treinos
1. **Header completo:** eyebrow "Relatório do clube"; H1 time; meta "Futebol 11 · Temporada 2026"; badge "01/01 – 31/12" + "2026 · N jogos · N sessões · N atletas".
2. **Desempenho** (título de seção com meta "N jogos"): grid `1.15fr | 1fr`. À esquerda, o mesmo card de Pontuação do Relatório 1 (anel + `4/6` + barra V/E/D). À direita, 2×2 KPIs: Gols pró (média/jogo), Gols contra (média/jogo), Saldo (`pos`/`neg`), Invicto há N (sub "x vitórias seguidas"; se a sequência atual for de derrotas, trocar para "Sem vencer há N" com `neg`).
3. **Histórico de jogos:** mesma tabela do Relatório 1; na meta do título vão os chips dos últimos 5 resultados. Mais de ~8 jogos: a tabela continua na página seguinte, com o cabeçalho repetido, **antes** do Plantel.
4. **Treinos:** 3 KPIs (Minutos trabalhados `accent` em `XhYY` com sub em min · Sessões com média de min/sessão · Atividades com nº de conteúdos distintos). Card **Distribuição por pilar**: `StackBar` (por minutos se existir `minutes` por pilar; senão por atividades, e a meta diz qual), e abaixo 1 coluna por pilar presente com o título "● Tático · 3 ativ." e os conteúdos como `Chip`, ordenados por atividades desc. Mais de 8 conteúdos num pilar: mostrar 8 e um chip "+N".

### Página 2: Plantel
1. **Header compacto** com o subtítulo "Plantel".
2. **Composição do plantel:** barra segmentada por setor (largura = nº de atletas, número dentro do segmento, cores de §2.6) e legenda "Goleiros 1 · Defensores 5 · …". Meta: "N atletas" + "todos sem grupo definido" se nenhum atleta tiver grupo.
3. **Cards por setor (grid 2×2):** borda superior 1mm na cor do setor; título com o rótulo plural e "N atletas"; linhas `nº · nome · PositionChip`. Setor vazio: `EmptyState` "Nenhum atleta".
4. **Com estatísticas do atleta** (`stats` presente para pelo menos 1 atleta): trocar os cards por **uma tabela única agrupada por setor** (subtítulo do setor como linha separadora), com as colunas `# · Atleta · Pos. · Jogos · Min · Gols · Ast.`, ordenada por setor e depois por posição. Zeros em `--faint`. É a versão mais útil. O protótipo mostra a versão sem estatísticas porque os dados de exemplo não as têm.
5. **Grupos** (G1/G2/G3): se existirem, mostrar como `Chip` ao lado do nome. Não agrupar a página por grupo; o agrupamento é por setor.
6. Elenco grande (> 28 atletas): a tabela quebra de página normalmente com o header compacto.
7. Nota de rodapé: "“—” = sem número de camisa cadastrado no plantel."

### Aceite
- [ ] 2 páginas retrato com os dados de exemplo; nenhuma capa vazia.
- [ ] Pilares sempre exibidos com acento e maiúscula.
- [ ] Setores corretos para os 14 atletas do exemplo (GOL 1 · DEF 5 · MEI 3 · ATA 5).

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

- [ ] Os cinco relatórios usam o novo layout, e todos os pontos de exportação (Estatísticas, Programação, Convocação e Relatório do clube) geram os PDFs novos.
- [ ] Número de páginas com os dados do exemplo: Jogos **2**, Treino **2**, Ficha **1**, Convocação **1** (paisagem), Clube **2**.
- [ ] Trocar a cor do time muda header, anel, barras, títulos de seção e dia de jogo; **amarelo `#FFD200` e preto `#111111`** continuam legíveis (texto do header escuro no amarelo; títulos com `--team-ink`).
- [ ] V/E/D mantêm verde/âmbar/vermelho independentemente da cor do time.
- [ ] Nenhum gráfico vazio é desenhado: sempre `EmptyState`.
- [ ] Fundos coloridos aparecem no PDF (print-color-adjust) e as fontes são as embutidas.
- [ ] Tabelas longas quebram de página com cabeçalho repetido; nenhum card/bloco cortado ao meio.
- [ ] Texto selecionável no PDF (não rasterizado).
- [ ] Comparar visualmente com `relatorios-preview.html` e `convocacao-preview.html` usando os dados da §8.
- [ ] Componentes (`ReportPage`, `ReportHeader`, `Kpi`, `Ring`, `StackBar`, `PositionChip`, `EmptyState`…) compartilhados entre os 5 relatórios, sem cópia de CSS por relatório.
- [ ] Remover o código antigo dos relatórios após a troca (sem flags paralelas, a menos que o projeto já use feature flags).

---

## 8. Dados de exemplo (para teste/storybook)

Uberlândia EC · Futebol 11 · Semana 43/2026 (19/10–25/10)
- Jogo: 20/10/26, Rod. 1, Casa, Cruzeiro, 1×0 (V). Gol aos 12', organização ofensiva, Pablo Thomaz (assist. Thomas Bastos). 0 cartões.
- Minutagem: Pablo Thomaz, Thomas Bastos, Jeferson, Samuel, Marcelo, Fumaça, Rafinha, Léo Reis, Calazans 90'; Nathan 88'.
- Seg 19/10 (foco BP Def, 5,0 km): Aquecimento 10' Aeróbio (Físico, G1, desc.: "desenvolvimento da via aeróbia por meio de ações combinadas") · Preparatório 20' Anaer. Láctico (Físico) · Atividade 1 100' Escanteios — Bola Parada Defensiva, Falta Frontal (Tático, G1–G3) · Atividade 2 56' Formação da linha defensiva — coberturas, rebatidas, tempo de bola — Organização Defensiva, Bloco Alto (Tático) · Atividade 3 30' Ataque x defesa — Organização Defensiva, Blocos Alto/Médio/Baixo (Tático) · Complementos 15' Cruzamentos e Finalizações — Finalização (Técnico). Total 231'.
- Ter 20/10: Jogo vs Cruzeiro + Não relacionados 60' Força (Físico). Qua 21/10: Descanso.
- Totais: 2 sessões, 7 atividades, 4 distintas, 291 min. Tático 186' (3 ativ.), Físico 90' (3 ativ., 2 sessões), Técnico 15' (1 ativ.).

**Convocação** · vs mmmm · 22/10/2026 · 4-4-2
- Titulares: Jeferson (GOL); Luis Felipe, Nathan, Marcelo, Max (DEF); Fumaça, Pablo Thomaz, Calazans, Da Silva (MEI); Léo Reis, Kaike (ATA).
- Reservas: Thomas Bastos (MOF), Rafinha (MD), Samuel (DD). Nenhuma camisa cadastrada.

**Relatório do clube** · Temporada 2026 (01/01–31/12)
- Jogos: 20/10/26 Rod. 1 Casa Cruzeiro 1×0 V; 22/10/26 Rod. 2 Fora Atlético MG 1×1 E → 4/6 pts, 67%, GP 2, GC 1, saldo +1, invicto há 2, 0 vitórias seguidas.
- Treinos: 2 sessões, 7 atividades, 185 min. Tático 3 (Bola Parada Def., Org. Ofensiva, Org. Defensiva) · Físico 3 (Aeróbio, Velocidade, Força) · Técnico 1 (Finalização).
- Plantel (14, sem grupo, sem camisa): Jeferson GOL · Marcelo ZAG, Max ZAG, Samuel LD, Luis Felipe LE, Nathan LE · Fumaça VOL, Rafinha VOL, Thomas Bastos MEI · Calazans ED, Léo Reis ED, Da Silva CA, Kaike CA, Pablo Thomaz CA.

> Atenção à consistência dos dados de exemplo: o Relatório do clube mostra 185 min em 2 sessões, e as Estatísticas de treino da semana 43 mostram 291 min. Se os dois cobrem as mesmas sessões, um dos cálculos está errado (provável causa: o clube não soma os "Não relacionados" ou soma só as atividades com conteúdo). **Verificar e unificar a regra de "minutos trabalhados" antes de implementar.**

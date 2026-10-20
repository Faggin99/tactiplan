// Cria uma jogada de treino no quadro tático: "espaço reduzido — tabela e
// finalização", com 2 frames + setas (passe, corrida, devolução, finalização),
// cones marcando o grid e mini-gol. Pro screenshot da loja.
require('dotenv').config();
const { query } = require('./src/config/database');
const { randomUUID } = require('crypto');

const CLUB = '6b8cfbbd-f643-4de1-8267-8d573e3ebf4b';
const WS   = '249536bb-ee36-4699-85c7-7785677d158a';
const NAME = 'Treino: tabela e finalização';

// Estáticos (mesma posição nos 2 frames): cones do grid + mini-gol
const cone = (id, x, y) => ({ id, type: 'marker', team: null, markerType: 'cone', x, y, rotation: 0 });
const statics = [
  cone('c1', 40, 22), cone('c2', 65, 22), cone('c3', 90, 22),
  cone('c4', 40, 50), cone('c5', 90, 50),
  cone('c6', 40, 80), cone('c7', 65, 80), cone('c8', 90, 80),
  { id: 'goal', type: 'marker', team: null, markerType: 'mini_goal', x: 95, y: 50, rotation: 0 },
];

// Móveis: jogadores + bola, com posição no frame 0 e no frame 1
const movers = [
  { id: 'p-b8',  type: 'player', team: 'A', jerseyNumber: 8,  name: 'MEI', athleteId: null, isGoalkeeper: false, p0: [46, 54], p1: [69, 52] },
  { id: 'p-b10', type: 'player', team: 'A', jerseyNumber: 10, name: 'MEI', athleteId: null, isGoalkeeper: false, p0: [66, 32], p1: [63, 37] },
  { id: 'p-b9',  type: 'player', team: 'A', jerseyNumber: 9,  name: 'ATA', athleteId: null, isGoalkeeper: false, p0: [72, 66], p1: [82, 60] },
  { id: 'p-r5',  type: 'player', team: 'B', jerseyNumber: 5,  name: 'ZAG', athleteId: null, isGoalkeeper: false, p0: [60, 50], p1: [66, 50] },
  { id: 'p-r4',  type: 'player', team: 'B', jerseyNumber: 4,  name: 'ZAG', athleteId: null, isGoalkeeper: false, p0: [80, 58], p1: [82, 55] },
  { id: 'p-gk',  type: 'player', team: 'B', jerseyNumber: 1,  name: 'GOL', athleteId: null, isGoalkeeper: true,  p0: [94, 50], p1: [92, 51] },
  { id: 'ball',  type: 'ball',   team: null,                                                                     p0: [46, 54], p1: [69, 52] },
];
const at = (m, k) => {
  const [x, y] = m[k];
  const { p0, p1, ...rest } = m;
  return { ...rest, x, y };
};

// Setas do frame 0 — o "plano" da jogada
const YEL = '#fbbf24', WHT = '#ffffff', GRN = '#22c55e';
const line = (id, color, dash, x1, y1, x2, y2, sw = 2.6) => ({ id, drawType: 'arrow_straight', color, strokeWidth: sw, dash, x1, y1, x2, y2 });
const curve = (id, color, dash, x1, y1, x2, y2) => {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
  return { id, drawType: 'arrow_curved', color, strokeWidth: 2.6, dash, x1, y1, x2, y2, cx: mx - dy * 0.3, cy: my + dx * 0.3 };
};
const frame0Draw = [
  line('d1', YEL, [8, 5], 46, 54, 64, 33),      // passe b8 → b10
  line('d2', WHT, [], 46, 54, 66, 52),          // corrida de b8
  curve('d3', YEL, [8, 5], 66, 33, 69, 51),     // devolução b10 → b8 (tabela)
  line('d4', GRN, [], 70, 52, 93, 50, 3.2),     // finalização → gol
];
const frame1Draw = [
  line('d4b', GRN, [], 70, 52, 93, 49, 3.2),    // finalização
];

const frames = [
  { index: 0, elements: [...statics, ...movers.map(m => at(m, 'p0'))], drawings: frame0Draw },
  { index: 1, elements: [...statics, ...movers.map(m => at(m, 'p1'))], drawings: frame1Draw },
];

async function main() {
  await query(`DELETE FROM tactical_plays WHERE club_id=$1 AND name=$2`, [CLUB, NAME]);
  const id = randomUUID();
  await query(
    `INSERT INTO tactical_plays (id, workspace_id, club_id, name, description, field_type, field_view, animation_speed, team_a_color, team_b_color, keyframes, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'football_11','full',1,'#3b82f6','#ef4444',$6::jsonb,now(),now())`,
    [id, WS, CLUB, NAME, 'Espaço reduzido: tabela (1-2) e finalização.', JSON.stringify(frames)]
  );
  console.log('✓ jogada criada:', NAME, '| frames:', frames.length, '| id', id);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

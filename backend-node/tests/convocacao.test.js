// Convocação (relatório 4, A4 paisagem): setores, camisa, vagas no campo, builder, template e permissão.
// Uso: node --test tests/convocacao.test.js  (banco simulado; o Chromium não é chamado)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const fake = require('./helpers/fakeDb');
fake.instalar();

const { positionSector, roleSector, sectorInfo } = require('../src/reports/positionSector');
const { deriveSlots, slotPosition, playerInitials } = require('../src/reports/lineup');
const { buildSlots, FORMACOES } = require('../src/utils/formacao');
const B = require('../src/reports/builders');
const { teamPalette } = require('../src/reports/theme');
const { renderConvocacao } = require('../src/reports/templates/convocacao');

const FRONT = path.join(__dirname, '../../frontend/src/lib');

// Carrega o lib/formation.js do FRONT (ESM) para comparar com o porte do backend.
function frontendFormation() {
  const src = fs.readFileSync(path.join(FRONT, 'formation.js'), 'utf8')
    .replace(/^import .*$/m, '')
    .replace(/^export \{[^}]*\} from .*$/gm, '')
    .replace(/^export /gm, '');
  // eslint-disable-next-line no-new-func
  return new Function('formacoes', `${src}\nreturn { buildSlots };`)(FORMACOES);
}

// ------------------------------------------------------------------ setores
test('setores: códigos do projeto (DD/DE = laterais → Defesa; ED/EE/PL/SA → Ataque)', () => {
  const cases = {
    GR: 'gol', GOL: 'gol',
    DD: 'def', DC: 'def', DE: 'def', Z: 'def', LD: 'def', LE: 'def', FIX: 'def',
    MD: 'mei', MC: 'mei', ME: 'mei', MOF: 'mei', M: 'mei', 'ALA-D': 'mei', 'ALA-E': 'mei',
    ED: 'ata', EE: 'ata', PL: 'ata', SA: 'ata', A: 'ata', PIV: 'ata',
    // códigos da especificação também valem
    ZAG: 'def', VOL: 'mei', PD: 'ata', PE: 'ata', CA: 'ata', ATA: 'ata',
  };
  for (const [code, sector] of Object.entries(cases)) assert.strictEqual(positionSector(code), sector, code);
  assert.strictEqual(positionSector(' mof '), 'mei', 'normaliza caixa e espaços');
  assert.strictEqual(positionSector('XYZ'), null);
  assert.strictEqual(positionSector(null), null);
  assert.strictEqual(sectorInfo(null).color, 'var(--faint)', 'desconhecido usa --faint');
  assert.strictEqual(sectorInfo('mei').color, 'var(--s-mei)');
});

test('setores: toda posição cadastrável no app (sportConfig.POSITIONS) tem setor', () => {
  const src = fs.readFileSync(path.join(FRONT, 'sportConfig.js'), 'utf8');
  const block = src.slice(src.indexOf('const FIELD_POSITIONS'), src.indexOf('export const DEFAULT_MATCH_DURATION'));
  const codes = [...block.matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(codes.length >= 14, 'Futebol 11/7 (9) + futsal (5)');
  for (const c of codes) assert.ok(positionSector(c), `sem setor: ${c}`);
});

test('setor da LINHA da vaga; LIN (futsal 4-0) não define', () => {
  assert.deepStrictEqual(['GOL', 'DEF', 'MEI', 'ATA', 'LIN'].map(roleSector), ['gol', 'def', 'mei', 'ata', null]);
});

// ------------------------------------------------------------------ camisa
test('camisa: jogo → plantel → null; iniciais no campo', () => {
  assert.strictEqual(B.shirtOf({ jersey_number: 7, athlete_jersey: 10 }), 7);
  assert.strictEqual(B.shirtOf({ jersey_number: null, athlete_jersey: 10 }), 10);
  assert.strictEqual(B.shirtOf({ jersey_number: '', athlete_jersey: '9' }), 9);
  assert.strictEqual(B.shirtOf({ jersey_number: null, athlete_jersey: null }), null);
  assert.strictEqual(B.shirtOf({}), null);
  assert.strictEqual(playerInitials('Pablo Thomaz'), 'PT');
  assert.strictEqual(playerInitials('Kaike'), 'KA');
  assert.strictEqual(playerInitials('Léo reis'), 'LR');
});

// ------------------------------------------------------------------ vagas
test('vagas: backend usa as MESMAS coordenadas do editor (todas as formações)', () => {
  const front = frontendFormation();
  for (const { opcoes } of Object.values(FORMACOES)) {
    for (const f of opcoes) assert.deepStrictEqual(buildSlots(f), front.buildSlots(f), f);
  }
});

test('vagas: posição vem do editor; fora da formação → null', () => {
  const gk = slotPosition('4-4-2', 0);
  assert.deepStrictEqual([gk.x, gk.y, gk.role, gk.source], [50, 90, 'GOL', 'editor']);
  const st = slotPosition('4-4-2', 10);
  assert.deepStrictEqual([st.role, st.y, st.perLine], ['ATA', 18, 2]);
  assert.strictEqual(slotPosition('4-4-2', 11), null);
  assert.strictEqual(slotPosition('4-4-2', null), null);
  assert.strictEqual(slotPosition('2-2', 5), null);
});

test('derivação pela formação (fallback): 88/68/42/17 e x = (i+1)/(n+1)', () => {
  const s = deriveSlots('4-4-2');
  assert.strictEqual(s.length, 11);
  assert.deepStrictEqual([...new Set(s.map((v) => v.y))], [88, 68, 42, 17]);
  assert.deepStrictEqual(s.filter((v) => v.y === 68).map((v) => v.x), [20, 40, 60, 80]);
  assert.deepStrictEqual(s.filter((v) => v.y === 17).map((v) => Math.round(v.x * 100) / 100), [33.33, 66.67]);
  // 4 linhas de linha: 17–68 dividido igualmente
  const q = deriveSlots('4-2-3-1');
  assert.deepStrictEqual([...new Set(q.map((v) => v.y))], [88, 68, 51, 34, 17]);
  assert.deepStrictEqual(q.map((v) => v.role), ['GOL', 'DEF', 'DEF', 'DEF', 'DEF', 'MEI', 'MEI', 'MEI', 'MEI', 'MEI', 'ATA']);
  assert.deepStrictEqual(deriveSlots('4-0').map((v) => v.y), [88, 42, 42, 42, 42]);
});

// ------------------------------------------------------------------ builder
const team = { name: 'Uberlândia EC', short: 'UEC', modality: 'football_11', palette: teamPalette('#1B8A3E'), logoUrl: null };
const P = (name, position, status, slot, jersey = null, athleteJersey = null) => ({
  athlete_id: name, name, position, status, slot, jersey_number: jersey, athlete_jersey: athleteJersey,
});
const LAURO = [
  P('Jeferson', 'GOL', 'starter', 0), P('Luis Felipe', 'LE', 'starter', 1), P('Nathan', 'LE', 'starter', 2),
  P('Marcelo', 'LD', 'starter', 3), P('Max', 'ZAG', 'starter', 4), P('Fumaça', 'MEI', 'starter', 5),
  P('Pablo Thomaz', 'CA', 'starter', 6), P('Calazans', 'ED', 'starter', 7), P('Da Silva', 'CA', 'starter', 8),
  P('Léo reis', 'ED', 'starter', 9), P('Kaike', 'CA', 'starter', 10),
  P('Thomas Bastos', 'MEI', 'substitute', null), P('Rafinha', 'MEI', 'substitute', null), P('Samuel', 'LD', 'substitute', null),
];
const SESSION = { date: '2026-10-22', opponent_name: 'mmmm', match_round: '2', match_location: null };

test('builder: 4-4-2 do protótipo (11 titulares por setor da vaga, 3 reservas)', () => {
  const vm = B.buildCallUp({ session: SESSION, team, players: LAURO, formation: '4-4-2', competitionName: 'Mineiro' });
  assert.deepStrictEqual(vm.counts, { total: 14, starters: 11, bench: 3 });
  assert.deepStrictEqual([vm.weekday, vm.ddmm], ['Quinta-feira', '22/10']);
  assert.deepStrictEqual(vm.meta, ['Mineiro', 'Rodada 2']);
  assert.deepStrictEqual(vm.info.map((i) => i.value), [null, null, null], 'sem horário/local/apresentação → "—"');
  const comInfo = B.buildCallUp({ session: { ...SESSION, match_kickoff: '16:00', match_venue: 'Parque do Sabiá', match_meet_time: '14:30' },
    team, players: LAURO, formation: '4-4-2' });
  assert.deepStrictEqual(comInfo.info.map((i) => [i.label, i.value]), [['Horário', '16:00'], ['Local', 'Parque do Sabiá'], ['Apresentação', '14:30']]);
  assert.deepStrictEqual(vm.groups.map((g) => [g.label, g.rows.length]), [['Goleiro', 1], ['Defesa', 4], ['Meio-campo', 4], ['Ataque', 2]]);
  // Pablo Thomaz (CA cadastrado) escalado no meio: grupo Meio-campo, etiqueta = posição EM CAMPO (MEI)
  const meio = vm.groups.find((g) => g.label === 'Meio-campo').rows;
  assert.deepStrictEqual(meio.map((r) => r.name), ['Fumaça', 'Pablo Thomaz', 'Calazans', 'Da Silva']);
  assert.deepStrictEqual([meio[1].pos, meio[1].posColor], ['MEI', 'var(--s-mei)']);
  // defesa de 4: 1ª vaga (esquerda da tela) = LE, última = LD
  assert.deepStrictEqual(vm.groups.find((g) => g.key === 'def').rows.map((r) => r.pos), ['LE', 'ZAG', 'ZAG', 'LD']);
  assert.deepStrictEqual(vm.groups.find((g) => g.key === 'ata').rows.map((r) => r.pos), ['CA', 'CA']);
  assert.deepStrictEqual(vm.bench.map((r) => [r.name, r.pos]), [['Thomas Bastos', 'MEI'], ['Rafinha', 'MEI'], ['Samuel', 'LD']]);
  assert.strictEqual(vm.field.length, 11);
  assert.ok(vm.field.every((f) => !f.hasShirt), 'sem camisa → iniciais');
  assert.deepStrictEqual(vm.field.slice(0, 2).map((f) => f.token), ['JE', 'LF']);
  assert.ok(vm.field[0].gk && !vm.field[1].gk);
  assert.deepStrictEqual(vm.unplaced, []);
  assert.strictEqual(vm.benchLayout, '');
});

test('builder: camisas, titular sem vaga, reservas compactas/2 colunas e sem escalação', () => {
  const players = [
    P('Goleiro Um', 'GOL', 'starter', 0, 1),
    P('Zagueiro Dois', 'ZAG', 'starter', null, null, 4),
    ...Array.from({ length: 8 }, (_, i) => P(`Reserva ${i + 1}`, i % 2 ? 'CA' : 'VOL', 'substitute', null, null, 12 + i)),
  ];
  const vm = B.buildCallUp({ session: { ...SESSION, match_location: 'away' }, team, players, formation: '4-4-2' });
  assert.deepStrictEqual(vm.field.map((f) => [f.token, f.hasShirt]), [['1', true]]);
  assert.deepStrictEqual(vm.unplaced, ['Zagueiro Dois']);
  const def = vm.groups.find((g) => g.key === 'def');
  assert.deepStrictEqual([def.rows[0].shirt, def.rows[0].offField], [4, true], 'sem vaga entra na lista pela posição cadastrada');
  assert.strictEqual(vm.benchLayout, 'compact');
  assert.deepStrictEqual(vm.meta, ['Rodada 2', 'Fora']);

  const many = Array.from({ length: 13 }, (_, i) => P(`R${i}`, 'VOL', 'substitute', null));
  assert.strictEqual(B.buildCallUp({ session: SESSION, team, players: many, formation: '4-4-2' }).benchLayout, 'two');

  const none = B.buildCallUp({ session: { ...SESSION, opponent_name: '' }, team, players: [P('A B', 'VOL', 'starter', null)], formation: '4-4-2' });
  assert.strictEqual(none.hasLineup, false);
  assert.strictEqual(none.opponent, 'Adversário');
});

test('builder: futsal 4-0 (LIN) usa a posição cadastrada; fut7 sem tokens menores', () => {
  const players = [P('G', 'GOL', 'starter', 0), P('F', 'FIX', 'starter', 1), P('A', 'ALA-D', 'starter', 2), P('P', 'PIV', 'starter', 3), P('X', null, 'starter', 4)];
  const vm = B.buildCallUp({ session: SESSION, team: { ...team, modality: 'futsal' }, players, formation: '4-0' });
  assert.deepStrictEqual(vm.groups.map((g) => [g.key, g.rows.map((r) => r.name).join()]), [['gol', 'G'], ['def', 'F'], ['mei', 'A,X'], ['ata', 'P']]);
  assert.strictEqual(vm.groups[2].rows[1].pos, 'LIN', 'sem posição cadastrada: etiqueta com o papel da vaga');
  assert.ok(vm.field.every((f) => !f.small));
  const big = B.buildCallUp({ session: SESSION, team, players: [P('a', 'VOL', 'starter', 1)], formation: '5-3-2' });
  assert.strictEqual(big.field[0].small, false, '5 numa linha ainda é 10mm; só acima de 5 diminui');
});

// ------------------------------------------------------------------ template
test('template: A4 paisagem, 1 página, "—" com opacidade e texto escapado', () => {
  const vm = B.buildCallUp({
    session: { ...SESSION, opponent_name: '<script>x</script>' }, team, players: LAURO, formation: '4-4-2',
  });
  const html = renderConvocacao(vm, { now: new Date('2026-10-20T17:16:00Z') });
  assert.match(html, /@page\{size:A4 landscape;margin:0\}/);
  assert.ok(html.indexOf('convocacao.css') === -1 && html.includes('.pitch{'), 'CSS da convocação embutido');
  assert.ok(html.indexOf('size:A4 landscape') > html.indexOf('@page{size:A4;'), 'paisagem vem depois do retrato comum');
  assert.strictEqual((html.match(/<section class="page" data-subtitle/g) || []).length, 1, 'uma página (fora o modelo de continuação)');
  assert.ok(html.includes('&lt;script&gt;x&lt;/script&gt;') && !html.includes('<script>x</script>'));
  assert.strictEqual((html.match(/<span class="nil">—<\/span>/g) || []).length, 3);
  // a formação (4-4-2) não aparece mais no PDF (26/10/2026); letra grande é uma classe na grade
  assert.ok(html.includes('Ataque ↑') && !html.includes('4-4-2') && !html.includes('Sistema'));
  assert.ok(renderConvocacao({ ...vm, fonte: 'muito_grande' }, { now: new Date() }).includes('class="cv f-muito_grande"'));
  assert.ok(!html.includes('Escalação não definida'));
  const empty = renderConvocacao(B.buildCallUp({ session: SESSION, team, players: [], formation: '2-3-1' }), { now: new Date() });
  assert.ok(empty.includes('Escalação não definida') && empty.includes('Sem reservas'));
});

// ------------------------------------------------------------------ rota (permissão)
const R = require('../src/reports');
let generated = [];
R.generateReport = async (tipo, body) => { generated.push({ tipo, body }); return { pdf: Buffer.from('%PDF-1.4 teste'), pages: 1, filename: 'Convocacao_x_22-10-2026.pdf' }; };

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../src/config/auth');
const requireActiveSubscription = require('../src/middleware/requireActiveSubscription');
const reportsRouter = require('../src/routes/reports');

const DONO = '00000000-0000-4000-8000-0000000000b1';
const MEMBRO = '00000000-0000-4000-8000-0000000000b2';
const WS = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const app = express();
app.use(express.json());
app.use(requireActiveSubscription);
app.use('/api/reports', reportsRouter);
const ATIVA = { plan_id: 'pro', status: 'active', current_period_end: new Date(Date.now() + 30 * 86400000).toISOString() };

function cenario({ subs = [ATIVA], memberPermissions = null } = {}) {
  require('../src/middleware/auth').invalidateAccessibleCache();
  const c = fake.reset();
  c.users[DONO] = { email: 'dono@exemplo.com', role: 'coach', cortesia_permanente: false };
  c.users[MEMBRO] = { email: 'membro@exemplo.com', role: 'coach', cortesia_permanente: false };
  c.workspaces[WS] = { owner_id: DONO, name: 'Sub-17' };
  c.members.push({ workspace_id: WS, user_id: MEMBRO, accepted: true, role: 'other', permissions: memberPermissions });
  subs.forEach((s, i) => c.subs.push({ user_id: DONO, workspace_id: WS, created_at: i + 1, ...s }));
  generated = [];
}
const post = (id) => request(app).post('/api/reports/convocacao')
  .set('Authorization', 'Bearer ' + jwt.sign({ id }, jwtSecret)).set('X-Workspace-Id', WS)
  .send({ session_id: '21ef30a2-98c0-4ecf-8f98-86ad72b1c8a1' });

test('permissão: convocacao exige games:view (a de abrir o jogo)', async () => {
  assert.strictEqual(R.PERMISSION.convocacao, 'games:view');
  cenario({ memberPermissions: ['training:view', 'stats:view'] });
  assert.strictEqual((await post(MEMBRO)).status, 403);
  cenario({ memberPermissions: ['games:view'] });
  const ok = await post(MEMBRO);
  assert.strictEqual(ok.status, 200);
  assert.match(ok.headers['content-type'], /application\/pdf/);
  assert.match(ok.headers['content-disposition'], /Convocacao_x_22-10-2026\.pdf/);
  assert.deepStrictEqual(generated.map((g) => g.tipo), ['convocacao']);
});

test('permissão: conta só leitura não exporta a convocação (402 pdf_export)', async () => {
  cenario({ subs: [] });
  const r = await post(DONO);
  assert.strictEqual(r.status, 402);
  assert.strictEqual(r.body.required_feature, 'pdf_export');
  assert.strictEqual(generated.length, 0);
});

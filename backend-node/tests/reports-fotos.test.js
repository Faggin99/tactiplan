// Modal "Fotos do relatório": validação da configuração (ids de outro clube,
// limites, escape), montagem por layout e prévia (HTML só das páginas de fotos).
// Uso: node --test tests/reports-fotos.test.js  (banco simulado; sem Chromium)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------- stubs (antes de carregar os relatórios)
const WS = 'aaaaaaaa-0000-4000-8000-0000000000f1';
const CLUB = 'cccccccc-0000-4000-8000-0000000000f1';
const S1 = '11111111-0000-4000-8000-000000000001'; // segunda
const S2 = '11111111-0000-4000-8000-000000000002'; // quarta
const OUTRA = '99999999-0000-4000-8000-000000000009'; // anexo de outro clube
const UP = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-modal-'));
process.env.UPLOAD_DIR = UP;

const FILES = [];
function stub(rel, exports) {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
stub('../src/config/database', {
  query: async (sql, params = []) => {
    if (/FROM clubs/.test(sql)) {
      return { rows: params[0] === CLUB && params[1].includes(WS) ? [{ id: CLUB, name: 'Uberlândia EC', modality: 'football_11', primary_color: '#1B8A3E', logo_path: null }] : [] };
    }
    if (/FROM training_activity_files f/.test(sql)) {
      return { rows: FILES.filter((f) => params[0].includes(f.session_id) && params[1].includes(f.workspace_id)) };
    }
    if (/FROM training_microcycles/.test(sql)) return { rows: [{ club_id: CLUB, category_id: null, week_identifier: '2026-43' }] };
    return { rows: [] };
  },
});
const SESSIONS = [
  { id: S1, date: '2026-10-19', session_type: 'training' },
  { id: S2, date: '2026-10-21', session_type: 'training' },
];
stub('../src/services/sessionData', {
  getSessionDetail: async (id, ws) => (id === S1 && ws.includes(WS)
    ? { id: S1, date: '2026-10-19', session_type: 'training', microcycle_id: 'm1', blocks: [], day_name: 'Segunda' } : null),
});
stub('../src/services/statsData', {
  getPeriodSessions: async () => SESSIONS,
  getTrainingStats: async () => ({}),
  getGameStats: async () => ({ matchesHistory: [] }),
  DEFAULT_DURATION_BY_MODALITY: {},
});

const PC = require('../src/reports/photoConfig');
const B = require('../src/reports/builders');
const { photoGrid } = require('../src/reports/templates/photos');
const R = require('../src/reports');
const { teamPalette } = require('../src/reports/theme');

const USER = { workspaceIds: [WS], allowedCategoryIds: null, assertCanAccessCategory: () => true };
const id = (n) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test.before(async () => {
  const sharp = require('sharp');
  fs.mkdirSync(path.join(UP, 'session-files'), { recursive: true });
  const mk = async (n, session, ws = WS, title = `Foto ${n}`) => {
    const rel = `session-files/f${n}.jpg`;
    await sharp({ create: { width: 800, height: 600, channels: 3, background: '#2563eb' } }).jpeg().toFile(path.join(UP, rel));
    FILES.push({ id: n === 99 ? OUTRA : id(n), session_id: session, activity_id: null, title, file_name: `f${n}.jpg`, file_path: `/uploads/${rel}`, mime_type: 'image/jpeg', created_at: `2026-10-19T1${n % 10}:00:00Z`, workspace_id: ws });
  };
  await mk(1, S1); await mk(2, S1); await mk(3, S1); await mk(4, S2);
  await mk(99, 'outra-sessao', 'outro-ws'); // de outro clube: nunca é candidata
});
test.after(() => fs.rmSync(UP, { recursive: true, force: true }));

// ---------------------------------------------------------------- validação (pura)
test('config: sem fotos = padrão; ids fora do relatório recusados (400)', () => {
  const ok = new Set([id(1), id(2)]);
  assert.strictEqual(PC.parseFotosConfig(undefined, ok), null);
  assert.throws(() => PC.parseFotosConfig({ ids: [id(1), OUTRA] }, ok), (e) => e.status === 400);
  assert.throws(() => PC.parseFotosConfig({ ids: 'x' }, ok), (e) => e.status === 400);
  assert.throws(() => PC.parseFotosConfig([], ok), (e) => e.status === 400);
  const c = PC.parseFotosConfig({ ids: [id(2), id(1), id(2)], layout: 'xx', proporcao: '16:9' }, ok);
  assert.deepStrictEqual(c.ids, [id(2), id(1)], 'ordem do usuário, sem repetir');
  assert.strictEqual(c.layout, 'medio');
  assert.strictEqual(c.proporcao, '4:3');
  assert.strictEqual(c.legendas, true);
  assert.deepStrictEqual(PC.parseFotosConfig({ ids: [] }, ok).ids, [], 'lista vazia = sem fotos');
});

test('config: no máximo 24 fotos; legenda até 120 caracteres e só de foto escolhida', () => {
  const many = Array.from({ length: 25 }, (_, i) => id(100 + i));
  assert.throws(() => PC.parseFotosConfig({ ids: many }, new Set(many)), /24/);
  assert.strictEqual(PC.parseFotosConfig({ ids: many.slice(0, 24) }, new Set(many)).ids.length, 24);
  const c = PC.parseFotosConfig({
    ids: [id(1)],
    legendasCustom: { [id(1)]: `  Linha\n${'x'.repeat(200)}`, [id(2)]: 'não escolhida', [OUTRA]: 'invasora' },
  }, new Set([id(1), id(2)]));
  assert.deepStrictEqual(Object.keys(c.legendasCustom), [id(1)]);
  assert.strictEqual(c.legendasCustom[id(1)].length, 120);
  assert.ok(c.legendasCustom[id(1)].startsWith('Linha x'), 'quebra de linha vira espaço');
});

test('config aplicada: ordem do usuário e legenda trocada só no relatório', () => {
  const cands = [{ id: 'a', caption: { title: 'A', context: 'Bloco 1' } }, { id: 'b', caption: { title: 'B', context: '' } }];
  const c = PC.parseFotosConfig({ ids: ['b', 'a'], legendasCustom: { a: 'Nova' } }, new Set(['a', 'b']));
  const out = PC.applyFotosConfig(cands, c);
  assert.deepStrictEqual(out.map((p) => [p.id, p.caption.title, p.caption.context]), [['b', 'B', ''], ['a', 'Nova', 'Bloco 1']]);
  assert.strictEqual(cands[0].caption.title, 'A', 'não altera o anexo de origem');
});

// ---------------------------------------------------------------- montagem por layout
const items = (n) => Array.from({ length: n }, (_, i) => ({ src: `img/foto-${i + 1}.jpg`, caption: { title: `T${i}`, context: 'Bloco' } }));

test('layouts: grande=1, médio=2, compacto=3 por linha; mosaico com destaque', () => {
  assert.match(photoGrid(items(4), { layout: 'grande' }), /class="photos c1"/);
  assert.match(photoGrid(items(4), { layout: 'medio', proporcao: '1:1' }), /class="photos c2 r11"/);
  assert.match(photoGrid(items(4), { layout: 'compacto', proporcao: 'original' }), /class="photos c3 rorig"/);
  const mos = photoGrid(items(5), { layout: 'mosaico', proporcao: '4:3' });
  assert.match(mos, /class="photos c3 mosaic r43"/);
  assert.strictEqual((mos.match(/ph-item hero/g) || []).length, 1, 'só a 1ª é destaque');
  assert.ok(mos.includes('<div class="ph-hero" data-unit>'), 'destaque + 2 vizinhas = 1 unidade do paginador');
  assert.strictEqual((mos.match(/data-unit/g) || []).length, 3, 'unidade do destaque + 2 fotos soltas');
  assert.match(photoGrid(items(2), { layout: 'mosaico' }), /class="photos c2"/, 'mosaico com 2 fotos vira médio');
  assert.match(photoGrid(items(1), { layout: 'mosaico' }), /class="photos c1"/);
  assert.ok(!photoGrid(items(3), { layout: 'medio', legendas: false }).includes('figcaption'), 'sem legendas');
});

test('legenda do usuário é escapada no HTML', () => {
  const html = photoGrid([{ src: 'img/foto-1.jpg', caption: { title: '<img src=x onerror=alert(1)>', context: '"Bloco" & <b>' } }], { layout: 'medio' });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&quot;Bloco&quot; &amp; &lt;b&gt;'));
});

test('seção: padrão mantém a regra antiga; escolha sem "+N" e lista corrida', () => {
  const byDay = new Map([['s1', { date: '2026-10-19' }], ['s2', { date: '2026-10-21' }]]);
  const ph = [{ id: 'a', session_id: 's1' }, { id: 'b', session_id: 's2' }, { id: 'c', session_id: 's1' }];
  const def = B.buildPhotoSection({ items: ph, hidden: 5, sessionsById: byDay });
  assert.deepStrictEqual([def.hidden, def.total, def.grid.layout, def.grid.proporcao], [5, 8, 'medio', null]);
  assert.deepStrictEqual(def.groups.map((g) => g.items.map((p) => p.id)), [['a', 'c'], ['b']]);
  const cfg = PC.parseFotosConfig({ ids: ['a', 'b', 'c'], layout: 'mosaico', agrupar: false }, new Set(['a', 'b', 'c']));
  const sel = B.buildPhotoSection({ items: ph, hidden: 5, config: cfg, sessionsById: byDay });
  assert.deepStrictEqual([sel.hidden, sel.total, sel.groups, sel.grid.layout], [0, 3, null, 'mosaico']);
  assert.strictEqual(B.buildPhotoSection({ items: items(6) }).grid.layout, 'compacto');
});

// ---------------------------------------------------------------- lista, prévia e PDF (fluxo do index)
test('lista do modal: só fotos do dia/semana do clube, com miniatura e seleção padrão', async () => {
  const dia = await R.listReportPhotos('sessao', { session_id: S1 }, USER);
  assert.deepStrictEqual(dia.fotos.map((f) => f.id), [id(1), id(2), id(3)]);
  assert.match(dia.fotos[0].thumb, /^data:image\/jpeg;base64,/);
  assert.strictEqual(dia.fotos[0].dia, 'Segunda-feira');
  assert.deepStrictEqual(dia.padrao.ids, [id(1), id(2), id(3)]);
  const semana = await R.listReportPhotos('treino', { club_id: CLUB, start_date: '2026-10-19', end_date: '2026-10-25', filter_type: '1-micro' }, USER);
  assert.strictEqual(semana.semana, true);
  assert.deepStrictEqual(semana.fotos.map((f) => f.id), [id(1), id(2), id(3), id(4)]);
  assert.ok(!semana.fotos.some((f) => f.id === OUTRA));
  assert.deepStrictEqual(semana.padrao.ids.slice(0, 2), [id(1), id(4)], 'padrão em rodízio entre os dias');
  const mes = await R.listReportPhotos('treino', { club_id: CLUB, start_date: '2026-10-01', end_date: '2026-10-31' }, USER);
  assert.strictEqual(mes.fotos.length, 0, 'período longo não tem fotos');
  assert.strictEqual((await R.listReportPhotos('jogos', {}, USER)).fotos.length, 0);
});

test('prévia: só a página de fotos, miniaturas e fontes embutidas; id de outro clube → 400', async () => {
  const body = { session_id: S1, fotos: { ids: [id(3), id(1), id(2)], layout: 'mosaico', proporcao: 'original', legendasCustom: { [id(3)]: 'Saída <de> bola' } } };
  const p = await R.previewReportPhotos('sessao', body, USER);
  assert.strictEqual(p.fotos, 3);
  assert.ok(p.html.includes('Registro fotográfico'));
  assert.ok(!p.html.includes('Observações'), 'sem a página de blocos');
  assert.ok(p.html.includes('photos c3 mosaic rorig'));
  assert.ok(p.html.includes('Saída &lt;de&gt; bola'));
  assert.ok(p.html.includes('src="data:image/jpeg;base64,'));
  assert.ok(p.html.includes('url(data:font/woff2;base64,'));
  assert.ok(!/src="img\//.test(p.html), 'nenhuma referência externa');
  assert.ok(p.html.includes('tp-report-preview'), 'paginador avisa o app');
  await assert.rejects(R.previewReportPhotos('sessao', { session_id: S1, fotos: { ids: [OUTRA] } }, USER), (e) => e.status === 400);
  await assert.rejects(R.previewReportPhotos('sessao', { session_id: S1, fotos: { ids: [id(4)] } }, USER), (e) => e.status === 400, 'foto de outro dia');
  const vazio = await R.previewReportPhotos('sessao', { session_id: S1, fotos: { ids: [] } }, USER);
  assert.strictEqual(vazio.html, null);
});

test('PDF: ids = [] sai sem a seção; escolha na semana em lista corrida', async () => {
  const semFotos = await R.BUILDERS.sessao({ session_id: S1, fotos: { ids: [] } }, USER, new Map(), 'pdf');
  assert.ok(!semFotos.html.includes('Registro fotográfico'));
  const padrao = await R.BUILDERS.sessao({ session_id: S1 }, USER, new Map(), 'pdf');
  assert.ok(padrao.html.includes('Registro fotográfico'), 'sem config continua com fotos');
  assert.ok(padrao.html.includes('photos c2"'), 'padrão antigo: até 4 fotos = 2 por linha');
  const assets = new Map();
  const wk = await R.BUILDERS.treino({
    club_id: CLUB, start_date: '2026-10-19', end_date: '2026-10-25', filter_type: '1-micro',
    fotos: { ids: [id(4), id(1)], layout: 'grande', agrupar: false, legendas: false },
  }, USER, assets, 'pdf');
  assert.ok(wk.html.includes('Fotos da semana'));
  assert.ok(wk.html.includes('photos c1 r43'));
  assert.ok(!wk.html.includes('class="ph-day"'), 'lista corrida');
  assert.ok(!wk.html.includes('figcaption'));
  assert.strictEqual(assets.size, 2, 'só as 2 escolhidas');
});

test('preview CSS e cor do time no HTML da prévia', async () => {
  const p = await R.previewReportPhotos('treino', { club_id: CLUB, start_date: '2026-10-19', end_date: '2026-10-25', fotos: { ids: [id(1), id(4)] } }, USER);
  assert.ok(p.html.includes(`--team:${teamPalette('#1B8A3E').team}`));
  assert.ok(p.html.includes('class="ph-day"'), 'agrupado por dia por padrão');
  assert.ok(p.html.includes('box-shadow'));
});

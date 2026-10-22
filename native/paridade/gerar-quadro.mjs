#!/usr/bin/env node
// Gera native/paridade/quadro.json: casos do QUADRO TÁTICO (fase T5 do app) calculados pelo
// CÓDIGO DO WEB (frontend/src/modules/tactical-board):
//   - medidas, vista, dimensões do canvas e limites de arrasto → utils/fieldDimensions.js (import)
//   - formações e espelho do Time B                          → utils/defaultFormations.js (import)
//   - interpolação entre quadros                             → utils/interpolation.js (import)
//   - estado do editor (peças, desenhos, quadros, desfazer/refazer, alterações não salvas,
//     formações não-destrutivas, abrir e salvar)            → hooks/useTacticalBoard.js, executado
//                                                             com um React mínimo (só estado)
//   - geometria do gramado/linhas                            → pitchGeometry do FieldBackground.jsx
//   - cor rgba das zonas                                     → hexToRgba do TacticalCanvas.jsx
//   - curva do desenho livre                                 → expandPoints do Konva (Line.js)
//   - catálogos (setas, objetos, cores, vistas, velocidades) → TacticalBoardPage/PlaybackControls
//   - ritmo do vídeo                                         → constantes do useVideoExport.js
// Regras de tela que no web moram dentro do JSX (seta curva, raio da zona, distância mínima,
// nome no token, nº da camisa) estão TRANSCRITAS abaixo, com o trecho de origem citado.
// Os testes do app (TactiPlanKit e Android) leem este arquivo e conferem o MESMO resultado.
//   node native/paridade/gerar-quadro.mjs          → regrava o arquivo
//   node native/paridade/gerar-quadro.mjs --check  → falha se o web mudou e o arquivo não
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '../..');
const TB = 'frontend/src/modules/tactical-board';
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const SAIDA = path.join(AQUI, 'quadro.json');

const campo = await import(path.join(RAIZ, TB, 'utils/fieldDimensions.js'));
const form = await import(path.join(RAIZ, TB, 'utils/defaultFormations.js'));
const interp = await import(path.join(RAIZ, TB, 'utils/interpolation.js'));

function corpoDaFuncao(src, nome, rotulo) {
  const i = src.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error(`${rotulo} sem ${nome}`);
  let n = 0; let j = src.indexOf('{', src.indexOf(')', i));
  for (; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}') { n--; if (n === 0) break; } }
  return src.slice(i, j + 1);
}

// Literal `const NOME = ...;` do topo de um arquivo, avaliado (com os nomes que ele usa).
function constante(arquivo, nome, escopo = {}) {
  const src = ler(arquivo);
  const i = src.indexOf(`const ${nome} =`);
  if (i < 0) throw new Error(`${arquivo} sem ${nome}`);
  const ini = src.indexOf('=', i) + 1;
  let n = 0; let j = ini;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '[' || ch === '{' || ch === '(') n++;
    else if (ch === ']' || ch === '}' || ch === ')') n--;
    else if (ch === ';' && n === 0) break;
  }
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(escopo), `return (${src.slice(ini, j)});`)(...Object.values(escopo));
}

// ---------------------------------------------------------------- React mínimo (só estado)
// O hook do web roda de verdade: useState/useRef guardam valor por posição, useCallback devolve
// a própria função, e a cada ação o hook é "renderizado" de novo para ler o estado novo.
function montarHook() {
  const src = ler(`${TB}/hooks/useTacticalBoard.js`)
    .replace(/^import .*$/gm, '')
    .replace(/^export /gm, '');
  let slots = []; let i = 0;
  const React = {
    useState(ini) {
      const k = i++;
      if (!(k in slots)) slots[k] = typeof ini === 'function' ? ini() : ini;
      return [slots[k], (v) => { slots[k] = typeof v === 'function' ? v(slots[k]) : v; }];
    },
    useRef(ini) { const k = i++; if (!(k in slots)) slots[k] = { current: ini }; return slots[k]; },
    useCallback(fn) { i++; return fn; },
  };
  // eslint-disable-next-line no-new-func
  const useTacticalBoard = new Function('useState', 'useCallback', 'useRef', 'FIELD_TYPES', 'FIELD_VIEWS',
    `${src}\nreturn useTacticalBoard;`)(React.useState, React.useCallback, React.useRef, campo.FIELD_TYPES, campo.FIELD_VIEWS);
  return {
    novo(opts) { slots = []; i = 0; this.opts = opts; return this.render(); },
    render() { i = 0; return useTacticalBoard(this.opts); },
  };
}

// ids gerados (tipo-agora-contador) viram "#n" pela ordem em que aparecem: quadros → peças → desenhos.
function normalizar(estado) {
  const mapa = new Map();
  const nome = (id) => { if (id == null) return null; if (!mapa.has(id)) mapa.set(id, `#${mapa.size + 1}`); return mapa.get(id); };
  const frames = estado.frames.map((f) => ({
    ...f,
    elements: f.elements.map((e) => ({ ...e, id: nome(e.id) })),
    drawings: (f.drawings || []).map((d) => ({ ...d, id: nome(d.id) })),
  }));
  return {
    frames,
    currentFrameIndex: estado.currentFrameIndex,
    canUndo: estado.canUndo,
    canRedo: estado.canRedo,
    isDirty: estado.isDirty,
    fieldType: estado.fieldType,
    fieldView: estado.fieldView,
    teamAColor: estado.teamAColor,
    teamBColor: estado.teamBColor,
    selectedElementId: estado.selectedElementId == null ? null : (mapa.get(estado.selectedElementId) || '?'),
    selectedDrawingId: estado.selectedDrawingId == null ? null : (mapa.get(estado.selectedDrawingId) || '?'),
  };
}

const hook = montarHook();
// Date.now fixo: só o formato do id importa (o teste normaliza).
const agoraReal = Date.now;
Date.now = () => 1767225600000;

// leve = só as marcas (quadro atual, desfazer/refazer, alterado, nº de peças) nos passos do meio.
function rodar(roteiro, opts = { initialFieldType: 'football_11' }, leve = false) {
  let b = hook.novo(opts);
  const refs = [];
  const passos = roteiro.map((acao, k) => {
    const id = (r) => refs[r];
    let resultado = null;
    switch (acao.op) {
      case 'addElement': resultado = b.addElement(acao.data); refs[k] = resultado; resultado = null; break;
      case 'removeElement': b.removeElement(id(acao.ref)); break;
      case 'updateElementPosition': b.updateElementPosition(id(acao.ref), acao.x, acao.y); break;
      case 'updateElementProps': b.updateElementProps(id(acao.ref), acao.patch); break;
      case 'nextGenericJersey': resultado = b.nextGenericJersey(acao.team); break;
      case 'applyFormations': resultado = b.applyFormations(acao.apps); break;
      case 'addDrawing': refs[k] = b.addDrawing(acao.data); break;
      case 'removeDrawing': b.removeDrawing(id(acao.ref)); break;
      case 'updateDrawing': b.updateDrawing(id(acao.ref), acao.patch); break;
      case 'selectElement': b.setSelectedElementId(acao.ref == null ? null : id(acao.ref)); break;
      case 'selectDrawing': b.setSelectedDrawingId(acao.ref == null ? null : id(acao.ref)); break;
      case 'addFrame': b.addFrame(); break;
      case 'deleteFrame': b.deleteFrame(); break;
      case 'goToFrame': b.goToFrame(acao.index); break;
      case 'goToNextFrame': b.goToNextFrame(); break;
      case 'goToPrevFrame': b.goToPrevFrame(); break;
      case 'undo': b.undo(); break;
      case 'redo': b.redo(); break;
      case 'markSaved': b.markSaved(); break;
      case 'resetBoard': b.resetBoard(); break;
      case 'loadPlay': b.loadPlay(acao.play); break;
      case 'setFieldType': b.setFieldType(acao.value); break;
      case 'setFieldView': b.setFieldView(acao.value); break;
      case 'setTeamAColor': b.setTeamAColor(acao.value); break;
      case 'setTeamBColor': b.setTeamBColor(acao.value); break;
      case 'getPlayData': resultado = b.getPlayData(); break;
      default: throw new Error(`ação desconhecida ${acao.op}`);
    }
    b = hook.render();
    if (acao.op === 'getPlayData') {
      const n = normalizar({ ...b, frames: resultado.keyframes });
      resultado = { ...resultado, keyframes: n.frames };
    }
    const estado = normalizar(b);
    if (leve && k < roteiro.length - 1) {
      return { acao, resultado, marcas: { currentFrameIndex: estado.currentFrameIndex, canUndo: estado.canUndo, canRedo: estado.canRedo, isDirty: estado.isDirty, pecas: estado.frames.map((f) => f.elements.length) } };
    }
    return { acao, resultado, estado };
  });
  return passos;
}

// ---------------------------------------------------------------- jogada real (conta demo)
// Cópia da jogada "Pressão pós-perda (5 segundos)" da conta demo (GET /api/plays/:id), sem
// datas/ids de conta. Ela NÃO é regravada no banco: o teste só abre e serializa.
const jogadaReal = JSON.parse(fs.readFileSync(path.join(AQUI, 'jogada-demo.json'), 'utf8'));

// ---------------------------------------------------------------- roteiros do editor
const jogA = (x, y, n, extra = {}) => ({ type: 'player', team: 'A', jerseyNumber: n, name: '', athleteId: null, isGoalkeeper: false, x, y, ...extra });
const jogB = (x, y, n, extra = {}) => ({ type: 'player', team: 'B', jerseyNumber: n, name: '', athleteId: null, isGoalkeeper: false, x, y, ...extra });
const f11 = form.getFormationsForFieldType('football_11');
const futsal = form.getFormationsForFieldType('futsal');

const roteiros = {
  pecasEQuadros: [
    { op: 'addElement', data: jogA(40, 30, 2) },
    { op: 'addElement', data: { type: 'ball', team: null, x: 50, y: 50 } },
    { op: 'addElement', data: { type: 'marker', team: null, markerType: 'cone', x: 61.5, y: 44.25 } },
    { op: 'nextGenericJersey', team: 'A' },
    { op: 'nextGenericJersey', team: 'B' },
    { op: 'addFrame' },
    { op: 'updateElementPosition', ref: 0, x: 72.5, y: 18 },
    { op: 'updateElementPosition', ref: 1, x: 80, y: 30 },
    { op: 'addFrame' },
    { op: 'updateElementPosition', ref: 1, x: 99, y: 48 },
    { op: 'goToFrame', index: 0 },
    { op: 'addElement', data: jogB(70, 60, 5) },
    { op: 'goToFrame', index: 2 },
    { op: 'addElement', data: jogB(30, 70, 8, { name: 'Zé' }) },
    { op: 'updateElementProps', ref: 0, patch: { jerseyNumber: 10, name: 'Camisa 10' } },
    { op: 'updateElementProps', ref: 2, patch: { rotation: 45 } },
    { op: 'selectElement', ref: 11 },
    { op: 'removeElement', ref: 11 },
    { op: 'goToPrevFrame' },
    { op: 'deleteFrame' },
    { op: 'goToNextFrame' },
    { op: 'goToNextFrame' },
    { op: 'goToFrame', index: 9 },
    { op: 'goToFrame', index: -3 },
  ],
  desfazerRefazerESalvo: [
    { op: 'addElement', data: jogA(10, 10, 2) },
    { op: 'addElement', data: jogA(20, 20, 3) },
    { op: 'markSaved' },
    { op: 'updateElementPosition', ref: 0, x: 11, y: 12 },
    { op: 'undo' },
    { op: 'redo' },
    { op: 'undo' },
    { op: 'undo' },
    { op: 'undo' },
    { op: 'undo' },
    { op: 'redo' },
    { op: 'addFrame' },
    { op: 'undo' },
    { op: 'redo' },
    { op: 'addElement', data: { type: 'ball', team: null, x: 50, y: 50 } },
    { op: 'redo' },
    { op: 'setFieldView', value: 'left_half' },
    { op: 'markSaved' },
    { op: 'setTeamAColor', value: '#22c55e' },
    { op: 'markSaved' },
    { op: 'deleteFrame' },
    { op: 'deleteFrame' },
    { op: 'deleteFrame' },
  ],
  limiteDoHistorico: [
    ...Array.from({ length: 56 }, (_, k) => ({ op: 'addElement', data: jogA(k, k, k + 2) })),
    ...Array.from({ length: 52 }, () => ({ op: 'undo' })),
    { op: 'redo' },
  ],
  limiteComSalvo: [
    { op: 'markSaved' },
    ...Array.from({ length: 51 }, (_, k) => ({ op: 'addElement', data: jogA(k, 50, k + 2) })),
    ...Array.from({ length: 50 }, () => ({ op: 'undo' })),
  ],
  desenhos: [
    { op: 'addElement', data: jogA(30, 30, 2) },
    { op: 'addDrawing', data: { drawType: 'arrow_straight', x1: 10, y1: 10, x2: 30, y2: 40, color: '#fbbf24', strokeWidth: 2.5, dash: [8, 5] } },
    { op: 'addFrame' },
    { op: 'addDrawing', data: { drawType: 'zone_rect', x: 20, y: 20, w: 30, h: 15, color: 'rgba(239,68,68,0.15)', strokeColor: 'rgba(239,68,68,0.5)' } },
    { op: 'addDrawing', data: { drawType: 'text', x: 50, y: 50, text: 'Pressão', color: '#ffffff', fontSize: 14 } },
    { op: 'goToFrame', index: 0 },
    { op: 'updateDrawing', ref: 1, patch: { color: '#ef4444', strokeWidth: 4 } },
    { op: 'updateDrawing', ref: 4, patch: { x: 55, y: 48 } },
    { op: 'selectDrawing', ref: 1 },
    { op: 'selectElement', ref: 0 },
    { op: 'removeDrawing', ref: 1 },
    { op: 'selectDrawing', ref: 3 },
    { op: 'removeDrawing', ref: 3 },
    { op: 'undo' },
    { op: 'addFrame' },
    { op: 'getPlayData' },
  ],
  formacoes: [
    { op: 'addElement', data: jogA(50, 50, 9) },
    { op: 'addElement', data: jogA(55, 50, 7, { isGoalkeeper: true }) },
    { op: 'addElement', data: jogA(60, 50, '3') },
    { op: 'addElement', data: jogA(65, 50, '', { athleteId: 'atleta-real', name: 'Real Silva' }) },
    { op: 'addElement', data: jogA(70, 50, 3) },
    { op: 'addElement', data: { type: 'ball', team: null, x: 50, y: 50 } },
    { op: 'addFrame' },
    { op: 'applyFormations', apps: [{ team: 'A', positions: f11['4-3-3'].positions }] },
    { op: 'applyFormations', apps: [{ team: 'B', positions: form.mirrorFormation(f11['4-4-2'].positions) }] },
    { op: 'goToFrame', index: 0 },
    { op: 'applyFormations', apps: [
      { team: 'A', positions: futsal['1-2-2'].positions },
      { team: 'B', positions: form.mirrorFormation(futsal['1-2-2'].positions) },
    ] },
    { op: 'undo' },
    { op: 'nextGenericJersey', team: 'A' },
  ],
  abrirESalvar: [
    { op: 'addElement', data: jogA(1, 1, 2) },
    { op: 'setFieldType', value: 'futsal' },
    { op: 'loadPlay', play: jogadaReal },
    { op: 'getPlayData' },
    { op: 'goToNextFrame' },
    { op: 'updateElementPosition', ref: 0, x: 1, y: 1 },
    { op: 'loadPlay', play: { name: 'sem quadros', keyframes: [] } },
    { op: 'loadPlay', play: { name: 'nulos', field_type: null, keyframes: null } },
    { op: 'loadPlay', play: { name: 'sem drawings', field_type: 'football_7', field_view: 'third_right', team_a_color: '#000000', team_b_color: '#ffffff', keyframes: [{ index: 0, elements: [{ id: 'p1', type: 'player', team: 'A', x: 120, y: -8, jerseyNumber: 4 }], extra: 'mantém' }, { index: 1, elements: [] }] } },
    { op: 'getPlayData' },
    { op: 'resetBoard' },
    { op: 'getPlayData' },
  ],
};

const LEVES = new Set(['limiteDoHistorico', 'limiteComSalvo']);
const editor = Object.fromEntries(Object.entries(roteiros).map(([k, r]) => [k, rodar(r, undefined, LEVES.has(k))]));
// Futsal como modalidade inicial do quadro (sport.defaultFieldType).
editor.inicialFutsal = rodar([{ op: 'getPlayData' }], { initialFieldType: 'futsal' });
Date.now = agoraReal;

// "Salvar" do web: persistPlay = { ...getPlayData(), name, description, club_id }.
function corpoSalvar(play, { name, description, clubId }) {
  const b = hook.novo({ initialFieldType: 'football_11' });
  b.loadPlay(play);
  const d = hook.render().getPlayData();
  return { ...d, name, description, club_id: clubId };
}
const salvar = [
  { jogada: jogadaReal, nome: jogadaReal.name, descricao: jogadaReal.description || '', clubeId: 'clube-atual', corpo: corpoSalvar(jogadaReal, { name: jogadaReal.name, description: jogadaReal.description || '', clubId: 'clube-atual' }) },
  { jogada: { id: 'x', name: 'Só nome', keyframes: [] }, nome: 'Renomeada', descricao: '', clubeId: null, corpo: corpoSalvar({ id: 'x', name: 'Só nome', keyframes: [] }, { name: 'Renomeada', description: '', clubId: null }) },
];

// ---------------------------------------------------------------- campo
const TIPOS = Object.values(campo.FIELD_TYPES);
const VISTAS = Object.values(campo.FIELD_VIEWS);
const TAMANHOS = [[800, 500], [844, 390], [390, 844], [1280, 720], [667, 375], [300, 200], [1920, 1080], [50, 30], [932, 430.5]];
const fb = ler(`${TB}/components/canvas/FieldBackground.jsx`);
// eslint-disable-next-line no-new-func
const pitchGeometry = new Function('getPitchSpec', 'getViewWindow', `${corpoDaFuncao(fb, 'pitchGeometry', 'FieldBackground')}\nreturn pitchGeometry;`)(campo.getPitchSpec, campo.getViewWindow);

const dimensoes = [];
for (const [w, h] of TAMANHOS) for (const tipo of TIPOS) for (const vista of VISTAS) for (const reserva of [0, 64]) {
  const dims = campo.calculateCanvasDimensions(w, h, tipo, vista, reserva);
  const g = pitchGeometry(tipo, vista, dims);
  const L = g.spec.length;
  dimensoes.push({
    entrada: { w, h, tipo, vista, reserva },
    dims,
    limites20: campo.getDragBounds(dims),
    limites4: campo.getDragBounds(dims, 4),
    geometria: { s: g.s, ox: g.ox, oy: g.oy, x0: g.X(0), xL: g.X(L), clip: g.clipProps },
  });
}

const conversao = [];
for (const [pct, total] of [[0, 400], [50, 400], [12.5, 333], [-7.5, 520], [112, 260], [33.333, 91]]) {
  conversao.push({ pct, total, px: campo.toPixel(pct, total), volta: campo.toPercent(campo.toPixel(pct, total), total) });
}
const limitesBase = campo.getDragBounds(campo.calculateCanvasDimensions(844, 390, 'football_11', 'full', 64));
const clamp = [[50, 50], [-30, 50], [140, -20], [5, 200], [-100, -100], [101, 99]].map(([x, y]) => ({ x, y, limites: limitesBase, saida: campo.clampToBounds(x, y, limitesBase) }));

// Meia-lua (RectangularField): parte do círculo do pênalti fora da grande área — transcrito.
const meiaLua = Object.fromEntries(TIPOS.map((t) => {
  const f = campo.getPitchSpec(t);
  let graus = 0;
  if (f.penaltyArcRadius && f.penaltyArcRadius > f.penaltyArea.depth - f.penaltySpot) {
    graus = (Math.acos((f.penaltyArea.depth - f.penaltySpot) / f.penaltyArcRadius) * 180) / Math.PI;
  }
  return [t, graus];
}));

// ---------------------------------------------------------------- interpolação
const kf = jogadaReal.keyframes;
const interpolacao = [0, 0.25, 0.5, 0.731, 1].map((t) => ({ a: 0, b: 1, t, saida: interp.interpolateElements(kf[0], kf[1], t) }));
const fA = { index: 0, elements: [{ id: 'p', type: 'player', x: 10, y: 10 }, { id: 'só-no-a', type: 'ball', x: 1, y: 2 }] };
const fB = { index: 1, elements: [{ id: 'p', type: 'player', x: 30, y: -5 }, { id: 'só-no-b', type: 'ball', x: 9, y: 9 }] };
interpolacao.push({ quadroA: fA, quadroB: fB, t: 0.5, saida: interp.interpolateElements(fA, fB, 0.5) });
interpolacao.push({ quadroA: fA, quadroB: null, t: 0.5, saida: interp.interpolateElements(fA, null, 0.5) });

// ---------------------------------------------------------------- desenho (TacticalCanvas)
const tc = ler(`${TB}/components/canvas/TacticalCanvas.jsx`);
// eslint-disable-next-line no-new-func
const hexToRgba = new Function(`${corpoDaFuncao(tc, 'hexToRgba', 'TacticalCanvas')}\nreturn hexToRgba;`)();
const rgba = ['#ffffff', '#fbbf24', '#ef4444', '#22C55E', '#abc', 'white', 'rgba(1,2,3,0.4)', '#12345678', null]
  .flatMap((c) => [0.15, 0.5].map((a) => ({ cor: c, alfa: a, saida: hexToRgba(c, a) })));

// Seta curva / zona circular / distância mínima — transcritos do finishDrawing.
const dimsDesenho = campo.calculateCanvasDimensions(844, 390, 'football_11', 'full', 64);
const curva = (x1, y1, x2, y2) => ({ cx: (x1 + x2) / 2 - (y2 - y1) * 0.3, cy: (y1 + y2) / 2 + (x2 - x1) * 0.3 });
const raioPct = (x1, y1, x2, y2, d) => {
  const dx = campo.toPixel(x2 - x1, d.width); const dy = campo.toPixel(y2 - y1, d.height);
  return campo.toPercent(Math.sqrt(dx * dx + dy * dy), d.height);
};
const distPx = (x1, y1, x2, y2, d) => {
  const dx = campo.toPixel(x2 - x1, d.width); const dy = campo.toPixel(y2 - y1, d.height);
  return Math.sqrt(dx * dx + dy * dy);
};
const tracos = [[10, 20, 40, 60], [50, 50, 50.5, 50.5], [80, 10, 20, 90], [0, 0, 1.2, 0]].map(([x1, y1, x2, y2]) => ({
  x1, y1, x2, y2, curva: curva(x1, y1, x2, y2), raio: raioPct(x1, y1, x2, y2, dimsDesenho), distPx: distPx(x1, y1, x2, y2, dimsDesenho),
  valido: distPx(x1, y1, x2, y2, dimsDesenho) >= 8,
}));

// Konva Line tension 0.3 (desenho livre): pontos de controle de Line.js.
const konva = ler('frontend/node_modules/konva/lib/shapes/Line.js');
// eslint-disable-next-line no-new-func
const expandPoints = new Function(`${corpoDaFuncao(konva, 'getControlPoints', 'Konva Line')}\n${corpoDaFuncao(konva, 'expandPoints', 'Konva Line')}\nreturn expandPoints;`)();
const livre = [
  [10, 10, 20, 15, 30, 10],
  [0, 0, 10, 0, 10, 10, 0, 10, 5, 5],
  [5, 5, 5, 5, 6, 7, 9, 9],
].map((p) => ({ pontos: p, tensao: 0.3, controle: expandPoints(p, 0.3) }));

// Nome no token (PlayerToken): name.length > 10 ? name.slice(0, 9) + '…' : name — transcrito.
const nomeToken = ['', 'Gabriel', 'Pedro Henri', 'Maximiliano', 'Jogador Muito Comprido', 'Ana'].map((n) => ({ nome: n, saida: n.length > 10 ? `${n.slice(0, 9)}…` : n }));
// Camisa (SelectionPanel.commitJersey): parseInt(v, 10), 1..99 e diferente da atual — transcrito.
const camisa = [['7', 10], ['12abc', 10], [' 9', 10], ['0', 10], ['100', 10], ['-3', 10], ['', 10], ['abc', 10], ['10', 10], ['10', '10'], ['4.9', 1]]
  .map(([v, atual]) => { const n = parseInt(v, 10); return { valor: v, atual, saida: (Number.isFinite(n) && n >= 1 && n <= 99 && n !== atual) ? n : null }; });
// Nome (commitName): trim().slice(0, 12) — transcrito.
const nomeSel = ['  Ana  ', 'Nome com mais de doze letras', '', 'Exatamente12'].map((v) => ({ valor: v, saida: v.trim().slice(0, 12) }));
// Rotação (SelectionPanel.rotate): ((rot + delta) % 360 + 360) % 360 — transcrito.
const rotacao = [[0, 45], [0, -45], [315, 45], [350, 45], [-30, -45], [720, 45]].map(([r, d]) => ({ rotacao: r, delta: d, saida: (((r + d) % 360) + 360) % 360 }));

// ---------------------------------------------------------------- catálogos
const pagina = `${TB}/pages/TacticalBoardPage.jsx`;
const catalogos = {
  setas: constante(pagina, 'ARROW_TOOLS'),
  objetos: constante(pagina, 'MARKER_TYPES'),
  vistas: constante(pagina, 'FIELD_VIEW_OPTIONS', { FIELD_VIEWS: campo.FIELD_VIEWS }),
  tiposCampo: constante(pagina, 'FIELD_TYPE_OPTIONS', { FIELD_TYPES: campo.FIELD_TYPES }),
  coresDesenho: constante(pagina, 'DRAWING_COLORS'),
  velocidades: constante(`${TB}/components/toolbar/PlaybackControls.jsx`, 'SPEED_OPTIONS'),
  girar: [...constante(`${TB}/components/canvas/MarkerToken.jsx`, 'ROTATABLE_MARKERS', { Set })],
};

// ---------------------------------------------------------------- ritmo (play e vídeo)
const numero = (arquivo, nome) => Number(constante(arquivo, nome));
const ritmo = {
  quadroMs: numero(`${TB}/hooks/usePlayback.js`, 'FRAME_DURATION_MS'),
  video: { fps: numero(`${TB}/hooks/useVideoExport.js`, 'EXPORT_FPS'), quadroMs: numero(`${TB}/hooks/useVideoExport.js`, 'FRAME_DURATION_MS') },
};
// Laço do startExport: cada transição tem os passos 0..ceil(s*fps) (inclusive) e o fim segura fps quadros.
function linhaDoVideo(n) {
  const out = [];
  const passos = Math.ceil((ritmo.video.quadroMs / 1000) * ritmo.video.fps);
  for (let f = 0; f < n - 1; f++) for (let s = 0; s <= passos; s++) out.push([f, s / passos]);
  for (let k = 0; k < ritmo.video.fps && n > 1; k++) out.push([n - 2, 1]);
  return out;
}
ritmo.video.linhas = [1, 2, 3, 5].map((n) => ({ quadros: n, total: linhaDoVideo(n).length, segundos: linhaDoVideo(n).length / ritmo.video.fps }));
ritmo.video.linha3 = linhaDoVideo(3);

// ---------------------------------------------------------------- formações
const formacoes = Object.fromEntries(TIPOS.map((t) => [t, Object.entries(form.getFormationsForFieldType(t)).map(([k, f]) => ({ chave: k, rotulo: f.label, posicoes: f.positions, espelho: form.mirrorFormation(f.positions) }))]));

const saida = {
  campo: { tipos: campo.FIELD_TYPES, vistas: campo.FIELD_VIEWS, medidas: campo.PITCH_SPECS, meiaLua, conversao, clamp, dimensoes },
  formacoes,
  interpolacao,
  desenho: { rgba, tracos, dimsDesenho, livre, nomeToken, camisa, nomeSelecao: nomeSel, rotacao },
  catalogos,
  ritmo,
  editor,
  jogadaReal,
  salvar,
};

const texto = `${JSON.stringify(saida, null, 1)}\n`;
if (process.argv.includes('--check')) {
  const atual = fs.existsSync(SAIDA) ? fs.readFileSync(SAIDA, 'utf8') : '';
  if (atual !== texto) { console.error('native/paridade/quadro.json desatualizado: rode node native/paridade/gerar-quadro.mjs'); process.exit(1); }
  console.log('quadro.json em dia');
} else {
  fs.writeFileSync(SAIDA, texto);
  console.log(`gravado ${path.relative(RAIZ, SAIDA)}`);
}

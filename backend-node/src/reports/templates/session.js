// Relatório 3 — Ficha de sessão (1 página; + "Registro fotográfico" se houver fotos).
const F = require('../format');
const C = require('./components');
const { photoPageBody, photoGrid } = require('./photos');

const esc = F.esc;

function pillarLegend(vm) {
  if (!vm.pillarsPresent.length) return '';
  return `<span class="legend" style="display:inline-flex">${vm.pillarsPresent
    .map((k) => `<span><i class="dot" style="background:${C.dimInfo(k).color}"></i>${esc(C.dimInfo(k).label)}</span>`).join('')}</span>`;
}

function timeline(vm, titulo = 'Linha do tempo') {
  const timed = vm.blocks.filter((b) => b.minutes > 0);
  if (!timed.length || vm.total <= 0) return '';
  const segs = timed.map((b) => {
    const info = C.dimInfo(b.pillar);
    return `<i class="${info.light ? 'lt' : ''}" style="flex:${b.minutes};background:${info.color}">${b.minutes >= 25 ? esc(b.phase) : ''}</i>`;
  }).join('');
  // marcas de minuto acumulado; some as que encostariam na anterior
  const ticks = [{ at: 0, label: "0'" }];
  for (const b of timed) ticks.push({ at: b.to, label: `${b.to}'` });
  const kept = [];
  for (let i = 0; i < ticks.length; i++) {
    const pctAt = (ticks[i].at / vm.total) * 100;
    const isLast = i === ticks.length - 1;
    const prev = kept[kept.length - 1];
    if (prev && pctAt - prev.pct < 7) {
      if (isLast) kept[kept.length - 1] = { ...ticks[i], pct: pctAt };
      continue;
    }
    kept.push({ ...ticks[i], pct: pctAt });
  }
  const tickHtml = kept.map((t) => `<span style="left:${t.pct}%">${esc(t.label)}</span>`).join('');
  return `<div>${C.sec(titulo, pillarLegend(vm))}<div class="tl">${segs}</div><div class="tl-ticks">${tickHtml}</div></div>`;
}

function blockCard(b, fotos = null) {
  const info = C.dimInfo(b.pillar);
  const groups = b.groups.length ? b.groups.map((g) => C.chip(g)).join('') : C.chip('Todos', { nil: true });
  const metaParts = [];
  if (b.contents.length) metaParts.push(`<em>Conteúdo</em>${esc(b.contents.join(', '))}`);
  if (b.subMoments.length) metaParts.push(`<em>Submomentos</em>${b.subMoments.map((s) => C.chip(s)).join('')}`);
  const range = b.minutes > 0 ? `<div class="rg">${b.from}'–${b.to}'</div>` : '';
  return `<div class="blk" style="--p:${info.color}">
    <div class="tm"><b>${b.minutes > 0 ? b.minutes : '—'}</b><small>min</small>${range}</div>
    <div class="ct">
      <div class="ph">${esc(b.phase)}${b.pillarLabel ? ` <span class="pill${info.light ? ' lt' : ''}">${esc(b.pillarLabel)}</span>` : ''}</div>
      <h3>${esc(b.title)}</h3>
      <div class="grp">${groups}</div>
      ${metaParts.length ? `<div class="meta">${metaParts.join(' &nbsp;·&nbsp; ')}</div>` : ''}
      ${b.description ? `<div class="desc">${esc(b.description)}</div>` : ''}
      ${fotos && fotos.items.length ? `<div class="blk-photos">${photoGrid(fotos.items, fotos.grid)}</div>` : ''}
    </div></div>`;
}

function gameCard(vm) {
  const g = vm.game;
  const meta = [g.round ? (/^\d+$/.test(String(g.round).trim()) ? `Rodada ${esc(g.round)}` : esc(g.round)) : '', g.location ? esc(g.location) : ''].filter(Boolean).join(' · ');
  return `<div class="gamecard"><div><div class="k">Jogo</div><div class="op">vs ${esc(g.opponent)}</div>${meta ? `<div class="meta2">${meta}</div>` : ''}</div>
    ${g.score ? `<div class="sc">${esc(g.score)} ${C.resultChip(({ V: 'win', E: 'draw', D: 'loss' })[g.result])}</div>` : ''}</div>`;
}

// Observações só aparecem quando o dia tem texto de observação (sem área em branco).
function notes(vm) {
  const txt = String((vm && vm.notes) || '').trim();
  if (!txt) return '';
  return `<div class="notes-wrap">${C.sec('Observações')}<div class="notes-txt">${esc(txt)}</div></div>`;
}

function renderSession(vm, { now, onlyPhotos = false }) {
  const team = vm.team;
  const groupsTxt = vm.groupsAll.length ? ` · Grupos: ${esc(vm.groupsAll.join(', '))}` : '';
  const foot = C.footer({ now, extraHtml: groupsTxt });
  const reportName = 'Ficha de sessão';
  const metaParts = [esc(team.name), esc(team.modalityLabel)];
  if (vm.focus) metaParts.push(`Foco: <b>${esc(vm.focus)}</b>`);
  const header1 = C.fullHeader({
    team, eyebrow: vm.eyebrow, title: vm.title, metaHtml: metaParts.join(' · '), badgeTop: vm.badgeTop, badgeSub: vm.badgeSub,
  });
  // Fotos junto dos blocos (opção do modal): cada foto vai abaixo do bloco da sua
  // atividade; as que não têm bloco (anexo do dia) seguem para a página do final.
  const ph0 = vm.photos;
  const inline = !!(ph0 && ph0.items.length && ph0.posicao === 'blocos');
  const porBloco = new Map();
  let sobra = ph0 ? ph0.items : [];
  if (inline) {
    const ids = new Set(vm.blocks.map((b) => b.activityId).filter(Boolean));
    sobra = [];
    for (const it of ph0.items) {
      if (it.activity_id && ids.has(it.activity_id)) {
        if (!porBloco.has(it.activity_id)) porBloco.set(it.activity_id, []);
        porBloco.get(it.activity_id).push(it);
      } else sobra.push(it);
    }
  }
  const fotosDo = (b) => {
    const items = inline ? porBloco.get(b.activityId) : null;
    if (!items || !items.length) return null;
    // ao lado do bloco a foto fica menor: no máx. 3 por linha
    const grid = { ...ph0.grid, layout: ph0.grid.layout === 'grande' && items.length > 1 ? 'medio' : (ph0.grid.layout === 'mosaico' ? 'compacto' : ph0.grid.layout) };
    return { items, grid };
  };
  const blocksDe = (lista) => (lista.length ? `<div class="blocks" data-split=".blk">${lista.map((b) => blockCard(b, fotosDo(b))).join('')}</div>` : '');
  const blocksHtml = blocksDe(vm.blocks);
  let body;
  if (vm.type === 'periodos') {
    // Dia com 2+ períodos: cada um em sequência, com a própria linha do tempo e blocos
    body = vm.periodos.map((p) => {
      const cab = `<div class="per-h"><b>${esc(p.label)}</b><span>${esc(p.type === 'match' ? 'Jogo' : 'Treino')} · ${esc(F.plural(p.total, 'minuto', 'minutos'))}${p.focus ? ` · ${esc(p.focus)}` : ''}</span></div>`;
      // o título do período anda junto do 1º elemento (não fica sozinho no pé da página)
      if (p.type === 'match') {
        return `<div class="per">${cab}${gameCard(p)}</div>`
          + (p.blocks.length ? `<div>${C.sec('Não relacionados', esc(F.plural(p.total, 'minuto', 'minutos')))}</div>${blocksDe(p.blocks)}` : '');
      }
      if (!p.blocks.length) return `<div class="per">${cab}<div class="empty"><b>Nenhuma atividade neste período</b></div></div>`;
      return `<div class="per">${cab}${timeline(p, `Linha do tempo · ${p.label}`)}</div>${blocksDe(p.blocks)}`;
    }).join('') + notes(vm);
  } else if (vm.type === 'rest') {
    body = `<div class="reststate"><b>Descanso</b>Dia sem treino programado.</div>${notes(vm)}`;
  } else if (vm.type === 'match') {
    const nr = vm.blocks.length ? `<div>${C.sec('Não relacionados', esc(F.plural(vm.total, 'minuto', 'minutos')))}</div>${blocksHtml}` : '';
    body = gameCard(vm) + nr + notes(vm);
  } else if (!vm.blocks.length) {
    body = `<div class="empty big"><b>Nenhuma atividade cadastrada para este dia</b>Preencha os blocos na Programação.</div>${notes(vm)}`;
  } else {
    body = timeline(vm) + blocksHtml + notes(vm);
  }
  const right = `${F.weekdayShort(vm.date)} ${F.ddmmyyyy(vm.date)}${vm.weekNumber ? ` · Semana ${vm.weekNumber}` : ''}`;
  // onlyPhotos: só a(s) página(s) de fotos (prévia do modal "Fotos do relatório")
  const pages = onlyPhotos ? [] : [C.page({ header: header1, subtitle: 'Blocos', body, bodyStyle: 'gap:5mm', foot })];
  const ph = vm.photos && inline ? { ...vm.photos, items: sobra, total: sobra.length, hidden: 0 } : vm.photos;
  if (ph && ph.items.length) {
    pages.push(C.page({
      header: C.compactHeader({ team, reportName, subtitle: 'Registro fotográfico', right }),
      subtitle: 'Registro fotográfico',
      body: photoPageBody('Registro fotográfico', ph),
      bodyStyle: 'gap:3mm',
      foot,
    }));
  }
  return C.documentHtml({
    title: `${reportName} · ${vm.title}`,
    palette: team.palette,
    pages,
    contHeader: C.compactHeader({ team, reportName, subtitle: '', right }),
    foot,
  });
}

module.exports = { renderSession };

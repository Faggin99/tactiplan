// Relatório 2 — Estatísticas de treino (2 páginas + fotos da semana).
const F = require('../format');
const C = require('./components');
const { photoPageBody } = require('./photos');

const esc = F.esc;

function kpis(vm) {
  const k = vm.kpis;
  return `<div class="grid g5">
    ${C.kpi({ label: 'Tempo total', value: F.duration(k.minutes), sub: `${F.int(k.minutes)} min`, variant: 'accent' })}
    ${C.kpi({ label: 'Sessões', value: k.sessions, sub: k.matches ? `+ ${F.plural(k.matches, 'jogo', 'jogos')}` : '' })}
    ${C.kpi({ label: 'Atividades', value: k.activities, sub: `${k.distinct} ${F.word(k.distinct, 'distinta', 'distintas')}` })}
    ${k.avgPerSession == null ? C.kpi({ label: 'Média/sessão', value: '—', sub: 'minutos', variant: 'nil' }) : C.kpi({ label: 'Média/sessão', value: `${k.avgPerSession}'`, sub: 'minutos' })}
    ${k.distanceKm == null ? C.kpi({ label: 'Distância', value: '—', sub: 'sem registro', variant: 'nil' }) : C.kpi({ label: 'Distância', value: F.dec1(k.distanceKm), sub: 'km acumulados' })}
  </div>`;
}

// Barra fina horizontal empilhada pelos PILARES do dia (cores dos pilares),
// comprimento proporcional ao maior dia; mesma altura em todos os dias.
function pillarBar(segs, minutes, max) {
  if (!(minutes > 0)) return '';
  const lista = (segs || []).length ? segs : [{ key: 'none', label: 'Sem pilar', minutes }];
  const fill = Math.max(6, Math.round((minutes / (max || minutes)) * 100));
  const soma = lista.reduce((t, g) => t + g.minutes, 0) || 1;
  const parts = lista.map((g) => {
    const info = C.dimInfo(g.key === 'none' ? 'outros' : g.key);
    return `<i style="flex:${Math.round((g.minutes / soma) * 1000)};background:${info.color}" title="${esc(`${g.label} ${g.minutes}'`)}"></i>`;
  }).join('');
  return `<div class="pbar"><div class="pbar-fill" style="width:${fill}%">${parts}</div></div>`;
}

function assessmentLine(a) {
  if (!a) return '';
  return `<div class="av"><b>Avaliação</b>${a.text ? ` · ${esc(a.text)}` : ''}</div>`;
}

function weekGrid(vm) {
  const max = vm.dayMax || 1;
  const cells = vm.days.map((d) => {
    const head = `<div><div class="dn">${esc(d.dn)}</div><div class="dd">${esc(d.dd)}</div></div>`;
    if (d.kind === 'jogo') {
      const sc = d.score ? `${esc(d.score)}${d.result ? ` · ${esc(d.result)}` : ''}` : 'Jogo';
      return `<div class="day game">${head}<div class="tag">Jogo</div><div class="fx">vs ${esc(d.opponent)}</div>${assessmentLine(d.assessment)}<div class="col"></div><div class="mn">${sc}</div></div>`;
    }
    if (d.kind === 'descanso') {
      return `<div class="day rest">${head}<div class="tag">Descanso</div><div class="fx"></div><div class="col"></div><div class="mn">—</div></div>`;
    }
    if (d.kind === 'avaliacao') {
      return `<div class="day assess">${head}<div class="tag">Avaliação</div><div class="fx av-tipos">${d.assessment.types.length ? d.assessment.types.map((t) => `<span>${esc(t).replace(/\//g, '/<wbr>')}</span>`).join('') : 'Tipo não informado'}</div><div class="col"></div><div class="mn">—</div></div>`;
    }
    if (d.kind === 'vazio') {
      return `<div class="day none">${head}<div class="tag">Sem registro</div><div class="fx"></div><div class="col"></div><div class="mn">—</div></div>`;
    }
    const tag = d.assessment ? 'Treino + Avaliação' : 'Treino';
    return `<div class="day">${head}<div class="tag">${tag}</div><div class="fx">${esc(d.focus || '')}</div>${assessmentLine(d.assessment)}`
      + `<div class="col pcol">${pillarBar(d.pillars, d.minutes, max)}</div><div class="mn">${d.minutes > 0 ? `${d.minutes}'` : '—'}</div>`
      + `${d.split && d.minutes > 0 ? `<div class="pd" title="${esc(d.periods.map((p) => `${p.label} ${p.minutes}'`).join(' + '))}">${esc(d.split)}</div>` : ''}</div>`;
  }).join('');
  const notes = vm.dayNotes.map((n) => `<div class="note">${esc(n)}</div>`).join('');
  // legenda das cores dos pilares que aparecem na semana
  const keys = Array.from(new Set(vm.days.flatMap((d) => (d.kind === 'treino' ? d.pillars.map((g) => g.key) : []))));
  const legend = keys.length
    ? `<span class="legend" style="display:inline-flex">${keys.map((k) => { const info = C.dimInfo(k === 'none' ? 'outros' : k); return `<span><i class="dot" style="background:${info.color}"></i>${esc(k === 'none' ? 'Sem pilar' : info.label)}</span>`; }).join('')}</span>`
    : 'minutos por dia';
  return `<div>${C.sec('Microciclo', legend)}<div class="week">${cells}</div>${notes}</div>`;
}

// Períodos longos: uma coluna por semana (minutos), empilhada pelos pilares
function weeksChart(vm) {
  const weeks = vm.weeks || [];
  const max = vm.weekMax || 1;
  const dense = weeks.length > 10;
  const every = weeks.length > 30 ? 4 : (weeks.length > 16 ? 2 : 1);
  const cols = weeks.map((w) => {
    const h = w.minutes > 0 ? Math.max(3, Math.round((w.minutes / max) * 85)) : 0;
    const segs = (w.pillars || []).length ? w.pillars : [{ key: 'none', minutes: w.minutes }];
    const soma = segs.reduce((t, g) => t + g.minutes, 0) || 1;
    const stack = h ? `<i class="stk" style="height:${h}%">${segs.slice().reverse().map((g) => `<u style="flex:${Math.round((g.minutes / soma) * 1000)};background:${C.dimInfo(g.key === 'none' ? 'outros' : g.key).color}"></u>`).join('')}</i>` : '';
    return `<div class="c">${w.minutes > 0 && !dense ? `<b>${w.minutes}'</b>` : ''}${stack}</div>`;
  }).join('');
  const labs = weeks.map((w, i) => `<span>${i % every === 0 ? esc(w.label) : ''}</span>`).join('');
  return `<div class="card">${C.sec('Minutos por semana', `${F.plural(weeks.length, 'semana', 'semanas')} · início de cada semana · cores = pilares`)}
    <div class="colchart${dense ? ' dense' : ''}" style="height:34mm">${cols}</div><div class="collab${dense ? ' dense' : ''}">${labs}</div></div>`;
}

function pillars(vm) {
  if (!vm.pillars.length) {
    return `<div class="card">${C.sec('Distribuição por pilar', 'por tempo de treino')}${C.emptyState('Nenhum conteúdo com pilar registrado no período')}</div>`;
  }
  const totalMin = vm.pillars.reduce((s, p) => s + p.minutes, 0);
  const useTime = totalMin > 0;
  const stack = C.stackBar(vm.pillars.map((p) => {
    const info = C.dimInfo(p.key);
    return { pct: useTime ? p.pctTime : p.pctActivities, color: info.color, light: info.light, label: p.label };
  }));
  const rows = vm.pillars.map((p) => `<tr><td><span class="dot" style="background:${C.dimInfo(p.key).color}"></span>&nbsp; <b>${esc(p.label)}</b></td>`
    + `<td class="c">${p.sessions}</td><td class="c">${p.activities}</td><td class="r">${p.pctActivities}%</td>`
    + `<td class="r"><b>${F.duration(p.minutes, 'table')}</b></td><td class="r">${p.pctTime}%</td></tr>`).join('');
  return `<div class="card">${C.sec('Distribuição por pilar', useTime ? 'por tempo de treino' : 'por nº de atividades (sem tempo registrado)')}
    ${stack}
    <table class="tbl"><thead><tr><th>Pilar</th><th class="c">Sessões</th><th class="c">Atividades</th><th class="r">% ativ.</th><th class="r">Tempo</th><th class="r">% tempo</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function topContents(vm) {
  if (!vm.topContents.length) {
    return `<div>${C.sec('Principais conteúdos por pilar')}${C.emptyState('Nenhum conteúdo registrado no período')}</div>`;
  }
  const n = Math.min(4, vm.topContents.length);
  const cards = vm.topContents.map((p) => `<div class="card"><div class="legend" style="margin-bottom:2mm"><span><i class="dot" style="background:${C.dimInfo(p.key).color}"></i><b>${esc(p.label)}</b></span></div>
    <table class="tbl"><thead><tr><th>Conteúdo</th><th class="c">Ativ.</th><th class="r">Min</th></tr></thead><tbody>
    ${p.rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="c">${r.activities}</td><td class="r"><b>${F.int(r.minutes)}</b></td></tr>`).join('')}
    </tbody></table></div>`).join('');
  return `<div>${C.sec('Principais conteúdos por pilar')}<div class="grid g${n}">${cards}</div></div>`;
}

function distance(vm) {
  const d = vm.distance;
  if (d.empty) {
    return `<div class="card">${C.sec('Distância ideal')}${C.emptyState('Nenhuma distância registrada no período')}</div>`;
  }
  const max = d.max || 1;
  const dense = d.series.length > 10;
  const pctOf = (km) => Math.round((km / max) * 85);
  const cols = d.series.map((x) => `<div class="c"><b>${F.dec1(x.km)}</b><i style="height:${Math.max(2, pctOf(x.km))}%"></i></div>`).join('');
  const labs = d.series.map((x) => `<span>${esc(x.label)}</span>`).join('');
  return `<div class="card">${C.sec('Distância ideal', 'dias sem registro não entram na média')}
    <div class="grid g4" style="margin-bottom:5mm">
      ${C.kpi({ label: 'Média/dia', value: F.dec1(d.avgKm), sub: 'km' })}
      ${C.kpi({ label: 'Acumulado', value: F.dec1(d.totalKm), sub: 'km' })}
      ${C.kpi({ label: 'Maior dia', value: F.dec1(d.maxKm), sub: `km · ${esc(d.maxDate)}` })}
      ${C.kpi({ label: 'Dias c/ registro', value: d.daysWithData, sub: `de ${F.plural(d.sessions, 'sessão', 'sessões')}` })}
    </div>
    <div class="colchart${dense ? ' dense' : ''}"><div class="avg" style="bottom:${pctOf(d.avgKm)}%"><span>média ${F.dec1(d.avgKm)}</span></div>${cols}</div>
    <div class="collab${dense ? ' dense' : ''}">${labs}</div></div>`;
}

function renderTraining(vm, { now, onlyPhotos = false }) {
  const team = vm.team;
  const foot = C.footer({ now });
  const reportName = 'Estatísticas de treino';
  const header1 = C.fullHeader({
    team, eyebrow: reportName, title: team.name, metaHtml: esc(vm.meta), badgeTop: vm.badgeTop, badgeSub: vm.badgeSub,
  });
  const pages = [];
  if (onlyPhotos) {
    // prévia do modal "Fotos do relatório": só a(s) página(s) de fotos
  } else if (vm.empty) {
    pages.push(C.page({
      header: header1,
      subtitle: 'Visão do período',
      body: `<div class="empty big"><b>Nenhum treino registrado neste período</b>Preencha as atividades na Programação para ver as estatísticas aqui.</div>`,
      foot,
    }));
  } else {
    pages.push(C.page({
      header: header1,
      subtitle: 'Visão do período',
      body: kpis(vm) + (vm.days ? weekGrid(vm) : weeksChart(vm)) + pillars(vm),
      foot,
    }));
    pages.push(C.page({
      header: C.compactHeader({ team, reportName, subtitle: 'Conteúdos e carga', right: vm.right }),
      subtitle: 'Conteúdos e carga',
      body: topContents(vm) + distance(vm),
      foot,
    }));
  }
  const ph = vm.photos;
  if (ph && ph.items.length) {
    pages.push(C.page({
      header: C.compactHeader({ team, reportName, subtitle: 'Fotos da semana', right: vm.right }),
      subtitle: 'Fotos da semana',
      body: photoPageBody('Fotos da semana', ph),
      bodyStyle: 'gap:4mm',
      foot,
    }));
  }
  return C.documentHtml({
    title: `${reportName} · ${team.name}`,
    palette: team.palette,
    pages,
    contHeader: C.compactHeader({ team, reportName, subtitle: '', right: vm.right }),
    foot,
  });
}

module.exports = { renderTraining };

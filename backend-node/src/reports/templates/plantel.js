// Relatório "Plantel" (A4 retrato): o plantel do clube por grupo de treino, como o
// PDF do web (jsPDF, PlantelPage): Grupo 1, 2, 3, Transição, DM e Sem grupo, cada
// grupo com foto, camisa, nome, posição, pé, altura e nascimento. Gerado no servidor
// para o app nativo (POST /api/reports/plantel { club_id }) — mesmo pipeline dos outros.
const F = require('../format');
const C = require('./components');

const esc = F.esc;
const PE = { right: 'Direito', left: 'Esquerdo', both: 'Amb.' };

function dataBR(d) {
  if (!d) return '—';
  const s = F.toDateStr(d);
  const [y, m, dd] = s.split('-');
  return y && m && dd ? `${dd}/${m}/${y}` : '—';
}

function linha(p, i) {
  const foto = p.photoKey ? `<img src="${esc(p.photoKey)}" alt="" style="width:9mm;height:9mm;border-radius:50%;object-fit:cover;display:block">`
    : '<span style="display:block;width:9mm;height:9mm;border-radius:50%;background:var(--surface-2,#eef2f7)"></span>';
  return `<tr><td class="c">${foto}</td><td class="c">${i + 1}</td>`
    + `<td class="c">${p.jersey != null ? `<span class="n">${esc(p.jersey)}</span>` : '<span class="nil">—</span>'}</td>`
    + `<td class="nm"><b>${esc(p.name)}</b></td>`
    + `<td class="c">${p.pos ? C.positionChip(p.pos, p.posColor) : '<span class="nil">—</span>'}</td>`
    + `<td class="c">${esc(PE[p.foot] || '—')}</td><td class="c" style="white-space:nowrap">${p.height ? `${esc(p.height)} cm` : "—"}</td>`
    + `<td class="c">${esc(dataBR(p.birthdate))}</td></tr>`;
}

function grupo(g) {
  return `<div class="card" data-split="tbody tr">${C.sec(g.label, esc(F.plural(g.players.length, 'atleta', 'atletas')))}
    <table class="tbl dense"><thead><tr><th class="c" style="width:12mm"></th><th class="c" style="width:8mm">#</th>
    <th class="c" style="width:14mm">Camisa</th><th>Nome</th><th class="c" style="width:16mm">Posição</th>
    <th class="c" style="width:16mm">Pé</th><th class="c" style="width:16mm">Altura</th><th class="c" style="width:22mm">Nascimento</th></tr></thead>
    <tbody>${g.players.map(linha).join('')}</tbody></table></div>`;
}

function renderPlantel(vm, { now }) {
  const team = vm.team;
  const foot = C.footer({ now });
  const reportName = 'Plantel de atletas';
  const header = C.fullHeader({
    team, eyebrow: reportName, title: team.name, metaHtml: esc(vm.meta), badgeTop: String(vm.total), badgeSub: vm.total === 1 ? 'atleta' : 'atletas',
  });
  const body = vm.total
    ? vm.groups.map(grupo).join('')
    : C.emptyState('Nenhum atleta cadastrado no plantel', { cls: 'fill' });
  return C.documentHtml({
    title: `${reportName} · ${team.name}`,
    palette: team.palette,
    pages: [C.page({ header, subtitle: 'Plantel', body, foot })],
    contHeader: C.compactHeader({ team, reportName, subtitle: '', right: vm.right }),
    foot,
  });
}

module.exports = { renderPlantel };

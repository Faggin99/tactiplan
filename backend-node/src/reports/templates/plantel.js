// Relatório "Plantel" (A4 retrato): o plantel do clube por grupo de treino, como o
// PDF do web (jsPDF, PlantelPage): Grupo 1, 2, 3, Transição, DM e Sem grupo, cada
// grupo com foto, camisa, nome, último clube, posição, pé, altura e nascimento. Gerado no
// servidor para o web e o app (POST /api/reports/plantel { club_id, category_id? }).
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
    + `<td>${p.prevClub ? esc(p.prevClub) : '<span class="nil">—</span>'}</td>`
    + `<td class="c">${p.pos ? C.positionChip(p.pos, p.posColor) : '<span class="nil">—</span>'}</td>`
    + `<td class="c">${esc(PE[p.foot] || '—')}</td><td class="c" style="white-space:nowrap">${p.height ? `${esc(p.height)} cm` : "—"}</td>`
    + `<td class="c">${esc(dataBR(p.birthdate))}</td></tr>`;
}

function grupo(g) {
  return `<div class="card" data-split="tbody tr">${C.sec(g.label, esc(F.plural(g.players.length, 'atleta', 'atletas')))}
    <table class="tbl dense"><thead><tr><th class="c" style="width:12mm"></th><th class="c" style="width:8mm">#</th>
    <th class="c" style="width:14mm">Camisa</th><th>Nome</th><th style="width:32mm;white-space:nowrap">Último clube</th><th class="c" style="width:16mm">Posição</th>
    <th class="c" style="width:16mm">Pé</th><th class="c" style="width:16mm">Altura</th><th class="c" style="width:22mm">Nascimento</th></tr></thead>
    <tbody>${g.players.map(linha).join('')}</tbody></table></div>`;
}

// Página do campograma: campo em pé (ataque para cima), grama listrada e linhas brancas; cada
// posição com o nome e os atletas empilhados (foto, número, nome curto; DM em vermelho).
function campograma(cg, futsal) {
  if (!cg || !cg.zonas.length) return '';
  const W = 68; const H = 105;
  const linhas = futsal
    ? `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}"/><path d="M1.5 ${H / 2}H${W - 1.5}"/><circle cx="${W / 2}" cy="${H / 2}" r="7"/>`
      + `<path d="M${W / 2 - 14} 1.5a14 14 0 0 0 28 0M${W / 2 - 14} ${H - 1.5}a14 14 0 0 1 28 0"/>`
    : `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}"/><path d="M1.5 ${H / 2}H${W - 1.5}"/><circle cx="${W / 2}" cy="${H / 2}" r="9.15"/>`
      + `<rect x="${W / 2 - 20.15}" y="1.5" width="40.3" height="16.5"/><rect x="${W / 2 - 9.16}" y="1.5" width="18.32" height="5.5"/>`
      + `<rect x="${W / 2 - 20.15}" y="${H - 18}" width="40.3" height="16.5"/><rect x="${W / 2 - 9.16}" y="${H - 7}" width="18.32" height="5.5"/>`;
  const faixas = Array.from({ length: 11 }, (_, i) => (i % 2 ? '' : `<rect x="0" y="${(i * H) / 11}" width="${W}" height="${H / 11}" fill="#000" fill-opacity=".06"/>`)).join('');
  const ficha = (a) => {
    const foto = a.photoKey
      ? `<img src="${esc(a.photoKey)}" alt="">`
      : `<i>${esc(a.nome.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase())}</i>`;
    return `<div class="cg-f${a.dm ? ' dm' : ''}">${foto}${a.numero != null ? `<em>${esc(a.numero)}</em>` : ''}<span>${esc(a.nome)}</span></div>`;
  };
  const zonas = cg.zonas.map((z) => `<div class="cg-z" style="left:${z.left}%;top:${z.top}%;transform:translate(${z.tx},${z.ty})">`
    + `<b>${esc(z.nome)} · ${z.atletas.length}</b>${z.atletas.map(ficha).join('')}</div>`).join('');
  const fora = cg.semLugar.length
    ? `<p class="cg-fora"><b>Sem posição no campo:</b> ${cg.semLugar.map((a) => esc(a.name)).join(', ')}</p>` : '';
  return `<div class="card">${C.sec('Campograma', 'elenco por posição · em vermelho, no departamento médico')}
    <div class="cg"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${faixas}<g fill="none" stroke="#fff" stroke-opacity=".8" stroke-width=".35">${linhas}</g></svg>${zonas}</div>${fora}</div>
    <style>
      .cg{position:relative;width:132mm;height:204mm;margin:1mm auto 0;border-radius:2.5mm;overflow:hidden;background:#2a8447}
      .cg svg{position:absolute;inset:0;width:100%;height:100%}
      .cg-z{position:absolute;display:flex;flex-direction:column;gap:.7mm;align-items:stretch;width:max-content}
      .cg-z b{align-self:center;font:700 5.6pt Poppins;letter-spacing:.06em;text-transform:uppercase;color:#fff;text-shadow:0 .3mm .6mm rgba(0,0,0,.5);white-space:nowrap}
      .cg-f{display:flex;align-items:center;gap:1.2mm;padding:.5mm 2mm .5mm .5mm;border-radius:5mm;background:rgba(15,23,42,.9);color:#fff;font:600 6.6pt Poppins;white-space:nowrap}
      .cg-f.dm{background:#8f1d1d}
      .cg-f img,.cg-f i{width:4.6mm;height:4.6mm;border-radius:50%;object-fit:cover;flex:none;background:var(--team);color:var(--on-team);font:700 5pt Poppins;display:inline-flex;align-items:center;justify-content:center;font-style:normal}
      .cg-f em{font-style:normal;font-weight:800;opacity:.75}
      .cg-fora{margin:2mm 0 0;font-size:7.5pt;color:var(--ink-2)}
    </style>`;
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
  // Campograma na 1ª página (quando há atleta com posição); a lista por grupo começa na seguinte.
  const campo = vm.total ? campograma(vm.campo, team.modality === 'futsal') : '';
  const contHeader = C.compactHeader({ team, reportName, subtitle: '', right: vm.right });
  const pages = campo
    ? [C.page({ header, subtitle: 'Campograma', body: campo, foot }), C.page({ header: contHeader, subtitle: 'Plantel', body, foot })]
    : [C.page({ header, subtitle: 'Plantel', body, foot })];
  return C.documentHtml({
    title: `${reportName} · ${team.name}`,
    palette: team.palette,
    pages,
    contHeader,
    foot,
  });
}

module.exports = { renderPlantel };

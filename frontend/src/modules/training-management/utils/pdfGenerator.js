// Excel do plantel. O PDF do plantel é gerado no servidor (POST /api/reports/plantel).

import { newWorkbook, addSheet, saveWorkbook, addMetaSheet } from '../../../utils/excelTheme';

/**
 * Excel do plantel — mantém o formato anterior (planilha por grupo + resumo).
 */
export const generatePlantelExcel = (athletes) => {
  const wb = newWorkbook({ title: 'Plantel de Atletas' });

  const grupo1 = athletes.filter(a => String(a.group) === '1');
  const grupo2 = athletes.filter(a => String(a.group) === '2');
  const grupo3 = athletes.filter(a => String(a.group) === '3');
  const transicao = athletes.filter(a => String(a.group) === 'Transição');
  const dm = athletes.filter(a => String(a.group) === 'DM');

  addMetaSheet(wb, {
    title: 'Plantel de Atletas',
    totals: [
      ['Total', athletes.length],
      ['Grupo 1', grupo1.length],
      ['Grupo 2', grupo2.length],
      ['Grupo 3', grupo3.length],
      ['Transição', transicao.length],
      ['DM', dm.length],
    ],
  });

  const allRows = [['Nome', 'Último clube', 'Posição', 'Camisa', 'Grupo', 'Pé', 'Altura', 'Nascimento']];
  athletes
    .slice()
    .sort((a, b) => (a.group || '').localeCompare(b.group || '') || (a.name || '').localeCompare(b.name || ''))
    .forEach((a) => allRows.push([
      a.name,
      a.previous_club || '',
      a.position || '',
      a.jersey_number || '',
      a.group || '',
      a.preferred_foot === 'right' ? 'Direito' : a.preferred_foot === 'left' ? 'Esquerdo' : a.preferred_foot === 'both' ? 'Ambidestro' : '',
      a.height_cm ? `${a.height_cm}cm` : '',
      a.birthdate ? a.birthdate.split('-').reverse().join('/') : '',
    ]));
  addSheet(wb, 'Todos', allRows, { widths: [32, 24, 14, 10, 12, 12, 10, 14], freezeHeader: true, autoFilter: true });

  const addGroupSheet = (label, players) => {
    if (players.length === 0) return;
    const rows = [['Nome', 'Posição', 'Camisa', 'Pé', 'Altura']];
    players
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .forEach((p) => rows.push([
        p.name,
        p.position || '',
        p.jersey_number || '',
        p.preferred_foot === 'right' ? 'Direito' : p.preferred_foot === 'left' ? 'Esquerdo' : p.preferred_foot === 'both' ? 'Ambidestro' : '',
        p.height_cm ? `${p.height_cm}cm` : '',
      ]));
    addSheet(wb, label, rows, { widths: [32, 14, 10, 12, 10], freezeHeader: true, autoFilter: true });
  };
  addGroupSheet('Grupo 1', grupo1);
  addGroupSheet('Grupo 2', grupo2);
  addGroupSheet('Grupo 3', grupo3);
  addGroupSheet('Transição', transicao);
  addGroupSheet('DM', dm);

  saveWorkbook(wb, `plantel_${new Date().toISOString().split('T')[0]}.xlsx`);
};

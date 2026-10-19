// PDF do Plantel — estilo U.E.C. (landscape, title strip verde, fotos circulares,
// tabelas com header verde). Substitui a versão antiga.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { deliverPdf } from '../../../lib/deliverFile';
import {
  PDF_THEME,
  addTitleStrip,
  drawCover,
  paginate,
  applyClubPrimaryColor,
  setFillHex,
  setTextHex,
  setDrawHex,
} from '../../../utils/pdfTheme';
import { newWorkbook, addSheet, saveWorkbook, addMetaSheet } from '../../../utils/excelTheme';

// Carrega imagem como dataURL pro jsPDF
async function loadImageAsDataURL(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function detectImageFormat(dataUrl) {
  if (!dataUrl) return 'JPEG';
  if (dataUrl.startsWith('data:image/png'))  return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

export async function preloadAthletePhotos(athletes) {
  const entries = await Promise.all((athletes || []).map(async (a) => {
    const dataUrl = await loadImageAsDataURL(a.photo_url);
    return [a.id, dataUrl];
  }));
  return new Map(entries);
}

function hexRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const GROUP_LABELS = { '1': 'Grupo 1', '2': 'Grupo 2', '3': 'Grupo 3', 'Transição': 'Transição', 'DM': 'DM', 'Sem grupo': 'Sem grupo' };

function organizeByGroup(athletes) {
  const out = { '1': [], '2': [], '3': [], 'Transição': [], 'DM': [], 'Sem grupo': [] };
  athletes.forEach((a) => {
    const k = ['1', '2', '3', 'Transição', 'DM'].includes(String(a.group)) ? String(a.group) : 'Sem grupo';
    out[k].push(a);
  });
  Object.keys(out).forEach((k) => out[k].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
  return out;
}

export const generatePlantelPDF = async (athletes, opts = {}) => {
  const { clubName = '', primaryColor = null } = opts;
  if (!athletes || athletes.length === 0) {
    alert('Nenhum atleta cadastrado pra exportar.');
    return;
  }
  const resetColor = applyClubPrimaryColor(primaryColor);
  try {

  const photoMap = await preloadAthletePhotos(athletes);
  const doc = new jsPDF({ orientation: PDF_THEME.orientation, unit: 'mm', format: PDF_THEME.pageFormat });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = PDF_THEME.margins;
  const totalW = pageW - M.left - M.right;

  // ============ PÁGINA 1: Capa ============
  drawCover(doc, {
    title: 'Plantel de Atletas',
    subtitle: `${athletes.length} atleta${athletes.length !== 1 ? 's' : ''}`,
    clubName,
  });

  // ============ PÁGINAS POR GRUPO ============
  const byGroup = organizeByGroup(athletes);
  const groupsWithPlayers = Object.entries(byGroup).filter(([, list]) => list.length > 0);
  const colGap = 4;

  groupsWithPlayers.forEach(([groupKey, list]) => {
    doc.addPage();
    let y = addTitleStrip(doc, {
      section: GROUP_LABELS[groupKey],
      clubName,
    });

    // KPI no canto: contagem do grupo
    const kpiW = 60;
    const kpiH = 16;
    const kpiX = pageW - M.right - kpiW;
    setFillHex(doc, PDF_THEME.colors.primary);
    doc.roundedRect(kpiX, y + 2, kpiW, kpiH, 1.5, 1.5, 'F');
    doc.setFont(PDF_THEME.fonts.family, 'normal');
    doc.setFontSize(8);
    setTextHex(doc, PDF_THEME.colors.accent);
    doc.text('TOTAL DE ATLETAS', kpiX + 4, y + 7);
    doc.setFont(PDF_THEME.fonts.family, 'bold');
    doc.setFontSize(16);
    setTextHex(doc, PDF_THEME.colors.light);
    doc.text(String(list.length), kpiX + kpiW - 4, y + 13, { align: 'right' });

    y += kpiH + 8;

    // PHOTO + nome em colunas (4 colunas → 8 atletas por linha em landscape)
    const PHOTO_W = 9;
    autoTable(doc, {
      startY: y,
      head: [['', '#', 'Camisa', 'Nome', 'Posição', 'Pé', 'Altura', 'Nascimento']],
      body: list.map((p, i) => [
        '',
        i + 1,
        p.jersey_number || '-',
        p.name || '—',
        p.position || '—',
        p.preferred_foot === 'right' ? 'Direito' : p.preferred_foot === 'left' ? 'Esquerdo' : p.preferred_foot === 'both' ? 'Amb.' : '—',
        p.height_cm ? `${p.height_cm}cm` : '—',
        p.birthdate ? p.birthdate.split('-').reverse().join('/') : '—',
      ]),
      theme: 'plain',
      headStyles: { fillColor: hexRgb(PDF_THEME.colors.primary), textColor: 255, fontStyle: 'bold', fontSize: 9, cellPadding: 2.4 },
      bodyStyles: { fontSize: 9, textColor: hexRgb(PDF_THEME.colors.text), cellPadding: 2, valign: 'middle', minCellHeight: 11 },
      alternateRowStyles: { fillColor: hexRgb(PDF_THEME.colors.surfaceAlt) },
      columnStyles: {
        0: { cellWidth: PHOTO_W, halign: 'center' },
        1: { cellWidth: 9, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 'auto', fontStyle: 'bold' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 16, halign: 'center' },
        7: { cellWidth: 24, halign: 'center' },
      },
      margin: { left: M.left, right: M.right },
      styles: { lineColor: hexRgb(PDF_THEME.colors.border), lineWidth: 0.05 },
      didDrawCell: (hookData) => {
        if (hookData.section !== 'body' || hookData.column.index !== 0) return;
        const player = list[hookData.row.index];
        const dataUrl = player && photoMap.get(player.id);
        if (!dataUrl) return;
        const { x, y, width, height } = hookData.cell;
        const side = Math.min(width, height) - 1.5;
        const cx = x + (width - side) / 2;
        const cy = y + (height - side) / 2;
        try { doc.addImage(dataUrl, detectImageFormat(dataUrl), cx, cy, side, side, undefined, 'FAST'); }
        catch (err) { /* ignora */ }
      },
    });
  });

  paginate(doc);
  deliverPdf(doc, `plantel_${(clubName || 'clube').replace(/\s+/g, '_').replace(/[^\w-]/g, '')}_${new Date().toISOString().split('T')[0]}.pdf`);
  } finally { resetColor(); }
};

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

  const allRows = [['Nome', 'Posição', 'Camisa', 'Grupo', 'Pé', 'Altura', 'Nascimento']];
  athletes
    .slice()
    .sort((a, b) => (a.group || '').localeCompare(b.group || '') || (a.name || '').localeCompare(b.name || ''))
    .forEach((a) => allRows.push([
      a.name,
      a.position || '',
      a.jersey_number || '',
      a.group || '',
      a.preferred_foot === 'right' ? 'Direito' : a.preferred_foot === 'left' ? 'Esquerdo' : a.preferred_foot === 'both' ? 'Ambidestro' : '',
      a.height_cm ? `${a.height_cm}cm` : '',
      a.birthdate ? a.birthdate.split('-').reverse().join('/') : '',
    ]));
  addSheet(wb, 'Todos', allRows, { widths: [32, 14, 10, 12, 12, 10, 14], freezeHeader: true, autoFilter: true });

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

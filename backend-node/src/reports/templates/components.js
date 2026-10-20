// Peças HTML compartilhadas pelos três relatórios (seção 2.5 da especificação).
// Tudo devolve string; texto do usuário SEMPRE passa por esc().
const fs = require('fs');
const path = require('path');
const { esc, generatedAt } = require('../format');
const { paletteCssVars } = require('../theme');

const CSS = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const PAGINATE_JS = fs.readFileSync(path.join(__dirname, 'paginate.client.js'), 'utf8');

const DIM = {
  tatico: { label: 'Tático', color: 'var(--p-tat)', light: false },
  fisico: { label: 'Físico', color: 'var(--p-fis)', light: false },
  tecnico: { label: 'Técnico', color: 'var(--p-tec)', light: false },
  mental: { label: 'Mental', color: 'var(--p-psi)', light: true },
  outros: { label: 'Sem pilar', color: 'var(--faint)', light: false },
};
const DIM_ORDER = ['tatico', 'fisico', 'tecnico', 'mental'];
function dimInfo(key) { return DIM[key] || DIM.outros; }

function crest(team, { compact = false } = {}) {
  if (team.logoUrl) {
    // Escudo com logo: sem fundo nem círculo (o PNG já vem recortado)
    return `<div class="crest has-logo"><img src="${esc(team.logoUrl)}" alt=""></div>`;
  }
  return `<div class="crest">${esc(team.short)}</div>`;
}

function fullHeader({ team, eyebrow, title, metaHtml, badgeTop, badgeSub }) {
  return `<header class="hdr">${crest(team)}
    <div class="ttl"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><div class="meta">${metaHtml}</div></div>
    <div class="badge"><b>${esc(badgeTop)}</b><span>${esc(badgeSub)}</span></div></header>`;
}

function compactHeader({ team, reportName, subtitle, right }) {
  return `<header class="hdr-c">${crest(team, { compact: true })}<b>${esc(reportName)}</b>`
    + `<span data-slot="subtitle">${subtitle ? '· ' + esc(subtitle) : ''}</span><div class="r">${esc(right || '')}</div></header>`;
}

function footer({ now, extraHtml = '' }) {
  return `<footer class="ftr"><span><b>TACTIPLAN</b> · Gerado em ${esc(generatedAt(now))}`
    + `<span data-slot="footer-extra">${extraHtml}</span></span><span data-slot="pageno"></span></footer>`;
}

function page({ header, body, foot, subtitle = '', bodyStyle = '' }) {
  return `<section class="page" data-subtitle="${esc(subtitle)}">${header}`
    + `<main class="body"${bodyStyle ? ` style="${bodyStyle}"` : ''}>${body}</main>${foot}</section>`;
}

// Documento completo. `contHeader` é o header compacto das páginas de continuação.
function documentHtml({ title, palette, pages, contHeader, foot }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${CSS}</style><style>:root{${paletteCssVars(palette)}}</style></head><body>
${pages.join('\n')}
<template id="tpl-cont"><section class="page cont">${contHeader}<main class="body"></main>${foot}</section></template>
<script>${PAGINATE_JS}</script></body></html>`;
}

function sec(title, meta = '') {
  return `<div class="sec">${esc(title)}${meta ? ` <small>${meta}</small>` : ''}</div>`;
}

function kpi({ label, value, sub = '', variant = '' }) {
  return `<div class="kpi${variant ? ' ' + variant : ''}"><div class="l">${esc(label)}</div>`
    + `<div class="v">${value}</div><div class="s">${sub || '&nbsp;'}</div></div>`;
}

const RESULT_LETTER = { win: 'V', draw: 'E', loss: 'D' };
function resultChip(result) {
  const l = RESULT_LETTER[result] || result || '';
  return `<span class="res ${esc(l)}">${esc(l)}</span>`;
}

function barRow({ label, value, max, cls = '' }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div class="barrow${value === 0 ? ' zero' : ''}${cls ? ' ' + cls : ''}"><span class="lb">${esc(label)}</span>`
    + `<div class="bar">${value > 0 ? `<i style="width:${w}%"></i>` : ''}</div><span class="vl">${value}</span></div>`;
}

function emptyState(text, { cls = '', icon = '' } = {}) {
  return `<div class="empty${cls ? ' ' + cls : ''}">${icon}${esc(text)}</div>`;
}

function chip(text, { nil = false } = {}) {
  return `<span class="chip${nil ? ' nil' : ''}">${esc(text)}</span>`;
}

// PositionChip (seção 2.6): fundo na cor do setor, texto branco.
function positionChip(code, color) {
  return `<span class="poschip" style="--c:${color}">${esc(code)}</span>`;
}

// StackBar: segmentos proporcionais [{ pct, color, label, light }]; rótulo só se ≥ 12%.
function stackBar(segments) {
  return `<div class="stack">${segments.filter((g) => g.pct > 0).map((g) => `<i class="${g.light ? 'lt' : ''}" style="width:${g.pct}%;background:${g.color}">`
    + `${g.pct >= 12 ? `${esc(g.label)} ${g.pct}%` : ''}</i>`).join('')}</div>`;
}

function ring(pctValue, label = 'aprov.') {
  const v = Math.max(0, Math.min(100, Math.round(pctValue)));
  return `<div class="ring"><svg viewBox="0 0 36 36">`
    + `<circle cx="18" cy="18" r="15.9" fill="none" style="stroke:var(--team-soft)" stroke-width="3.6"/>`
    + (v > 0 ? `<circle cx="18" cy="18" r="15.9" fill="none" style="stroke:var(--team-bar)" stroke-width="3.6" stroke-linecap="round" pathLength="100" stroke-dasharray="${v} 100"/>` : '')
    + `</svg><div class="t"><div><b>${v}%</b><span>${esc(label)}</span></div></div></div>`;
}

// Ícones simples em SVG (sem depender de glifos fora da fonte embutida)
const ICON = {
  up: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12 L12 3 M6 3 H12 V9"/></svg>',
  star: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.2 4.1 13.3 5 9 1.8 6l4.3-.5z"/></svg>',
  down: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4 L12 13 M12 7 V13 H6"/></svg>',
  dash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8 H12"/></svg>',
  shield: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 1.5 L13.5 3.5 V8 C13.5 11 11 13.5 8 14.5 C5 13.5 2.5 11 2.5 8 V3.5 Z"/></svg>',
  ball: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5 L10.5 6.8 9.5 9.8 6.5 9.8 5.5 6.8 Z"/></svg>',
};

module.exports = {
  DIM,
  DIM_ORDER,
  dimInfo,
  crest,
  fullHeader,
  compactHeader,
  footer,
  page,
  documentHtml,
  sec,
  kpi,
  resultChip,
  barRow,
  emptyState,
  chip,
  ring,
  positionChip,
  stackBar,
  ICON,
};

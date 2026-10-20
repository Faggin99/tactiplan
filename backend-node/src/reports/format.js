// Formatação pt-BR dos relatórios (docs/formato_relatorios, seção 6).
// Datas chegam como 'YYYY-MM-DD' (coluna DATE) ou Date; tudo é tratado como
// data-calendário, sem fuso, para não "voltar um dia".

const TZ = 'America/Sao_Paulo';

const WEEKDAYS_LONG = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const MODALITY_LABELS = { football_11: 'Futebol 11', football_7: 'Futebol 7', futsal: 'Futsal' };

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// "1 jogo" / "2 jogos" / "0 empates"
function plural(n, singular, pluralForm) {
  const num = Number(n) || 0;
  return `${num} ${num === 1 ? singular : pluralForm}`;
}
function word(n, singular, pluralForm) {
  return Number(n) === 1 ? singular : pluralForm;
}

function int(n) {
  return Math.round(Number(n) || 0).toLocaleString('pt-BR');
}

// 5 → "5,0" ; 4.25 → "4,3"
function dec1(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return (Math.round(Number(n) * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function signed(n) {
  const v = Number(n) || 0;
  return v > 0 ? `+${v}` : String(v);
}

function pct(part, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.round(((Number(part) || 0) / t) * 100);
}

// KPI: 291 → "4h51"; 45 → "45 min". Tabela: 186 → "3h06"; 15 → "0h15".
function duration(min, style = 'kpi') {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60 && style === 'kpi') return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}`;
}

function toDateStr(d) {
  if (!d) return null;
  if (d instanceof Date) {
    // coluna DATE do pg vira Date à meia-noite local do processo
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d).slice(0, 10);
}

function parts(d) {
  const s = toDateStr(d);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, day] = s.split('-').map(Number);
  return { y, m, d: day, dow: new Date(Date.UTC(y, m - 1, day)).getUTCDay() };
}

function ddmm(d) {
  const p = parts(d);
  return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}` : '—';
}
function ddmmyy(d) {
  const p = parts(d);
  return p ? `${ddmm(d)}/${String(p.y).slice(2)}` : '—';
}
function ddmmyyyy(d) {
  const p = parts(d);
  return p ? `${ddmm(d)}/${p.y}` : '—';
}
function weekdayLong(d) {
  const p = parts(d);
  return p ? WEEKDAYS_LONG[p.dow] : '';
}
function weekdayShort(d) {
  const p = parts(d);
  return p ? WEEKDAYS_SHORT[p.dow] : '';
}
function year(d) {
  const p = parts(d);
  return p ? p.y : null;
}

function addDays(dateStr, n) {
  const p = parts(dateStr);
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return dt.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}
function mondayOf(dateStr) {
  const p = parts(dateStr);
  const dow = p.dow || 7;
  return addDays(dateStr, 1 - dow);
}

// Semana ISO-8601 (mesma convenção "YYYY-WW" do app).
function isoWeek(d) {
  const p = parts(d);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
  return { year: dt.getUTCFullYear(), week };
}

// "19/10 – 25/10" (mesmo ano) ou "19/12/25 – 04/01/26"
function rangeShort(start, end) {
  if (year(start) === year(end)) return `${ddmm(start)} – ${ddmm(end)}`;
  return `${ddmmyy(start)} – ${ddmmyy(end)}`;
}
function rangeLong(start, end) {
  if (year(start) === year(end)) return `${ddmm(start)} – ${ddmmyyyy(end)}`;
  return `${ddmmyyyy(start)} – ${ddmmyyyy(end)}`;
}

// "20/10/2026, 09:34" no horário de Brasília
function generatedAt(now = new Date()) {
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const g = (t) => f.find((x) => x.type === t)?.value || '';
  return `${g('day')}/${g('month')}/${g('year')}, ${g('hour')}:${g('minute')}`;
}

// Sigla do escudo (até 3 letras): "Uberlândia EC" → "UEC"; "Esporte Clube Vila Nova" → "ECV"
const CONNECTIVES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'del', 'la', 'the', 'of']);
function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'TP';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  let out = '';
  for (const w of words) {
    if (CONNECTIVES.has(w.toLowerCase())) continue;
    const letters = w.replace(/[^\p{L}\p{N}]/gu, '');
    if (!letters) continue;
    out += (letters.length <= 3 && letters === letters.toUpperCase()) ? letters : letters[0].toUpperCase();
    if (out.length >= 3) break;
  }
  return (out || words[0].slice(0, 3)).slice(0, 3).toUpperCase();
}

function modalityLabel(modality) {
  return MODALITY_LABELS[modality] || MODALITY_LABELS.football_11;
}

// Corta texto longo com reticências (rankings/legendas)
function truncate(s, max) {
  const t = String(s ?? '');
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

module.exports = {
  TZ,
  esc,
  plural,
  word,
  int,
  dec1,
  signed,
  pct,
  duration,
  toDateStr,
  ddmm,
  ddmmyy,
  ddmmyyyy,
  weekdayLong,
  weekdayShort,
  year,
  addDays,
  daysBetween,
  mondayOf,
  isoWeek,
  rangeShort,
  rangeLong,
  generatedAt,
  initials,
  modalityLabel,
  truncate,
};

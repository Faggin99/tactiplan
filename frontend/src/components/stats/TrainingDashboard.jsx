import { useState, useEffect } from 'react';
import { Activity, Clock, Calendar, ChevronRight, Trophy, PieChart, BarChart3 } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { DistanceCard } from './DistanceCard';

// Paleta consistente das 4 dimensões em todo o dashboard
export const DIM_COLORS = {
  tatico: '#3b82f6',
  tecnico: '#a855f7',
  fisico: '#f59e0b',
  mental: '#10b981',
};
export const DIM_LABELS = {
  tatico: 'Tático',
  tecnico: 'Técnico',
  fisico: 'Físico',
  mental: 'Mental',
};
export const DIM_ORDER = ['tatico', 'fisico', 'tecnico', 'mental'];

function formatMinutes(min) {
  if (!min || min === 0) return '0min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ─────────────────────────────────────────────────────────────────
// Sparkline (SVG, sem deps)
// ─────────────────────────────────────────────────────────────────
function Sparkline({ values = [], color = '#3b82f6', width = 80, height = 24 }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = 0;
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height * 0.85 - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// KPI Card com Sparkline
// ─────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, icon, color, sparkline, colors }) {
  return (
    <div style={{
      padding: '1rem',
      backgroundColor: colors.surface,
      borderRadius: '0.625rem',
      border: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      minHeight: '100px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: '32px', height: '32px',
          borderRadius: '0.5rem',
          backgroundColor: `${color}15`,
          color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
        {sparkline && <Sparkline values={sparkline} color={color} width={70} height={22} />}
      </div>
      <div>
        <div style={{ fontSize: '0.7rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: colors.text, lineHeight: 1.1 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// Card que rotaciona entre os pilares mostrando o conteúdo mais usado de cada um.
function TopContentByPillarCard({ byContent, colors }) {
  // Para cada pilar, descobre o conteúdo de maior contagem
  const topByDim = DIM_ORDER.map((dim) => {
    const items = (byContent || []).filter(c => c.dimension === dim);
    if (items.length === 0) return null;
    const top = items.reduce((m, c) => (c.count > (m?.count || 0) ? c : m), null);
    return top ? { dim, name: top.name, count: top.count, minutes: top.minutes } : null;
  }).filter(Boolean);

  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  useEffect(() => {
    if (topByDim.length <= 1) return;
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % topByDim.length);
        setFade(true);
      }, 180);
    }, 3500);
    return () => clearInterval(interval);
  }, [topByDim.length]);

  if (topByDim.length === 0) {
    return (
      <div style={{
        padding: '1rem', backgroundColor: colors.surface,
        borderRadius: '0.625rem', border: `1px solid ${colors.border}`,
        minHeight: '100px', display: 'flex', flexDirection: 'column', gap: '0.5rem',
      }}>
        <div style={{ fontSize: '0.7rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}>
          Conteúdo mais usado
        </div>
        <div style={{ fontSize: '0.9rem', color: colors.textSecondary, fontStyle: 'italic' }}>—</div>
      </div>
    );
  }

  const safeIdx = Math.min(idx, topByDim.length - 1);
  const current = topByDim[safeIdx];
  const color = DIM_COLORS[current.dim];

  return (
    <div style={{
      padding: '1rem',
      backgroundColor: colors.surface,
      borderRadius: '0.625rem',
      border: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      minHeight: '100px',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: '32px', height: '32px',
          borderRadius: '0.5rem',
          backgroundColor: `${color}15`,
          color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background-color 0.3s, color 0.3s',
        }}>
          <Trophy size={18} strokeWidth={1.75} />
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          {topByDim.map((t, i) => (
            <span
              key={t.dim}
              onClick={() => { setIdx(i); }}
              title={DIM_LABELS[t.dim]}
              style={{
                width: i === safeIdx ? 14 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === safeIdx ? DIM_COLORS[t.dim] : colors.border,
                transition: 'all 0.25s',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ opacity: fade ? 1 : 0, transition: 'opacity 0.18s' }}>
        <div style={{ fontSize: '0.7rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}>
          Conteúdo mais usado · <span style={{ color }}>{DIM_LABELS[current.dim]}</span>
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: colors.text, lineHeight: 1.15, marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current.name}
        </div>
        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: '0.1rem' }}>
          {current.count} atividade{current.count !== 1 ? 's' : ''} · {formatMinutes(current.minutes || 0)}
        </div>
      </div>
    </div>
  );
}

export function KpiCardsRow({ totals, sparklines, byContent, colors }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      gap: '0.75rem',
    }}>
      <KpiCard label="Atividades" value={totals.activities} icon={<Activity size={18} strokeWidth={1.75} />}
        color="#3b82f6" sparkline={sparklines.activities} colors={colors} />
      <KpiCard label="Tempo total" value={formatMinutes(totals.minutes)} icon={<Clock size={18} strokeWidth={1.75} />}
        color="#a855f7" sparkline={sparklines.minutes} colors={colors} />
      <KpiCard label="Sessões" value={totals.sessions} icon={<Calendar size={18} strokeWidth={1.75} />}
        color="#10b981" colors={colors} />
      <TopContentByPillarCard byContent={byContent || []} colors={colors} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Donut Chart (SVG, com clique em fatia)
// ─────────────────────────────────────────────────────────────────
// Helper: lê o valor numérico do item conforme o modo (sessions | count | minutes)
function valueOfMode(d, mode) {
  if (mode === 'minutes') return d.minutes || 0;
  if (mode === 'sessions') return d.sessions || 0;
  return d.count || 0;
}

function formatModeValue(v, mode) {
  if (mode === 'minutes') return formatMinutes(v);
  if (mode === 'sessions') return String(Math.round(v)); // sempre inteiro
  return String(v);
}

function modeLabel(mode) {
  if (mode === 'minutes') return 'tempo';
  if (mode === 'sessions') return 'sessões';
  return 'atividades';
}

export function DonutChart({ data, mode = 'count', size = 220, onSelect, selectedKey, colors }) {
  // data: [{ key, label, count, minutes, days, color }]
  const total = data.reduce((s, d) => s + valueOfMode(d, mode), 0);
  const center = size / 2;
  const radius = size * 0.42;
  const innerR = radius * 0.62;

  if (total === 0) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textSecondary, fontSize: '0.875rem' }}>
        Sem dados
      </div>
    );
  }

  let currentAngle = -90;
  const segments = data
    .filter(d => valueOfMode(d, mode) > 0)
    .map((d) => {
      const value = valueOfMode(d, mode);
      const angle = (value / total) * 360;
      const startA = currentAngle;
      const midA = startA + angle / 2;
      currentAngle += angle;
      const sR = (startA * Math.PI) / 180;
      const eR = (currentAngle * Math.PI) / 180;
      const x1 = center + radius * Math.cos(sR);
      const y1 = center + radius * Math.sin(sR);
      const x2 = center + radius * Math.cos(eR);
      const y2 = center + radius * Math.sin(eR);
      const xi1 = center + innerR * Math.cos(eR);
      const yi1 = center + innerR * Math.sin(eR);
      const xi2 = center + innerR * Math.cos(sR);
      const yi2 = center + innerR * Math.sin(sR);
      const largeArc = angle > 180 ? 1 : 0;
      const path = angle >= 359.99
        ? `M ${center + radius} ${center} A ${radius} ${radius} 0 1 1 ${center - radius} ${center} A ${radius} ${radius} 0 1 1 ${center + radius} ${center} M ${center + innerR} ${center} A ${innerR} ${innerR} 0 1 0 ${center - innerR} ${center} A ${innerR} ${innerR} 0 1 0 ${center + innerR} ${center}`
        : `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${xi2} ${yi2} Z`;
      // Posição central da fatia (no raio médio) — pra plotar a % dentro
      const midR = (radius + innerR) / 2;
      const labelX = center + midR * Math.cos((midA * Math.PI) / 180);
      const labelY = center + midR * Math.sin((midA * Math.PI) / 180);
      const pct = Math.round((value / total) * 100);
      return { ...d, path, angle, value, labelX, labelY, pct };
    });

  // Tamanho do texto da % proporcional ao donut, com piso mínimo
  const labelFontSize = Math.max(9, Math.round(size * 0.06));

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size}>
        {segments.map((s) => {
          const isSelected = selectedKey === s.key;
          const isFaded = selectedKey && selectedKey !== s.key;
          return (
            <path
              key={s.key}
              d={s.path}
              fill={s.color}
              fillRule="evenodd"
              opacity={isFaded ? 0.35 : 1}
              stroke={isSelected ? colors.text : 'transparent'}
              strokeWidth={isSelected ? 2 : 0}
              style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
              onClick={() => onSelect?.(isSelected ? null : s.key)}
            >
              <title>{`${s.label || s.key}: ${formatModeValue(s.value, mode)} ${modeLabel(mode)} (${s.pct}%)`}</title>
            </path>
          );
        })}
        {/* Labels de % dentro das fatias (só se a fatia for grande o bastante) */}
        {segments.map((s) => {
          if (s.angle < 18) return null; // fatias < 5% ficam ilegíveis
          const isFaded = selectedKey && selectedKey !== s.key;
          return (
            <text
              key={`lbl-${s.key}`}
              x={s.labelX}
              y={s.labelY}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={labelFontSize}
              fontWeight="700"
              fill="#fff"
              opacity={isFaded ? 0.5 : 1}
              style={{ pointerEvents: 'none', userSelect: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
            >
              {s.pct}%
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Toggle Contagem / Tempo
// ─────────────────────────────────────────────────────────────────
// Toggle visual: Pizza ou Barras. Compacto, fica próximo do título do bloco.
export function ViewToggle({ value, onChange, colors }) {
  const btn = (active) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 26, height: 26,
    borderRadius: '0.3rem',
    border: 'none',
    backgroundColor: active ? colors.primary : 'transparent',
    color: active ? colors.primaryText : colors.textSecondary,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });
  return (
    <div style={{ display: 'inline-flex', gap: '0.15rem', padding: '0.15rem', backgroundColor: colors.surface, borderRadius: '0.4rem', border: `1px solid ${colors.border}` }}>
      <button onClick={() => onChange('donut')} style={btn(value === 'donut')} title="Visualizar como gráfico de pizza" aria-label="Pizza">
        <PieChart size={14} strokeWidth={1.75} />
      </button>
      <button onClick={() => onChange('bars')} style={btn(value === 'bars')} title="Visualizar como barras horizontais" aria-label="Barras">
        <BarChart3 size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

export const MODE_DESCRIPTIONS = {
  sessions: 'Frequência: em quantas sessões cada conteúdo apareceu (1× por sessão, mesmo que repita dentro do dia).',
  count: 'Volume: cada atividade conta individualmente. Uma sessão com 3 atividades de OO contabiliza 3 pra OO.',
  minutes: 'Carga: soma o tempo de todas as atividades. Submomentos não usam tempo (uma atividade pode marcar vários).',
};

export function ModeToggle({ value, onChange, colors }) {
  const btn = (active) => ({
    padding: '0.35rem 0.75rem',
    borderRadius: '0.375rem',
    border: 'none',
    backgroundColor: active ? colors.primary : 'transparent',
    color: active ? colors.primaryText : colors.textSecondary,
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  });
  return (
    <div style={{ display: 'inline-flex', gap: '0.2rem', padding: '0.2rem', backgroundColor: colors.surface, borderRadius: '0.5rem', border: `1px solid ${colors.border}` }}>
      <button
        onClick={() => onChange('sessions')}
        style={btn(value === 'sessions')}
        title={`Por sessão — ${MODE_DESCRIPTIONS.sessions}`}
      >Por sessão</button>
      <button
        onClick={() => onChange('count')}
        style={btn(value === 'count')}
        title={`Nº atividades — ${MODE_DESCRIPTIONS.count}`}
      >Nº atividades</button>
      <button
        onClick={() => onChange('minutes')}
        style={btn(value === 'minutes')}
        title={`Tempo — ${MODE_DESCRIPTIONS.minutes}`}
      >Tempo</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Legenda lateral (lista com bullet + count/minutes)
// ─────────────────────────────────────────────────────────────────
export function DimensionLegend({ data, mode, selectedKey, onSelect, colors }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {data.map((d) => {
        const value = valueOfMode(d, mode);
        const isSelected = selectedKey === d.key;
        const isFaded = selectedKey && selectedKey !== d.key;
        return (
          <button
            key={d.key}
            onClick={() => onSelect?.(isSelected ? null : d.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.4rem 0.6rem',
              border: `1px solid ${isSelected ? d.color : 'transparent'}`,
              borderRadius: '0.4rem',
              backgroundColor: isSelected ? `${d.color}10` : 'transparent',
              opacity: isFaded ? 0.5 : 1,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: d.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.875rem', color: colors.text, fontWeight: 500 }}>{d.label}</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: colors.text }}>
              {formatModeValue(value, mode)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Content drill-down (barras horizontais — conteúdos da pilar)
// ─────────────────────────────────────────────────────────────────
export function ContentDrilldown({ contents, dimensionKey, mode, colors }) {
  const filtered = contents.filter(c => c.dimension === dimensionKey);
  const total = filtered.reduce((s, d) => s + valueOfMode(d, mode), 0);
  const max = filtered.reduce((m, d) => Math.max(m, valueOfMode(d, mode)), 0);
  const color = DIM_COLORS[dimensionKey] || colors.primary;
  const label = DIM_LABELS[dimensionKey] || dimensionKey;
  const unitLabel = mode === 'minutes' ? 'min' : mode === 'sessions' ? 'sessões' : 'atividades';

  if (filtered.length === 0) {
    return (
      <div style={{ padding: '1rem', color: colors.textSecondary, fontSize: '0.875rem', textAlign: 'center' }}>
        Nenhum conteúdo registrado em {label} no período.
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: '0.875rem', color: colors.textSecondary, marginBottom: '0.75rem' }}>
        <strong style={{ color }}>{label}</strong> — {formatModeValue(total, mode)} {unitLabel}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {filtered.map((c) => {
          const value = valueOfMode(c, mode);
          const pct = max > 0 ? (value / max) * 100 : 0;
          return (
            <div key={c.content_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
              <span style={{ flex: '0 0 38%', color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <div style={{ flex: 1, height: 10, backgroundColor: colors.border, borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '5px', transition: 'width 0.25s' }} />
              </div>
              <span style={{ width: 56, textAlign: 'right', fontWeight: 700, color: colors.text }}>
                {formatModeValue(value, mode)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Submomento drill — só Tático tem submomentos
// Donut compacto + lista, tons de azul derivados do tático
// ─────────────────────────────────────────────────────────────────
// Paleta variada — cada submomento ganha uma cor distinta pra ficar legível.
const SUBMOMENT_PALETTE = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

// Submomentos não usam tempo: dividir distorce e somar duplica
// (uma atividade pode marcar vários). Sempre por contagem de aparições.
export function SubmomentDrilldown({ subcontents, colors, view = 'donut' }) {
  const filtered = subcontents.filter(s => s.dimension === 'tatico');
  if (filtered.length === 0) {
    return (
      <div style={{ padding: '1rem', color: colors.textSecondary, fontSize: '0.8rem', textAlign: 'center', fontStyle: 'italic' }}>
        Nenhum submomento marcado nas atividades táticas.
      </div>
    );
  }
  const sorted = [...filtered].sort((a, b) => b.count - a.count);
  const data = sorted.map((s, i) => ({
    key: s.subcontent_id,
    label: s.name,
    count: s.count,
    color: SUBMOMENT_PALETTE[i % SUBMOMENT_PALETTE.length],
  }));
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const maxV = Math.max(...data.map(d => d.count), 1);

  if (view === 'bars') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {data.map((d) => {
          const pct = (d.count / maxV) * 100;
          return (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
              <span style={{ flex: '0 0 38%', color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
              <div style={{ flex: 1, height: 10, backgroundColor: colors.border, borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: d.color, borderRadius: 5, transition: 'width 0.25s' }} />
              </div>
              <span style={{ width: 40, textAlign: 'right', fontWeight: 700, color: colors.text }}>{d.count}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // Donut view (default)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <DonutChart data={data} mode="count" size={160} colors={colors} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.25rem' }}>
        {data.map((d) => {
          const pct = total > 0 ? (d.count / total) * 100 : 0;
          return (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: d.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
              <span style={{ fontSize: '0.7rem', color: colors.textSecondary, width: 36, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
              <span style={{ width: 40, textAlign: 'right', fontWeight: 700, color: colors.text }}>{d.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Top atividades-template
// ─────────────────────────────────────────────────────────────────
export function TopTitlesList({ titles, mode, colors }) {
  if (mode === 'sessions') {
    return (
      <div style={{ padding: '1.5rem 1rem', color: colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', fontStyle: 'italic' }}>
        Atividades não se contam por sessão.<br />
        <span style={{ fontSize: '0.78rem' }}>Troque pra <strong>Nº atividades</strong> ou <strong>Tempo</strong> pra ver o ranking.</span>
      </div>
    );
  }
  if (titles.length === 0) {
    return <div style={{ padding: '1rem', color: colors.textSecondary, fontSize: '0.875rem', textAlign: 'center' }}>Sem atividades no período.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {titles.map((t, i) => {
        const c = DIM_COLORS[t.dimension] || colors.textSecondary;
        return (
          <div key={t.title_id} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 0.6rem',
            borderRadius: '0.4rem',
            backgroundColor: i === 0 ? `${c}10` : 'transparent',
            border: `1px solid ${i === 0 ? `${c}30` : colors.border}`,
            fontSize: '0.825rem',
          }}>
            <span style={{ width: 18, color: colors.textSecondary, fontWeight: 600, textAlign: 'right' }}>{i + 1}.</span>
            <span style={{ flex: 1, color: colors.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.title}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c }} />
              <span style={{ fontSize: '0.7rem', color: colors.textSecondary }}>{DIM_LABELS[t.dimension] || ''}</span>
            </span>
            <span style={{ fontWeight: 700, color: colors.text, width: 32, textAlign: 'right' }}>
              {mode === 'count' ? `${t.count}x` : formatMinutes(t.minutes)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Tendência stackada (barras por bucket) + sidebar com agregados
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// Pizza das atividades — proporção entre atividades-template no período.
// Cor de cada fatia = cor do pilar da atividade. Top N fatias + "Outras".
// ─────────────────────────────────────────────────────────────────
const ACTIVITY_VARIANTS = {
  tatico:  ['#3b82f6', '#60a5fa', '#1d4ed8', '#93c5fd', '#2563eb', '#1e40af'],
  fisico:  ['#f59e0b', '#fbbf24', '#d97706', '#fcd34d', '#b45309'],
  tecnico: ['#a855f7', '#c084fc', '#7e22ce', '#d8b4fe', '#6b21a8'],
  mental:  ['#10b981', '#34d399', '#047857', '#6ee7b7', '#065f46'],
};

export function ActivityPieChart({ titles, mode, colors, topN = 8 }) {
  const isMobile = useIsMobile();
  // Modo "Por sessão" não faz sentido pra atividades-template (uma atividade pode
  // ser usada várias vezes na mesma sessão ou em sessões diferentes).
  if (mode === 'sessions') {
    return (
      <div style={{ padding: '1.5rem', color: colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', fontStyle: 'italic' }}>
        Atividades não se contam por sessão.<br />
        <span style={{ fontSize: '0.78rem' }}>Troque pra <strong>Nº atividades</strong> ou <strong>Tempo</strong> pra ver a proporção.</span>
      </div>
    );
  }
  if (!titles || titles.length === 0) {
    return <div style={{ padding: '1.5rem', color: colors.textSecondary, fontSize: '0.85rem', textAlign: 'center', fontStyle: 'italic' }}>Sem atividades no período.</div>;
  }
  const effectiveMode = mode === 'minutes' ? 'minutes' : 'count';
  const valueOf = (t) => effectiveMode === 'minutes' ? (t.minutes || 0) : (t.count || 0);
  const sorted = [...titles].sort((a, b) => valueOf(b) - valueOf(a));
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  // Tom da fatia variando dentro da cor do pilar (pra distinguir atividades do mesmo pilar)
  const seenByDim = {};
  const data = top.map((t) => {
    const dim = t.dimension || 'tatico';
    const variants = ACTIVITY_VARIANTS[dim] || ACTIVITY_VARIANTS.tatico;
    seenByDim[dim] = (seenByDim[dim] || 0) + 1;
    const color = variants[(seenByDim[dim] - 1) % variants.length];
    return {
      key: t.title_id || t.title,
      label: t.title,
      dimension: dim,
      count: t.count || 0,
      minutes: t.minutes || 0,
      color,
    };
  });
  if (rest.length > 0) {
    const restCount = rest.reduce((s, t) => s + (t.count || 0), 0);
    const restMinutes = rest.reduce((s, t) => s + (t.minutes || 0), 0);
    data.push({
      key: '__others',
      label: `Outras (${rest.length})`,
      count: restCount,
      minutes: restMinutes,
      color: '#6b7280',
    });
  }
  const total = data.reduce((s, d) => s + valueOf(d), 0);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 1fr', gap: '1rem', alignItems: 'center', justifyItems: isMobile ? 'center' : 'stretch' }}>
      <DonutChart data={data} mode={effectiveMode} size={180} colors={colors} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: 240, overflowY: 'auto', paddingRight: '0.25rem' }}>
        {data.map((d) => {
          const v = valueOf(d);
          const pct = total > 0 ? (v / total) * 100 : 0;
          return (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: d.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.label}>{d.label}</span>
              <span style={{ fontSize: '0.7rem', color: colors.textSecondary, width: 32, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
              <span style={{ width: 50, textAlign: 'right', fontWeight: 700, color: colors.text }}>
                {mode === 'minutes' ? formatMinutes(d.minutes) : `${d.count}x`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrendStackedBars({ trend, mode, colors, height = 160 }) {
  const isMobile = useIsMobile();
  if (!trend?.length) return null;
  const valueOf = (b) => mode === 'minutes' ? b.minutes : b.total;
  const max = Math.max(...trend.map(valueOf), 1);

  // Agregados
  const totalActivities = trend.reduce((s, b) => s + b.total, 0);
  const totalMinutes = trend.reduce((s, b) => s + b.minutes, 0);
  const nonEmptyBuckets = trend.filter(b => b.total > 0).length;
  const avgPerBucket = nonEmptyBuckets > 0 ? totalActivities / nonEmptyBuckets : 0;
  const peakBucket = trend.reduce((max, b) => (b.total > (max?.total || 0) ? b : max), null);

  const statCardStyle = {
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
  };
  const statLabelStyle = { fontSize: '0.65rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 };
  const statValueStyle = { fontSize: '1rem', fontWeight: 700, color: colors.text, marginTop: '0.1rem' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 130px', gap: '0.75rem', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height, padding: '0.5rem 0' }}>
          {trend.map((b, i) => {
            const val = valueOf(b);
            const totalH = (val / max) * (height - 30);
            const segmentBase = mode === 'minutes' ? b.minutes : b.total;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: colors.text }}>
                  {mode === 'minutes' ? formatMinutes(b.minutes) : b.total}
                </div>
                <div style={{ width: '100%', maxWidth: 50, display: 'flex', flexDirection: 'column-reverse', height: totalH, borderRadius: '4px 4px 0 0', overflow: 'hidden', backgroundColor: colors.border }}>
                  {DIM_ORDER.map((dim) => {
                    const count = b.byDimension?.[dim] || 0;
                    if (count === 0 || segmentBase === 0) return null;
                    // Modo minutes: aproxima proporção pela contagem (sem tempo por dim no payload)
                    const h = (count / b.total) * totalH;
                    return <div key={dim} style={{ width: '100%', height: h, backgroundColor: DIM_COLORS[dim] }} title={`${DIM_LABELS[dim]}: ${count}`} />;
                  })}
                </div>
                <div style={{ fontSize: '0.65rem', color: colors.textSecondary, textAlign: 'center' }}>{b.period}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', fontSize: '0.7rem', color: colors.textSecondary }}>
          {DIM_ORDER.map((dim) => (
            <div key={dim} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: DIM_COLORS[dim] }} />
              <span>{DIM_LABELS[dim]}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Total no período</div>
          <div style={statValueStyle}>{totalActivities}</div>
          <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: '0.1rem' }}>{formatMinutes(totalMinutes)}</div>
        </div>
        <div style={statCardStyle}>
          <div style={statLabelStyle}>Média/bucket</div>
          <div style={statValueStyle}>{avgPerBucket.toFixed(1)}</div>
          <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: '0.1rem' }}>{nonEmptyBuckets} de {trend.length} ativos</div>
        </div>
        {peakBucket && peakBucket.total > 0 && (
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Pico</div>
            <div style={statValueStyle}>{peakBucket.total}</div>
            <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: '0.1rem' }}>{peakBucket.period}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Dashboard completo de Treino
// ─────────────────────────────────────────────────────────────────
export function TrainingDashboard({ stats, colors }) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState('sessions'); // 'sessions' (default) | 'count' | 'minutes'
  const [selectedDim, setSelectedDim] = useState(null);
  // View dos drills do pilar Tático: pizza ou barras
  const [taticView, setTaticView] = useState('donut'); // 'donut' | 'bars'
  const [submomentView, setSubmomentView] = useState('donut'); // 'donut' | 'bars'
  // Filtro: ao clicar num conteúdo tático, restringe submomentos a esse content_id
  const [selectedTaticContent, setSelectedTaticContent] = useState(null);

  if (!stats || stats.totals.activities === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: colors.textSecondary, textAlign: 'center', gap: '0.5rem' }}>
        <Activity size={48} strokeWidth={1.5} style={{ opacity: 0.3 }} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: colors.text }}>Nenhum dado encontrado</h3>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>Não há treinos registrados no período selecionado.</p>
        {/* Só a distância do dia foi preenchida (sem atividades): mostra ela mesmo assim */}
        {stats?.distance?.daysWithData > 0 && (
          <div style={{ width: '100%', marginTop: '1.5rem', textAlign: 'left' }}>
            <DistanceCard distance={stats.distance} colors={colors} />
          </div>
        )}
      </div>
    );
  }

  const dimensionDataAll = DIM_ORDER.map((key) => {
    const found = (stats.byDimension || []).find(d => d.dimension === key);
    const foundPred = (stats.byDimensionPredominance || []).find(d => d.dimension === key);
    return {
      key,
      label: DIM_LABELS[key],
      count: found?.count || 0,
      minutes: found?.minutes || 0,
      sessions: foundPred?.sessions || 0,
      color: DIM_COLORS[key],
    };
  });
  const dimensionData = dimensionDataAll.filter(d => d.count > 0 || d.minutes > 0 || d.sessions > 0);

  // No modo "Por sessão", os componentes leem `byContentPredominance` em vez de `byContent`
  const contentsForDrill = mode === 'sessions'
    ? (stats.byContentPredominance || []).map(c => ({ ...c, count: 0, minutes: 0 }))
    : (stats.byContent || []);

  // Quando nenhum drill selecionado, mostra pilar com mais atividades
  const activeDim = selectedDim || dimensionData[0]?.key;

  const cardStyle = {
    backgroundColor: colors.surface,
    borderRadius: '0.625rem',
    border: `1px solid ${colors.border}`,
    padding: '1rem',
  };
  const sectionTitleStyle = {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: colors.text,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <KpiCardsRow totals={stats.totals} sparklines={stats.sparklines} byContent={stats.byContent} colors={colors} />

      {/* Distribuição por Pilar + Drill (Conteúdos + Submomentos se Tático) */}
      <div style={cardStyle}>
        <div style={sectionTitleStyle}>
          <span>Distribuição por Pilar</span>
          <ModeToggle value={mode} onChange={setMode} colors={colors} />
        </div>
        {/* Legenda explicativa do modo atual — visível pra deixar claro o que cada modo conta */}
        <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginBottom: '0.75rem', padding: '0.4rem 0.6rem', backgroundColor: colors.background, border: `1px solid ${colors.border}`, borderRadius: '0.375rem' }}>
          <strong style={{ color: colors.text }}>
            {mode === 'sessions' ? 'Por sessão' : mode === 'count' ? 'Nº atividades' : 'Tempo'}:
          </strong>{' '}
          {MODE_DESCRIPTIONS[mode]}
        </div>
        <div style={{
          display: 'grid',
          // No mobile empilha em 1 coluna — os grids de 2/3 colunas fixas
          // vazavam pra fora da tela e encavalavam os donuts.
          gridTemplateColumns: isMobile
            ? '1fr'
            : (activeDim === 'tatico' && mode !== 'minutes')
              ? 'minmax(220px, 280px) 1fr 1fr'
              : 'minmax(260px, 360px) 1fr',
          gap: isMobile ? '1.5rem' : '1.25rem',
          alignItems: 'start',
        }}>
          <div>
            <DonutChart
              data={dimensionData}
              mode={mode}
              size={200}
              onSelect={setSelectedDim}
              selectedKey={selectedDim}
              colors={colors}
            />
            <div style={{ marginTop: '0.75rem' }}>
              <DimensionLegend
                data={dimensionData}
                mode={mode}
                selectedKey={selectedDim}
                onSelect={setSelectedDim}
                colors={colors}
              />
            </div>
          </div>
          <div style={{ minWidth: 0, ...(isMobile ? { paddingTop: '0.75rem', borderTop: `1px solid ${colors.border}` } : { paddingLeft: '0.5rem', borderLeft: `1px solid ${colors.border}` }) }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                {activeDim === 'tatico' ? 'Momentos do Jogo' : 'Conteúdos'}
              </div>
              {activeDim === 'tatico' && (
                <ViewToggle value={taticView} onChange={setTaticView} colors={colors} />
              )}
            </div>
            {activeDim === 'tatico' ? (() => {
              const taticPalette = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
              const taticContents = contentsForDrill
                .filter(c => c.dimension === 'tatico')
                .sort((a, b) => valueOfMode(b, mode) - valueOfMode(a, mode))
                .map((c, i) => ({
                  key: c.content_id,
                  content_id: c.content_id,
                  label: c.name,
                  name: c.name,
                  dimension: 'tatico',
                  count: c.count || 0,
                  minutes: c.minutes || 0,
                  sessions: c.sessions || 0,
                  color: taticPalette[i % taticPalette.length],
                }));
              if (taticContents.length === 0) {
                return <div style={{ padding: '1rem', color: colors.textSecondary, fontSize: '0.875rem', textAlign: 'center' }}>Nenhum conteúdo registrado em Tático no período.</div>;
              }
              if (taticView === 'donut') {
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 1fr', gap: '0.75rem', alignItems: 'center', justifyItems: isMobile ? 'center' : 'stretch' }}>
                    <DonutChart
                      data={taticContents}
                      mode={mode}
                      size={180}
                      colors={colors}
                      onSelect={(k) => setSelectedTaticContent(k === selectedTaticContent ? null : k)}
                      selectedKey={selectedTaticContent}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {taticContents.map((c) => {
                        const v = valueOfMode(c, mode);
                        const isActive = selectedTaticContent === c.content_id;
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => setSelectedTaticContent(isActive ? null : c.content_id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.4rem',
                              padding: '0.3rem 0.5rem',
                              fontSize: '0.78rem',
                              backgroundColor: isActive ? `${c.color}1A` : 'transparent',
                              border: `1px solid ${isActive ? c.color : 'transparent'}`,
                              borderRadius: '0.35rem',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'all 0.15s',
                            }}
                          >
                            <span style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: c.color, flexShrink: 0 }} />
                            <span style={{ flex: 1, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                            <span style={{ fontWeight: 700, color: colors.text }}>{formatModeValue(v, mode)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              // Bars view
              const maxV = Math.max(...taticContents.map(c => valueOfMode(c, mode)), 1);
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {taticContents.map((c) => {
                    const v = valueOfMode(c, mode);
                    const pct = (v / maxV) * 100;
                    const isActive = selectedTaticContent === c.content_id;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setSelectedTaticContent(isActive ? null : c.content_id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          padding: '0.3rem 0.5rem',
                          backgroundColor: isActive ? `${c.color}1A` : 'transparent',
                          border: `1px solid ${isActive ? c.color : 'transparent'}`,
                          borderRadius: '0.35rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                          fontSize: '0.825rem',
                        }}
                      >
                        <span style={{ flex: '0 0 38%', color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                        <div style={{ flex: 1, height: 10, backgroundColor: colors.border, borderRadius: '5px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: c.color, borderRadius: '5px', transition: 'width 0.25s' }} />
                        </div>
                        <span style={{ width: 56, textAlign: 'right', fontWeight: 700, color: colors.text }}>{formatModeValue(v, mode)}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })() : (
              <ContentDrilldown
                contents={contentsForDrill}
                dimensionKey={activeDim}
                mode={mode}
                colors={colors}
              />
            )}
            {!selectedDim && (
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: '0.75rem', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <ChevronRight size={11} /> Clique na fatia/legenda pra trocar
              </div>
            )}
          </div>
          {activeDim === 'tatico' && mode !== 'minutes' && (
            <div style={{ minWidth: 0, ...(isMobile ? { paddingTop: '0.75rem', borderTop: `1px solid ${colors.border}` } : { paddingLeft: '0.5rem', borderLeft: `1px solid ${colors.border}` }) }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  Submomentos
                  {selectedTaticContent && (() => {
                    const sel = (stats.byContent || []).find(c => c.content_id === selectedTaticContent);
                    return sel ? (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', textTransform: 'none', letterSpacing: 0, color: '#3b82f6', fontWeight: 600 }}>· {sel.name}</span>
                    ) : null;
                  })()}
                </div>
                <ViewToggle value={submomentView} onChange={setSubmomentView} colors={colors} />
              </div>
              <SubmomentDrilldown
                subcontents={(stats.bySubcontent || []).filter(s => !selectedTaticContent || s.content_id === selectedTaticContent)}
                colors={colors}
                view={submomentView}
              />
              {selectedTaticContent && (
                <button
                  type="button"
                  onClick={() => setSelectedTaticContent(null)}
                  style={{
                    marginTop: '0.5rem', width: '100%', padding: '0.35rem',
                    background: 'transparent', border: `1px dashed ${colors.border}`,
                    borderRadius: '0.375rem', color: colors.textSecondary,
                    fontSize: '0.7rem', cursor: 'pointer',
                  }}
                >
                  Limpar filtro
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Distância ideal (info do dia) — some quando não há registro */}
      <DistanceCard distance={stats.distance} colors={colors} />

      {/* Top Atividades + Tendência lado a lado (altura independente) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '0.75rem', alignItems: 'start' }}>
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>
            <span>Top Atividades</span>
            <span style={{ fontSize: '0.7rem', color: colors.textSecondary, fontWeight: 500 }}>Mais usadas</span>
          </div>
          <TopTitlesList titles={stats.topTitles || []} mode={mode} colors={colors} />
        </div>
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>
            <span>Atividades · proporção</span>
            <span style={{ fontSize: '0.7rem', color: colors.textSecondary, fontWeight: 500 }}>{mode === 'minutes' ? 'por tempo' : 'por uso'}</span>
          </div>
          <ActivityPieChart titles={stats.topTitles || []} mode={mode} colors={colors} />

        </div>
      </div>
    </div>
  );
}

// Escalação no campo/quadra: desenha as VAGAS da formação escolhida e quem
// ocupa cada uma. Quem decide onde o atleta aparece é a vaga (slot), nunca a
// posição cadastrada. Geometria das vagas em lib/formation.js (compartilhada com o PDF).

import { readJersey } from '../../lib/lineupLayout';
import { buildSlots, initials, shortName } from '../../lib/formation';
import { startLineupDrag } from '../../lib/lineupDrag';

// ---------- Componentes de campo por modalidade ----------
function FutsalCourt() {
  // Quadra cobalto sólida com marcações brancas (estilo padrão de futsal).
  return (
    <svg viewBox="0 0 100 150" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="futsalGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="150" fill="url(#futsalGrad)" />
      {/* Linhas brancas */}
      <g stroke="#ffffff" strokeWidth="0.6" fill="none" opacity="0.92">
        {/* Borda */}
        <rect x="3" y="3" width="94" height="144" />
        {/* Meio de campo + círculo central */}
        <line x1="3" y1="75" x2="97" y2="75" />
        <circle cx="50" cy="75" r="9" />
        <circle cx="50" cy="75" r="0.9" fill="#ffffff" />
        {/* Área (D) inferior — nossa */}
        <path d="M 22 147 A 28 28 0 0 1 78 147" />
        {/* Área (D) superior — adversária */}
        <path d="M 22 3 A 28 28 0 0 0 78 3" />
        {/* Marca do pênalti (6m) — pequeno X */}
        <circle cx="50" cy="135" r="0.9" fill="#ffffff" />
        <circle cx="50" cy="15"  r="0.9" fill="#ffffff" />
        {/* Marca do segundo pênalti (10m) */}
        <circle cx="50" cy="119" r="0.9" fill="#ffffff" />
        <circle cx="50" cy="31"  r="0.9" fill="#ffffff" />
        {/* Gols (pequenos retângulos brancos cheios) */}
        <rect x="44" y="1" width="12" height="2" fill="#ffffff" />
        <rect x="44" y="147" width="12" height="2" fill="#ffffff" />
      </g>
    </svg>
  );
}

// Campo de futebol com as MEDIDAS OFICIAIS (68 × 105 m), no mesmo desenho do PDF
// da convocação (backend-node/src/reports/templates/convocacao.js). O container
// trava o aspect ratio 68:105, então os círculos não ficam ovais.
//   grande área 40,32 × 16,5 · pequena área 18,32 × 5,5 · pênalti a 11 m
//   círculo central e meias-luas r 9,15 (a meia-lua é a parte do círculo do
//   pênalti fora da grande área: corda em y = 16,5, meia-largura √(9,15² − 5,5²) ≈ 7,31)
export const FIELD_ASPECT = '68 / 105';
function FootballField() {
  const W = 68, H = 105, cx = 34;
  const paW = 40.32, paD = 16.5, gaW = 18.32, gaD = 5.5, pen = 11, r = 9.15;
  const arcHalf = Math.sqrt(r * r - (paD - pen) ** 2); // ≈ 7,31
  const stripes = 10;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
      <rect x="0" y="0" width={W} height={H} fill="#2c6f33" />
      {Array.from({ length: stripes }).map((_, i) => (
        <rect key={i} x="0" y={(i * H) / stripes} width={W} height={H / stripes} fill={i % 2 === 0 ? '#34803f' : '#2c6f33'} />
      ))}
      <g stroke="#ffffff" strokeWidth="0.35" fill="none" opacity="0.9">
        {/* linhas laterais/de fundo (meia espessura pra dentro) + meio-campo */}
        <rect x="0.4" y="0.4" width={W - 0.8} height={H - 0.8} />
        <line x1="0.4" y1={H / 2} x2={W - 0.4} y2={H / 2} />
        <circle cx={cx} cy={H / 2} r={r} />
        {/* grande e pequena área — topo (adversário) e base (nossa) */}
        <rect x={cx - paW / 2} y="0.4" width={paW} height={paD - 0.4} />
        <rect x={cx - gaW / 2} y="0.4" width={gaW} height={gaD - 0.4} />
        <rect x={cx - paW / 2} y={H - paD} width={paW} height={paD - 0.4} />
        <rect x={cx - gaW / 2} y={H - gaD} width={gaW} height={gaD - 0.4} />
        {/* meias-luas */}
        <path d={`M ${cx - arcHalf} ${paD} A ${r} ${r} 0 0 0 ${cx + arcHalf} ${paD}`} />
        <path d={`M ${cx - arcHalf} ${H - paD} A ${r} ${r} 0 0 1 ${cx + arcHalf} ${H - paD}`} />
        {/* escanteios r 1 */}
        <path d="M 0.4 1.4 A 1 1 0 0 0 1.4 0.4" />
        <path d={`M ${W - 1.4} 0.4 A 1 1 0 0 0 ${W - 0.4} 1.4`} />
        <path d={`M 0.4 ${H - 1.4} A 1 1 0 0 1 1.4 ${H - 0.4}`} />
        <path d={`M ${W - 1.4} ${H - 0.4} A 1 1 0 0 1 ${W - 0.4} ${H - 1.4}`} />
      </g>
      <g fill="#ffffff" opacity="0.9">
        <circle cx={cx} cy={H / 2} r="0.45" />
        <circle cx={cx} cy={pen} r="0.4" />
        <circle cx={cx} cy={H - pen} r="0.4" />
        {/* metas 7,32 m */}
        <rect x={cx - 3.66} y="0" width="7.32" height="0.6" />
        <rect x={cx - 3.66} y={H - 0.6} width="7.32" height="0.6" />
      </g>
    </svg>
  );
}

// ---------- Componente principal ----------
/**
 * @param {object}   props
 * @param {Array}    props.players     jogadores do jogo ({ athlete_id, status, slot, ... })
 * @param {string}   props.formation   formação efetiva (ex. "4-4-2")
 * @param {string}   props.modality
 * @param {Function} [props.onSlotClick] (slotIndex) => void — sem isso o campo é só leitura
 * @param {string}   [props.movingAthleteId] atleta sendo movido (destaca as vagas de destino)
 * @param {Function} [props.onDropAthlete] (athleteId, slot) => void — liga o ARRASTAR: o atleta do
 *   campo vai para outra vaga (troca); listas de fora usam lib/lineupDrag.js com o mesmo callback
 */
export function LineupField({ players = [], formation, modality = 'football_11', onSlotClick, movingAthleteId = null, maxWidth = 430, onDropAthlete = null }) {
  const isFutsal = modality === 'futsal';
  const slots = buildSlots(formation);
  const bySlot = new Map();
  (players || []).forEach((p) => {
    if (p.status === 'starter' && p.slot != null) bySlot.set(p.slot, p);
  });
  const interactive = typeof onSlotClick === 'function';

  return (
    <div style={{
      width: '100%',
      maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
      margin: '0 auto',
      aspectRatio: isFutsal ? '2 / 3' : FIELD_ASPECT,
      position: 'relative',
      borderRadius: '0.5rem',
      overflow: 'hidden',
      boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
      containerType: 'inline-size',
    }}>
      {isFutsal ? <FutsalCourt /> : <FootballField />}
      {/* vaga embaixo do atleta arrastado (lib/lineupDrag.js marca data-drop-over) */}
      <style>{'[data-slot][data-drop-over] > div:first-child{outline:3px solid #facc15;outline-offset:2px;transform:scale(1.12)}'}</style>

      {slots.map((s) => {
        const p = bySlot.get(s.index);
        const name = p ? (p.name || p.athlete?.name || 'Jogador') : '';
        const num = p ? readJersey(p) : null;
        const isMoving = p && movingAthleteId && p.athlete_id === movingAthleteId;
        const isTarget = movingAthleteId && !isMoving;
        const label = p
          ? `${s.role}: ${name}${num != null && num !== '' ? ` (${num})` : ''}`
          : `Vaga ${s.role} vazia — escolher atleta`;

        return (
          <button
            key={s.index}
            type="button"
            data-slot={s.index}
            title={label}
            aria-label={label}
            disabled={!interactive}
            onClick={interactive ? () => onSlotClick(s.index) : undefined}
            onPointerDown={p && onDropAthlete ? (e) => startLineupDrag(e, {
              athleteId: p.athlete_id, label: shortName(name), onDrop: onDropAthlete,
            }) : undefined}
            style={{
              position: 'absolute',
              left: `${s.x}%`,
              top: `${s.y}%`,
              transform: 'translate(-50%, -50%)',
              width: `${s.spacing}%`,
              minWidth: 44,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.2rem',
              padding: '0.15rem 0',
              background: 'none',
              border: 'none',
              cursor: interactive ? 'pointer' : 'default',
              WebkitTapHighlightColor: 'transparent',
              // atleta arrastável: o dedo arrasta o atleta em vez de rolar a tela
              touchAction: p && onDropAthlete ? 'none' : 'manipulation',
              font: 'inherit',
            }}
          >
            {p ? (
              <div style={{
                width: 'clamp(30px, 11cqw, 40px)', height: 'clamp(30px, 11cqw, 40px)', borderRadius: '50%',
                background: '#ffffff',
                border: `2px solid ${isMoving ? '#facc15' : '#0f172a'}`,
                outline: isMoving ? '3px solid #facc15' : (isTarget ? '2px dashed rgba(255,255,255,0.9)' : 'none'),
                outlineOffset: 2,
                color: '#0f172a',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: (num != null && num !== '') ? 'clamp(0.78rem, 4cqw, 0.95rem)' : 'clamp(0.66rem, 3.4cqw, 0.8rem)',
                fontWeight: 800,
                boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
              }}>
                {num != null && num !== '' ? num : initials(name)}
              </div>
            ) : (
              <div style={{
                width: 'clamp(30px, 11cqw, 40px)', height: 'clamp(30px, 11cqw, 40px)', borderRadius: '50%',
                background: isTarget ? 'rgba(250,204,21,0.25)' : 'rgba(255,255,255,0.12)',
                border: `2px dashed ${isTarget ? '#facc15' : 'rgba(255,255,255,0.85)'}`,
                color: '#ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'clamp(1rem, 5cqw, 1.2rem)', fontWeight: 600, lineHeight: 1,
              }}>+</div>
            )}
            <div style={{
              maxWidth: '100%',
              padding: '0.06rem 0.35rem',
              backgroundColor: p ? 'rgba(15,23,42,0.85)' : 'rgba(15,23,42,0.45)',
              color: p ? '#fff' : 'rgba(255,255,255,0.85)',
              fontSize: 'clamp(0.56rem, 2.8cqw, 0.68rem)',
              fontWeight: p ? 600 : 700,
              borderRadius: '0.3rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
              letterSpacing: p ? '0.01em' : '0.06em',
              boxSizing: 'border-box',
            }}>{p ? shortName(name) : s.role}</div>
          </button>
        );
      })}
    </div>
  );
}

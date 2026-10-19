import { MapPin } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { formatKm } from '../../utils/distancia';

// Cor do pilar Físico (DIM_COLORS.fisico): distância é carga física.
const COR = '#f59e0b';

// Distância média por jogador (info do dia, preenchida no modal do treino).
// Não renderiza nada quando nenhum dia do período tem registro.
export function DistanceCard({ distance, colors }) {
  const isMobile = useIsMobile();
  if (!distance || !distance.daysWithData) return null;

  const { series = [], avgKm, totalKm, maxKm, daysWithData, granularity } = distance;
  const porSemana = granularity === 'week';
  const max = Math.max(...series.map((s) => s.avgKm), avgKm || 0, 0.01) * 1.15;
  const chartH = 150;
  const mostrarValores = series.length <= 14;
  // Em séries longas (1 ano = ~52 semanas), rótulo a cada N barras pra não encavalar
  const passoRotulo = series.length > 26 ? 4 : series.length > 14 ? 2 : 1;
  const avgPct = avgKm ? (avgKm / max) * 100 : 0;

  const cardStyle = {
    backgroundColor: colors.surface,
    borderRadius: '0.625rem',
    border: `1px solid ${colors.border}`,
    padding: '1rem',
  };
  const tileStyle = {
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
  };
  const tileLabel = { fontSize: '0.65rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 };
  const tileValue = { fontSize: '1.15rem', fontWeight: 700, color: colors.text, marginTop: '0.1rem', fontVariantNumeric: 'tabular-nums' };
  const tileSub = { fontSize: '0.7rem', color: colors.textSecondary, marginTop: '0.1rem' };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: colors.text, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <MapPin size={16} color={COR} /> Distância média por jogador
        </span>
        <span style={{ fontSize: '0.7rem', color: colors.textSecondary, fontWeight: 500 }}>
          {porSemana ? 'média por semana' : 'por dia de treino'} · km
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 170px', gap: '0.75rem', alignItems: 'start' }}>
        {/* Barras + linha da média do período */}
        <div style={{ minWidth: 0 }}>
          <div style={{ position: 'relative', height: chartH, display: 'flex', alignItems: 'flex-end', gap: series.length > 26 ? '2px' : '0.4rem', borderBottom: `1px solid ${colors.border}` }}>
            {avgKm > 0 && (
              <div
                aria-hidden
                style={{ position: 'absolute', left: 0, right: 0, bottom: `${avgPct}%`, borderTop: `1.5px dashed ${colors.textSecondary}`, opacity: 0.7, pointerEvents: 'none', zIndex: 1 }}
              >
                <span style={{ position: 'absolute', right: 0, top: '-1.05rem', fontSize: '0.65rem', fontWeight: 600, color: colors.textSecondary, backgroundColor: colors.surface, padding: '0 0.25rem' }}>
                  média {formatKm(avgKm, 1)}
                </span>
              </div>
            )}
            {series.map((s) => {
              const h = (s.avgKm / max) * 100;
              const dica = porSemana
                ? `Semana de ${s.label}: ${formatKm(s.avgKm)} km (média de ${s.days} ${s.days === 1 ? 'dia' : 'dias'})`
                : `${s.label}: ${formatKm(s.avgKm)} km`;
              return (
                <div key={s.start} title={dica} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {mostrarValores && (
                    <div style={{ fontSize: '0.68rem', fontWeight: 600, color: colors.text, marginBottom: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>
                      {formatKm(s.avgKm, 1)}
                    </div>
                  )}
                  <div style={{ width: '100%', maxWidth: 44, height: `${h}%`, backgroundColor: COR, borderRadius: '4px 4px 0 0', minHeight: 2 }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: series.length > 26 ? '2px' : '0.4rem', marginTop: '0.25rem' }}>
            {series.map((s, i) => (
              <div key={s.start} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: '0.65rem', color: colors.textSecondary, whiteSpace: 'nowrap', overflow: 'visible' }}>
                {i % passoRotulo === 0 ? s.label : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Resumo */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : '1fr', gap: '0.4rem' }}>
          <div style={tileStyle}>
            <div style={tileLabel}>Média</div>
            <div style={tileValue}>{formatKm(avgKm, 1)} km</div>
            <div style={tileSub}>{daysWithData} {daysWithData === 1 ? 'dia com registro' : 'dias com registro'}</div>
          </div>
          <div style={tileStyle}>
            <div style={tileLabel}>Acumulado</div>
            <div style={tileValue}>{formatKm(totalKm, 1)} km</div>
            <div style={tileSub}>por jogador no período</div>
          </div>
          <div style={tileStyle}>
            <div style={tileLabel}>Maior dia</div>
            <div style={tileValue}>{formatKm(maxKm, 1)} km</div>
          </div>
        </div>
      </div>
    </div>
  );
}

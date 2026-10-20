import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '../common/Card';
import { Clock, X, Target, Trophy, Goal, Shield, AlertTriangle, TrendingUp, Square, ArrowLeftRight, Video, ListChecks, Award, Flame, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

export function GameStatsContent({
  gameStats,
  loading,
  colors,
  statsGridStyle,
  statCardStyle,
  statIconStyle,
  statContentStyle,
  statLabelStyle,
  statValueStyle,
  chartsGridStyle,
  chartCardStyle,
  chartTitleStyle,
  chartContentStyle,
}) {
  const [showScoredModal, setShowScoredModal] = useState(false);
  const [showConcededModal, setShowConcededModal] = useState(false);
  const [chartViewMode, setChartViewMode] = useState('type');
  const [showAllMinutes, setShowAllMinutes] = useState(false);

  const displayStats = gameStats || {
    totalMatches: 0, totalGoalsScored: 0, totalGoalsConceded: 0,
    wins: 0, draws: 0, losses: 0,
    goalsScoredByType: [], goalsConcededByType: [],
    goalsScoredByMinute: [], goalsConcededByMinute: [],
    redCards: 0, yellowCards: 0, assists: 0,
    topScorers: [], topAssisters: [], topMinutes: [], playerStats: [],
    avgGoalsScored: 0, avgGoalsConceded: 0,
    cleanSheets: 0, biggestWin: null, biggestLoss: null,
    form: [], avgTimeFirstGoalFor: null, avgTimeFirstGoalAgainst: null,
    goalDifference: 0,
    pointsWon: 0, pointsPlayed: 0,
    winStreak: 0, unbeatenStreak: 0, drawStreak: 0,
    matchesHistory: [],
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: colors.textSecondary }}>
        Carregando estatísticas de jogos...
      </div>
    );
  }

  if (displayStats.totalMatches === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: colors.textSecondary, textAlign: 'center', gap: '0.5rem' }}>
        <Trophy size={48} strokeWidth={1.5} style={{ opacity: 0.3 }} />
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: colors.text }}>Nenhum jogo encontrado</h3>
        <p style={{ margin: 0, fontSize: '0.875rem' }}>Não há jogos registrados no período selecionado.</p>
      </div>
    );
  }

  const totalGoals = displayStats.goalsScoredByType.reduce((sum, g) => sum + g.value, 0);
  const totalConceded = displayStats.goalsConcededByType.reduce((sum, g) => sum + g.value, 0);

  const compactStatCardStyle = { padding: '0.5rem 0.75rem', backgroundColor: colors.surface, borderRadius: '0.375rem', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 };
  const compactStatIconStyle = { width: '28px', height: '28px', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
  const compactStatValueStyle = { fontSize: '1rem', fontWeight: '700', color: colors.text, lineHeight: 1 };
  const compactStatLabelStyle = { fontSize: '0.65rem', color: colors.textSecondary, whiteSpace: 'nowrap' };
  const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '2rem' };
  const modalContentStyle = { backgroundColor: colors.surface, borderRadius: '0.75rem', padding: '1.5rem', maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto', position: 'relative' };

  return (
    <>
      {/* Cards numéricos top: paleta neutra. Cor é reservada pra sinalizar
          resultado (V/E/D) — não pra contar coisas. */}
      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'stretch', width: '100%' }}>
        <NeutralStatCard icon={<Trophy size={16} strokeWidth={1.5} />} label="Jogos" value={displayStats.totalMatches} colors={colors} />
        <NeutralStatCard icon={<Goal size={16} strokeWidth={1.5} />} label="Gols Feitos" value={displayStats.totalGoalsScored} colors={colors} />
        <NeutralStatCard icon={<Shield size={16} strokeWidth={1.5} />} label="Gols Tomados" value={displayStats.totalGoalsConceded} colors={colors} />
        <NeutralStatCard icon={<Square size={14} strokeWidth={1.5} fill="currentColor" />} label="Amarelos" value={displayStats.yellowCards || 0} colors={colors} />
        <NeutralStatCard icon={<Square size={14} strokeWidth={1.5} fill="currentColor" />} label="Vermelhos" value={displayStats.redCards} colors={colors} />
        <NeutralStatCard icon={<TrendingUp size={16} strokeWidth={1.5} />} label="Gols/Jogo" value={displayStats.avgGoalsScored} colors={colors} />
        {displayStats.modality === 'futsal' && (
          <>
            <NeutralStatCard icon={<Square size={14} strokeWidth={1.5} fill="currentColor" />} label="Faltas Acum." value={displayStats.accumulatedFouls || 0} colors={colors} />
            <NeutralStatCard icon={<Square size={14} strokeWidth={1.5} fill="currentColor" />} label="6ª Falta" value={displayStats.sixthFouls || 0} colors={colors} />
          </>
        )}
      </div>

      {/* Linha de métricas auxiliares: Forma + Saldo + Cleansheets + Goleadas + 1º gol */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
        {/* Forma */}
        <div style={{ ...compactStatCardStyle, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={compactStatLabelStyle}>Últimos jogos</div>
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.3rem' }}>
              {(displayStats.form || []).length === 0
                ? <span style={{ fontSize: '0.78rem', color: colors.textSecondary, fontStyle: 'italic' }}>—</span>
                : (displayStats.form || []).map((m, i) => {
                    const c = m.result === 'win' ? '#22c55e' : m.result === 'loss' ? '#ef4444' : '#f59e0b';
                    const letter = m.result === 'win' ? 'V' : m.result === 'loss' ? 'D' : 'E';
                    const title = `${m.date}${m.opponent ? ' · ' + m.opponent : ''} · ${m.goals_scored}×${m.goals_conceded}`;
                    return (
                      <span key={i} title={title} style={{
                        width: 22, height: 22, borderRadius: '50%', backgroundColor: c,
                        color: '#fff', fontWeight: 700, fontSize: '0.72rem',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}>{letter}</span>
                    );
                  })
              }
            </div>
          </div>
        </div>

        {/* Saldo — único ponto onde o sinal positivo/negativo é informação,
            então mantém cor sutil ali (verde/vermelho). */}
        <div style={compactStatCardStyle}>
          <div style={{ ...compactStatIconStyle, backgroundColor: `${colors.textSecondary}15` }}>
            <TrendingUp size={16} strokeWidth={1.5} style={{ color: colors.textSecondary }} />
          </div>
          <div>
            <div style={compactStatLabelStyle}>Saldo de gols</div>
            <div style={{ ...compactStatValueStyle, color: (displayStats.goalDifference || 0) > 0 ? '#22c55e' : (displayStats.goalDifference || 0) < 0 ? '#ef4444' : colors.text }}>
              {(displayStats.goalDifference || 0) > 0 ? '+' : ''}{displayStats.goalDifference || 0}
            </div>
          </div>
        </div>

        <NeutralAuxCard icon={<Shield size={16} strokeWidth={1.5} />} label="Jogos sem sofrer" value={displayStats.cleanSheets || 0} colors={colors} />
        {displayStats.modality !== 'futsal' && (
          <NeutralAuxCard
            icon={<ArrowLeftRight size={16} strokeWidth={1.5} />}
            label="Substituições"
            value={displayStats.substitutionsTotal || 0}
            sub={(displayStats.substitutionsTotal || 0) > 0
              ? `${String(displayStats.avgSubstitutionsPerGame ?? 0).replace('.', ',')}/jogo${displayStats.avgSubstitutionMinute != null ? ` · média ${displayStats.avgSubstitutionMinute}'` : ''}`
              : null}
            colors={colors}
          />
        )}
        <NeutralAuxCard icon={<Clock size={16} strokeWidth={1.5} />} label="1º gol nosso (méd.)" value={displayStats.avgTimeFirstGoalFor != null ? `${displayStats.avgTimeFirstGoalFor}'` : '—'} colors={colors} />
        <NeutralAuxCard icon={<Clock size={16} strokeWidth={1.5} />} label="1º gol sofrido (méd.)" value={displayStats.avgTimeFirstGoalAgainst != null ? `${displayStats.avgTimeFirstGoalAgainst}'` : '—'} colors={colors} />

        {/* Maior vitória / Maior derrota: ÚNICOS com tonalidade V/D (consistente com badges). */}
        <NeutralAuxCard
          icon={<Trophy size={16} strokeWidth={1.5} />}
          label="Maior vitória"
          value={displayStats.biggestWin ? `${displayStats.biggestWin.goals_scored}×${displayStats.biggestWin.goals_conceded}` : '—'}
          sub={displayStats.biggestWin?.opponent ? `vs ${displayStats.biggestWin.opponent}` : null}
          colors={colors}
          tint="#22c55e"
        />
        <NeutralAuxCard
          icon={<AlertTriangle size={16} strokeWidth={1.5} />}
          label="Maior derrota"
          value={displayStats.biggestLoss ? `${displayStats.biggestLoss.goals_scored}×${displayStats.biggestLoss.goals_conceded}` : '—'}
          sub={displayStats.biggestLoss?.opponent ? `vs ${displayStats.biggestLoss.opponent}` : null}
          colors={colors}
          tint="#ef4444"
        />
      </div>

      {/* Aproveitamento + sequências — KPIs grandes ao estilo do PDF do U.E.C. */}
      {(displayStats.pointsPlayed || 0) > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.5rem',
        }}>
          <BigKpiCard
            icon={<Award size={18} strokeWidth={1.6} />}
            label="Pontos ganhos"
            value={`${displayStats.pointsWon || 0}/${displayStats.pointsPlayed || 0}`}
            sub={`${(((displayStats.pointsWon || 0) / Math.max(1, displayStats.pointsPlayed || 0)) * 100).toFixed(1)}% aproveitamento`}
            colors={colors}
          />
          <BigKpiCard
            icon={<Flame size={18} strokeWidth={1.6} />}
            label="Sequência V"
            value={displayStats.winStreak || 0}
            sub={(displayStats.winStreak || 0) === 1 ? 'jogo' : 'jogos'}
            colors={colors}
          />
          <BigKpiCard
            icon={<TrendingUp size={18} strokeWidth={1.6} />}
            label="Sequência invicta"
            value={displayStats.unbeatenStreak || 0}
            sub={(displayStats.unbeatenStreak || 0) === 1 ? 'jogo' : 'jogos'}
            colors={colors}
          />
          <BigKpiCard
            icon={<ListChecks size={18} strokeWidth={1.6} />}
            label="Sequência E"
            value={displayStats.drawStreak || 0}
            sub={(displayStats.drawStreak || 0) === 1 ? 'jogo' : 'jogos'}
            colors={colors}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.25rem', padding: '0.25rem', backgroundColor: colors.surface, borderRadius: '0.5rem', border: `1px solid ${colors.border}` }}>
          <button onClick={() => setChartViewMode('type')} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: 'none', backgroundColor: chartViewMode === 'type' ? colors.primary : 'transparent', color: chartViewMode === 'type' ? '#fff' : colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Target size={14} /> Tipo de Gol
          </button>
          <button onClick={() => setChartViewMode('minute')} style={{ padding: '0.4rem 0.75rem', borderRadius: '0.375rem', border: 'none', backgroundColor: chartViewMode === 'minute' ? colors.primary : 'transparent', color: chartViewMode === 'minute' ? '#fff' : colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Clock size={14} /> Minuto do Gol
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', padding: '0.35rem 0.75rem', backgroundColor: colors.surface, borderRadius: '0.375rem', border: `1px solid ${colors.border}`, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#22c55e' }}>{displayStats.wins}</div><div style={{ fontSize: '0.55rem', color: colors.textSecondary }}>Vitórias</div></div>
          <div style={{ width: '1px', height: '20px', backgroundColor: colors.border }} />
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f59e0b' }}>{displayStats.draws}</div><div style={{ fontSize: '0.55rem', color: colors.textSecondary }}>Empates</div></div>
          <div style={{ width: '1px', height: '20px', backgroundColor: colors.border }} />
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#ef4444' }}>{displayStats.losses}</div><div style={{ fontSize: '0.55rem', color: colors.textSecondary }}>Derrotas</div></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.75rem', flex: 1, minHeight: '280px', alignItems: 'stretch' }}>
        <Card style={{ ...chartCardStyle, height: '100%' }}>
          <div style={chartTitleStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Goal size={16} strokeWidth={1.5} style={{ color: '#22c55e' }} />
              <span>Gols Feitos {chartViewMode === 'minute' ? '(por Minuto)' : '(por Tipo)'}</span>
            </span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'visible', minHeight: 0 }}>
            {chartViewMode === 'type' ? (
              displayStats.goalsScoredByType.length > 0 ? (
                <GoalsPieWithList data={displayStats.goalsScoredByType} total={totalGoals} colors={colors} accentColor="#22c55e" onExpand={() => setShowScoredModal(true)} />
              ) : <div style={{ textAlign: 'center', color: colors.textSecondary, padding: '2rem', width: '100%' }}>Nenhum gol registrado</div>
            ) : (
              displayStats.goalsScoredByMinute?.some(g => g.value > 0) ? (
                <GoalsPieWithList data={displayStats.goalsScoredByMinute.filter(g => g.value > 0)} total={totalGoals} colors={colors} accentColor="#22c55e" onExpand={() => setShowScoredModal(true)} maxItems={6} />
              ) : <div style={{ textAlign: 'center', color: colors.textSecondary, padding: '2rem', width: '100%' }}>Nenhum gol registrado</div>
            )}
          </div>
        </Card>

        <Card style={{ ...chartCardStyle, height: '100%' }}>
          <div style={chartTitleStyle}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Shield size={16} strokeWidth={1.5} style={{ color: '#ef4444' }} />
              <span>Gols Tomados {chartViewMode === 'minute' ? '(por Minuto)' : '(por Tipo)'}</span>
            </span>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', overflow: 'visible', minHeight: 0 }}>
            {chartViewMode === 'type' ? (
              displayStats.goalsConcededByType.length > 0 ? (
                <GoalsPieWithList data={displayStats.goalsConcededByType} total={totalConceded} colors={colors} accentColor="#ef4444" onExpand={() => setShowConcededModal(true)} />
              ) : <div style={{ textAlign: 'center', color: colors.textSecondary, padding: '2rem', width: '100%' }}>Nenhum gol tomado registrado</div>
            ) : (
              displayStats.goalsConcededByMinute?.some(g => g.value > 0) ? (
                <GoalsPieWithList data={displayStats.goalsConcededByMinute.filter(g => g.value > 0)} total={totalConceded} colors={colors} accentColor="#ef4444" onExpand={() => setShowConcededModal(true)} maxItems={6} />
              ) : <div style={{ textAlign: 'center', color: colors.textSecondary, padding: '2rem', width: '100%' }}>Nenhum gol tomado registrado</div>
            )}
          </div>
        </Card>
      </div>

      {showScoredModal && (
        <div style={modalOverlayStyle} onClick={() => setShowScoredModal(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowScoredModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: colors.text, cursor: 'pointer', padding: '0.5rem' }}><X size={20} strokeWidth={1.5} /></button>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: colors.text, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Goal size={20} style={{ color: '#22c55e' }} /> Gols Feitos - {chartViewMode === 'minute' ? 'Por Minuto' : 'Por Tipo'}
            </h3>
            <GoalsFullList data={chartViewMode === 'type' ? displayStats.goalsScoredByType : displayStats.goalsScoredByMinute?.filter(g => g.value > 0) || []} total={totalGoals} colors={colors} accentColor="#22c55e" />
          </div>
        </div>
      )}

      {showConcededModal && (
        <div style={modalOverlayStyle} onClick={() => setShowConcededModal(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowConcededModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: colors.text, cursor: 'pointer', padding: '0.5rem' }}><X size={20} strokeWidth={1.5} /></button>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: colors.text, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={20} style={{ color: '#ef4444' }} /> Gols Tomados - {chartViewMode === 'minute' ? 'Por Minuto' : 'Por Tipo'}
            </h3>
            <GoalsFullList data={chartViewMode === 'type' ? displayStats.goalsConcededByType : displayStats.goalsConcededByMinute?.filter(g => g.value > 0) || []} total={totalConceded} colors={colors} accentColor="#ef4444" />
          </div>
        </div>
      )}

      {/* Rankings por atleta */}
      <div style={{ ...chartsGridStyle, marginTop: '0.5rem' }}>
        <Card style={chartCardStyle}>
          <div style={chartTitleStyle}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Goal size={16} style={{ color: '#22c55e' }} /> Artilheiros</span>
          </div>
          <PlayerRankList items={(displayStats.topScorers || []).map(p => ({ ...p, value: p.goals, label: p.goals === 1 ? '1 gol' : `${p.goals} gols` }))} colors={colors} accent="#22c55e" emptyMsg="Sem gols no período" />
        </Card>
        <Card style={chartCardStyle}>
          <div style={chartTitleStyle}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Target size={16} style={{ color: '#3b82f6' }} /> Assistências</span>
          </div>
          <PlayerRankList items={(displayStats.topAssisters || []).map(p => ({ ...p, value: p.assists, label: p.assists === 1 ? '1 assist.' : `${p.assists} assists.` }))} colors={colors} accent="#3b82f6" emptyMsg="Sem assistências no período" />
        </Card>
        <Card style={chartCardStyle}>
          <div style={{ ...chartTitleStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Clock size={16} style={{ color: '#a855f7' }} /> Minutagem</span>
            {(displayStats.playerStats || []).length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllMinutes(true)}
                style={{ background: 'none', border: `1px solid ${colors.border}`, borderRadius: '0.35rem', color: colors.text, fontSize: '0.72rem', fontWeight: 600, padding: '0.25rem 0.55rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Ver todas
              </button>
            )}
          </div>
          <PlayerRankList
            items={(displayStats.topMinutes || []).map(p => ({ ...p, value: p.minutes, label: `${p.minutes} min${p.appearances ? ` · ${p.appearances} jogo${p.appearances !== 1 ? 's' : ''}` : ''}` }))}
            colors={colors} accent="#a855f7"
            emptyMsg="Registre escalações e substituições pra calcular minutagem"
          />
        </Card>
        {(displayStats.topSubEntries || []).length > 0 && (
          <Card style={chartCardStyle}>
            <div style={chartTitleStyle}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><ArrowLeftRight size={16} style={{ color: '#0ea5e9' }} /> Mais acionados do banco</span>
            </div>
            <PlayerRankList
              items={(displayStats.topSubEntries || []).map(p => ({ ...p, value: p.sub_entries, label: `${p.sub_entries} entrada${p.sub_entries !== 1 ? 's' : ''} · ${p.minutes} min` }))}
              colors={colors} accent="#0ea5e9"
              emptyMsg="Nenhuma substituição no período"
            />
          </Card>
        )}
      </div>

      {showAllMinutes && (
        <AllMinutesModal
          players={displayStats.playerStats || []}
          minutesPossible={displayStats.minutesPossible || 0}
          totalMatches={displayStats.totalMatches || 0}
          colors={colors}
          onClose={() => setShowAllMinutes(false)}
        />
      )}

      {/* Histórico de jogos — tabela com rodada/local/placar/vídeos */}
      {(displayStats.matchesHistory || []).length > 0 && (
        <Card style={{ padding: '0.75rem', marginTop: '0.5rem' }}>
          <div style={{ ...chartTitleStyle, marginBottom: '0.5rem' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Trophy size={16} style={{ color: colors.primary }} /> Histórico de jogos ({displayStats.matchesHistory.length})
            </span>
          </div>
          <MatchesHistoryTable items={displayStats.matchesHistory} colors={colors} />
        </Card>
      )}
    </>
  );
}

function BigKpiCard({ icon, label, value, sub, colors }) {
  // KPIs grandes — neutros. Sem borda colorida, sem ícone colorido.
  // Cor fica reservada pra sinalização V/E/D (badges, bolinhas da forma).
  return (
    <div style={{
      padding: '0.9rem 1rem',
      backgroundColor: colors.surface,
      borderRadius: '0.6rem',
      border: `1px solid ${colors.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: colors.textSecondary, fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.02em' }}>
        <span style={{ color: colors.textSecondary }}>{icon}</span>
        <span>{label}</span>
      </div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: colors.text, lineHeight: 1.05 }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>{sub}</div>
    </div>
  );
}

// Card numérico padrão na linha do topo (Jogos, Gols Feitos, etc).
// Neutro — só usa cor do tema, sem tonalidade por tipo de stat.
function NeutralStatCard({ icon, label, value, colors }) {
  return (
    <div style={{
      padding: '0.5rem 0.75rem',
      backgroundColor: colors.surface,
      borderRadius: '0.375rem',
      border: `1px solid ${colors.border}`,
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      minWidth: 0, flex: 1,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '0.375rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.background,
        color: colors.textSecondary, flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.65rem', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.text, lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  );
}

// Card auxiliar (linha do meio): Cleansheets, 1º gol, Maior vitória/derrota.
// "tint" só pra Maior vitória (verde sutil) e Maior derrota (vermelho sutil) —
// nos outros vem undefined e fica totalmente neutro.
function NeutralAuxCard({ icon, label, value, sub, colors, tint }) {
  const iconColor = tint || colors.textSecondary;
  return (
    <div style={{
      padding: '0.5rem 0.75rem',
      backgroundColor: colors.surface,
      borderRadius: '0.375rem',
      border: `1px solid ${colors.border}`,
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      minWidth: 0,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '0.375rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: tint ? `${tint}15` : colors.background,
        color: iconColor, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.65rem', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{label}</div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: colors.text, lineHeight: 1 }}>{value}</div>
        {sub && (
          <div style={{ fontSize: '0.6rem', color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
        )}
      </div>
    </div>
  );
}

function MatchesHistoryTable({ items, colors }) {
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const s = String(iso).split('T')[0].split('-');
    return s.length === 3 ? `${s[2]}/${s[1]}/${s[0].slice(-2)}` : iso;
  };
  const locationLabel = (loc) => loc === 'home' ? 'Casa' : loc === 'away' ? 'Fora' : loc === 'neutral' ? 'Neutro' : '—';
  const resultBadge = (r) => {
    const map = { win: { c: '#22c55e', l: 'V' }, loss: { c: '#ef4444', l: 'D' }, draw: { c: '#f59e0b', l: 'E' } };
    const it = map[r] || { c: colors.textSecondary, l: '—' };
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: '50%', backgroundColor: it.c,
        color: '#fff', fontSize: '0.7rem', fontWeight: 700,
      }}>{it.l}</span>
    );
  };
  const VideoBtn = ({ url, title }) => (
    <a
      href={url || '#'}
      target={url ? '_blank' : undefined}
      rel="noreferrer"
      onClick={(e) => { if (!url) e.preventDefault(); }}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 22, borderRadius: '0.3rem',
        backgroundColor: url ? `${colors.primary}15` : 'transparent',
        color: url ? colors.primary : colors.textSecondary,
        border: `1px solid ${url ? colors.primary + '30' : colors.border}`,
        opacity: url ? 1 : 0.45, cursor: url ? 'pointer' : 'not-allowed',
        textDecoration: 'none',
      }}
    >
      <Video size={12} />
    </a>
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ color: colors.textSecondary, fontSize: '0.65rem', textTransform: 'uppercase' }}>
            <th style={{ textAlign: 'left',  padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}` }}>Data</th>
            <th style={{ textAlign: 'center', padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}` }}>Rod.</th>
            <th style={{ textAlign: 'center', padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}` }}>Local</th>
            <th style={{ textAlign: 'left',  padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}` }}>Adversário</th>
            <th style={{ textAlign: 'center', padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}` }}>Placar</th>
            <th style={{ textAlign: 'center', padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}` }}>Result.</th>
            <th style={{ textAlign: 'center', padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}` }}>Vídeo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m, i) => (
            <tr key={m.session_id || i} style={{ color: colors.text }}>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}40`, whiteSpace: 'nowrap' }}>{fmtDate(m.date)}</td>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}40`, textAlign: 'center', color: colors.textSecondary }}>{m.match_round || '—'}</td>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}40`, textAlign: 'center', color: colors.textSecondary }}>{locationLabel(m.match_location)}</td>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}40` }}>{m.opponent || '—'}</td>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}40`, textAlign: 'center', fontWeight: 700 }}>
                {m.goals_scored ?? 0}×{m.goals_conceded ?? 0}
              </td>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}40`, textAlign: 'center' }}>{resultBadge(m.result)}</td>
              <td style={{ padding: '0.4rem 0.5rem', borderBottom: `1px solid ${colors.border}40`, textAlign: 'center' }}>
                <VideoBtn url={m.video_full_url} title="Vídeo do jogo" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GoalsPieWithList({ data, total, colors, accentColor, onExpand, maxItems = 5 }) {
  const [tooltip, setTooltip] = useState({ show: false, content: '', x: 0, y: 0 });
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  const displayData = sortedData.slice(0, maxItems);
  const hasMore = sortedData.length > maxItems;

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const timer = setTimeout(updateSize, 100);
    window.addEventListener('resize', updateSize);
    return () => { clearTimeout(timer); window.removeEventListener('resize', updateSize); };
  }, []);

  const availableWidth = containerSize.width * 0.5;
  const availableHeight = containerSize.height;
  const size = Math.max(120, Math.min(availableWidth * 0.9, availableHeight * 0.9, 220));
  const center = size / 2;
  const radius = (size / 2) * 0.92;

  let currentAngle = -90;
  const segments = data.filter(item => item.value > 0).map((item, index) => {
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (currentAngle * Math.PI) / 180;
    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;
    if (angle >= 359.99) return { isCircle: true, color: item.color, item, index, cx: center, cy: center, r: radius };
    const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { path, color: item.color, item, index, isCircle: false };
  });

  return (
    <div ref={containerRef} style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={{ flex: '0 0 50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={size} height={size}>
          {segments.map((seg) => (
            seg.isCircle ? (
              <circle key={seg.index} cx={seg.cx} cy={seg.cy} r={seg.r} fill={seg.color}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => setTooltip({ show: true, content: `${seg.item.name}: ${seg.item.value}`, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip({ show: false, content: '', x: 0, y: 0 })} />
            ) : (
              <path key={seg.index} d={seg.path} fill={seg.color}
                style={{ cursor: 'pointer' }}
                onMouseEnter={(e) => setTooltip({ show: true, content: `${seg.item.name}: ${seg.item.value}`, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip({ show: false, content: '', x: 0, y: 0 })} />
            )
          ))}
        </svg>
        {tooltip.show && (
          <div style={{ position: 'fixed', left: `${tooltip.x + 10}px`, top: `${tooltip.y + 10}px`, backgroundColor: colors.surface, color: colors.text, padding: '0.5rem 0.75rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: '500', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', border: `1px solid ${colors.border}`, zIndex: 9999 }}>
            {tooltip.content}
          </div>
        )}
      </div>
      <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', minWidth: 0, paddingRight: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem', fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', borderBottom: `1px solid ${colors.border}`, paddingBottom: '0.35rem', marginBottom: '0.35rem' }}>
          <span style={{ width: '14px' }}></span>
          <span style={{ flex: 1 }}>Tipo</span>
          <span style={{ width: '35px', textAlign: 'right' }}>%</span>
          <span style={{ width: '30px', textAlign: 'right' }}>Qtd</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {displayData.map((item, i) => {
            const percentage = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: item.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: colors.text, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                <span style={{ width: '35px', textAlign: 'right', color: colors.textSecondary, fontSize: '0.7rem' }}>{percentage}%</span>
                <span style={{ width: '30px', textAlign: 'right', fontWeight: '700', color: accentColor }}>{item.value}</span>
              </div>
            );
          })}
        </div>
        {hasMore && onExpand && (
          <button onClick={onExpand} style={{ marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: colors.primary, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            +{sortedData.length - maxItems} mais...
          </button>
        )}
      </div>
    </div>
  );
}

function GoalsFullList({ data, total, colors, accentColor }) {
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {sortedData.map((item, i) => {
        const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '0.75rem', backgroundColor: colors.background, borderRadius: '0.375rem', border: `1px solid ${colors.border}` }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: `${accentColor}15`, color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: '600', marginRight: '0.75rem', flexShrink: 0 }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '500', color: colors.text }}>{item.name}</div>
              <div style={{ height: '4px', backgroundColor: colors.border, borderRadius: '2px', marginTop: '0.35rem', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${percentage}%`, backgroundColor: accentColor, borderRadius: '2px' }} />
              </div>
            </div>
            <div style={{ marginLeft: '1rem', textAlign: 'right' }}>
              <div style={{ fontSize: '1rem', fontWeight: '700', color: accentColor }}>{item.value}</div>
              <div style={{ fontSize: '0.7rem', color: colors.textSecondary }}>{percentage}%</div>
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: `${accentColor}10`, borderRadius: '0.375rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: '600', color: colors.text }}>Total</span>
        <span style={{ fontSize: '1.25rem', fontWeight: '700', color: accentColor }}>{total}</span>
      </div>
    </div>
  );
}

function PlayerRankList({ items = [], colors, accent, emptyMsg }) {
  if (!items.length) {
    return (
      <div style={{ padding: '1.5rem 0.5rem', textAlign: 'center', color: colors.textSecondary, fontSize: '0.85rem', fontStyle: 'italic' }}>
        {emptyMsg || 'Sem dados.'}
      </div>
    );
  }
  const max = items[0]?.value || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      {items.slice(0, 8).map((p, i) => {
        const pct = max > 0 ? (p.value / max) * 100 : 0;
        return (
          <div key={p.athlete_id || `p-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.45rem', borderRadius: '0.35rem', fontSize: '0.82rem', backgroundColor: i === 0 ? `${accent}10` : 'transparent', border: `1px solid ${i === 0 ? `${accent}30` : 'transparent'}` }}>
            <span style={{ width: 16, color: colors.textSecondary, fontWeight: 700, textAlign: 'right', fontSize: '0.7rem' }}>{i + 1}.</span>
            {p.jersey_number != null && (
              <span style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: `${accent}25`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                {p.jersey_number}
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            <div style={{ flex: '0 0 70px', height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: accent, borderRadius: 3 }} />
            </div>
            <span style={{ width: 95, textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, color: colors.text }}>{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Minutagem completa do período: todos os relacionados, ordenável.
// % = minutos ÷ minutos possíveis do período (soma das durações dos jogos).
const MINUTE_COLS = [
  { key: 'name', label: 'Jogador', align: 'left' },
  { key: 'minutes', label: 'Min', align: 'right' },
  { key: 'appearances', label: 'Jogos', align: 'center' },
  { key: 'pct', label: '% poss.', align: 'right' },
  { key: 'starts', label: 'Tit.', align: 'center' },
  { key: 'sub_entries', label: 'Entrou', align: 'center' },
];

function AllMinutesModal({ players, minutesPossible, totalMatches, colors, onClose }) {
  const [sort, setSort] = useState({ key: 'minutes', dir: 'desc' });
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const rows = useMemo(() => {
    const list = (players || [])
      .filter(p => (p.called_up || 0) > 0 || (p.minutes || 0) > 0)
      .map(p => ({ ...p, pct: minutesPossible > 0 ? Math.round(((p.minutes || 0) / minutesPossible) * 100) : 0 }));
    const { key, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      if (key === 'name') return mul * String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
      return mul * ((a[key] || 0) - (b[key] || 0)) || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
  }, [players, minutesPossible, sort]);
  const toggle = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' });
  const max = Math.max(1, ...rows.map(r => r.minutes || 0));
  const th = (c) => {
    const active = sort.key === c.key;
    const Icon = active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ArrowUpDown;
    return (
      <th key={c.key} style={{ position: 'sticky', top: 0, background: colors.surface, padding: '0.45rem 0.4rem', textAlign: c.align, fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: active ? colors.text : colors.textSecondary, borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap', zIndex: 1 }}>
        <button type="button" onClick={() => toggle(c.key)} style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: 0, textTransform: 'inherit', letterSpacing: 'inherit' }}>
          {c.label}<Icon size={11} style={{ opacity: active ? 1 : 0.45 }} />
        </button>
      </th>
    );
  };
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 'max(0.75rem, env(safe-area-inset-top)) 0.75rem' }}>
      <div role="dialog" aria-modal="true" aria-label="Minutagem completa" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: colors.surface, color: colors.text, borderRadius: '0.75rem', border: `1px solid ${colors.border}`, width: '100%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.85rem 1rem', borderBottom: `1px solid ${colors.border}` }}>
          <Clock size={18} style={{ color: '#a855f7' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Minutagem completa</div>
            <div style={{ fontSize: '0.72rem', color: colors.textSecondary }}>
              {rows.length} atleta{rows.length !== 1 ? 's' : ''} · {totalMatches} jogo{totalMatches !== 1 ? 's' : ''} · {minutesPossible} min possíveis
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, padding: '0.25rem', display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 460 }}>
            <thead><tr>
              <th style={{ position: 'sticky', top: 0, background: colors.surface, width: 28, borderBottom: `1px solid ${colors.border}`, zIndex: 1 }} />
              {MINUTE_COLS.map(th)}
            </tr></thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={p.athlete_id || i} style={{ borderBottom: `1px solid ${colors.border}55` }}>
                  <td style={{ padding: '0.4rem 0.3rem', color: colors.textSecondary, fontSize: '0.7rem', textAlign: 'right', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '0.4rem', maxWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                      {p.jersey_number != null && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textSecondary, minWidth: 18 }}>{p.jersey_number}</span>}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{p.name}</span>
                    </div>
                    <div style={{ height: 4, background: colors.border, borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${((p.minutes || 0) / max) * 100}%`, height: '100%', background: '#a855f7' }} />
                    </div>
                  </td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.minutes || 0}'</td>
                  <td style={{ padding: '0.4rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{p.appearances || 0}{p.called_up ? <span style={{ color: colors.textSecondary, fontSize: '0.68rem' }}>/{p.called_up}</span> : null}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.pct}%</td>
                  <td style={{ padding: '0.4rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{p.starts || 0}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{p.sub_entries || 0}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: colors.textSecondary, fontStyle: 'italic' }}>Sem escalações registradas no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '0.55rem 1rem', borderTop: `1px solid ${colors.border}`, fontSize: '0.68rem', color: colors.textSecondary }}>
          Jogos = jogou/relacionado. % = minutos ÷ minutos possíveis do período. Minutagem pelas substituições e expulsões (ou ajuste manual no jogo).
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, BarChart3, Users, Waypoints, Target, CreditCard,
  Trophy, HeartPulse, Megaphone, ChevronRight, AlertTriangle, Info, Check, X, Clock,
  FileText, Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { Layout } from '../components/layout/Layout';
import { homeService } from '../services/homeService';
import { downloadReport, safeFileName } from '../services/reportsService';
import { notify } from '../lib/notify';
import { useFeatureGuard } from '../components/common/PlanGate';

const QUICK_LINKS = [
  { key: 'training',       label: 'Programação',   icon: Calendar,   route: '/training',          color: '#2563eb' },
  { key: 'stats',          label: 'Estatísticas',  icon: BarChart3,  route: '/training-stats',    color: '#f59e0b' },
  { key: 'plantel',        label: 'Plantel',       icon: Users,      route: '/plantel',           color: '#22c55e' },
  { key: 'tactical-board', label: 'Quadro Tático', icon: Waypoints,  route: '/tactical-board',    color: '#a855f7' },
  { key: 'activities',     label: 'Atividades',    icon: Target,     route: '/settings/activities', color: '#06b6d4' },
  { key: 'billing',        label: 'Assinatura',    icon: CreditCard, route: '/billing',           color: '#ec4899' },
];

const SEVERITY_STYLE = {
  info:      { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', icon: Info },
  warning:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', icon: AlertTriangle },
  important: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)',  icon: AlertTriangle },
  success:   { color: '#10b981', bg: 'rgba(16,185,129,0.10)', icon: Check },
};

const SESSION_TYPE_LABEL = {
  training: 'Treino',
  match:    'Jogo',
  rest:     'Descanso',
};

const formatDateBR = (s) => {
  if (!s) return '';
  const d = String(s).split('T')[0];
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const daysFromToday = (s) => {
  if (!s) return null;
  const target = new Date(String(s).split('T')[0] + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff < 0) return `${-diff}d atrás`;
  return `em ${diff}d`;
};

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { selectedClub } = useClub();
  const isMobile = useIsMobile();
  const guardFeature = useFeatureGuard();

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);

  // Gera o "Relatório do Clube" — PDF consolidado do ano vigente em 1 clique,
  // gerado no servidor (POST /api/reports/clube, mesmo pipeline dos outros relatórios).
  // Período padrão: 01/jan → 31/dez do ano atual (mesmo critério da Estatísticas).
  // Pra recortes diferentes, o usuário usa o Exportar dentro de Estatísticas.
  const handleGenerateReport = useCallback(async () => {
    if (!selectedClub?.id) {
      notify.error('Selecione um clube antes de gerar o relatório.');
      return;
    }
    if (!guardFeature('pdf_export')) return;
    setReportLoading(true);
    try {
      const y = String(new Date().getFullYear());
      await downloadReport('clube', {
        club_id: selectedClub.id,
        start_date: `${y}-01-01`,
        end_date: `${y}-12-31`,
        period_label: y,
      }, `Relatorio_${safeFileName(selectedClub.name)}_${y}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      notify.error(err.message || 'Falha ao gerar o relatório. Tente novamente.');
    } finally {
      setReportLoading(false);
    }
  }, [selectedClub?.id, selectedClub?.name, guardFeature]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const data = await homeService.getDashboard(selectedClub?.id);
      setDashboard(data);
    } catch (err) {
      console.error('Home dashboard error', err);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [selectedClub?.id]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handleDismiss = async (announcementId) => {
    try {
      await homeService.dismissAnnouncement(announcementId);
      setDashboard(prev => prev ? { ...prev, announcements: (prev.announcements || []).filter(a => a.id !== announcementId) } : prev);
    } catch (err) {
      console.error('dismiss error', err);
    }
  };

  const firstName = (user?.name || '').split(' ')[0];

  const cardStyle = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.625rem',
    padding: '1rem 1.1rem',
  };

  const sectionTitleStyle = {
    fontSize: '0.7rem',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 700,
    marginBottom: '0.6rem',
  };

  const nextSessions = dashboard?.nextSessions || [];
  const nextSession = nextSessions[0];
  const nextMatch = dashboard?.nextMatch || null;
  const injuries = dashboard?.activeInjuries || [];
  const announcements = dashboard?.announcements || [];
  const summary = dashboard?.summary || { totalAthletes: 0, activeInjuries: 0 };

  return (
    <Layout>
      {/* flex:1 — em telas altas (tablet) o conteúdo estica e distribui em vez
          de terminar no meio e sobrar só o fundo embaixo. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 1280, width: '100%', margin: '0 auto', flex: 1 }}>
        {/* Saudação + Relatório do Clube (PDF consolidado do ano vigente) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '1rem', flexDirection: isMobile ? 'column' : 'row' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? '1.4rem' : '1.75rem', fontWeight: 700, color: colors.text, letterSpacing: '-0.02em' }}>
              Olá{firstName ? `, ${firstName}` : ''}.
            </h1>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: colors.textSecondary }}>
              {selectedClub ? selectedClub.name + ' · ' : ''}Resumo do {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            </p>
          </div>
          {selectedClub && (
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              title={`Gera um PDF com plantel, treinos e jogos de ${new Date().getFullYear()}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.55rem 0.95rem',
                backgroundColor: colors.surface,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: reportLoading ? 'progress' : 'pointer',
                opacity: reportLoading ? 0.7 : 1,
              }}
            >
              {reportLoading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              {reportLoading ? 'Gerando…' : 'Relatório do Clube'}
            </button>
          )}
        </div>

        {/* Anúncios */}
        {announcements.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {announcements.map((a) => {
              const sev = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info;
              const Icon = sev.icon;
              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.7rem',
                  padding: '0.85rem 1rem',
                  borderRadius: '0.5rem',
                  border: `1px solid ${sev.color}40`,
                  backgroundColor: sev.bg,
                }}>
                  <Icon size={18} style={{ color: sev.color, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: colors.text, marginBottom: 2 }}>
                      {a.title}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: colors.text, lineHeight: 1.5, opacity: 0.85 }}>
                      {a.body}
                    </div>
                    {a.link_url && (
                      <a href={a.link_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: 4, fontSize: '0.78rem', color: sev.color, textDecoration: 'none', fontWeight: 600 }}>
                        Saiba mais <ChevronRight size={12} />
                      </a>
                    )}
                  </div>
                  <button onClick={() => handleDismiss(a.id)} title="Marcar como lido" style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 4 }}>
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Resumo numérico — 4 cards de quick stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
          <StatCard icon={<Calendar size={16} />}    color="#3b82f6" label="Próximo treino" value={nextSession ? `${SESSION_TYPE_LABEL[nextSession.session_type] || 'Treino'} · ${daysFromToday(nextSession.date)}` : '—'} sub={nextSession ? formatDateBR(nextSession.date) : 'Sem sessões futuras'} colors={colors} />
          <StatCard icon={<Trophy size={16} />}      color="#f59e0b" label="Próximo jogo"   value={nextMatch ? (nextMatch.opponent_name || 'A definir') : '—'} sub={nextMatch ? `${formatDateBR(nextMatch.date)} · ${daysFromToday(nextMatch.date)}` : 'Sem jogo agendado'} colors={colors} />
          <StatCard icon={<Users size={16} />}       color="#22c55e" label="Plantel"        value={String(summary.totalAthletes || 0)} sub={`${summary.totalAthletes === 1 ? '1 atleta' : `${summary.totalAthletes} atletas`}`} colors={colors} />
          <StatCard icon={<HeartPulse size={16} />}  color="#ef4444" label="Lesionados"     value={String(summary.activeInjuries || 0)} sub={summary.activeInjuries === 0 ? 'Plantel pleno' : 'Ativos no DM'} colors={colors} clickable onClick={() => navigate('/plantel')} />
        </div>

        {/* Conteúdo principal — 2 colunas: próximas sessões | lesionados.
            flex:1 + minHeight:0: absorve a altura extra em telas altas (os
            cards esticam juntos), empurrando os Atalhos pro pé da tela. */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '0.75rem', flex: 1, minHeight: 0, alignContent: 'stretch' }}>
          {/* Próximas sessões */}
          <div style={cardStyle}>
            <div style={sectionTitleStyle}>Próximas sessões</div>
            {nextSessions.length === 0 ? (
              <EmptyState colors={colors} message="Nenhuma sessão programada à frente." action={{ label: 'Ir pro calendário', onClick: () => navigate('/training') }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {nextSessions.slice(0, 5).map((s) => {
                  const isMatch = s.session_type === 'match';
                  return (
                    <button
                      key={s.id}
                      onClick={() => navigate('/training')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.6rem 0.75rem',
                        backgroundColor: 'transparent',
                        border: `1px solid ${colors.border}`,
                        borderLeft: `3px solid ${isMatch ? '#f59e0b' : '#3b82f6'}`,
                        borderRadius: '0.4rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.background}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{ width: 38, textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.62rem', color: colors.textSecondary, textTransform: 'uppercase', fontWeight: 600 }}>
                          {(s.day_name || '').slice(0, 3)}
                        </div>
                        <div style={{ fontSize: '0.9rem', color: colors.text, fontWeight: 700, lineHeight: 1 }}>
                          {String(s.date).split('-')[2]}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', color: colors.text, fontWeight: 500 }}>
                          {isMatch ? `Jogo${s.opponent_name ? ` · vs ${s.opponent_name}` : ''}` : (SESSION_TYPE_LABEL[s.session_type] || 'Treino')}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: 1 }}>
                          {formatDateBR(s.date)} · {daysFromToday(s.date)}
                        </div>
                      </div>
                      <ChevronRight size={14} style={{ color: colors.textSecondary, flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Lesionados */}
          <div style={cardStyle}>
            <div style={sectionTitleStyle}>Departamento médico</div>
            {injuries.length === 0 ? (
              <EmptyState colors={colors} message="Nenhum atleta lesionado." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {injuries.slice(0, 6).map((inj) => (
                  <div key={inj.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.55rem',
                    padding: '0.5rem 0.6rem',
                    backgroundColor: 'transparent',
                    border: `1px solid ${colors.border}`,
                    borderLeft: '3px solid #ef4444',
                    borderRadius: '0.4rem',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.825rem', color: colors.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inj.athlete_name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: colors.textSecondary, marginTop: 1 }}>
                        {inj.injury_type}{inj.body_part ? ` · ${inj.body_part}` : ''}
                      </div>
                    </div>
                    {inj.expected_return && (
                      <div style={{ fontSize: '0.7rem', color: colors.textSecondary, textAlign: 'right', flexShrink: 0 }}>
                        <Clock size={11} style={{ display: 'inline', marginRight: 2, verticalAlign: 'middle' }} />
                        {formatDateBR(inj.expected_return)}
                      </div>
                    )}
                  </div>
                ))}
                {injuries.length > 6 && (
                  <button onClick={() => navigate('/plantel')} style={{ marginTop: 2, padding: '0.35rem', background: 'transparent', border: `1px dashed ${colors.border}`, borderRadius: '0.35rem', color: colors.textSecondary, fontSize: '0.72rem', cursor: 'pointer' }}>
                    Ver todos ({injuries.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Atalhos rápidos */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Atalhos</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '0.5rem' }}>
            {QUICK_LINKS.map((q) => {
              const Icon = q.icon;
              return (
                <button
                  key={q.key}
                  onClick={() => navigate(q.route)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    padding: '0.7rem 0.85rem',
                    backgroundColor: 'transparent',
                    border: `1px solid ${colors.border}`,
                    borderLeft: `3px solid ${q.color}`,
                    borderRadius: '0.4rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: colors.text,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.background}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Icon size={18} style={{ color: q.color || colors.primary, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{q.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {loading && (
          <div style={{ padding: '1rem', textAlign: 'center', color: colors.textSecondary, fontSize: '0.85rem' }}>
            Carregando…
          </div>
        )}
      </div>
    </Layout>
  );
}

function StatCard({ icon, color, label, value, sub, colors, clickable, onClick }) {
  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        padding: '0.875rem 1rem',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: '0.5rem',
        display: 'flex', flexDirection: 'column', gap: '0.4rem',
        minHeight: 90,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => clickable && (e.currentTarget.style.borderColor = color)}
      onMouseLeave={(e) => clickable && (e.currentTarget.style.borderColor = colors.border)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: `${color}1A`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <div style={{ fontSize: '0.65rem', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: colors.text, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: colors.textSecondary }}>{sub}</div>}
    </div>
  );
}

function EmptyState({ colors, message, action }) {
  return (
    <div style={{ padding: '1.25rem 0.5rem', textAlign: 'center', color: colors.textSecondary }}>
      <div style={{ fontSize: '0.825rem', fontStyle: 'italic' }}>{message}</div>
      {action && (
        <button onClick={action.onClick} style={{ marginTop: '0.5rem', padding: '0.35rem 0.7rem', background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: '0.35rem', color: colors.text, fontSize: '0.78rem', cursor: 'pointer' }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

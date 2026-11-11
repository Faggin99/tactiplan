import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Calendar, BarChart3, Users, Waypoints, Target, ArrowRight,
  ChevronRight, AlertTriangle, Info, Check, X, Clock, MapPin,
  FileText, Loader2, Binoculars,
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
import { useCan } from '../hooks/useCan';
import { rotuloPeriodo } from '../lib/periodos';
import { COR_PILAR, NOME_PILAR } from '../lib/estilos';
import { darkenHex, bestTextOn } from '../lib/color';

// Início (11/11/2026): mistura da "Prancheta" (a semana inteira num quadro, cada atividade um
// ímã na cor do pilar, total do dia) com o "Vestiário" (capa com escudo e saudação, o treino de
// hoje em destaque, atalhos ilustrados). A capa e os detalhes seguem o ESTILO escolhido em
// Aparência (Clássico, Quadro tático, Gramado, Placar).

const SEVERITY_STYLE = {
  info:      { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', icon: Info },
  warning:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', icon: AlertTriangle },
  important: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)',  icon: AlertTriangle },
  success:   { color: '#10b981', bg: 'rgba(16,185,129,0.10)', icon: Check },
};
const VERMELHO = '#C62D2D';
const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DIAS_LONGOS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataDe = (s) => new Date(`${String(s).split('T')[0]}T12:00:00`);
const ddmm = (s) => { const [, m, d] = String(s).split('T')[0].split('-'); return `${d}/${m}`; };
function diasAte(s, hojeStr) {
  return Math.round((dataDe(s) - dataDe(hojeStr)) / 86400000);
}
function semanaIso(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const ano = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - ano) / 86400000 + 1) / 7);
}
function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}
function quandoJogo(dias, data) {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias < 7) return DIAS_LONGOS[(dataDe(data).getDay() + 6) % 7];
  return `dia ${ddmm(data)}`;
}

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { colors, estilo, estiloTokens, isDark } = useTheme();
  const { selectedClub, getLogoUrl } = useClub();
  const isMobile = useIsMobile();
  const guardFeature = useFeatureGuard();
  const { can } = useCan();

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  // ?semanaDe=AAAA-MM-DD (prévia): mostra outra semana no quadro
  const semanaDe = useMemo(() => {
    const v = new URLSearchParams(location.search).get('semanaDe');
    return /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null;
  }, [location.search]);
  const hojeStr = semanaDe || iso(new Date());

  const handleGenerateReport = useCallback(async () => {
    if (!selectedClub?.id) { notify.error('Selecione um clube antes de gerar o relatório.'); return; }
    if (!guardFeature('pdf_export')) return;
    setReportLoading(true);
    try {
      const y = String(new Date().getFullYear());
      await downloadReport('clube', { club_id: selectedClub.id, start_date: `${y}-01-01`, end_date: `${y}-12-31`, period_label: y },
        `Relatorio_${safeFileName(selectedClub.name)}_${y}.pdf`);
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
      setDashboard(await homeService.getDashboard(selectedClub?.id, { semanaDe }));
    } catch (err) {
      console.error('Home dashboard error', err);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [selectedClub?.id, semanaDe]);
  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const handleDismiss = async (id) => {
    try {
      await homeService.dismissAnnouncement(id);
      setDashboard((prev) => (prev ? { ...prev, announcements: (prev.announcements || []).filter((a) => a.id !== id) } : prev));
    } catch (err) { console.error('dismiss error', err); }
  };

  // ---- dados ----
  const nextMatch = dashboard?.nextMatch || null;
  const injuries = dashboard?.activeInjuries || [];
  const announcements = dashboard?.announcements || [];
  const summary = dashboard?.summary || { totalAthletes: 0, activeInjuries: 0 };
  const nextSessions = dashboard?.nextSessions || [];

  // 7 dias da semana (seg–dom) com o que veio do servidor
  const dias = useMemo(() => {
    const ref = dataDe(hojeStr);
    const seg = new Date(ref); seg.setDate(ref.getDate() - ((ref.getDay() + 6) % 7));
    const porData = new Map((dashboard?.semana || []).map((d) => [d.date, d]));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(seg); d.setDate(seg.getDate() + i);
      const data = iso(d);
      const s = porData.get(data);
      return { data, i, periodos: s?.periodos || [], minutos: s?.minutos || 0 };
    });
  }, [dashboard?.semana, hojeStr]);
  const numSemana = semanaIso(dataDe(hojeStr));
  const hoje = dias.find((d) => d.data === hojeStr) || null;
  const diasJogo = nextMatch ? diasAte(nextMatch.date, hojeStr) : null;
  const alerta = nextMatch && diasJogo >= 0 && diasJogo <= 7
    ? `jogo ${quandoJogo(diasJogo, nextMatch.date)}!${nextMatch.match_kickoff ? ` ${nextMatch.match_kickoff.replace(':', 'h')}` : ''}`
    : null;

  const abrirDia = (data) => navigate(`/training?data=${data}`);
  const abrirJogo = (jogo, abrir) => navigate(`/training?jogo=${jogo.id}&data=${String(jogo.date).split('T')[0]}${abrir ? `&abrir=${abrir}` : ''}`);

  const firstName = (user?.name || '').split(' ')[0];
  const logoPath = (isDark && selectedClub?.logo_dark_path) || selectedClub?.logo_path || null;
  const logoUrl = logoPath ? getLogoUrl(logoPath) : null;
  const ctx = { colors, estilo, tk: estiloTokens, isMobile, isDark };

  const disponiveis = Math.max(0, (summary.totalAthletes || 0) - (summary.activeInjuries || 0));
  const treinosAteJogo = nextMatch
    ? dias.filter((d) => d.data >= hojeStr && d.data < String(nextMatch.date).split('T')[0] && d.periodos.some((p) => p.tipo === 'training')).length
    : 0;

  const atalhos = [
    { key: 'prog', label: 'Programação', sub: `Semana ${numSemana}`, icon: Calendar, ilu: 'semana', onClick: () => navigate('/training') },
    can('athletes:view') && { key: 'plantel', label: 'Plantel', sub: `${summary.totalAthletes || 0} atletas`, icon: Users, ilu: 'pessoas', onClick: () => navigate('/plantel') },
    { key: 'stats', label: 'Estatísticas', sub: 'Treinos, jogos e atletas', icon: BarChart3, ilu: 'barras', onClick: () => navigate('/training-stats') },
    { key: 'quadro', label: 'Quadro tático', sub: 'Jogadas e vídeos', icon: Waypoints, ilu: 'campo', onClick: () => navigate('/tactical-board') },
    { key: 'ativ', label: 'Atividades', sub: 'Banco de exercícios', icon: Target, ilu: 'alvo', onClick: () => navigate('/settings/activities') },
  ].filter(Boolean);

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.85rem' : '1.1rem', maxWidth: 1320, width: '100%', margin: '0 auto' }}>
        <Capa ctx={ctx} clube={selectedClub} logoUrl={logoUrl}
          titulo={`${saudacao()}${firstName ? `, ${firstName}` : ''}.`}
          sub={`${selectedClub ? `${selectedClub.name} · ` : ''}${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`}
          alerta={alerta} onRelatorio={selectedClub ? handleGenerateReport : null} reportLoading={reportLoading} />

        {announcements.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {announcements.map((a) => {
              const sev = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info;
              const Icon = sev.icon;
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', padding: '0.85rem 1rem', borderRadius: estiloTokens.raio, border: `1px solid ${sev.color}40`, backgroundColor: sev.bg }}>
                  <Icon size={18} style={{ color: sev.color, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: colors.text, marginBottom: 2 }}>{a.title}</div>
                    <div style={{ fontSize: '0.8rem', color: colors.text, lineHeight: 1.5, opacity: 0.85 }}>{a.body}</div>
                    {a.link_url && (
                      <a href={a.link_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: 4, fontSize: '0.78rem', color: sev.color, textDecoration: 'none', fontWeight: 600 }}>
                        Saiba mais <ChevronRight size={12} />
                      </a>
                    )}
                  </div>
                  <button onClick={() => handleDismiss(a.id)} title="Marcar como lido" aria-label="Marcar como lido" style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 4 }}>
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <QuadroSemana ctx={ctx} dias={dias} hojeStr={hojeStr} numSemana={numSemana} clube={selectedClub?.name}
          onDia={abrirDia} onAbrir={() => navigate(semanaDe ? `/training?data=${hojeStr}` : '/training')} loading={loading && !dashboard} />

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.35fr) minmax(0,1fr) minmax(0,1fr)', gap: isMobile ? '0.85rem' : '1.1rem', alignItems: 'stretch' }}>
          <CartaoHoje ctx={ctx} hoje={hoje} nextSessions={nextSessions} hojeStr={hojeStr} onAbrir={abrirDia} />
          <CartaoJogo ctx={ctx} jogo={nextMatch} dias={diasJogo} treinos={treinosAteJogo} onAbrir={abrirJogo} onProgramacao={() => navigate('/training')} />
          <CartaoPlantel ctx={ctx} total={summary.totalAthletes || 0} disponiveis={disponiveis} injuries={injuries}
            podeVer={can('athletes:view')} onPlantel={() => navigate('/plantel')} />
        </div>

        <nav aria-label="Atalhos" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : `repeat(${atalhos.length}, minmax(0,1fr))`, gap: isMobile ? '0.6rem' : '0.8rem' }}>
          {atalhos.map((a, i) => (
            <Atalho key={a.key} ctx={ctx} {...a} largo={isMobile && i === 0 && atalhos.length % 2 === 1} />
          ))}
        </nav>
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------------------------
// Peças compartilhadas
// ---------------------------------------------------------------------------------------------

function Titulo({ ctx, children, tamanho = '1.05rem', cor, as: Tag = 'h2', style }) {
  const pincel = ctx.estilo === 'prancheta';
  return (
    <Tag className="tp-titulo" style={{ margin: 0, fontSize: pincel ? `calc(${tamanho} * 1.3)` : tamanho, lineHeight: 1.15, color: cor || ctx.colors.text, letterSpacing: ctx.estilo === 'placar' ? '0.02em' : pincel ? 0 : '-0.01em', ...style }}>
      {children}
    </Tag>
  );
}

// Moldura do "cartão" conforme o estilo: alumínio grosso no quadro tático, fino nos outros.
function cartaoStyle(ctx, extra = {}) {
  const { colors, tk, estilo } = ctx;
  return {
    backgroundColor: colors.surface,
    border: `${estilo === 'prancheta' ? 4 : 1}px solid ${colors.border}`,
    borderRadius: tk.raio,
    padding: ctx.isMobile ? '1rem' : '1.15rem 1.25rem',
    boxShadow: estilo === 'prancheta' ? '0 8px 18px -14px rgba(0,0,0,.55)' : estilo === 'gramado' ? '0 10px 24px -20px rgba(16,36,26,.5)' : 'none',
    minWidth: 0,
    ...extra,
  };
}

function Ima({ cor, tamanho = 14, children, style }) {
  return (
    <span aria-hidden="true" style={{ width: tamanho, height: tamanho, borderRadius: '50%', backgroundColor: cor, flexShrink: 0, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: tamanho * 0.45, fontWeight: 700, ...style }}>
      {children}
    </span>
  );
}

function LinkAcao({ ctx, onClick, children, cor }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: cor || ctx.colors.primary, fontWeight: 600, fontSize: '0.82rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
      {children} <ArrowRight size={14} />
    </button>
  );
}

function Escudo({ clube, logoUrl, tamanho = 64, borda = '#fff' }) {
  const [falhou, setFalhou] = useState(false);
  if (logoUrl && !falhou) {
    return <img src={logoUrl} alt={clube?.name || 'Escudo'} onError={() => setFalhou(true)} style={{ height: tamanho, width: 'auto', maxWidth: tamanho * 1.4, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.25))' }} />;
  }
  // Sem logo: escudo desenhado com as cores do clube e as iniciais
  const cor = clube?.primary_color?.slice(0, 7) || '#15803D';
  const cor2 = clube?.secondary_color?.slice(0, 7) || '#FFFFFF';
  const sigla = (clube?.name || 'TP').split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p)).map((p) => p[0]).join('').slice(0, 4).toUpperCase() || 'TP';
  return (
    <svg viewBox="0 0 84 96" width={tamanho * 0.875} height={tamanho} aria-label={clube?.name || 'Escudo'} role="img" style={{ flexShrink: 0, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.28))' }}>
      <path d="M42 3 79 14v30c0 24-16 40-37 49C21 84 5 68 5 44V14z" fill={borda} />
      <path d="M42 9 73 18v26c0 20-13 34-31 42C24 78 11 64 11 44V18z" fill={cor} />
      <path d="M11 38h62v11H11z" fill={cor2} opacity=".9" />
      <text x="42" y={sigla.length > 3 ? 70 : 72} textAnchor="middle" fontFamily="Poppins, sans-serif" fontWeight="800" fontSize={sigla.length > 3 ? 13 : 16} fill={bestTextOn(cor)}>{sigla}</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Capa (do "Vestiário"): escudo + saudação; fundo conforme o estilo
// ---------------------------------------------------------------------------------------------

function Capa({ ctx, clube, logoUrl, titulo, sub, alerta, onRelatorio, reportLoading }) {
  const { colors, tk, estilo, isMobile } = ctx;
  const primaria = colors.primary;
  const quadro = estilo === 'prancheta';
  const fundo = {
    clube: `linear-gradient(115deg, ${darkenHex(primaria, 0.35)} 0%, ${darkenHex(primaria, 0.12)} 55%, ${primaria} 100%)`,
    quadro: colors.surface,
    gramado: '#1d6b37',
    placar: '#0b0b0c',
  }[tk.capa] || primaria;
  // texto sobre a capa: no quadro, a tinta do tema; na faixa do clube, contraste com a cor; nos outros, branco
  const ct = quadro ? colors.text : tk.capa === 'clube' ? bestTextOn(darkenHex(primaria, 0.2)) : '#ffffff';
  const ctTitulo = quadro ? primaria : ct;
  const claro = ct.toLowerCase() === '#ffffff';
  return (
    <section aria-label="Resumo" style={{
      position: 'relative', overflow: 'hidden', borderRadius: tk.raio, background: fundo,
      border: quadro ? `6px solid ${colors.border}` : 'none',
      boxShadow: quadro ? '0 10px 22px -16px rgba(0,0,0,.55), inset 0 0 0 1px rgba(0,0,0,.06)' : '0 14px 30px -22px rgba(0,0,0,.6)',
      minHeight: isMobile ? 168 : 200, display: 'flex', alignItems: 'flex-end',
    }}>
      {!(isMobile && tk.capa === 'quadro') && <FundoCapa tipo={tk.capa} primaria={primaria} colors={colors} />}
      {estilo === 'placar' && <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, backgroundColor: primaria }} />}
      <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-end', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '0.75rem' : '1.25rem', padding: isMobile ? '1.1rem 1rem 1.15rem' : '1.6rem 1.75rem 1.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.8rem' : '1.1rem', minWidth: 0, flex: 1 }}>
          <Escudo clube={clube} logoUrl={logoUrl} tamanho={isMobile ? 52 : 76} borda={quadro ? colors.border : '#fff'} />
          <div style={{ minWidth: 0 }}>
            <Titulo ctx={ctx} as="h1" tamanho={isMobile ? '1.55rem' : '2.15rem'} cor={ctTitulo} style={{ letterSpacing: estilo === 'placar' ? '0.02em' : quadro ? 0 : '-0.03em', fontWeight: tk.pesoTitulo === 700 && estilo !== 'placar' && !quadro ? 800 : undefined }}>
              {titulo}
            </Titulo>
            <p style={{ margin: '0.3rem 0 0', fontSize: isMobile ? '0.82rem' : '0.95rem', color: quadro ? colors.textSecondary : ct, opacity: quadro ? 1 : 0.88 }}>{sub}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flexShrink: 0 }}>
          {alerta && (quadro
            ? <span className="tp-titulo" style={{ fontFamily: tk.fonteTitulo, color: VERMELHO, fontSize: isMobile ? '1.35rem' : '1.75rem', transform: 'rotate(-3deg)', borderBottom: `3px solid ${VERMELHO}`, lineHeight: 1.05, padding: '0 4px 2px' }}>{alerta}</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: VERMELHO, color: '#fff', fontWeight: 700, fontSize: '0.8rem', borderRadius: estilo === 'placar' ? 2 : 99, padding: '0.32rem 0.8rem', textTransform: estilo === 'placar' ? 'uppercase' : 'none', letterSpacing: estilo === 'placar' ? '0.04em' : 0 }}>{alerta}</span>)}
          {onRelatorio && (
            <button type="button" onClick={onRelatorio} disabled={reportLoading} title={`Gera um PDF com plantel, treinos e jogos de ${new Date().getFullYear()}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 0.9rem', borderRadius: Math.min(tk.raio, 10), fontSize: '0.84rem', fontWeight: 600, fontFamily: 'inherit', cursor: reportLoading ? 'progress' : 'pointer', opacity: reportLoading ? 0.75 : 1,
                ...(quadro
                  ? { backgroundColor: colors.surface, color: colors.text, border: `2px solid ${colors.text}` }
                  : { backgroundColor: claro ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.08)', color: ct, border: 'none', boxShadow: `inset 0 0 0 1px ${claro ? 'rgba(255,255,255,.4)' : 'rgba(0,0,0,.25)'}` }) }}>
              {reportLoading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              {reportLoading ? 'Gerando…' : 'Relatório do clube'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function FundoCapa({ tipo, primaria, colors }) {
  const props = { 'aria-hidden': true, viewBox: '0 0 1200 260', preserveAspectRatio: 'xMidYMid slice', style: { position: 'absolute', inset: 0, width: '100%', height: '100%' } };
  if (tipo === 'quadro') {
    // campo desenhado a pincel no quadro branco, com ímãs e a seta da jogada
    return (
      <svg {...props}>
        <g fill="none" stroke={primaria} strokeOpacity=".28" strokeWidth="3" strokeDasharray="10 8" strokeLinecap="round" transform="translate(120 -10)">
          <rect x="640" y="28" width="520" height="204" rx="4" /><path d="M900 28v204" /><circle cx="900" cy="130" r="44" />
          <rect x="1100" y="80" width="60" height="100" /><rect x="640" y="80" width="60" height="100" />
        </g>
        <g transform="translate(120 -10)" opacity=".8">
          {[[720, 90], [760, 170], [830, 60], [850, 130], [955, 85], [985, 175]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="11" fill={primaria} fillOpacity=".75" />
          ))}
          {[[1040, 110], [1075, 170], [1010, 60]].map(([x, y], i) => <circle key={`a${i}`} cx={x} cy={y} r="11" fill="#555" fillOpacity=".55" />)}
        </g>
        <path transform="translate(120 -10)" d="M865 128c50-50 120-50 170-20" fill="none" stroke={VERMELHO} strokeOpacity=".7" strokeWidth="3.5" strokeLinecap="round" />
        <path transform="translate(120 -10)" d="m1022 96 15 12-18 6" fill="none" stroke={VERMELHO} strokeOpacity=".7" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tipo === 'gramado') {
    return (
      <svg {...props}>
        <defs>
          <linearGradient id="tpg-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f8f4e" /><stop offset="1" stopColor="#155c2d" /></linearGradient>
          <radialGradient id="tpg-luz" cx=".75" cy="0" r=".9"><stop offset="0" stopColor="#fff" stopOpacity=".3" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <linearGradient id="tpg-veu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#06250f" stopOpacity=".75" /><stop offset=".55" stopColor="#06250f" stopOpacity=".2" /><stop offset="1" stopColor="#06250f" stopOpacity="0" /></linearGradient>
        </defs>
        <rect width="1200" height="260" fill="url(#tpg-g)" />
        <g fill="#000" opacity=".08">{[0, 64, 128, 192, 256].map((y) => <rect key={y} y={y} width="1200" height="32" />)}</g>
        <g fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="3" transform="rotate(-8 600 130)">
          <rect x="80" y="-60" width="1100" height="420" /><path d="M640 -60v420" /><circle cx="640" cy="150" r="92" />
          <rect x="990" y="40" width="200" height="220" /><rect x="1110" y="95" width="80" height="110" />
        </g>
        {[[860, 96], [780, 150], [700, 78], [930, 170]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="9" fill="#fff" />)}
        {[[1010, 118], [960, 58], [1045, 190]].map(([x, y], i) => <circle key={`b${i}`} cx={x} cy={y} r="9" fill="#111827" />)}
        <circle cx="905" cy="126" r="5" fill="#facc15" />
        <rect width="1200" height="260" fill="url(#tpg-luz)" /><rect width="1200" height="260" fill="url(#tpg-veu)" />
      </svg>
    );
  }
  if (tipo === 'placar') {
    // painel de placar: grade de lâmpadas apagadas + o campo em traço fino
    return (
      <svg {...props}>
        <defs><pattern id="tpp-led" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="2" fill="#fff" fillOpacity=".06" /></pattern></defs>
        <rect width="1200" height="260" fill="url(#tpp-led)" />
        <g fill="none" stroke={primaria} strokeOpacity=".55" strokeWidth="2">
          <rect x="760" y="36" width="400" height="188" /><path d="M960 36v188" /><circle cx="960" cy="130" r="38" />
        </g>
      </svg>
    );
  }
  // clube (Clássico): faixas de gramado + linhas do campo sobre a cor do clube
  return (
    <svg {...props}>
      <g fill="#000" opacity=".07">{[0, 200, 400, 600, 800, 1000].map((x) => <rect key={x} x={x} width="100" height="260" />)}</g>
      <g fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="3">
        <circle cx="930" cy="130" r="105" /><path d="M930 -20v300" /><rect x="1090" y="30" width="140" height="200" /><rect x="1150" y="80" width="80" height="100" />
      </g>
      <circle cx="930" cy="130" r="5" fill="#fff" fillOpacity=".5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Quadro da semana (da "Prancheta"): 7 colunas, ímãs por atividade, total do dia
// ---------------------------------------------------------------------------------------------

function QuadroSemana({ ctx, dias, hojeStr, numSemana, clube, onDia, onAbrir, loading }) {
  const { colors, tk, estilo, isMobile } = ctx;
  const quadro = estilo === 'prancheta';
  const visiveis = isMobile ? dias.filter((d) => d.data >= hojeStr) : dias;
  const separador = quadro ? `2px dashed ${colors.border}` : `1px solid ${colors.border}`;
  const totalSemana = dias.reduce((s, d) => s + d.minutos, 0);
  return (
    <section aria-label="Semana" style={cartaoStyle(ctx, quadro ? { border: `6px solid ${colors.border}`, padding: isMobile ? '0.9rem' : '1.15rem 1.35rem 1rem' } : {})}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: isMobile ? '0.5rem' : '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Titulo ctx={ctx} tamanho={isMobile ? '1.15rem' : '1.3rem'} cor={quadro ? colors.primary : undefined}>
            Semana {numSemana}
          </Titulo>
          <span className="tp-num" style={{ fontSize: '0.82rem', color: colors.textSecondary }}>
            {ddmm(dias[0].data)} a {ddmm(dias[6].data)}{clube ? ` · ${clube}` : ''}{totalSemana ? ` · ${totalSemana} min de treino` : ''}
          </span>
        </div>
        <LinkAcao ctx={ctx} onClick={onAbrir}>Abrir a semana</LinkAcao>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, minmax(0,1fr))', borderTop: separador }}>
        {visiveis.map((d, idx) => {
          const eHoje = d.data === hojeStr;
          const jogo = d.periodos.find((p) => p.tipo === 'match');
          const folga = d.periodos.length > 0 && d.periodos.every((p) => p.tipo === 'rest');
          const atividades = d.periodos.filter((p) => p.tipo === 'training').flatMap((p) => p.atividades.map((a) => ({ ...a, periodo: d.periodos.length > 1 ? p.periodo : null })));
          const avaliacao = d.periodos.some((p) => p.tipo === 'assessment');
          const mostrar = isMobile ? atividades.slice(0, 3) : atividades.slice(0, 4);
          const resto = atividades.length - mostrar.length;
          const ultimo = idx === visiveis.length - 1;
          return (
            <button key={d.data} type="button" className="tp-dia" onClick={() => onDia(d.data)} aria-label={`Abrir ${DIAS_LONGOS[d.i]} ${ddmm(d.data)}`}
              style={{
                display: 'flex', flexDirection: 'column', gap: isMobile ? 6 : 8, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: colors.text,
                padding: isMobile ? '0.65rem 0.15rem' : '0.75rem 0.7rem 0.6rem', minHeight: isMobile ? 0 : 214, minWidth: 0,
                background: eHoje ? (quadro ? `repeating-linear-gradient(0deg, transparent 0 27px, ${colors.primary}10 27px 28px)` : `${colors.primary}0D`) : 'transparent',
                border: 'none',
                borderRight: !isMobile && !ultimo ? separador : 'none',
                borderBottom: isMobile && !ultimo ? separador : 'none',
                borderRadius: 0,
              }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%', gap: 6 }}>
                <span className="tp-titulo" style={{ fontFamily: tk.fonteTitulo, fontWeight: tk.pesoTitulo, textTransform: tk.caixaTitulo, fontSize: quadro ? '1.2rem' : '0.95rem', color: eHoje ? colors.primary : colors.text, lineHeight: 1.1 }}>
                  {DIAS_CURTOS[d.i]}{eHoje ? ' · hoje' : ''}
                </span>
                <span className="tp-num" style={{ fontSize: '0.74rem', color: colors.textSecondary, fontFamily: quadro ? "'Red Hat Mono', ui-monospace, monospace" : 'inherit' }}>{ddmm(d.data)}</span>
              </span>
              {loading ? (
                <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>…</span>
              ) : jogo ? (
                <span style={{ border: `2px solid ${VERMELHO}`, borderRadius: Math.min(tk.raio, 6), padding: '0.45rem 0.5rem', color: VERMELHO, transform: quadro ? 'rotate(-1.5deg)' : 'none', alignSelf: 'stretch' }}>
                  <span className="tp-titulo" style={{ display: 'block', fontFamily: tk.fonteTitulo, fontWeight: tk.pesoTitulo, textTransform: 'uppercase', fontSize: quadro ? '1.2rem' : '0.9rem', lineHeight: 1 }}>Jogo!</span>
                  <span style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>× {jogo.adversario || 'adversário a definir'}</span>
                </span>
              ) : folga ? (
                <span className="tp-titulo" style={{ fontFamily: quadro ? tk.fonteTitulo : 'inherit', fontWeight: 400, color: colors.textMuted, fontSize: quadro ? '1.1rem' : '0.82rem', marginTop: isMobile ? 0 : 18, alignSelf: isMobile ? 'flex-start' : 'center' }}>folga</span>
              ) : (
                <>
                  {mostrar.map((a, k) => (
                    <span key={k} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: '0.8rem', lineHeight: 1.25, minWidth: 0 }}>
                      <Ima cor={COR_PILAR[a.pilar] || colors.textMuted} tamanho={13} style={{ marginTop: 2 }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontWeight: 600 }} title={NOME_PILAR[a.pilar] || ''}>{a.titulo}</span>
                        <span className="tp-num" style={{ fontSize: '0.72rem', color: colors.textSecondary }}>{a.minutos ? `${a.minutos} min` : ''}{a.periodo ? `${a.minutos ? ' · ' : ''}${rotuloPeriodo(a.periodo)}` : ''}</span>
                      </span>
                    </span>
                  ))}
                  {resto > 0 && <span style={{ fontSize: '0.74rem', color: colors.textSecondary }}>+{resto} atividade{resto > 1 ? 's' : ''}</span>}
                  {avaliacao && <span style={{ fontSize: '0.76rem', fontWeight: 600, color: colors.textSecondary }}>Avaliação</span>}
                  {!atividades.length && !avaliacao && <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>{d.data < hojeStr ? '—' : 'a planejar'}</span>}
                </>
              )}
              {d.minutos > 0 && (
                <span className="tp-titulo tp-num" style={{ marginTop: isMobile ? 0 : 'auto', alignSelf: isMobile ? 'flex-end' : 'flex-start', fontFamily: quadro ? tk.fonteTitulo : 'inherit', fontWeight: 700, fontSize: quadro ? '1.15rem' : '0.82rem', color: quadro ? colors.primary : colors.text, textTransform: 'none' }}>
                  {quadro ? `= ${d.minutos}'` : `${d.minutos} min`}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', marginTop: '0.7rem', fontSize: '0.74rem', color: colors.textSecondary }}>
        {Object.keys(COR_PILAR).map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ima cor={COR_PILAR[k]} tamanho={10} />{NOME_PILAR[k]}</span>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Hoje (do "Vestiário"): o treino do dia, atividade a atividade
// ---------------------------------------------------------------------------------------------

function CartaoHoje({ ctx, hoje, nextSessions, hojeStr, onAbrir }) {
  const { colors, tk } = ctx;
  const treinos = (hoje?.periodos || []).filter((p) => p.tipo === 'training' && p.atividades.length);
  const jogoHoje = (hoje?.periodos || []).find((p) => p.tipo === 'match');
  const proximo = nextSessions.find((s) => String(s.date).split('T')[0] > hojeStr && s.session_type === 'training');
  return (
    <section aria-label="Treino de hoje" style={cartaoStyle(ctx, { display: 'flex', flexDirection: 'column' })}>
      {treinos.length ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: '0.7rem' }}>
            <div>
              <Titulo ctx={ctx} tamanho="1.15rem">Treino de hoje{treinos.length === 1 && treinos[0].periodo ? ` · ${rotuloPeriodo(treinos[0].periodo)}` : ''}</Titulo>
              <p className="tp-num" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: colors.textSecondary }}>{hoje.minutos} minutos · {treinos.reduce((s, p) => s + p.atividades.length, 0)} atividades</p>
            </div>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
            {treinos.flatMap((p) => p.atividades.map((a, k) => ({ ...a, k: `${p.id}-${k}`, periodo: treinos.length > 1 ? p.periodo : null }))).slice(0, 6).map((a, k, arr) => (
              <li key={a.k} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'start', padding: '0.45rem 0', borderBottom: k < arr.length - 1 ? `1px ${ctx.estilo === 'prancheta' ? 'dashed' : 'solid'} ${colors.border}` : 'none' }}>
                <Ima cor={COR_PILAR[a.pilar] || colors.textMuted} tamanho={12} style={{ marginTop: 3 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '0.86rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titulo}</span>
                  <span style={{ display: 'block', fontSize: '0.74rem', lineHeight: 1.35, color: colors.textSecondary }}>{[a.bloco, NOME_PILAR[a.pilar], a.periodo && rotuloPeriodo(a.periodo)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="tp-num" style={{ fontWeight: 600, fontSize: '0.8rem', color: colors.textSecondary }}>{a.minutos ? `${a.minutos}'` : ''}</span>
              </li>
            ))}
          </ol>
          <div style={{ marginTop: '0.8rem' }}>
            <button type="button" onClick={() => onAbrir(hojeStr)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.6rem 1rem', borderRadius: Math.min(tk.raio, 10), border: 'none', backgroundColor: colors.primary, color: colors.primaryText, fontWeight: 600, fontSize: '0.86rem', fontFamily: 'inherit', cursor: 'pointer' }}>
              Abrir o treino <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <>
          <Titulo ctx={ctx} tamanho="1.15rem">Hoje</Titulo>
          <p style={{ margin: '0.45rem 0 0.9rem', fontSize: '0.88rem', color: colors.textSecondary, lineHeight: 1.5 }}>
            {jogoHoje ? `Dia de jogo contra ${jogoHoje.adversario || 'o adversário'}.`
              : (hoje?.periodos || []).some((p) => p.tipo === 'rest') ? 'Dia de folga do grupo.'
                : 'Nenhum treino montado para hoje.'}
            {proximo ? ` Próximo treino: ${DIAS_LONGOS[(dataDe(proximo.date).getDay() + 6) % 7]}, ${ddmm(proximo.date)}.` : ''}
          </p>
          <div style={{ marginTop: 'auto' }}>
            <LinkAcao ctx={ctx} onClick={() => onAbrir(proximo ? String(proximo.date).split('T')[0] : hojeStr)}>{proximo ? 'Ver o próximo treino' : 'Montar o treino de hoje'}</LinkAcao>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Próximo jogo: campo com a formação, contagem e atalhos do jogo
// ---------------------------------------------------------------------------------------------

function posicoesDaFormacao(formacao) {
  const linhas = String(formacao || '4-3-3').split('-').map((n) => parseInt(n, 10)).filter((n) => n > 0 && n <= 6);
  const ok = linhas.length >= 2 && linhas.reduce((a, b) => a + b, 0) <= 10 ? linhas : [4, 3, 3];
  const pts = [{ x: 7, y: 50 }];
  ok.forEach((n, li) => {
    const x = 20 + (li * 30) / Math.max(1, ok.length - 1) + (li === ok.length - 1 ? 2 : 0);
    for (let k = 0; k < n; k++) pts.push({ x, y: ((k + 1) * 100) / (n + 1) });
  });
  return pts;
}

function CampoMini({ ctx, formacao }) {
  const { colors, estilo } = ctx;
  const quadro = estilo === 'prancheta';
  const linha = quadro ? colors.primary : '#ffffff';
  const pts = posicoesDaFormacao(formacao);
  return (
    <svg viewBox="0 0 200 110" role="img" aria-label={`Formação ${formacao || '4-3-3'}`} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: Math.min(ctx.tk.raio, 8), backgroundColor: quadro ? 'transparent' : '#1f7a3f' }}>
      {!quadro && <g fill="#000" opacity=".08">{[0, 40, 80, 120, 160].map((x) => <rect key={x} x={x} width="20" height="110" />)}</g>}
      <g fill="none" stroke={linha} strokeOpacity={quadro ? 0.55 : 0.6} strokeWidth="1.5" strokeDasharray={quadro ? '5 4' : undefined}>
        <rect x="3" y="3" width="194" height="104" rx="2" /><path d="M100 3v104" /><circle cx="100" cy="55" r="15" />
        <rect x="3" y="30" width="24" height="50" /><rect x="173" y="30" width="24" height="50" />
      </g>
      {pts.map((p, i) => (
        <circle key={i} cx={(p.x / 100) * 200} cy={3 + (p.y / 100) * 104} r="6.5" fill={colors.primary} stroke={quadro ? 'none' : '#fff'} strokeWidth="1.2" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.35))' }} />
      ))}
    </svg>
  );
}

function CartaoJogo({ ctx, jogo, dias, treinos, onAbrir, onProgramacao }) {
  const { colors, tk, estilo } = ctx;
  if (!jogo) {
    return (
      <section aria-label="Próximo jogo" style={cartaoStyle(ctx, { display: 'flex', flexDirection: 'column' })}>
        <Titulo ctx={ctx} tamanho="1.15rem">Próximo jogo</Titulo>
        <p style={{ margin: '0.45rem 0 0.9rem', fontSize: '0.88rem', color: colors.textSecondary, lineHeight: 1.5 }}>Nenhum jogo marcado. Na Programação, mude o tipo de um dia para Jogo.</p>
        <div style={{ marginTop: 'auto' }}><LinkAcao ctx={ctx} onClick={onProgramacao}>Ir para a Programação</LinkAcao></div>
      </section>
    );
  }
  const data = String(jogo.date).split('T')[0];
  const mando = jogo.match_location === 'home' ? 'em casa' : jogo.match_location === 'away' ? 'fora' : null;
  const contador = (n, rot) => (
    <span style={{ flex: 1, textAlign: 'center', padding: '0.4rem 0.3rem', borderRadius: Math.min(tk.raio, 8), backgroundColor: colors.surfaceHover }}>
      <b className="tp-titulo tp-num" style={{ display: 'block', fontFamily: estilo === 'placar' || estilo === 'prancheta' ? tk.fonteTitulo : 'inherit', fontSize: '1.35rem', lineHeight: 1.05, color: colors.text, textTransform: 'none' }}>{n}</b>
      <span style={{ fontSize: '0.7rem', color: colors.textSecondary }}>{rot}</span>
    </span>
  );
  return (
    <section aria-label="Próximo jogo" style={cartaoStyle(ctx, { display: 'flex', flexDirection: 'column', gap: '0.65rem' })}>
      <div>
        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: VERMELHO, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {DIAS_LONGOS[(dataDe(data).getDay() + 6) % 7]} {ddmm(data)}{jogo.match_kickoff ? ` · ${jogo.match_kickoff.replace(':', 'h')}` : ''}{mando ? ` · ${mando}` : ''}
        </span>
        <Titulo ctx={ctx} tamanho="1.2rem" style={{ marginTop: 4 }}>× {jogo.opponent_name || 'Adversário a definir'}</Titulo>
        {(jogo.match_venue || jogo.match_meet_time) && (
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.8rem', color: colors.textSecondary, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {jogo.match_venue && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><MapPin size={13} />{jogo.match_venue}</span>}
            {jogo.match_meet_time && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Clock size={13} />apresentação {jogo.match_meet_time.replace(':', 'h')}</span>}
          </p>
        )}
      </div>
      <CampoMini ctx={ctx} formacao={jogo.formation} />
      <div style={{ display: 'flex', gap: 6 }}>
        {contador(dias === 0 ? 'Hoje' : dias, dias === 0 ? 'é o jogo' : dias === 1 ? 'dia' : 'dias')}
        {contador(treinos, treinos === 1 ? 'treino antes' : 'treinos antes')}
        {contador(jogo.formation || '—', 'formação')}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
        <button type="button" onClick={() => onAbrir(jogo)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 0.9rem', borderRadius: Math.min(tk.raio, 10), border: 'none', backgroundColor: colors.primary, color: colors.primaryText, fontWeight: 600, fontSize: '0.84rem', fontFamily: 'inherit', cursor: 'pointer' }}>
          Abrir o jogo <ArrowRight size={15} />
        </button>
        <button type="button" onClick={() => onAbrir(jogo, 'analise')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.55rem 0.8rem', borderRadius: Math.min(tk.raio, 10), border: `1px solid ${colors.border}`, backgroundColor: 'transparent', color: colors.text, fontWeight: 600, fontSize: '0.84rem', fontFamily: 'inherit', cursor: 'pointer' }}>
          <Binoculars size={15} /> Análise
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Plantel: prontos × no departamento médico (um ímã por atleta)
// ---------------------------------------------------------------------------------------------

function CartaoPlantel({ ctx, total, disponiveis, injuries, podeVer, onPlantel }) {
  const { colors, tk, estilo } = ctx;
  const n = Math.min(total, 30);
  const noDm = Math.min(injuries.length, n);
  return (
    <section aria-label="Plantel" style={cartaoStyle(ctx, { display: 'flex', flexDirection: 'column' })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Titulo ctx={ctx} tamanho="1.15rem">Plantel</Titulo>
        {podeVer && <LinkAcao ctx={ctx} onClick={onPlantel}>Ver plantel</LinkAcao>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0.5rem 0 0.55rem' }}>
        <span className="tp-titulo tp-num" style={{ fontFamily: estilo === 'classico' || estilo === 'gramado' ? 'inherit' : tk.fonteTitulo, fontWeight: 800, fontSize: estilo === 'prancheta' ? '2.6rem' : '2.1rem', lineHeight: 1, letterSpacing: estilo === 'classico' || estilo === 'gramado' ? '-0.03em' : 0, color: estilo === 'prancheta' ? colors.primary : colors.text, textTransform: 'none' }}>
          {disponiveis}<span style={{ fontSize: '0.5em', color: colors.textSecondary, fontWeight: 600 }}>/{total}</span>
        </span>
        <span style={{ fontSize: '0.84rem', color: colors.textSecondary }}>prontos para jogar</span>
      </div>
      {total > 0 && (
        <div aria-hidden="true" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: '0.75rem' }}>
          {Array.from({ length: n }, (_, i) => <Ima key={i} cor={i >= n - noDm ? VERMELHO : colors.primary} tamanho={15} />)}
        </div>
      )}
      {injuries.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.84rem', color: colors.textSecondary }}>{total ? 'Ninguém no departamento médico.' : 'Nenhum atleta cadastrado ainda.'}</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {injuries.slice(0, 3).map((inj, k, arr) => (
            <li key={inj.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '0.45rem 0', borderBottom: k < arr.length - 1 ? `1px ${estilo === 'prancheta' ? 'dashed' : 'solid'} ${colors.border}` : 'none' }}>
              <Ima cor={VERMELHO} tamanho={12} style={{ marginTop: 4 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.3 }}>{inj.athlete_name}</span>
                <span style={{ display: 'block', fontSize: '0.74rem', lineHeight: 1.35, color: colors.textSecondary }}>{[inj.injury_type, inj.body_part].filter(Boolean).join(' · ')}{inj.expected_return ? ` · volta ${ddmm(inj.expected_return)}` : ''}</span>
              </span>
            </li>
          ))}
          {injuries.length > 3 && <li style={{ fontSize: '0.78rem', color: colors.textSecondary, paddingTop: 4 }}>+{injuries.length - 3} no departamento médico</li>}
        </ul>
      )}
      {!podeVer && <span style={{ marginTop: 'auto' }} />}
      {total === 0 && podeVer && <div style={{ marginTop: '0.8rem' }}><LinkAcao ctx={ctx} onClick={onPlantel}>Cadastrar atletas</LinkAcao></div>}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Atalhos (do "Vestiário"): cartões ilustrados; no quadro tático viram etiquetas
// ---------------------------------------------------------------------------------------------

const COR_ATALHO = { semana: null, pessoas: '#1e3a8a', barras: '#7c2d12', campo: '#0f172a', alvo: '#5b21b6' };

function Ilustracao({ tipo, cor }) {
  const g = { fill: 'none', stroke: cor, strokeOpacity: 0.28, strokeWidth: 2 };
  const f = { fill: cor, fillOpacity: 0.22 };
  return (
    <svg aria-hidden="true" viewBox="0 0 300 110" preserveAspectRatio="xMaxYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {tipo === 'semana' && <g {...g}><rect x="170" y="12" width="118" height="86" rx="4" /><path d="M170 34h118M200 12v86M230 12v86M260 12v86" /></g>}
      {tipo === 'pessoas' && <g {...f}><circle cx="215" cy="40" r="16" /><path d="M185 98c0-20 13-32 30-32s30 12 30 32z" /><circle cx="262" cy="47" r="12" /><path d="M241 98c2-15 10-24 21-24s19 9 21 24z" /></g>}
      {tipo === 'barras' && <g {...f}><rect x="182" y="62" width="16" height="40" /><rect x="206" y="42" width="16" height="60" /><rect x="230" y="24" width="16" height="78" /><rect x="254" y="50" width="16" height="52" /></g>}
      {tipo === 'campo' && <><g {...g}><rect x="160" y="10" width="130" height="90" /><path d="M225 10v90" /><circle cx="225" cy="55" r="16" /></g><path d="M180 82c30-30 55-40 90-30" stroke="#facc15" strokeOpacity=".75" strokeWidth="2.5" fill="none" strokeDasharray="5 4" /></>}
      {tipo === 'alvo' && <g {...g}><circle cx="240" cy="55" r="40" /><circle cx="240" cy="55" r="25" /><circle cx="240" cy="55" r="10" /></g>}
    </svg>
  );
}

function Atalho({ ctx, label, sub, icon: Icon, ilu, onClick, largo }) {
  const { colors, tk, estilo, isMobile } = ctx;
  const base = { gridColumn: largo ? 'span 2' : undefined, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-start', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', minWidth: 0, minHeight: isMobile ? 84 : 104, padding: isMobile ? '0.75rem 0.85rem' : '0.9rem 1rem', borderRadius: tk.raio };
  if (estilo === 'prancheta') {
    // etiqueta de quadro: branco, contorno de pincel; a 1ª na cor do clube
    const cheia = ilu === 'semana';
    return (
      <button type="button" onClick={onClick} className="tp-cartao-link"
        style={{ ...base, justifyContent: 'space-between', backgroundColor: cheia ? colors.primary : colors.surface, color: cheia ? colors.primaryText : colors.text, border: `2.5px solid ${cheia ? colors.primary : colors.text}` }}>
        <Icon size={20} />
        <span>
          <span className="tp-titulo" style={{ display: 'block', fontFamily: tk.fonteTitulo, fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.1 }}>{label}</span>
          <span style={{ fontSize: '0.74rem', opacity: 0.8 }}>{sub}</span>
        </span>
      </button>
    );
  }
  if (estilo === 'placar') {
    return (
      <button type="button" onClick={onClick} className="tp-cartao-link"
        style={{ ...base, justifyContent: 'space-between', backgroundColor: '#0b0b0c', color: '#f5f5f4', border: 'none', borderBottom: `4px solid ${colors.primary}` }}>
        <Icon size={19} color={colors.primary === '#0b0b0c' ? '#fff' : colors.primary} />
        <span>
          <span className="tp-titulo" style={{ display: 'block', fontFamily: tk.fonteTitulo, fontWeight: 700, textTransform: 'uppercase', fontSize: '1.2rem', letterSpacing: '0.03em', lineHeight: 1.05 }}>{label}</span>
          <span style={{ fontSize: '0.72rem', color: '#a6a6ae' }}>{sub}</span>
        </span>
      </button>
    );
  }
  // Clássico e Gramado: cartões coloridos com ilustração
  const fundo = COR_ATALHO[ilu] || colors.primary;
  const texto = ilu === 'semana' ? colors.primaryText : '#fff';
  return (
    <button type="button" onClick={onClick} className="tp-cartao-link" style={{ ...base, backgroundColor: fundo, color: texto, border: 'none' }}>
      <Ilustracao tipo={ilu} cor={texto} />
      <span style={{ position: 'relative' }}>
        <span className="tp-titulo" style={{ display: 'block', fontWeight: estilo === 'gramado' ? 800 : 700, fontSize: '1rem', lineHeight: 1.15 }}>{label}</span>
        <span style={{ fontSize: '0.74rem', opacity: 0.85 }}>{sub}</span>
      </span>
    </button>
  );
}

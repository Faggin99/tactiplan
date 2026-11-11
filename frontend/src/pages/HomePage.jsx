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
  const altura = useAlturaJanela();
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

  // Quantas atividades cabem por dia sem rolar a página (altura da janela)
  const porDia = altura >= 1050 ? 5 : altura >= 900 ? 4 : altura >= 780 ? 3 : 2;
  const avisos = isMobile ? announcements : announcements.slice(0, 1);

  return (
    <Layout>
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.85rem' : '0.9rem', maxWidth: 1440, width: '100%', margin: '0 auto', ...(isMobile ? {} : { flex: 1, minHeight: 0, paddingBottom: estilo === 'prancheta' ? 4 : 0 }) }}>
        {avisos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flexShrink: 0 }}>
            {avisos.map((a) => {
              const sev = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info;
              const Icon = sev.icon;
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.7rem', padding: '0.6rem 0.9rem', borderRadius: estiloTokens.raio, border: `1px solid ${sev.color}40`, backgroundColor: sev.bg }}>
                  <Icon size={18} style={{ color: sev.color, marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: colors.text }}>{a.title}</div>
                    <div style={{ fontSize: '0.8rem', color: colors.text, lineHeight: 1.45, opacity: 0.85 }}>{a.body}</div>
                    {a.link_url && (
                      <a href={a.link_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: 2, fontSize: '0.78rem', color: sev.color, textDecoration: 'none', fontWeight: 600 }}>
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

        <Quadro ctx={ctx} clube={selectedClub} logoUrl={logoUrl} dias={dias} hojeStr={hojeStr} numSemana={numSemana}
          saudacao={`${saudacao()}${firstName ? `, ${firstName}` : ''}.`}
          dataHoje={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          alerta={alerta} onRelatorio={selectedClub ? handleGenerateReport : null} reportLoading={reportLoading}
          onDia={abrirDia} onAbrir={() => navigate(semanaDe ? `/training?data=${hojeStr}` : '/training')}
          loading={loading && !dashboard} porDia={porDia} atalhos={atalhos} />

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr)', gap: isMobile ? '0.85rem' : '0.9rem', alignItems: 'stretch', ...(isMobile ? {} : { flexShrink: 0, height: altura >= 900 ? 268 : 236 }) }}>
          <CartaoHoje ctx={ctx} hoje={hoje} nextSessions={nextSessions} hojeStr={hojeStr} onAbrir={abrirDia} max={altura >= 1000 ? 4 : 3} />
          <CartaoJogo ctx={ctx} jogo={nextMatch} dias={diasJogo} treinos={treinosAteJogo} onAbrir={abrirJogo} onProgramacao={() => navigate('/training')} />
          <CartaoPlantel ctx={ctx} total={summary.totalAthletes || 0} disponiveis={disponiveis} injuries={injuries}
            podeVer={can('athletes:view')} onPlantel={() => navigate('/plantel')} max={altura >= 1000 ? 2 : 1} />
        </div>
      </div>
    </Layout>
  );
}

function useAlturaJanela() {
  const [h, setH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 900));
  useEffect(() => {
    const f = () => setH(window.innerHeight);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return h;
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
  const { colors, tk, estilo, isDark } = ctx;
  const folha = estilo === 'prancheta';
  return {
    position: 'relative',
    backgroundColor: folha ? (isDark ? '#23282D' : '#FFFFFF') : colors.surface,
    border: folha ? 'none' : `1px solid ${colors.border}`,
    borderRadius: folha ? 2 : tk.raio,
    padding: ctx.isMobile ? '1rem' : '0.95rem 1.15rem',
    boxShadow: folha ? '0 1px 1px rgba(0,0,0,.12), 0 10px 18px -12px rgba(0,0,0,.45)' : estilo === 'gramado' ? '0 10px 24px -20px rgba(16,36,26,.5)' : 'none',
    minWidth: 0,
    overflow: folha ? 'visible' : 'hidden',
    ...extra,
  };
}

// Ímã que prende a folha no quadro (só no Quadro tático)
function Prende({ ctx, cor }) {
  if (ctx.estilo !== 'prancheta') return null;
  return <Ima cor={cor || ctx.colors.primary} tamanho={18} style={{ position: 'absolute', top: -7, left: '50%', marginLeft: -9, zIndex: 1 }} />;
}

function Ima({ cor, tamanho = 14, children, style }) {
  return (
    <span aria-hidden="true" style={{ width: tamanho, height: tamanho, borderRadius: '50%', backgroundColor: cor, backgroundImage: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,.55) 0, rgba(255,255,255,0) 45%)', flexShrink: 0, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: tamanho * 0.45, fontWeight: 700, ...style }}>
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
// O quadro (Prancheta + Vestiário): cabeçalho (capa), a semana em colunas com ímãs e os atalhos.
// No Quadro tático é um quadro branco de verdade: moldura de alumínio, calha com pincéis embaixo,
// título "Semana 46" a pincel e o aviso do jogo em vermelho. Nos outros estilos o cabeçalho é a
// capa (faixa na cor do clube, gramado ou placar) com o escudo e a saudação.
// ---------------------------------------------------------------------------------------------

function Quadro({ ctx, clube, logoUrl, dias, hojeStr, numSemana, saudacao: ola, dataHoje, alerta, onRelatorio, reportLoading, onDia, onAbrir, loading, porDia, atalhos }) {
  const { colors, tk, estilo, isMobile, isDark } = ctx;
  const quadro = estilo === 'prancheta';
  const totalSemana = dias.reduce((s, d) => s + d.minutos, 0);
  const faixaSemana = `${ddmm(dias[0].data)} a ${ddmm(dias[6].data)}${totalSemana ? ` · ${totalSemana} min de treino` : ''}`;

  const relatorio = onRelatorio && (
    <button type="button" onClick={onRelatorio} disabled={reportLoading} title={`Gera um PDF com plantel, treinos e jogos de ${new Date().getFullYear()}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.8rem', borderRadius: quadro ? 3 : Math.min(tk.raio, 10), fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit', cursor: reportLoading ? 'progress' : 'pointer', opacity: reportLoading ? 0.75 : 1, whiteSpace: 'nowrap',
        ...(quadro
          ? { backgroundColor: 'transparent', color: colors.text, border: `2px solid ${colors.text}` }
          : { backgroundColor: 'rgba(255,255,255,.14)', color: '#fff', border: 'none', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.4)' }) }}>
      {reportLoading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
      {reportLoading ? 'Gerando…' : 'Relatório do clube'}
    </button>
  );

  const avisoJogo = alerta && (quadro
    ? <span className="tp-titulo" style={{ fontFamily: tk.fonteTitulo, fontWeight: 700, color: VERMELHO, fontSize: isMobile ? '1.3rem' : '1.7rem', transform: 'rotate(-3deg)', borderBottom: `3px solid ${VERMELHO}`, lineHeight: 1.05, padding: '0 4px 2px', whiteSpace: 'nowrap' }}>{alerta}</span>
    : <span style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: VERMELHO, color: '#fff', fontWeight: 700, fontSize: '0.8rem', borderRadius: estilo === 'placar' ? 2 : 99, padding: '0.32rem 0.8rem', textTransform: estilo === 'placar' ? 'uppercase' : 'none', letterSpacing: estilo === 'placar' ? '0.04em' : 0, whiteSpace: 'nowrap' }}>{alerta}</span>);

  // ------------------------------------------------ cabeçalho
  let cabecalho;
  if (quadro) {
    cabecalho = (
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '0.6rem' : '1rem', flexDirection: isMobile ? 'column' : 'row', paddingBottom: isMobile ? '0.6rem' : '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0, flex: 1 }}>
          <Escudo clube={clube} logoUrl={logoUrl} tamanho={isMobile ? 44 : 54} borda={colors.border} />
          <div style={{ minWidth: 0 }}>
            <h1 className="tp-titulo" style={{ margin: 0, fontFamily: tk.fonteTitulo, fontWeight: 700, fontSize: isMobile ? '2rem' : '2.6rem', lineHeight: 0.95, color: colors.primary }}>
              Semana {numSemana}
            </h1>
            <p style={{ margin: '0.3rem 0 0', fontSize: isMobile ? '0.8rem' : '0.9rem', color: colors.textSecondary }}>
              {clube?.name ? `${clube.name} · ` : ''}{dataHoje} · {ola}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {avisoJogo}
          {relatorio}
        </div>
      </div>
    );
  } else {
    cabecalho = (
      <>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: `${tk.raio}px ${tk.raio}px 0 0`, background: tk.capa === 'clube' ? `linear-gradient(115deg, ${darkenHex(colors.primary, 0.42)} 0%, ${darkenHex(colors.primary, 0.2)} 60%, ${darkenHex(colors.primary, 0.05)} 100%)` : tk.capa === 'gramado' ? '#1d6b37' : '#0b0b0c', flexShrink: 0 }}>
          <FundoCapa tipo={tk.capa} primaria={colors.primary} colors={colors} />
          {estilo === 'placar' && <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: colors.primary }} />}
          <div style={{ position: 'relative', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '0.7rem' : '1rem', padding: isMobile ? '1rem' : '1.05rem 1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', minWidth: 0, flex: 1 }}>
              <Escudo clube={clube} logoUrl={logoUrl} tamanho={isMobile ? 46 : 58} />
              <div style={{ minWidth: 0 }}>
                <h1 className="tp-titulo" style={{ margin: 0, fontSize: isMobile ? '1.45rem' : '1.85rem', lineHeight: 1.05, color: '#fff', fontWeight: estilo === 'placar' ? 700 : 800, letterSpacing: estilo === 'placar' ? '0.02em' : '-0.03em' }}>{ola}</h1>
                <p style={{ margin: '0.25rem 0 0', fontSize: isMobile ? '0.8rem' : '0.9rem', color: 'rgba(255,255,255,.86)' }}>{clube?.name ? `${clube.name} · ` : ''}{dataHoje}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>{avisoJogo}{relatorio}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', padding: isMobile ? '0.8rem 1rem 0.4rem' : '0.8rem 1.25rem 0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', flexWrap: 'wrap' }}>
            <Titulo ctx={ctx} tamanho="1.15rem">Semana {numSemana}</Titulo>
            <span className="tp-num" style={{ fontSize: '0.8rem', color: colors.textSecondary }}>{faixaSemana}</span>
          </div>
          <LinkAcao ctx={ctx} onClick={onAbrir}>Abrir a semana</LinkAcao>
        </div>
      </>
    );
  }

  // ------------------------------------------------ semana
  const visiveis = isMobile ? dias.filter((d) => d.data >= hojeStr) : dias;
  const separador = quadro ? `2px dashed ${isDark ? '#4a5157' : '#C3C8CC'}` : `1px solid ${colors.border}`;
  const semana = (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(7, minmax(0,1fr))', gridTemplateRows: isMobile ? undefined : 'minmax(0,1fr)', borderTop: separador, flex: isMobile ? undefined : 1, minHeight: 0, margin: quadro ? 0 : (isMobile ? '0 1rem' : '0 1.25rem') }}>
      {visiveis.map((d, idx) => {
        const eHoje = d.data === hojeStr;
        const jogo = d.periodos.find((p) => p.tipo === 'match');
        const folga = d.periodos.length > 0 && d.periodos.every((p) => p.tipo === 'rest');
        const atividades = d.periodos.filter((p) => p.tipo === 'training').flatMap((p) => p.atividades.map((a) => ({ ...a, periodo: d.periodos.length > 1 ? p.periodo : null })));
        const avaliacao = d.periodos.some((p) => p.tipo === 'assessment');
        const mostrar = atividades.slice(0, isMobile ? 3 : porDia);
        const resto = atividades.length - mostrar.length;
        const ultimo = idx === visiveis.length - 1;
        const passado = d.data < hojeStr;
        return (
          <button key={d.data} type="button" className="tp-dia" onClick={() => onDia(d.data)} aria-label={`Abrir ${DIAS_LONGOS[d.i]} ${ddmm(d.data)}`}
            style={{
              display: 'flex', flexDirection: 'column', gap: isMobile ? 6 : 7, textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: colors.text,
              padding: isMobile ? '0.6rem 0.15rem' : '0.6rem 0.65rem 0.5rem', minWidth: 0, minHeight: 0, overflow: 'hidden',
              background: eHoje ? (quadro ? `repeating-linear-gradient(0deg, transparent 0 25px, ${colors.primary}14 25px 26px)` : `${colors.primary}0F`) : 'transparent',
              border: 'none', borderRight: !isMobile && !ultimo ? separador : 'none', borderBottom: isMobile && !ultimo ? separador : 'none', borderRadius: 0,
              opacity: passado && !isMobile ? 0.72 : 1,
            }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%', gap: 6 }}>
              <span className="tp-titulo" style={{ fontFamily: tk.fonteTitulo, fontWeight: tk.pesoTitulo, textTransform: tk.caixaTitulo, fontSize: quadro ? '1.3rem' : '0.95rem', color: eHoje ? colors.primary : colors.text, lineHeight: 1.05, whiteSpace: 'nowrap' }}>
                {DIAS_CURTOS[d.i]}{eHoje ? ' · hoje' : ''}
              </span>
              <span className="tp-num" style={{ fontSize: '0.74rem', color: colors.textSecondary, fontFamily: quadro ? "'Red Hat Mono', ui-monospace, monospace" : 'inherit' }}>{ddmm(d.data)}</span>
            </span>
            {loading ? (
              <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>…</span>
            ) : jogo ? (
              <span style={{ border: `2.5px solid ${VERMELHO}`, borderRadius: quadro ? 3 : Math.min(tk.raio, 6), padding: '0.45rem 0.5rem', color: VERMELHO, transform: quadro ? 'rotate(-2deg)' : 'none', alignSelf: 'stretch', marginTop: 2 }}>
                <span className="tp-titulo" style={{ display: 'block', fontFamily: tk.fonteTitulo, fontWeight: tk.pesoTitulo, textTransform: 'uppercase', fontSize: quadro ? '1.35rem' : '0.9rem', lineHeight: 1 }}>Jogo!</span>
                <span style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>× {jogo.adversario || 'adversário a definir'}</span>
              </span>
            ) : folga ? (
              <span className="tp-titulo" style={{ fontFamily: quadro ? tk.fonteTitulo : 'inherit', fontWeight: 400, color: colors.textMuted, fontSize: quadro ? '1.2rem' : '0.82rem', marginTop: isMobile ? 0 : 14, alignSelf: isMobile ? 'flex-start' : 'center', textTransform: 'none' }}>folga</span>
            ) : (
              <>
                {mostrar.map((a, k) => (
                  <span key={k} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: '0.8rem', lineHeight: 1.25, minWidth: 0 }}>
                    <Ima cor={COR_PILAR[a.pilar] || colors.textMuted} tamanho={quadro ? 15 : 12} style={{ marginTop: quadro ? 1 : 2 }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontWeight: 600 }} title={NOME_PILAR[a.pilar] || ''}>{a.titulo}</span>
                      <span className="tp-num" style={{ fontSize: '0.72rem', color: colors.textSecondary }}>{a.minutos ? `${a.minutos} min` : ''}{a.periodo ? `${a.minutos ? ' · ' : ''}${rotuloPeriodo(a.periodo)}` : ''}</span>
                    </span>
                  </span>
                ))}
                {resto > 0 && <span style={{ fontSize: '0.74rem', color: colors.textSecondary }}>+{resto} atividade{resto > 1 ? 's' : ''}</span>}
                {avaliacao && <span style={{ fontSize: '0.76rem', fontWeight: 600, color: colors.textSecondary }}>Avaliação</span>}
                {!atividades.length && !avaliacao && (
                  <span className={quadro ? 'tp-titulo' : undefined} style={{ fontFamily: quadro ? tk.fonteTitulo : 'inherit', fontWeight: 400, fontSize: quadro ? '1.05rem' : '0.78rem', color: colors.textMuted, textTransform: 'none' }}>
                    {passado ? '—' : quadro ? '+ a planejar' : 'a planejar'}
                  </span>
                )}
              </>
            )}
            {d.minutos > 0 && (
              <span className="tp-titulo tp-num" style={{ marginTop: 'auto', alignSelf: isMobile ? 'flex-end' : 'flex-start', fontFamily: quadro ? tk.fonteTitulo : 'inherit', fontWeight: 700, fontSize: quadro ? '1.25rem' : '0.82rem', color: quadro ? colors.primary : colors.text, textTransform: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {quadro ? `= ${d.minutos}'` : `${d.minutos} min`}{quadro && eHoje && <ArrowRight size={18} />}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // ------------------------------------------------ rodapé: legenda + atalhos
  const rodape = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', borderTop: quadro ? separador : `1px solid ${colors.border}`, padding: quadro ? '0.65rem 0 0' : (isMobile ? '0.75rem 1rem 1rem' : '0.7rem 1.25rem 0.85rem'), flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', fontSize: '0.74rem', color: colors.textSecondary }}>
        {Object.keys(COR_PILAR).map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ima cor={COR_PILAR[k]} tamanho={10} />{NOME_PILAR[k]}</span>
        ))}
      </div>
      <nav aria-label="Atalhos" style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? '1fr 1fr' : undefined, gap: isMobile ? 6 : 8, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
        {atalhos.map((a, i) => <AtalhoCompacto key={a.key} ctx={ctx} {...a} principal={i === 0} largo={isMobile && i === 0 && atalhos.length % 2 === 1} />)}
      </nav>
    </div>
  );

  if (quadro) {
    return (
      <section aria-label="Quadro da semana" style={{ position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 0, flex: isMobile ? undefined : 1, marginBottom: isMobile ? 6 : 14 }}>
        <div style={{
          position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
          backgroundColor: colors.surface,
          backgroundImage: isDark ? 'none' : 'linear-gradient(160deg, rgba(255,255,255,.9) 0%, rgba(255,255,255,0) 35%, rgba(0,0,0,.025) 100%)',
          border: `${isMobile ? 6 : 9}px solid ${colors.border}`, borderRadius: 7,
          boxShadow: `inset 0 0 0 1px ${isDark ? 'rgba(0,0,0,.4)' : 'rgba(0,0,0,.08)'}, inset 0 2px 6px rgba(0,0,0,.06), 0 14px 26px -18px rgba(0,0,0,.6)`,
          padding: isMobile ? '0.85rem 0.8rem 0.8rem' : '1rem 1.4rem 0.8rem',
        }}>
          {cabecalho}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -2, marginBottom: 4 }}>
            <span className="tp-num" style={{ fontSize: '0.78rem', color: colors.textSecondary, marginRight: 'auto' }}>{faixaSemana}</span>
            <LinkAcao ctx={ctx} onClick={onAbrir}>Abrir a semana</LinkAcao>
          </div>
          {semana}
          {rodape}
        </div>
        {/* calha do quadro com os pincéis e o apagador */}
        {!isMobile && (
          <div aria-hidden="true" style={{ position: 'absolute', left: '18%', right: '18%', bottom: -13, height: 13, borderRadius: '0 0 4px 4px', background: isDark ? '#3d444b' : 'linear-gradient(#a7aeb5, #858c93)', boxShadow: '0 4px 8px -4px rgba(0,0,0,.5)' }}>
            <span style={{ position: 'absolute', left: '12%', top: -6, width: 64, height: 9, borderRadius: 5, background: '#1A3E9C', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.3)' }} />
            <span style={{ position: 'absolute', left: 'calc(12% + 74px)', top: -6, width: 64, height: 9, borderRadius: 5, background: VERMELHO, boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.3)' }} />
            <span style={{ position: 'absolute', left: 'calc(12% + 148px)', top: -6, width: 64, height: 9, borderRadius: 5, background: '#222', boxShadow: 'inset 0 -2px 0 rgba(255,255,255,.15)' }} />
            <span style={{ position: 'absolute', right: '14%', top: -12, width: 70, height: 15, borderRadius: 3, background: 'linear-gradient(#3a3a3a 0 45%, #d8d2c4 45%)', boxShadow: '0 1px 2px rgba(0,0,0,.4)' }} />
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Semana" style={cartaoStyle(ctx, { display: 'flex', flexDirection: 'column', padding: 0, flex: isMobile ? undefined : 1, minHeight: 0 })}>
      {cabecalho}
      {semana}
      {rodape}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Hoje (do "Vestiário"): o treino do dia, atividade a atividade
// ---------------------------------------------------------------------------------------------

function CartaoHoje({ ctx, hoje, nextSessions, hojeStr, onAbrir, max = 4 }) {
  const { colors, tk } = ctx;
  const treinos = (hoje?.periodos || []).filter((p) => p.tipo === 'training' && p.atividades.length);
  const jogoHoje = (hoje?.periodos || []).find((p) => p.tipo === 'match');
  const proximo = nextSessions.find((s) => String(s.date).split('T')[0] > hojeStr && s.session_type === 'training');
  return (
    <section aria-label="Treino de hoje" style={cartaoStyle(ctx, { display: 'flex', flexDirection: 'column', transform: ctx.estilo === 'prancheta' && !ctx.isMobile ? 'rotate(-0.4deg)' : 'none' })}>
      <Prende ctx={ctx} />
      {treinos.length ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: '0.4rem' }}>
            <div>
              <Titulo ctx={ctx} tamanho="1.1rem">Treino de hoje{treinos.length === 1 && treinos[0].periodo ? ` · ${rotuloPeriodo(treinos[0].periodo)}` : ''}</Titulo>
              <p className="tp-num" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: colors.textSecondary }}>{hoje.minutos} minutos · {treinos.reduce((s, p) => s + p.atividades.length, 0)} atividades</p>
            </div>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {treinos.flatMap((p) => p.atividades.map((a, k) => ({ ...a, k: `${p.id}-${k}`, periodo: treinos.length > 1 ? p.periodo : null }))).slice(0, max).map((a, k, arr) => (
              <li key={a.k} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 10, alignItems: 'start', padding: '0.32rem 0', borderBottom: k < arr.length - 1 ? `1px ${ctx.estilo === 'prancheta' ? 'dashed' : 'solid'} ${colors.border}` : 'none' }}>
                <Ima cor={COR_PILAR[a.pilar] || colors.textMuted} tamanho={12} style={{ marginTop: 3 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: '0.86rem', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titulo}</span>
                  <span style={{ display: 'block', fontSize: '0.74rem', lineHeight: 1.35, color: colors.textSecondary }}>{[a.bloco, NOME_PILAR[a.pilar], a.periodo && rotuloPeriodo(a.periodo)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="tp-num" style={{ fontWeight: 600, fontSize: '0.8rem', color: colors.textSecondary }}>{a.minutos ? `${a.minutos}'` : ''}</span>
              </li>
            ))}
          </ol>
          <div style={{ marginTop: 'auto', paddingTop: '0.4rem' }}>
            <LinkAcao ctx={ctx} onClick={() => onAbrir(hojeStr)}>Abrir o treino</LinkAcao>
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
    <svg viewBox="0 0 200 110" role="img" aria-label={`Formação ${formacao || '4-3-3'}`} style={{ width: '100%', height: 'auto', maxHeight: ctx.isMobile ? 'none' : 92, display: 'block', borderRadius: Math.min(ctx.tk.raio, 8), backgroundColor: quadro ? 'transparent' : '#1f7a3f' }}>
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
        <Prende ctx={ctx} cor={VERMELHO} />
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
    <section aria-label="Próximo jogo" style={cartaoStyle(ctx, { display: 'flex', flexDirection: 'column', gap: '0.5rem' })}>
      <Prende ctx={ctx} cor={VERMELHO} />
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

function CartaoPlantel({ ctx, total, disponiveis, injuries, podeVer, onPlantel, max = 2 }) {
  const { colors, tk, estilo } = ctx;
  const n = Math.min(total, 30);
  const noDm = Math.min(injuries.length, n);
  return (
    <section aria-label="Plantel" style={cartaoStyle(ctx, { display: 'flex', flexDirection: 'column', transform: ctx.estilo === 'prancheta' && !ctx.isMobile ? 'rotate(0.35deg)' : 'none' })}>
      <Prende ctx={ctx} cor="#555" />
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
          {injuries.slice(0, max).map((inj, k, arr) => (
            <li key={inj.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '0.45rem 0', borderBottom: k < arr.length - 1 ? `1px ${estilo === 'prancheta' ? 'dashed' : 'solid'} ${colors.border}` : 'none' }}>
              <Ima cor={VERMELHO} tamanho={12} style={{ marginTop: 4 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.3 }}>{inj.athlete_name}</span>
                <span style={{ display: 'block', fontSize: '0.74rem', lineHeight: 1.35, color: colors.textSecondary }}>{[inj.injury_type, inj.body_part].filter(Boolean).join(' · ')}{inj.expected_return ? ` · volta ${ddmm(inj.expected_return)}` : ''}</span>
              </span>
            </li>
          ))}
          {injuries.length > max && <li style={{ fontSize: '0.78rem', color: colors.textSecondary, paddingTop: 4 }}>+{injuries.length - max} no departamento médico</li>}
        </ul>
      )}
      {!podeVer && <span style={{ marginTop: 'auto' }} />}
      {total === 0 && podeVer && <div style={{ marginTop: '0.8rem' }}><LinkAcao ctx={ctx} onClick={onPlantel}>Cadastrar atletas</LinkAcao></div>}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Atalhos compactos no pé do quadro: etiquetas de pincel (Quadro tático), placas pretas (Placar),
// pastilhas coloridas (Clássico e Gramado). O primeiro (Programação) vai na cor do clube.
// ---------------------------------------------------------------------------------------------

const COR_ATALHO = { semana: null, pessoas: '#1e3a8a', barras: '#9a3412', campo: '#0f172a', alvo: '#5b21b6' };

function AtalhoCompacto({ ctx, label, icon: Icon, ilu, onClick, principal, largo }) {
  const { colors, tk, estilo } = ctx;
  const base = { gridColumn: largo ? 'span 2' : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0.48rem 0.85rem', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 0 };
  if (estilo === 'prancheta') {
    return (
      <button type="button" onClick={onClick} className="tp-cartao-link"
        style={{ ...base, borderRadius: 3, backgroundColor: principal ? colors.primary : 'transparent', color: principal ? colors.primaryText : colors.text, border: `2px solid ${principal ? colors.primary : colors.text}`, fontWeight: 700 }}>
        <Icon size={16} />{label}
      </button>
    );
  }
  if (estilo === 'placar') {
    return (
      <button type="button" onClick={onClick} className="tp-cartao-link"
        style={{ ...base, borderRadius: 2, backgroundColor: '#0b0b0c', color: '#f5f5f4', border: 'none', borderBottom: `3px solid ${colors.primary}`, fontFamily: tk.fonteTitulo, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.95rem', fontWeight: 700 }}>
        <Icon size={15} />{label}
      </button>
    );
  }
  const fundo = principal ? colors.primary : (COR_ATALHO[ilu] || colors.primary);
  return (
    <button type="button" onClick={onClick} className="tp-cartao-link"
      style={{ ...base, borderRadius: Math.min(tk.raio, 10), backgroundColor: fundo, color: principal ? colors.primaryText : '#fff', border: 'none' }}>
      <Icon size={16} />{label}
    </button>
  );
}

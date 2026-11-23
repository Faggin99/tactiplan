import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookmarkCheck, CopyPlus, Pencil, Search, Trash2, CalendarDays, Check, ChevronDown, ChevronRight, Paperclip } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useCan } from '../hooks/useCan';
import { useIsMobile } from '../hooks/useIsMobile';
import { trainingService } from '../services/trainingService';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { COR_PILAR, NOME_PILAR } from '../lib/estilos';
import { ehBlocoGoleiro, rotuloPeriodo, periodoEfetivo } from '../lib/periodos';
import { notify } from '../lib/notify';

// SESSÕES SALVAS (21/11/2026): o treino inteiro de um dia (os 6 blocos) guardado com um nome para repetir.
// Salvar: Programação › clique no dia (resumo) › "Salvar sessão" — ou botão direito no dia.
// Aqui: ver o que tem em cada sessão, usar em um dia (escolhe a data e o período), renomear e excluir.
// API: /api/treinos-modelo (GET, PATCH, DELETE, POST /:id/aplicar).

const ORDEM_PILAR = ['tatico', 'fisico', 'tecnico', 'mental'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dataLocal = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
const rotuloData = (iso) => { const d = dataLocal(iso); return `${DIAS[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const dataCurta = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };

// Semana ISO "AAAA-SS" (mesma conta da Programação)
function semanaISO(iso) {
  const d = dataLocal(iso);
  const dow = d.getDay() || 7;
  const quinta = new Date(d); quinta.setDate(d.getDate() + (4 - dow));
  const inicio = new Date(quinta.getFullYear(), 0, 1);
  const n = Math.ceil((((quinta - inicio) / 86400000) + 1) / 7);
  return `${quinta.getFullYear()}-${String(n).padStart(2, '0')}`;
}

const atividadePreenchida = (a) => !!a && (a.title_id || a.contents?.length || Number(a.duration_minutes) > 0 || String(a.description || '').trim());
const contarAtividades = (s) => (s?.blocks || []).filter((b) => atividadePreenchida(b.activity)).length;
const ROTULO_TIPO = { match: 'jogo', rest: 'descanso', assessment: 'avaliação' };

export function SessoesSalvasPage() {
  const { colors } = useTheme();
  const { can } = useCan();
  const isMobile = useIsMobile();
  const podeEditar = can('training:edit');
  const [modelos, setModelos] = useState(null);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState('');
  const [usando, setUsando] = useState(null); // sessão salva escolhida para "Usar em um dia"
  const [aberta, setAberta] = useState(null); // linha aberta (detalhe)

  const carregar = () => trainingService.listarModelos()
    .then((l) => { setModelos(l); setErro(null); })
    .catch((e) => { setModelos([]); setErro(e.message || 'Não foi possível carregar as sessões salvas.'); });
  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return modelos || [];
    return (modelos || []).filter((m) => m.nome.toLowerCase().includes(t)
      || m.blocos.some((b) => `${b.titulo || ''} ${b.conteudo || ''}`.toLowerCase().includes(t)));
  }, [modelos, busca]);

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: isMobile ? '1rem' : '1.5rem 1.75rem 2.5rem' }}>
      <header style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: '1rem', flexDirection: isMobile ? 'column' : 'row', marginBottom: '1.25rem' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: isMobile ? '1.4rem' : '1.65rem', fontWeight: 700, color: colors.text, display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
            Sessões salvas
            {modelos && modelos.length > 0 && <span style={{ fontSize: '0.95rem', fontWeight: 500, color: colors.textSecondary }}>{modelos.length}</span>}
          </h1>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem', color: colors.textSecondary, maxWidth: '62ch', lineHeight: 1.5 }}>
            Treinos completos guardados com um nome para usar de novo em outro dia.
            Para salvar, abra o dia na Programação e toque em <strong style={{ color: colors.text, fontWeight: 600 }}>Salvar sessão</strong>.
          </p>
        </div>
        {modelos && modelos.length > 3 && (
          <label style={{ position: 'relative', display: 'block', width: isMobile ? '100%' : 280, flexShrink: 0 }}>
            <span className="sr-only">Buscar sessão</span>
            <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: colors.textSecondary }} />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou atividade"
              style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.75rem 0.55rem 2.1rem', borderRadius: '0.5rem', border: `1px solid ${colors.border}`, backgroundColor: colors.surface, color: colors.text, fontSize: '0.88rem', fontFamily: 'inherit' }} />
          </label>
        )}
      </header>

      {modelos === null ? (
        <p style={{ color: colors.textSecondary, fontSize: '0.9rem' }}>Carregando…</p>
      ) : erro ? (
        <p role="alert" style={{ color: '#dc2626', fontSize: '0.9rem' }}>{erro}</p>
      ) : modelos.length === 0 ? (
        <Vazio colors={colors} />
      ) : filtrados.length === 0 ? (
        <p style={{ color: colors.textSecondary, fontSize: '0.9rem' }}>Nenhuma sessão com "{busca}".</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtrados.map((m) => (
            <LinhaSessao key={m.id} m={m} colors={colors} isMobile={isMobile} podeEditar={podeEditar}
              aberta={aberta === m.id} onAbrir={() => setAberta(aberta === m.id ? null : m.id)}
              onUsar={() => setUsando(m)} onMudou={carregar} />
          ))}
        </ul>
      )}

      {usando && <UsarEmUmDia modelo={usando} onClose={() => setUsando(null)} />}
    </div>
  );
}

function Vazio({ colors }) {
  const navigate = useNavigate();
  return (
    <div style={{ border: `1px dashed ${colors.border}`, borderRadius: '0.75rem', padding: '2.25rem 1.5rem', textAlign: 'center', color: colors.textSecondary }}>
      <BookmarkCheck size={28} strokeWidth={1.5} aria-hidden="true" style={{ color: colors.primary }} />
      <p style={{ margin: '0.6rem 0 0.3rem', fontWeight: 600, color: colors.text }}>Nenhuma sessão salva ainda</p>
      <p style={{ margin: '0 auto 1rem', fontSize: '0.88rem', maxWidth: '46ch', lineHeight: 1.5 }}>
        Monte um treino na Programação, abra o dia e use <strong style={{ color: colors.text }}>Salvar sessão</strong>. Ele aparece aqui para repetir quando quiser.
      </p>
      <Button size="sm" onClick={() => navigate('/training')} icon={<CalendarDays size={15} />}>Ir para a Programação</Button>
    </div>
  );
}

// Uma sessão = UMA LINHA na largura toda (23/11/2026: com muitas sessões os cartões ficavam gigantes e espremidos no
// centro). Fechada: nome + resumo · os 6 blocos lado a lado (conteúdo e minutos) · Usar. Clique abre o detalhe:
// cada bloco numa coluna com título, descrição e as mídias salvas junto.
const ABREV = { 'Ativação': 'Ativ.', 'Atividade 1': 'A1', 'Atividade 2': 'A2', 'Atividade 3': 'A3', 'Atividade 4': 'A4', 'Treino de goleiro': 'Gol' };

function LinhaSessao({ m, colors, isMobile, podeEditar, aberta, onAbrir, onUsar, onMudou }) {
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(m.nome);
  const [apagando, setApagando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const pilares = useMemo(() => {
    const t = {};
    for (const b of m.blocos) {
      if (!b.pilar || ehBlocoGoleiro(b.nome)) continue;
      t[b.pilar] = (t[b.pilar] || 0) + (m.minutos ? b.minutos : 1);
    }
    const total = Object.values(t).reduce((a, v) => a + v, 0);
    return total ? ORDEM_PILAR.filter((p) => t[p]).map((p) => ({ p, pct: (t[p] / total) * 100 })) : [];
  }, [m]);

  const salvarNome = async () => {
    const n = nome.trim();
    if (!n || n === m.nome) { setRenomeando(false); setNome(m.nome); return; }
    setOcupado(true);
    try { await trainingService.renomearModelo(m.id, n); setRenomeando(false); onMudou(); }
    catch (e) { notify.error(e.message || 'Não foi possível renomear.'); }
    finally { setOcupado(false); }
  };
  const excluir = async () => {
    setOcupado(true);
    try { await trainingService.excluirModelo(m.id); notify.success(`Sessão "${m.nome}" excluída.`); onMudou(); }
    catch (e) { notify.error(e.message || 'Não foi possível excluir.'); setOcupado(false); }
  };

  const iconBtn = { border: 'none', background: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 6, borderRadius: 6, display: 'inline-flex' };
  const meta = [
    `${m.atividades} ${m.atividades === 1 ? 'atividade' : 'atividades'}`,
    m.minutos ? `${m.minutos} min` : null,
    m.goleiro ? `+${m.goleiro}′ gol` : null,
    m.midias ? `${m.midias} ${m.midias === 1 ? 'mídia' : 'mídias'}` : null,
  ].filter(Boolean).join(' · ');
  const textoBloco = (b) => b.conteudo || b.titulo || (b.descricao ? b.descricao.slice(0, 40) : '');

  return (
    <li style={{ backgroundColor: colors.surface, border: `1px solid ${aberta ? colors.primary : colors.border}`, borderRadius: '0.7rem', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(200px, 1.1fr) minmax(0, 3.4fr) auto', alignItems: 'center', gap: isMobile ? '0.6rem' : '1rem', padding: '0.7rem 0.9rem' }}>
        {/* nome + resumo (clique abre/fecha) */}
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {renomeando ? (
            <form onSubmit={(e) => { e.preventDefault(); salvarNome(); }} style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0 }}>
              <input autoFocus value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} aria-label="Nome da sessão"
                onKeyDown={(e) => { if (e.key === 'Escape') { setRenomeando(false); setNome(m.nome); } }}
                style={{ flex: 1, minWidth: 0, padding: '0.35rem 0.55rem', borderRadius: 6, border: `1px solid ${colors.primary}`, backgroundColor: colors.background, color: colors.text, fontSize: '0.92rem', fontWeight: 600, fontFamily: 'inherit' }} />
              <button type="submit" disabled={ocupado} aria-label="Salvar nome" style={{ ...iconBtn, color: colors.primary }}><Check size={18} /></button>
            </form>
          ) : (
            <button type="button" onClick={onAbrir} aria-expanded={aberta}
              style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: colors.text }}>
              {aberta ? <ChevronDown size={16} style={{ flexShrink: 0 }} /> : <ChevronRight size={16} style={{ flexShrink: 0 }} />}
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
                {/* treino de onde a sessão foi salva (23/11/2026) */}
                {m.origem_data && (
                  <span title="Data do treino de onde a sessão foi salva" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', fontWeight: 600, color: colors.text, marginTop: 1 }}>
                    <CalendarDays size={12} aria-hidden="true" style={{ color: colors.primary, flexShrink: 0 }} />
                    Treino de {rotuloData(m.origem_data)}{m.origem_periodo ? ` · ${rotuloPeriodo(m.origem_periodo)}` : ''}
                  </span>
                )}
                <span style={{ display: 'block', fontSize: '0.76rem', color: colors.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{meta}</span>
                {pilares.length > 0 && (
                  <span role="img" aria-label={pilares.map((x) => `${NOME_PILAR[x.p]} ${Math.round(x.pct)}%`).join(', ')} style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', gap: 2, marginTop: 5, maxWidth: 220 }}>
                    {pilares.map((x) => <span key={x.p} style={{ width: `${x.pct}%`, backgroundColor: COR_PILAR[x.p] }} />)}
                  </span>
                )}
              </span>
            </button>
          )}
        </div>

        {/* os 6 blocos numa faixa (fechado) */}
        {!isMobile && (
          <button type="button" onClick={onAbrir} tabIndex={-1} aria-hidden="true"
            style={{ display: 'grid', gridTemplateColumns: `repeat(${m.blocos.length || 6}, minmax(0, 1fr))`, gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minWidth: 0 }}>
            {m.blocos.map((b) => {
              const t = textoBloco(b);
              return (
                <span key={b.ordem} title={`${b.nome}${t ? ` · ${t}` : ''}${b.minutos ? ` · ${b.minutos}′` : ''}`}
                  style={{ minWidth: 0, padding: '0.3rem 0.45rem', borderRadius: 6, backgroundColor: t ? colors.background : 'transparent', border: t ? 'none' : `1px dashed ${colors.border}`, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 4, fontSize: '0.66rem', color: colors.textSecondary }}>
                    <span>{ABREV[b.nome] || b.nome}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {b.minutos ? `${b.minutos}′` : ''}
                      {b.midias?.length > 0 && <><Paperclip size={10} aria-label={`${b.midias.length} mídias`} />{b.midias.length}</>}
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: '0.78rem', fontWeight: 600, color: t ? colors.text : colors.textMuted }}>
                    {b.pilar && <i aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: COR_PILAR[b.pilar], flexShrink: 0 }} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t || '—'}</span>
                  </span>
                </span>
              );
            })}
          </button>
        )}

        {/* ações */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          {apagando ? (
            <>
              <span style={{ fontSize: '0.8rem', color: colors.text, marginRight: 4 }}>Excluir?</span>
              <Button size="sm" variant="secondary" onClick={() => setApagando(false)} disabled={ocupado}>Não</Button>
              <Button size="sm" variant="danger" onClick={excluir} disabled={ocupado}>Excluir</Button>
            </>
          ) : (
            <>
              {podeEditar && !renomeando && (
                <>
                  <button type="button" onClick={() => setRenomeando(true)} title="Renomear" aria-label={`Renomear ${m.nome}`} style={iconBtn}><Pencil size={16} /></button>
                  <button type="button" onClick={() => setApagando(true)} title="Excluir" aria-label={`Excluir ${m.nome}`} style={iconBtn}><Trash2 size={16} /></button>
                </>
              )}
              {podeEditar && <Button size="sm" onClick={onUsar} icon={<CopyPlus size={15} />}>Usar</Button>}
            </>
          )}
        </div>
      </div>

      {aberta && (
        <div style={{ borderTop: `1px solid ${colors.border}`, padding: '0.8rem 0.9rem 0.9rem', backgroundColor: colors.background }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${m.blocos.length || 6}, minmax(0, 1fr))`, gap: '0.6rem' }}>
            {m.blocos.map((b) => {
              const vazio = !(b.titulo || b.conteudo || b.minutos || b.descricao);
              return (
                <div key={b.ordem} style={{ minWidth: 0, backgroundColor: colors.surface, border: `1px ${vazio ? 'dashed' : 'solid'} ${colors.border}`, borderRadius: 8, padding: '0.55rem 0.65rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: colors.textSecondary }}>
                    <span>{b.nome}</span><span style={{ fontWeight: 700, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{b.minutos ? `${b.minutos}′` : ''}</span>
                  </div>
                  {vazio ? <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>vazio</span> : (
                    <>
                      {b.conteudo && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.84rem', fontWeight: 700, color: colors.text }}>
                        {b.pilar && <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: COR_PILAR[b.pilar], flexShrink: 0 }} />}{b.conteudo}</span>}
                      {b.titulo && <span style={{ fontSize: '0.8rem', color: colors.text }}>{b.titulo}</span>}
                      {b.descricao && <span style={{ fontSize: '0.75rem', color: colors.textSecondary, lineHeight: 1.4, whiteSpace: 'pre-line', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.descricao}</span>}
                    </>
                  )}
                  {b.midias?.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 4, marginTop: 2 }}>
                      {b.midias.map((md, k) => (
                        <a key={k} href={md.url} target="_blank" rel="noreferrer" title={md.nome}
                          style={{ display: 'block', aspectRatio: '4 / 3', borderRadius: 5, overflow: 'hidden', backgroundColor: colors.background, border: `1px solid ${colors.border}` }}>
                          {md.tipo === 'image'
                            ? <img src={md.url} alt={md.nome || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '0.64rem', fontWeight: 700, color: colors.textSecondary }}>{md.tipo === 'video' ? 'VÍDEO' : 'ARQUIVO'}</span>}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: '0.6rem', fontSize: '0.74rem', color: colors.textMuted }}>
            {m.origem_data ? `Do treino de ${rotuloData(m.origem_data)}${m.origem_periodo ? ` (${rotuloPeriodo(m.origem_periodo)})` : ''} · ` : ''}
            {m.criado_por ? `Salva por ${m.criado_por}` : 'Salva'}{m.created_at ? ` em ${dataCurta(m.created_at)}` : ''}
          </div>
        </div>
      )}
    </li>
  );
}

// Janela "Usar em um dia": escolhe a data (e o período, se o dia tiver mais de um treino), mostra se o treino
// já tem atividades (substitui) e aplica. Dia ainda não criado no banco: cria a semana antes.
function UsarEmUmDia({ modelo, onClose }) {
  const { colors } = useTheme();
  const { selectedClub } = useClub();
  const navigate = useNavigate();
  const [data, setData] = useState(hojeISO());
  const [dia, setDia] = useState(null); // { sessao (1º período/dia), periodos[] } | null carregando
  const [periodoId, setPeriodoId] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !selectedClub?.id) return;
    let vivo = true;
    setDia(null); setErro(null); setPeriodoId(null);
    trainingService.getMicrocycle(semanaISO(data), selectedClub.id).then(({ data: micro }) => {
      if (!vivo) return;
      const s = (micro?.sessions || []).find((x) => String(x.date).split('T')[0] === data) || { date: data, session_type: 'training', blocks: [] };
      const periodos = Array.isArray(s.periodos) && s.periodos.length > 1 ? s.periodos : [s];
      const treinos = periodos.filter((p) => (p.session_type || 'training') === 'training');
      setDia({ periodos, treinos });
      setPeriodoId(treinos[0] ? (treinos[0].id || 'novo') : null);
    }).catch(() => vivo && setErro('Não foi possível ler esse dia.'));
    return () => { vivo = false; };
  }, [data, selectedClub?.id]);

  const alvo = dia?.treinos.find((p) => (p.id || 'novo') === periodoId) || null;
  const ocupadas = contarAtividades(alvo);

  const aplicar = async () => {
    if (!alvo || ocupado) return;
    setOcupado(true); setErro(null);
    try {
      let sessionId = alvo.id;
      if (!sessionId) {
        const r = await trainingService.ensureMicrocycleStructure(semanaISO(data), selectedClub.id);
        sessionId = r.data?.sessions?.find((x) => String(x.date).split('T')[0] === data)?.id;
        if (!sessionId) throw new Error('Não foi possível criar o dia na Programação.');
      }
      await trainingService.aplicarModelo(modelo.id, sessionId, { substituir: ocupadas > 0 });
      setFeito(true);
    } catch (e) {
      setErro(e.message || 'Não foi possível usar a sessão.');
    } finally { setOcupado(false); }
  };

  const nomeTipo = dia && !dia.treinos.length ? ROTULO_TIPO[dia.periodos[0]?.session_type] || 'outro tipo' : null;
  const chip = (ativo) => ({ border: `1px solid ${ativo ? colors.primary : colors.border}`, backgroundColor: ativo ? `${colors.primary}18` : 'transparent', color: ativo ? colors.primary : colors.text, borderRadius: 999, padding: '0.3rem 0.8rem', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });

  return (
    <Modal isOpen onClose={onClose} title={feito ? 'Sessão aplicada' : `Usar "${modelo.nome}"`} size="sm"
      footer={feito ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
          <Button onClick={() => navigate(`/training?data=${data}`)} icon={<CalendarDays size={15} />}>Abrir na Programação</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={aplicar} disabled={!alvo || ocupado} icon={<CopyPlus size={15} />}>
            {ocupado ? 'Aplicando…' : ocupadas ? 'Substituir o treino' : 'Usar neste dia'}
          </Button>
        </div>
      )}>
      {feito ? (
        <p style={{ margin: 0, color: colors.text, lineHeight: 1.5 }}>
          O treino de <strong>{rotuloData(data)}</strong>{alvo && dia.treinos.length > 1 ? ` (${rotuloPeriodo(periodoEfetivo(alvo))})` : ''} foi preenchido com a sessão "{modelo.nome}". Dá para ajustar qualquer bloco na Programação.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.84rem', fontWeight: 600, color: colors.text }}>
            Dia
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} required
              style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.background, color: colors.text, fontSize: '0.92rem', fontFamily: 'inherit', colorScheme: 'light dark' }} />
            {/^\d{4}-\d{2}-\d{2}$/.test(data) && <span style={{ fontWeight: 400, color: colors.textSecondary, fontSize: '0.8rem' }}>{rotuloData(data)}{selectedClub?.name ? ` · ${selectedClub.name}` : ''}</span>}
          </label>

          {!dia && !erro && <p style={{ margin: 0, fontSize: '0.85rem', color: colors.textSecondary }}>Lendo o dia…</p>}

          {dia && dia.treinos.length > 1 && (
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: colors.text, marginBottom: 6 }}>Em qual treino?</div>
              <div role="radiogroup" aria-label="Período" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {dia.treinos.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={periodoId === p.id} onClick={() => setPeriodoId(p.id)} style={chip(periodoId === p.id)}>
                    {rotuloPeriodo(periodoEfetivo(p))}
                  </button>
                ))}
              </div>
            </div>
          )}

          {nomeTipo && (
            <p style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: colors.text, padding: '0.65rem 0.75rem', borderRadius: 8, backgroundColor: colors.background, border: `1px solid ${colors.border}` }}>
              Esse dia está marcado como <strong>{nomeTipo}</strong>. Para usar a sessão, mude o dia para treino na Programação (ou adicione um período de treino).
            </p>
          )}

          {alvo && ocupadas > 0 && (
            <p role="status" style={{ margin: 0, fontSize: '0.86rem', lineHeight: 1.5, color: colors.text, padding: '0.65rem 0.75rem', borderRadius: 8, border: '1px solid #f59e0b66', backgroundColor: 'rgba(245,158,11,0.10)' }}>
              Esse treino já tem {ocupadas} {ocupadas === 1 ? 'atividade' : 'atividades'}. Elas serão trocadas pelas da sessão; fotos e anexos continuam.
            </p>
          )}

          {erro && <p role="alert" style={{ margin: 0, fontSize: '0.85rem', color: '#dc2626' }}>{erro}</p>}
        </div>
      )}
    </Modal>
  );
}

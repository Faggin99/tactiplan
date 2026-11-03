// Análise do jogo em VÍDEO (/api/video-analise, migration 065). O treinador abre o arquivo do jogo no
// computador (o vídeo NÃO sobe ao servidor), escolhe o atleta no campo (escalação do jogo ou adversário) e
// marca o lance com a tag (clique ou teclas 1–9: 1º toque começa, 2º termina). Os lances ficam salvos no
// servidor; ao reabrir, escolhe-se o mesmo arquivo. Com o início de cada tempo marcado no vídeo, o lance
// sabe o minuto do jogo e "Gol"/"Cartão" podem ir para os eventos do jogo (o modal do jogo salva).
// Aba Scout: resumo por tag, nosso × adversário, atleta × tag, faixas de 15 min e CSV.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, Play, Pause, Trash2, Download, Flag, Plus, Check, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useTheme } from '../../contexts/ThemeContext';
import { videoAnaliseService } from '../../services/videoAnaliseService';
import { notify } from '../../lib/notify';
import { buildSlots } from '../../lib/formation';
import { minutoDoJogo, scout } from '../../lib/analiseVideo';

const relogio = (ms) => {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

// Evento do jogo que a tag gera (gol e cartões); null = a tag não vira evento
function eventoDaTag(nome, equipe) {
  const n = nome.toLowerCase();
  if (n.startsWith('gol')) return equipe === 'adversario' ? 'goal_conceded' : equipe === 'nosso' ? 'goal_scored' : null;
  if (equipe !== 'nosso') return null;
  if (n.includes('vermelho') || n.includes('expuls')) return 'red_card';
  if (n.includes('cartão') || n.includes('cartao') || n.includes('amarelo')) return 'yellow_card';
  return null;
}

const ehCampo = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export function VideoAnalysisModal({ isOpen, onClose, session, opponentName, players = [], formation, duration = 90, podeEditar = true, onLancarEvento }) {
  const { colors } = useTheme();
  const video = useRef(null);
  const fimDoPlay = useRef(null);
  const [aba, setAba] = useState('marcar');
  const [carregado, setCarregado] = useState(false);
  const [meta, setMeta] = useState(null);
  const [lances, setLances] = useState([]);
  const [tags, setTags] = useState([]);
  const [adversario, setAdversario] = useState([]);
  const [url, setUrl] = useState(null);
  const [arquivo, setArquivo] = useState('');
  const [agora, setAgora] = useState(0);
  const [dur, setDur] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [quem, setQuem] = useState(null); // { equipe, athlete_id?, adv_numero?, adv_nome? }
  const [aberto, setAberto] = useState(null); // { tag, inicio_ms } — lance começado, esperando o fim
  const [editandoTags, setEditandoTags] = useState(false);

  const atletas = useMemo(() => new Map(players.map((p) => [p.athlete_id, p.athlete?.name || p.name || 'Atleta'])), [players]);
  const camisa = (id) => { const p = players.find((x) => x.athlete_id === id); return p?.jersey_number ?? p?.athlete?.jersey_number ?? ''; };

  useEffect(() => {
    if (!isOpen || !session?.id) return undefined;
    setCarregado(false); setAberto(null); setQuem(null); setAba('marcar');
    videoAnaliseService.carregar(session.id)
      .then((r) => {
        setMeta(r.meta); setLances(r.lances || []); setTags(r.tags || []);
        const adv = (r.adversario || []).filter((p) => p.nome || p.numero != null);
        setAdversario(adv.length ? adv : Array.from({ length: 11 }, (_, i) => ({ numero: i + 1, nome: '' })));
        setCarregado(true);
      })
      .catch((e) => { notify.error(e.message || 'Não foi possível abrir a análise de vídeo.'); onClose(); });
    return undefined;
  }, [isOpen, session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // libera o arquivo da memória ao fechar/trocar
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  function abrirArquivo(f) {
    if (!f) return;
    if (url) URL.revokeObjectURL(url);
    setUrl(URL.createObjectURL(f));
    setArquivo(f.name);
  }

  async function salvarMeta(novo) {
    const m = { ...(meta || {}), ...novo };
    setMeta(m);
    if (!podeEditar) return;
    try { const r = await videoAnaliseService.salvarMeta(session.id, m); setMeta(r.meta); } catch (e) { notify.error(e.message || 'Não foi possível salvar.'); }
  }

  const ms = () => Math.round((video.current?.currentTime || 0) * 1000);
  const irPara = (t) => { if (video.current) video.current.currentTime = Math.max(0, t / 1000); };
  const tocar = () => { const v = video.current; if (!v) return; if (v.paused) v.play(); else v.pause(); };

  const marcarTag = useCallback(async (tag) => {
    if (!podeEditar || !url) return;
    const t = ms();
    if (aberto && aberto.tag.nome === tag.nome) {
      const ini = aberto.inicio_ms;
      const fim = Math.max(t, ini + 1000);
      setAberto(null);
      const corpo = { tag_nome: tag.nome, tag_cor: tag.cor, inicio_ms: ini, fim_ms: fim, ...(quem || {}) };
      try {
        const r = await videoAnaliseService.criarLance(session.id, corpo);
        setLances((l) => [...l, r.lance].sort((a, b) => a.inicio_ms - b.inicio_ms));
      } catch (e) { notify.error(e.message || 'Não foi possível salvar o lance.'); }
      return;
    }
    setAberto({ tag, inicio_ms: t });
  }, [aberto, quem, url, podeEditar, session?.id]);

  // teclado: espaço play/pause, ←/→ 5 s, 1–9 tags, Esc cancela o lance aberto
  useEffect(() => {
    if (!isOpen || aba !== 'marcar') return undefined;
    const tecla = (e) => {
      if (ehCampo(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ') { e.preventDefault(); tocar(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); irPara(ms() - 5000); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); irPara(ms() + 5000); }
      else if (e.key === 'Escape' && aberto) { e.preventDefault(); e.stopPropagation(); setAberto(null); }
      else if (/^[1-9]$/.test(e.key)) { const t = tags[Number(e.key) - 1]; if (t) { e.preventDefault(); marcarTag(t); } }
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [isOpen, aba, tags, marcarTag, aberto]);

  async function atualizar(l, mudanca) {
    const novo = { ...l, ...mudanca };
    setLances((ls) => ls.map((x) => (x.id === l.id ? novo : x)));
    try {
      const r = await videoAnaliseService.salvarLance(session.id, l.id, novo);
      setLances((ls) => ls.map((x) => (x.id === l.id ? r.lance : x)).sort((a, b) => a.inicio_ms - b.inicio_ms));
    } catch (e) {
      notify.error(e.message || 'Não foi possível salvar o lance.');
      setLances((ls) => ls.map((x) => (x.id === l.id ? l : x)));
    }
  }

  async function apagar(l) {
    try { await videoAnaliseService.apagarLance(session.id, l.id); setLances((ls) => ls.filter((x) => x.id !== l.id)); }
    catch (e) { notify.error(e.message || 'Não foi possível apagar o lance.'); }
  }

  function assistir(l) {
    const v = video.current;
    if (!v) return;
    irPara(l.inicio_ms);
    fimDoPlay.current = l.fim_ms;
    v.play();
  }

  function lancar(l) {
    const tipo = eventoDaTag(l.tag_nome, l.equipe);
    const minuto = minutoDoJogo(l.inicio_ms, meta, duration);
    if (!tipo || minuto == null) return;
    const p = players.find((x) => x.athlete_id === l.athlete_id);
    onLancarEvento?.({
      event_type: tipo,
      team: tipo === 'goal_conceded' ? 'opponent' : 'own',
      goal_type: null,
      minute: Math.min(minuto, duration),
      player_id: tipo === 'goal_conceded' ? null : (l.athlete_id || null),
      player: tipo === 'goal_conceded' || !p ? null : { id: p.athlete_id, name: p.athlete?.name || p.name, jersey_number: camisa(p.athlete_id) },
      secondary_player_id: null,
      secondary_player: null,
    });
    atualizar(l, { lancado: true });
    notify.success(`${tipo === 'goal_scored' || tipo === 'goal_conceded' ? 'Gol' : 'Cartão'} lançado no jogo aos ${minuto}'. Salve o jogo para gravar.`);
  }

  async function salvarTags(lista) {
    try {
      const r = await videoAnaliseService.salvarTags(session.id, lista);
      setTags(r.tags); setEditandoTags(false);
      notify.success('Tags do clube salvas.');
    } catch (e) { notify.error(e.message || 'Não foi possível salvar as tags.'); }
  }

  function baixarCsv(s) {
    const linhas = [['Lance', 'Tag', 'Equipe', 'Atleta', 'Início', 'Fim', 'Minuto do jogo', 'Observação']];
    lances.forEach((l, i) => linhas.push([i + 1, l.tag_nome, l.equipe === 'nosso' ? 'Nosso time' : l.equipe === 'adversario' ? (opponentName || 'Adversário') : '',
      nomeDoLance(l), relogio(l.inicio_ms), relogio(l.fim_ms), minutoDoJogo(l.inicio_ms, meta, duration) ?? '', l.observacao || '']));
    linhas.push([]);
    linhas.push(['Resumo por tag', 'Total', 'Nosso', 'Adversário', 'Tempo total (s)']);
    s.tags.forEach((t) => linhas.push([t.tag, t.total, t.nosso, t.adversario, Math.round(t.tempo_ms / 1000)]));
    const csv = '﻿' + linhas.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Analise_video_${(opponentName || 'jogo').replace(/\s+/g, '_')}_${session?.date || ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function nomeDoLance(l) {
    if (l.equipe === 'nosso' && l.athlete_id) return `${camisa(l.athlete_id) !== '' ? `${camisa(l.athlete_id)} ` : ''}${atletas.get(l.athlete_id) || 'Atleta'}`;
    if (l.equipe === 'adversario') return [l.adv_numero != null ? `#${l.adv_numero}` : null, l.adv_nome].filter(Boolean).join(' ') || (opponentName || 'Adversário');
    return '';
  }

  const titulares = players.filter((p) => p.status === 'starter' && Number.isInteger(p.slot));
  const semVaga = players.filter((p) => p.status === 'starter' && !Number.isInteger(p.slot));
  const reservas = players.filter((p) => p.status !== 'starter');
  const slots = useMemo(() => (formation ? buildSlots(formation) : []), [formation]);
  const s = useMemo(() => scout(lances, { meta, duracao: duration, atletas }), [lances, meta, duration, atletas]);
  const durMs = dur * 1000 || meta?.duracao_ms || Math.max(1, ...lances.map((l) => l.fim_ms));

  const card = { border: `1px solid ${colors.border}`, borderRadius: '0.6rem', background: colors.surface, padding: '0.75rem', minWidth: 0 };
  const rot = { fontSize: '0.7rem', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' };
  const chip = (on, cor = colors.primary) => ({
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.55rem', borderRadius: '999px', cursor: 'pointer',
    border: `1px solid ${on ? cor : colors.border}`, background: on ? `${cor}22` : colors.background, color: on ? cor : colors.text,
    fontSize: '0.78rem', fontWeight: on ? 700 : 500,
  });
  const igual = (a, b) => a && b && a.equipe === b.equipe && (a.athlete_id || null) === (b.athlete_id || null) && (a.adv_numero ?? null) === (b.adv_numero ?? null) && (a.adv_nome || null) === (b.adv_nome || null);
  // a escolha fica até trocar ou limpar (vários lances seguidos do mesmo atleta)
  const escolher = (q) => setQuem(q);

  const campo = (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '68 / 92', borderRadius: '0.5rem', overflow: 'hidden',
      background: 'repeating-linear-gradient(180deg,#2c6f33 0 10%,#34803f 10% 20%)' }}>
      <div style={{ position: 'absolute', inset: '3%', border: '2px solid rgba(255,255,255,.75)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', left: '3%', right: '3%', top: '50%', borderTop: '2px solid rgba(255,255,255,.75)' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: '26%', aspectRatio: '1', transform: 'translate(-50%,-50%)', border: '2px solid rgba(255,255,255,.75)', borderRadius: '50%' }} />
      <div style={{ position: 'absolute', left: '22%', right: '22%', bottom: '3%', height: '15%', border: '2px solid rgba(255,255,255,.75)', borderBottom: 'none' }} />
      <div style={{ position: 'absolute', left: '22%', right: '22%', top: '3%', height: '15%', border: '2px solid rgba(255,255,255,.75)', borderTop: 'none' }} />
      {slots.map((sl) => {
        const p = titulares.find((x) => x.slot === sl.index);
        if (!p) return null;
        const q = { equipe: 'nosso', athlete_id: p.athlete_id };
        const on = igual(quem, q);
        return (
          <button key={sl.index} type="button" onClick={() => escolher(q)} title={atletas.get(p.athlete_id)}
            style={{ position: 'absolute', left: `${sl.x}%`, top: `${sl.y}%`, transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0, maxWidth: `${Math.max(sl.spacing, 18)}%` }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13,
              background: on ? '#FACC15' : '#fff', color: '#0f172a', boxShadow: on ? '0 0 0 3px #FACC1588' : '0 1px 3px rgba(0,0,0,.4)' }}>{camisa(p.athlete_id) || '·'}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
              {(atletas.get(p.athlete_id) || '').split(' ')[0]}
            </span>
          </button>
        );
      })}
    </div>
  );

  const marcar = (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: '0.85rem', alignItems: 'start' }}>
      {/* vídeo + linha do tempo + lances */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0 }}>
        {url ? (
          <video ref={video} src={url} controls playsInline style={{ width: '100%', maxHeight: '52vh', background: '#000', borderRadius: '0.5rem' }}
            onLoadedMetadata={(e) => { setDur(e.target.duration || 0); if (podeEditar && meta?.arquivo_nome !== arquivo) salvarMeta({ arquivo_nome: arquivo, duracao_ms: Math.round((e.target.duration || 0) * 1000) }); }}
            onTimeUpdate={(e) => { setAgora(e.target.currentTime * 1000); if (fimDoPlay.current != null && e.target.currentTime * 1000 >= fimDoPlay.current) { e.target.pause(); fimDoPlay.current = null; } }}
            onPlay={() => setTocando(true)} onPause={() => setTocando(false)} />
        ) : (
          <label style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', minHeight: 260, cursor: 'pointer', textAlign: 'center' }}>
            <Film size={34} color={colors.primary} />
            <b style={{ color: colors.text }}>Abrir o vídeo do jogo</b>
            <span style={{ fontSize: '0.8rem', color: colors.textSecondary, maxWidth: 420 }}>
              O arquivo fica no seu computador e não é enviado. {meta?.arquivo_nome ? <>Use o mesmo arquivo da última vez: <b>{meta.arquivo_nome}</b>.</> : 'MP4 ou MOV.'}
            </span>
            <input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => abrirArquivo(e.target.files?.[0])} />
          </label>
        )}
        {url && meta?.arquivo_nome && arquivo && meta.arquivo_nome !== arquivo && (
          <div style={{ fontSize: '0.78rem', color: colors.warning }}>Este arquivo ({arquivo}) é diferente do usado antes ({meta.arquivo_nome}). Os tempos dos lances podem não bater.</div>
        )}
        {/* linha do tempo */}
        <div style={{ position: 'relative', height: 30, borderRadius: 6, background: colors.background, border: `1px solid ${colors.border}`, cursor: url ? 'pointer' : 'default' }}
          onClick={(e) => { if (!url) return; const r = e.currentTarget.getBoundingClientRect(); irPara(((e.clientX - r.left) / r.width) * durMs); }}
          title="Clique para ir ao ponto">
          {lances.map((l) => (
            <span key={l.id} style={{ position: 'absolute', top: 4, bottom: 4, left: `${(l.inicio_ms / durMs) * 100}%`, width: `max(3px, ${((l.fim_ms - l.inicio_ms) / durMs) * 100}%)`, background: l.tag_cor, borderRadius: 2 }} />
          ))}
          {[['inicio1_ms', '1ºT'], ['inicio2_ms', '2ºT']].map(([k, r]) => meta?.[k] != null && (
            <span key={k} style={{ position: 'absolute', top: -2, bottom: -2, left: `${(meta[k] / durMs) * 100}%`, borderLeft: `2px dashed ${colors.text}` }}>
              <span style={{ position: 'absolute', top: -14, left: 2, fontSize: 9, fontWeight: 700, color: colors.textSecondary }}>{r}</span>
            </span>
          ))}
          {aberto && <span style={{ position: 'absolute', top: 2, bottom: 2, left: `${(aberto.inicio_ms / durMs) * 100}%`, width: `${Math.max(0, (agora - aberto.inicio_ms) / durMs) * 100}%`, background: `${aberto.tag.cor}88`, borderRadius: 2 }} />}
          <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${(agora / durMs) * 100}%`, width: 2, background: colors.error }} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="outline" size="sm" disabled={!url} onClick={tocar} icon={tocando ? <Pause size={14} /> : <Play size={14} />}>{relogio(agora)}</Button>
          {podeEditar && [['inicio1_ms', '1º tempo'], ['inicio2_ms', '2º tempo']].map(([k, r]) => (
            <Button key={k} variant="outline" size="sm" disabled={!url} icon={<Flag size={14} />}
              onClick={() => salvarMeta({ [k]: meta?.[k] === Math.round(agora) ? null : Math.round(agora) })}>
              {meta?.[k] != null ? `${r} começa em ${relogio(meta[k])}` : `Começo do ${r} é aqui`}
            </Button>
          ))}
          {url && (
            <label style={{ fontSize: '0.78rem', color: colors.primary, cursor: 'pointer', marginLeft: 'auto' }}>
              Trocar vídeo<input type="file" accept="video/*" style={{ display: 'none' }} onChange={(e) => abrirArquivo(e.target.files?.[0])} />
            </label>
          )}
        </div>
        <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
          Espaço: play/pause · ←/→: 5 s · teclas 1–9: começar e terminar o lance da tag · Esc: cancelar. Marque o começo de cada tempo para o lance saber o minuto do jogo.
        </div>

        {/* lances */}
        <div style={card}>
          <div style={{ ...rot, marginBottom: '0.5rem' }}>Lances ({lances.length})</div>
          {!lances.length && <div style={{ fontSize: '0.82rem', color: colors.textSecondary }}>Nenhum lance ainda. Escolha o atleta, aperte a tag no começo e de novo no fim do lance.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 340, overflowY: 'auto' }}>
            {lances.map((l) => {
              const minuto = minutoDoJogo(l.inicio_ms, meta, duration);
              const tipo = eventoDaTag(l.tag_nome, l.equipe);
              const valorQuem = l.equipe === 'nosso' && l.athlete_id ? `a:${l.athlete_id}` : l.equipe === 'adversario' ? `x:${l.adv_numero ?? ''}:${l.adv_nome ?? ''}` : '';
              return (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '4px auto minmax(0,1fr) auto', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                  <span style={{ alignSelf: 'stretch', background: l.tag_cor, borderRadius: 2 }} />
                  <button type="button" onClick={() => assistir(l)} disabled={!url} title="Assistir o lance"
                    style={{ ...chip(false), cursor: url ? 'pointer' : 'default' }}><Play size={12} />{relogio(l.inicio_ms)}</button>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', minWidth: 0 }}>
                    <b style={{ color: colors.text }}>{l.tag_nome}</b>
                    {minuto != null && <span style={{ color: colors.textSecondary }}>{minuto}'</span>}
                    <span style={{ color: colors.textSecondary }}>{Math.round((l.fim_ms - l.inicio_ms) / 1000)} s</span>
                    {podeEditar ? (
                      <select value={valorQuem} onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return atualizar(l, { equipe: null, athlete_id: null, adv_numero: null, adv_nome: null });
                        if (v.startsWith('a:')) return atualizar(l, { equipe: 'nosso', athlete_id: v.slice(2), adv_numero: null, adv_nome: null });
                        const [, n, ...nome] = v.split(':');
                        return atualizar(l, { equipe: 'adversario', athlete_id: null, adv_numero: n === '' ? null : Number(n), adv_nome: nome.join(':') || null });
                      }} style={{ fontSize: '0.78rem', padding: '0.15rem 0.3rem', borderRadius: 4, border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, maxWidth: 190 }}>
                        <option value="">Sem atleta</option>
                        <optgroup label="Nosso time">
                          {players.map((p) => <option key={p.athlete_id} value={`a:${p.athlete_id}`}>{camisa(p.athlete_id)} {atletas.get(p.athlete_id)}</option>)}
                        </optgroup>
                        <optgroup label={opponentName || 'Adversário'}>
                          <option value="x::">{opponentName || 'Adversário'} (sem número)</option>
                          {adversario.map((p, i) => <option key={i} value={`x:${p.numero ?? ''}:${p.nome || ''}`}>{p.numero != null ? `#${p.numero} ` : ''}{p.nome}</option>)}
                        </optgroup>
                      </select>
                    ) : <span style={{ color: colors.textSecondary }}>{nomeDoLance(l)}</span>}
                    {podeEditar ? (
                      <input defaultValue={l.observacao || ''} placeholder="Observação" maxLength={300}
                        onBlur={(e) => { if ((e.target.value || null) !== (l.observacao || null)) atualizar(l, { observacao: e.target.value }); }}
                        style={{ flex: '1 1 140px', minWidth: 100, fontSize: '0.78rem', padding: '0.15rem 0.35rem', borderRadius: 4, border: `1px solid ${colors.border}`, background: colors.background, color: colors.text }} />
                    ) : l.observacao && <span style={{ color: colors.textSecondary }}>{l.observacao}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    {podeEditar && tipo && onLancarEvento && (l.lancado
                      ? <span title="Já está nos eventos do jogo" style={{ ...chip(true, colors.success), cursor: 'default' }}><Check size={12} />No jogo</span>
                      : <button type="button" disabled={minuto == null} onClick={() => lancar(l)}
                          title={minuto == null ? 'Marque o começo do tempo no vídeo para saber o minuto' : 'Adicionar aos eventos do jogo'}
                          style={{ ...chip(false, colors.success), opacity: minuto == null ? 0.5 : 1 }}><Plus size={12} />Lançar no jogo</button>)}
                    {podeEditar && (
                      <>
                        <button type="button" title="Começo −1 s" onClick={() => atualizar(l, { inicio_ms: Math.max(0, l.inicio_ms - 1000) })} style={chip(false)}>−</button>
                        <button type="button" title="Fim +1 s" onClick={() => atualizar(l, { fim_ms: l.fim_ms + 1000 })} style={chip(false)}>+</button>
                        <button type="button" title="Apagar o lance" onClick={() => apagar(l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary }}><Trash2 size={15} /></button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* quem + tags */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={rot}>Tags</span>
            {podeEditar && <button type="button" onClick={() => setEditandoTags(true)} style={{ background: 'none', border: 'none', color: colors.primary, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Editar tags do clube</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.35rem' }}>
            {tags.map((t, i) => {
              const on = aberto?.tag.nome === t.nome;
              return (
                <button key={t.nome} type="button" disabled={!url || !podeEditar} onClick={() => marcarTag(t)}
                  title={on ? 'Aperte de novo para terminar o lance' : 'Começar o lance'}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.45rem 0.55rem', borderRadius: '0.45rem', cursor: url && podeEditar ? 'pointer' : 'default',
                    border: `1px solid ${on ? t.cor : colors.border}`, background: on ? `${t.cor}2a` : colors.background, color: colors.text,
                    fontSize: '0.82rem', fontWeight: 600, textAlign: 'left', opacity: url ? 1 : 0.55, boxShadow: on ? `0 0 0 2px ${t.cor}66` : 'none' }}>
                  <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: t.cor }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                  {i < 9 && <kbd style={{ fontSize: '0.68rem', color: colors.textSecondary, border: `1px solid ${colors.border}`, borderRadius: 4, padding: '0 0.3rem' }}>{i + 1}</kbd>}
                </button>
              );
            })}
          </div>
          {aberto && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: aberto.tag.cor, fontWeight: 700 }}>
              ● {aberto.tag.nome} desde {relogio(aberto.inicio_ms)} — aperte de novo para terminar
              <button type="button" onClick={() => setAberto(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer' }}><X size={12} /> cancelar</button>
            </div>
          )}
          {!url && <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: colors.textSecondary }}>Abra o vídeo do jogo para marcar.</div>}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={rot}>De quem é o lance</span>
            <span style={{ fontSize: '0.75rem', color: quem ? colors.primary : colors.textSecondary, fontWeight: 600 }}>
              {quem ? (quem.equipe === 'nosso' ? atletas.get(quem.athlete_id) : `${opponentName || 'Adversário'}${quem.adv_numero != null ? ` #${quem.adv_numero}` : ''}`) : 'Ninguém escolhido'}
              {quem && <button type="button" onClick={() => setQuem(null)} title="Limpar a escolha" style={{ marginLeft: 6, background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', verticalAlign: 'middle' }}><X size={13} /></button>}
            </span>
          </div>
          {slots.length > 1 && titulares.length ? campo : <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>Coloque os titulares nas vagas da escalação para vê-los no campo.</div>}
          {[[semVaga, titulares.length ? 'Titulares sem vaga no campo' : 'Titulares'], [reservas, 'Reservas']].map(([lista, r]) => lista.length > 0 && (
            <div key={r} style={{ marginTop: '0.5rem' }}>
              <div style={{ ...rot, marginBottom: '0.3rem' }}>{r}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {lista.map((p) => { const q = { equipe: 'nosso', athlete_id: p.athlete_id }; return (
                  <button key={p.athlete_id} type="button" onClick={() => escolher(q)} style={chip(igual(quem, q))}>{camisa(p.athlete_id)} {(atletas.get(p.athlete_id) || '').split(' ')[0]}</button>
                ); })}
              </div>
            </div>
          ))}
          <div style={{ marginTop: '0.6rem' }}>
            <div style={{ ...rot, marginBottom: '0.3rem' }}>{opponentName || 'Adversário'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              <button type="button" onClick={() => escolher({ equipe: 'adversario', adv_numero: null, adv_nome: null })} style={chip(igual(quem, { equipe: 'adversario', adv_numero: null, adv_nome: null }), colors.error)}>Time todo</button>
              {adversario.map((p, i) => { const q = { equipe: 'adversario', adv_numero: p.numero ?? null, adv_nome: p.nome || null }; return (
                <button key={i} type="button" onClick={() => escolher(q)} title={p.nome || ''} style={chip(igual(quem, q), colors.error)}>
                  {p.numero != null ? `#${p.numero}` : ''}{p.nome ? ` ${p.nome.split(' ')[0]}` : ''}
                </button>
              ); })}
            </div>
            <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: '0.3rem' }}>Os jogadores do adversário vêm da provável escalação da Análise do adversário.</div>
          </div>
        </div>
      </div>
    </div>
  );

  const barra = (v, max, cor) => (
    <div style={{ flex: 1, height: 10, borderRadius: 5, background: colors.background, overflow: 'hidden' }}>
      <div style={{ width: `${max ? (v / max) * 100 : 0}%`, height: '100%', background: cor, borderRadius: 5 }} />
    </div>
  );
  const maxTag = Math.max(1, ...s.tags.map((t) => t.total));
  const maxFaixa = Math.max(1, ...s.faixas.map((f) => f.total));
  const tagsDosAtletas = s.tags.map((t) => t.tag);

  const scoutTela = !lances.length ? (
    <div style={{ ...card, color: colors.textSecondary }}>Ainda não há lances. Marque lances na aba Marcar e o scout aparece aqui.</div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.6rem' }}>
        {[[s.total, 'lances marcados'], [s.tipos, 'tipos de ação'], [relogio(s.tempo_ms), 'tempo em lances'], [`${s.sem_atleta}`, 'lances sem atleta']].map(([v, r]) => (
          <div key={r} style={card}><div style={{ fontSize: '1.6rem', fontWeight: 800, color: colors.text }}>{v}</div><div style={{ fontSize: '0.78rem', color: colors.textSecondary }}>{r}</div></div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '0.75rem' }}>
        <div style={card}>
          <div style={{ ...rot, marginBottom: '0.6rem' }}>Ações por tag</div>
          {s.tags.map((t) => (
            <div key={t.tag} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.82rem' }}>
              <span style={{ width: 110, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tag}</span>
              {barra(t.total, maxTag, t.cor)}<b style={{ width: 24, textAlign: 'right', color: colors.text }}>{t.total}</b>
            </div>
          ))}
        </div>
        <div style={card}>
          <div style={{ ...rot, marginBottom: '0.6rem' }}>Nosso time × {opponentName || 'adversário'}</div>
          {s.tags.map((t) => (
            <div key={t.tag} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 110px 1fr 24px', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', fontSize: '0.8rem' }}>
              <b style={{ textAlign: 'right', color: colors.text }}>{t.nosso}</b>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: `${(t.nosso / maxTag) * 100}%`, height: 10, borderRadius: 5, background: colors.primary }} /></div>
              <span style={{ textAlign: 'center', color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tag}</span>
              <div><div style={{ width: `${(t.adversario / maxTag) * 100}%`, height: 10, borderRadius: 5, background: colors.error }} /></div>
              <b style={{ color: colors.text }}>{t.adversario}</b>
            </div>
          ))}
        </div>
      </div>
      <div style={card}>
        <div style={{ ...rot, marginBottom: '0.6rem' }}>Ações ao longo do jogo (por 15 min)</div>
        {s.com_minuto ? (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${s.faixas.length}, minmax(0,1fr))`, gap: '0.5rem', alignItems: 'end', height: 130 }}>
            {s.faixas.map((f) => (
              <div key={f.de} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <b style={{ fontSize: '0.8rem', color: colors.text }}>{f.total}</b>
                <div style={{ width: '70%', height: `${(f.total / maxFaixa) * 85}%`, minHeight: f.total ? 4 : 1, background: colors.primary, borderRadius: 4 }} />
                <span style={{ fontSize: '0.72rem', color: colors.textSecondary }}>{f.de}–{f.ate}'</span>
              </div>
            ))}
          </div>
        ) : <div style={{ fontSize: '0.82rem', color: colors.textSecondary }}>Marque no vídeo onde começa o 1º tempo (e o 2º) para ver as ações por minuto do jogo.</div>}
      </div>
      {s.atletas.length > 0 && (
        <div style={{ ...card, overflowX: 'auto' }}>
          <div style={{ ...rot, marginBottom: '0.6rem' }}>Atleta × ação</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead><tr>
              <th style={{ textAlign: 'left', padding: '0.35rem', color: colors.textSecondary }}>Atleta</th>
              {tagsDosAtletas.map((t) => <th key={t} style={{ padding: '0.35rem', color: colors.textSecondary, fontWeight: 600 }}>{t}</th>)}
              <th style={{ padding: '0.35rem', color: colors.textSecondary }}>Total</th>
            </tr></thead>
            <tbody>{s.atletas.map((a) => (
              <tr key={a.chave} style={{ borderTop: `1px solid ${colors.border}` }}>
                <td style={{ padding: '0.35rem', color: colors.text, whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: a.equipe === 'nosso' ? colors.primary : colors.error, marginRight: 6 }} />
                  {a.equipe === 'nosso' && a.athlete_id && camisa(a.athlete_id) !== '' ? `${camisa(a.athlete_id)} ` : ''}{a.nome}
                </td>
                {tagsDosAtletas.map((t) => <td key={t} style={{ padding: '0.35rem', textAlign: 'center', color: a.tags[t] ? colors.text : colors.textMuted }}>{a.tags[t] || '–'}</td>)}
                <td style={{ padding: '0.35rem', textAlign: 'center', fontWeight: 700, color: colors.text }}>{a.total}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title={`Análise de vídeo${opponentName ? ` · ${opponentName}` : ''}`}
      footer={(
        <div style={{ display: 'flex', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            {[['marcar', 'Marcar lances'], ['scout', `Scout${lances.length ? ` (${lances.length})` : ''}`]].map(([k, r]) => (
              <button key={k} type="button" onClick={() => setAba(k)} style={chip(aba === k)}>{r}</button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          {aba === 'scout' && lances.length > 0 && <Button variant="outline" onClick={() => baixarCsv(s)} icon={<Download size={15} />}>Baixar CSV</Button>}
          <Button onClick={onClose}>Fechar</Button>
        </div>
      )}
    >
      {!carregado ? <div style={{ color: colors.textSecondary }}>Carregando…</div> : aba === 'marcar' ? marcar : scoutTela}
      {editandoTags && <EditorTags inicial={tags} colors={colors} onCancelar={() => setEditandoTags(false)} onSalvar={salvarTags} />}
    </Modal>
  );
}

// Editor das tags do clube (nome + cor, ordem = teclas 1–9). Sem tags = volta ao padrão.
function EditorTags({ inicial, colors, onCancelar, onSalvar }) {
  const [lista, setLista] = useState(inicial.map((t) => ({ ...t })));
  const muda = (i, k, v) => setLista((l) => l.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const input = { padding: '0.35rem 0.5rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontSize: '0.85rem' };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 2000 }} onClick={onCancelar}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 92vw)', maxHeight: '86vh', overflowY: 'auto', background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.75rem', padding: '1rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', color: colors.text, fontSize: '1rem' }}>Tags do clube</h3>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: colors.textSecondary }}>Valem para todos os jogos deste clube. As 9 primeiras ganham as teclas 1–9. Uma tag que comece com "Gol" ou "Cartão" pode virar evento do jogo.</p>
        {lista.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ width: 18, fontSize: '0.75rem', color: colors.textSecondary }}>{i < 9 ? i + 1 : ''}</span>
            <input type="color" value={t.cor} onChange={(e) => muda(i, 'cor', e.target.value.toUpperCase())} style={{ width: 34, height: 30, padding: 0, border: 'none', background: 'none' }} />
            <input value={t.nome} maxLength={40} onChange={(e) => muda(i, 'nome', e.target.value)} style={{ ...input, flex: 1 }} />
            <button type="button" onClick={() => setLista((l) => l.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer' }} aria-label="Remover tag"><Trash2 size={15} /></button>
          </div>
        ))}
        {lista.length < 20 && <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => setLista((l) => [...l, { nome: '', cor: '#64748B' }])}>Nova tag</Button>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <Button variant="outline" onClick={() => onSalvar([])}>Voltar ao padrão</Button>
          <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
          <Button onClick={() => onSalvar(lista)}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}


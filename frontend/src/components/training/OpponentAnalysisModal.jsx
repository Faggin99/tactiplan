// Análise do adversário do jogo (PUT/GET /api/games/:id/analise, migration 062). O treinador
// preenche por seções, no formato do modelo do dono (Analise_Flamengo_Libertadores_2026.pptx);
// o PDF / PowerPoint (POST /api/reports/analise, formato 'pptx') mostra só o que foi preenchido. Escudo do
// adversário e vídeos por seção (migration 063): os vídeos entram só no PowerPoint. Listas de tópicos: uma linha
// por item (o servidor tira as linhas vazias ao salvar — backend-node/src/services/analiseAdversario.js).
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, FileDown, Presentation, Upload, Video } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useTheme } from '../../contexts/ThemeContext';
import { gameService } from '../../services/gameService';
import { downloadReport, safeFileName } from '../../services/reportsService';
import { notify } from '../../lib/notify';
import { vagasLivres } from '../../lib/formacaoLivre';

// Mesma ordem e títulos do relatório (backend-node/src/services/analiseAdversario.js TITULOS)
const SECOES = [
  ['capa', 'Capa'], ['campanha', 'Campanha'], ['sistema', 'Sistema inicial'], ['variacoes', 'Variações do sistema'],
  ['escalacao', 'Provável escalação'], ['individuais', 'Análise individual'], ['ataque', 'Organização ofensiva'],
  ['defesa', 'Organização defensiva'], ['transicoes', 'Transições'], ['bp_ofensiva', 'Bolas paradas ofensivas'],
  ['bp_defensiva', 'Bolas paradas defensivas'], ['pontos', 'Pontos positivos e a explorar'], ['final', 'Observações finais'],
];
const FREQ = [['', '—'], ['predominante', 'Predominante'], ['frequente', 'Frequente'], ['pontual', 'Pontual'], ['raro', 'Raro']];
const PERDER = [['', '—'], ['pressionam', 'Pressionam (contrapressão)'], ['temporizam', 'Temporizam'], ['recuam', 'Recuam e recompõem o bloco']];
const RECUPERAR = [['', '—'], ['verticais', 'Passes verticais (contra-ataque)'], ['laterais', 'Passes laterais'], ['tras', 'Passes para trás (retêm a posse)']];
const PAPEL = { GOL: 'Goleiro', DEF: 'Defesa', MEI: 'Meio', ATA: 'Ataque' };

// "tem algo preenchido?" (marca a seção na lista)
function temAlgo(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return true;
  if (Array.isArray(v)) return v.some(temAlgo);
  if (typeof v === 'object') return Object.values(v).some(temAlgo);
  return false;
}

function setIn(obj, path, valor) {
  if (!path.length) return valor;
  const [k, ...resto] = path;
  const base = Array.isArray(obj) ? [...obj] : { ...(obj || {}) };
  base[k] = setIn(base[k], resto, valor);
  return base;
}
const getIn = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);

// ---------- campos (fora da tela: identidade estável, o campo não perde o foco ao digitar) ----------
const Ctx = createContext(null);
function useCampo() {
  const { dados, muda, colors, podeEditar } = useContext(Ctx);
  const input = { width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.65rem', borderRadius: '0.4rem', border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontSize: '0.875rem', fontFamily: 'inherit' };
  const rot = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' };
  const cartao = { border: `1px solid ${colors.border}`, borderRadius: '0.55rem', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.7rem', background: colors.surface };
  return { dados, muda, colors, podeEditar, input, rot, cartao, v: (path) => getIn(dados, path) ?? '' };
}
const grade = (n) => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: '0.6rem' });

function Texto({ label, path, ph = '', max = 200 }) {
  const { input, rot, v, muda, podeEditar } = useCampo();
  return (
    <label style={{ display: 'block' }}><span style={rot}>{label}</span>
      <input style={input} value={v(path)} maxLength={max} placeholder={ph} disabled={!podeEditar} onChange={(e) => muda(path, e.target.value)} />
    </label>
  );
}
// texto livre de várias linhas (vira um parágrafo no PDF)
function TextoLongo({ label, path, ph = '', linhas = 2 }) {
  const { input, rot, v, muda, podeEditar } = useCampo();
  return (
    <label style={{ display: 'block' }}><span style={rot}>{label}</span>
      <textarea style={{ ...input, resize: 'vertical', minHeight: `${linhas * 1.6 + 0.8}rem` }} placeholder={ph} maxLength={600} disabled={!podeEditar}
        value={v(path)} onChange={(e) => muda(path, e.target.value)} />
    </label>
  );
}
function Numero({ label, path, max = 999 }) {
  const { input, rot, v, muda, podeEditar } = useCampo();
  return (
    <label style={{ display: 'block' }}><span style={rot}>{label}</span>
      <input style={input} type="number" min={0} max={max} value={v(path) ?? ''} disabled={!podeEditar}
        onChange={(e) => muda(path, e.target.value === '' ? null : Number(e.target.value))} onWheel={(e) => e.currentTarget.blur()} />
    </label>
  );
}
// lista de tópicos: uma linha por item (o servidor tira as vazias ao salvar)
function Lista({ label, path, ph = 'Um item por linha', linhas = 3 }) {
  const { input, rot, dados, muda, podeEditar } = useCampo();
  const arr = getIn(dados, path);
  return (
    <label style={{ display: 'block' }}><span style={rot}>{label}</span>
      <textarea style={{ ...input, resize: 'vertical', minHeight: `${linhas * 1.6 + 0.8}rem` }} placeholder={ph} disabled={!podeEditar}
        value={Array.isArray(arr) ? arr.join('\n') : (arr || '')} onChange={(e) => muda(path, e.target.value.split('\n'))} />
    </label>
  );
}
function Escolha({ label, path, opcoes }) {
  const { input, rot, v, muda, podeEditar } = useCampo();
  return (
    <label style={{ display: 'block' }}><span style={rot}>{label}</span>
      <select style={input} value={v(path)} disabled={!podeEditar} onChange={(e) => muda(path, e.target.value)}>
        {opcoes.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
      </select>
    </label>
  );
}
const Fonte = ({ k }) => <Texto label="Fontes (opcional)" path={['fontes', k]} ph="Ex.: CONMEBOL, vídeo do último jogo" />;
function Repetir({ path, novo, max, rotulo, render }) {
  const { dados, muda, colors, podeEditar, cartao } = useCampo();
  const lista = getIn(dados, path) || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {lista.map((_, i) => (
        <div key={i} style={cartao}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <b style={{ flex: 1, fontSize: '0.85rem', color: colors.text }}>{rotulo} {i + 1}</b>
            {podeEditar && (
              <button type="button" onClick={() => muda(path, lista.filter((__, j) => j !== i))} aria-label={`Remover ${rotulo} ${i + 1}`}
                style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer' }}><Trash2 size={15} /></button>
            )}
          </div>
          {render([...path, i])}
        </div>
      ))}
      {podeEditar && lista.length < max && (
        <Button variant="outline" size="sm" icon={<Plus size={14} />} onClick={() => muda(path, [...lista, novo])}>Adicionar {rotulo.toLowerCase()}</Button>
      )}
    </div>
  );
}

// Botão que abre o seletor de arquivo (input escondido dentro do label)
function BotaoArquivo({ aceita, onArquivo, children, disabled }) {
  const { colors } = useContext(Ctx);
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', borderRadius: '0.4rem', fontSize: '0.82rem', fontWeight: 600,
      border: `1px solid ${colors.border}`, color: colors.text, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, width: 'fit-content' }}>
      <input type="file" accept={aceita} disabled={disabled} style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onArquivo(f); }} />
      {children}
    </label>
  );
}

function Escudo() {
  const { midias, enviar, remover, enviando, podeEditar, colors } = useContext(Ctx);
  const escudo = midias.find((m) => m.tipo === 'escudo');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', overflow: 'hidden', border: `1px dashed ${colors.border}`, background: colors.background }}>
        {escudo ? <img src={escudo.url} alt="Escudo do adversário" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: '0.7rem', color: colors.textSecondary }}>sem escudo</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Escudo do adversário</span>
        {podeEditar && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <BotaoArquivo aceita="image/png,image/jpeg,image/webp" disabled={enviando} onArquivo={(f) => enviar(f, { tipo: 'escudo' })}>
              <Upload size={14} />{escudo ? 'Trocar' : 'Enviar imagem'}
            </BotaoArquivo>
            {escudo && <button type="button" onClick={() => remover(escudo)} style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', fontSize: '0.8rem' }}>Remover</button>}
          </div>
        )}
        <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Aparece na capa e no topo de cada página. Sem escudo, vão as iniciais.</span>
      </div>
    </div>
  );
}

// Vídeos da seção: arquivo (até 50 MB) entra no PowerPoint num slide logo depois da seção (o PDF só avisa);
// vídeo grande vai por LINK, que sai clicável no PDF e no PowerPoint (página "Vídeos (links)" no fim).
function VideosDaSecao({ secao }) {
  const { midias, enviar, remover, enviando, podeEditar, colors, cartao, adicionarLink } = { ...useContext(Ctx), ...useCampo() };
  const [titulo, setTitulo] = useState('');
  const [link, setLink] = useState('');
  const lista = midias.filter((m) => (m.tipo === 'video' || m.tipo === 'link') && m.secao === secao);
  if (!podeEditar && !lista.length) return null;
  return (
    <div style={{ ...cartao, gap: '0.5rem' }}>
      <b style={{ fontSize: '0.85rem', color: colors.text, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Video size={15} />Vídeos desta seção</b>
      <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
        Arquivo (MP4, MOV ou WEBM até 50 MB) vai embutido só no PowerPoint. Vídeo maior: cole o link (YouTube, Drive…) — sai clicável no PDF e no PowerPoint.
      </span>
      {lista.map((m) => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: colors.text }}>
          <a href={m.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: colors.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.titulo || (m.tipo === 'link' ? m.url : 'Vídeo sem título')}</a>
          <span style={{ color: colors.textSecondary, fontSize: '0.75rem' }}>{m.tipo === 'link' ? 'link' : `${Math.round((m.size_bytes || 0) / 1048576)} MB`}</span>
          {podeEditar && <button type="button" onClick={() => remover(m)} aria-label="Remover vídeo" style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer' }}><Trash2 size={15} /></button>}
        </div>
      ))}
      {podeEditar && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} placeholder="Título do vídeo (opcional)"
            style={{ flex: 1, minWidth: 180, padding: '0.45rem 0.6rem', borderRadius: '0.4rem', border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontSize: '0.85rem' }} />
          <BotaoArquivo aceita="video/mp4,video/quicktime,video/webm" disabled={enviando}
            onArquivo={async (f) => { if (await enviar(f, { tipo: 'video', secao, titulo: titulo || f.name.replace(/\.[^.]+$/, '') })) setTitulo(''); }}>
            <Upload size={14} />{enviando ? 'Enviando…' : 'Enviar arquivo'}
          </BotaoArquivo>
          <input value={link} onChange={(e) => setLink(e.target.value)} maxLength={500} placeholder="ou cole o link do vídeo (https://…)"
            style={{ flex: 1, minWidth: 180, padding: '0.45rem 0.6rem', borderRadius: '0.4rem', border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontSize: '0.85rem' }} />
          <Button variant="outline" size="sm" disabled={!link.trim()}
            onClick={async () => { if (await adicionarLink({ secao, titulo, url: link.trim() })) { setLink(''); setTitulo(''); } }}>Adicionar link</Button>
        </div>
      )}
    </div>
  );
}

export function OpponentAnalysisModal({ isOpen, onClose, session, opponentName, podeEditar = true }) {
  const { colors } = useTheme();
  const [dados, setDados] = useState(null);
  const [secao, setSecao] = useState('capa');
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(null); // 'pdf' | 'pptx'
  const [midias, setMidias] = useState([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!isOpen || !session?.id) return;
    setDados(null); setSujo(false); setSecao('capa'); setMidias([]);
    gameService.getAnalise(session.id)
      .then((r) => { setDados(r.data || {}); setMidias(r.midias || []); })
      .catch((e) => { notify.error(e.message || 'Não foi possível abrir a análise.'); setDados({}); });
  }, [isOpen, session?.id]);

  const preenchidas = useMemo(() => new Set(SECOES.map(([k]) => k).filter((k) => temAlgo(dados?.[k]) || temAlgo(dados?.fontes?.[k]))), [dados]);

  const muda = (path, valor) => { setDados((d) => setIn(d, path, valor)); setSujo(true); };
  const v = (path) => getIn(dados, path) ?? '';

  async function salvar() {
    setSalvando(true);
    try {
      const r = await gameService.saveAnalise(session.id, dados);
      setDados(r.data); setSujo(false);
      notify.success('Análise salva.');
      return true;
    } catch (e) {
      notify.error(e.message || 'Não foi possível salvar a análise.');
      return false;
    } finally {
      setSalvando(false);
    }
  }

  // formato 'pdf' (sem vídeos) | 'pptx' (PowerPoint com os vídeos)
  async function exportar(formato) {
    if (sujo && !(await salvar())) return;
    setGerando(formato);
    try {
      const data = session?.date ? session.date.split('-').reverse().join('-') : '';
      const nome = `Analise_${safeFileName(opponentName || 'Adversario')}_${data}.${formato}`;
      if (formato === 'pptx') await downloadReport('analise', { session_id: session.id, formato: 'pptx' }, nome, 'Compartilhar PowerPoint');
      else await downloadReport('analise', { session_id: session.id }, nome);
    } catch (e) {
      notify.error(e.message || 'Não foi possível gerar o arquivo.');
    } finally {
      setGerando(null);
    }
  }

  async function enviar(file, opcoes) {
    if (file.size > 50 * 1024 * 1024) { notify.error('Arquivo maior que 50 MB. Para vídeo grande, cole o link (YouTube, Drive…).'); return false; }
    setEnviando(true);
    try {
      const r = await gameService.uploadAnaliseMidia(session.id, file, opcoes);
      setMidias(r.midias || []);
      notify.success(opcoes.tipo === 'escudo' ? 'Escudo salvo.' : 'Vídeo adicionado.');
      return true;
    } catch (e) {
      notify.error(e.message || 'Não foi possível enviar o arquivo.');
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function adicionarLink(dadosLink) {
    try {
      const r = await gameService.addAnaliseLink(session.id, dadosLink);
      setMidias(r.midias || []);
      notify.success('Link adicionado.');
      return true;
    } catch (e) {
      notify.error(e.message || 'Não foi possível salvar o link.');
      return false;
    }
  }

  async function remover(m) {
    try {
      const r = await gameService.deleteAnaliseMidia(session.id, m.id);
      setMidias(r.midias || midias.filter((x) => x.id !== m.id));
    } catch (e) {
      notify.error(e.message || 'Não foi possível remover.');
    }
  }

  const input = { width: '100%', boxSizing: 'border-box', padding: '0.5rem 0.65rem', borderRadius: '0.4rem', border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontSize: '0.875rem', fontFamily: 'inherit' };
  const rot = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: colors.textSecondary, marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.03em' };
  const cartao = { border: `1px solid ${colors.border}`, borderRadius: '0.55rem', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.7rem', background: colors.surface };

  const formulario = () => {
    if (!dados) return <div style={{ color: colors.textSecondary }}>Carregando…</div>;
    switch (secao) {
      case 'capa': return (<>
        <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>Adversário, campeonato, data, horário e local vêm dos dados do jogo.</div>
        <Escudo />
        <div style={grade(2)}><Texto label="Fase" path={['capa', 'fase']} ph="Ex.: Semifinal (volta)" /><Texto label="Jogo de ida" path={['capa', 'ida']} ph="Ex.: Estudiantes 0 × 0 Fla" /></div>
        <Texto label="Técnico do adversário" path={['capa', 'tecnico']} />
        <Texto label="Observação" path={['capa', 'observacao']} ph="Ex.: Dados públicos até 22/10" />
      </>);
      case 'campanha': return (<>
        <Texto label="Situação na competição" path={['campanha', 'situacao']} ph="Ex.: 1º do Grupo A (16 pts) · invicto em 11 jogos" />
        <div style={grade(6)}>
          <Numero label="Vitórias" path={['campanha', 'vitorias']} /><Numero label="Empates" path={['campanha', 'empates']} />
          <Numero label="Derrotas" path={['campanha', 'derrotas']} /><Numero label="Gols pró" path={['campanha', 'gols_pro']} />
          <Numero label="Gols contra" path={['campanha', 'gols_contra']} /><Numero label="Posse %" path={['campanha', 'posse']} max={100} />
        </div>
        <span style={rot}>Últimos jogos (mais antigo → mais recente; placar do adversário primeiro)</span>
        <Repetir path={['campanha', 'ultimos']} max={10} rotulo="Jogo" novo={{ resultado: '', adversario: '', mando: '', placar: '' }}
          render={(p) => (<div style={grade(4)}>
            <Escolha label="Resultado" path={[...p, 'resultado']} opcoes={[['', '—'], ['V', 'Vitória'], ['E', 'Empate'], ['D', 'Derrota']]} />
            <Texto label="Contra" path={[...p, 'adversario']} />
            <Escolha label="Mando" path={[...p, 'mando']} opcoes={[['', '—'], ['C', 'Casa'], ['F', 'Fora'], ['N', 'Neutro']]} />
            <Texto label="Placar" path={[...p, 'placar']} ph="2 × 1" max={12} />
          </div>)} />
        {['casa', 'fora'].map((lado) => (
          <div key={lado}><span style={rot}>Desempenho {lado === 'casa' ? 'em casa' : 'fora'}</span>
            <div style={grade(6)}>{['j', 'v', 'e', 'd', 'gp', 'gc'].map((k) => <Numero key={k} label={k.toUpperCase()} path={['campanha', lado, k]} />)}</div>
          </div>
        ))}
        <TextoLongo label="Observação" path={['campanha', 'observacao']} ph="Texto livre" />
        <Fonte k="campanha" />
      </>);
      case 'sistema': return (<>
        {[['ofensivo', 'Ofensivo (com a bola)', 'Ex.: 4-3-3'], ['defensivo', 'Defensivo (sem a bola)', 'Ex.: 4-1-4-1']].map(([lado, r, ph]) => (
          <div key={lado} style={cartao}><b style={{ fontSize: '0.85rem', color: colors.text }}>{r}</b>
            <div style={grade(2)}><Texto label="Formação" path={['sistema', lado, 'formacao']} ph={ph} max={12} /><Texto label="Descrição" path={['sistema', lado, 'descricao']} ph="Ex.: Sistema-base com o técnico atual" /></div>
            <Lista label="Observações" path={['sistema', lado, 'itens']} />
          </div>
        ))}
        <Fonte k="sistema" />
      </>);
      case 'variacoes': return (<>
        <Repetir path={['variacoes']} max={6} rotulo="Variação" novo={{ fase: '', formacao: '', quando: '', itens: [] }}
          render={(p) => (<>
            <div style={grade(3)}><Texto label="Situação" path={[...p, 'fase']} ph="Com bola / Sem bola…" /><Texto label="Formação" path={[...p, 'formacao']} ph="2-3-5" max={12} /><Texto label="Quando" path={[...p, 'quando']} /></div>
            <Lista label="Observações" path={[...p, 'itens']} linhas={2} />
          </>)} />
        <Fonte k="variacoes" />
      </>);
      case 'escalacao': {
        const vagas = vagasLivres(v(['escalacao', 'formacao']));
        const jogs = getIn(dados, ['escalacao', 'jogadores']) || [];
        const daVaga = (vaga) => jogs.find((j) => j?.vaga === vaga) || {};
        const mudaJog = (vaga, campo, valor) => {
          const atual = { vaga, numero: null, nome: '', ...daVaga(vaga), [campo]: valor };
          muda(['escalacao', 'jogadores'], [...jogs.filter((j) => j?.vaga !== vaga), atual].sort((a, b) => a.vaga - b.vaga));
        };
        return (<>
          <Texto label="Formação do adversário" path={['escalacao', 'formacao']} ph="Ex.: 4-3-3 (define as vagas no campo)" max={12} />
          {vagas.length > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={rot}>Titulares (da defesa para o ataque, da esquerda para a direita)</span>
              {vagas.map((vg) => (
                <div key={vg.vaga} style={{ display: 'grid', gridTemplateColumns: '5.5rem 4rem 1fr', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.textSecondary }}>{PAPEL[vg.papel]}</span>
                  <input style={input} type="number" min={1} max={99} placeholder="Nº" value={daVaga(vg.vaga).numero ?? ''} disabled={!podeEditar}
                    onChange={(e) => mudaJog(vg.vaga, 'numero', e.target.value === '' ? null : Number(e.target.value))} onWheel={(e) => e.currentTarget.blur()} />
                  <input style={input} placeholder="Nome" value={daVaga(vg.vaga).nome || ''} maxLength={80} disabled={!podeEditar}
                    onChange={(e) => mudaJog(vg.vaga, 'nome', e.target.value)} />
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: '0.8rem', color: colors.textSecondary }}>Informe a formação (ex.: 4-3-3) para preencher os titulares no campo.</div>}
          <Lista label="Opções no banco" path={['escalacao', 'banco']} ph="Ex.: 27 Bruno Henrique – atacante" />
          <div style={grade(2)}><Lista label="Desfalques" path={['escalacao', 'desfalques']} /><Lista label="Dúvidas" path={['escalacao', 'duvidas']} /></div>
          <Texto label="Observação" path={['escalacao', 'observacao']} />
          <Fonte k="escalacao" />
        </>);
      }
      case 'defesa': return (<>
        {[['alto', 'Bloco alto'], ['medio', 'Bloco médio'], ['baixo', 'Bloco baixo']].map(([b, r]) => (
          <div key={b} style={cartao}><b style={{ fontSize: '0.85rem', color: colors.text }}>{r}</b>
            <Escolha label="Frequência" path={['defesa', b, 'frequencia']} opcoes={FREQ} />
            <Lista label="Observações" path={['defesa', b, 'itens']} linhas={2} />
          </div>
        ))}
        <Fonte k="defesa" />
      </>);
      case 'ataque': return (<>
        <Lista label="1 · Construção" path={['ataque', 'construcao']} linhas={2} /><Lista label="2 · 2ª fase de construção" path={['ataque', 'segunda_fase']} linhas={2} />
        <Lista label="3 · Criação" path={['ataque', 'criacao']} linhas={2} /><Lista label="4 · Finalização" path={['ataque', 'finalizacao']} linhas={2} />
        <Fonte k="ataque" />
      </>);
      case 'transicoes': return (<>
        <div style={cartao}><b style={{ fontSize: '0.85rem', color: colors.text }}>Quando perdem a bola</b>
          <Escolha label="Comportamento predominante" path={['transicoes', 'perder', 'comportamento']} opcoes={PERDER} />
          <Lista label="Observações" path={['transicoes', 'perder', 'itens']} linhas={2} /></div>
        <div style={cartao}><b style={{ fontSize: '0.85rem', color: colors.text }}>Quando roubam a bola</b>
          <Escolha label="Comportamento predominante" path={['transicoes', 'recuperar', 'comportamento']} opcoes={RECUPERAR} />
          <Lista label="Observações" path={['transicoes', 'recuperar', 'itens']} linhas={2} /></div>
        <Fonte k="transicoes" />
      </>);
      case 'individuais': return (<>
        <Repetir path={['individuais']} max={8} rotulo="Jogador" novo={{ nome: '', numero: null, posicao: '', destaque: '', fortes: [], fracos: [], neutralizar: [] }}
          render={(p) => (<>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 5rem 1.2fr', gap: '0.6rem' }}>
              <Texto label="Nome" path={[...p, 'nome']} /><Numero label="Nº" path={[...p, 'numero']} max={99} /><Texto label="Posição" path={[...p, 'posicao']} max={40} />
            </div>
            <Texto label="Destaque" path={[...p, 'destaque']} ph="Ex.: artilheiro com 5 gols" />
            <div style={grade(3)}><Lista label="Pontos fortes" path={[...p, 'fortes']} /><Lista label="Pontos fracos" path={[...p, 'fracos']} /><Lista label="Como neutralizar" path={[...p, 'neutralizar']} /></div>
          </>)} />
        <Fonte k="individuais" />
      </>);
      case 'bp_ofensiva': return (<>
        <TextoLongo label="Resumo" path={['bp_ofensiva', 'resumo']} ph="Ex.: 20% dos gols de bola parada…" />
        <div style={grade(2)}><Lista label="Escanteios" path={['bp_ofensiva', 'escanteios']} /><Lista label="Faltas" path={['bp_ofensiva', 'faltas']} />
          <Lista label="Laterais" path={['bp_ofensiva', 'laterais']} /><Lista label="Pênaltis" path={['bp_ofensiva', 'penaltis']} /></div>
        <Fonte k="bp_ofensiva" />
      </>);
      case 'bp_defensiva': return (<>
        <div style={grade(4)}><Texto label="Marcação" path={['bp_defensiva', 'marcacao']} ph="zona / individual / mista" /><Numero label="Homens na área" path={['bp_defensiva', 'homens_area']} max={11} />
          <Texto label="Jogador na trave" path={['bp_defensiva', 'trave']} ph="sim / não" /><Texto label="Barreira" path={['bp_defensiva', 'barreira']} ph="nº de jogadores" /></div>
        <Texto label="Quem fica na frente (contra-ataque)" path={['bp_defensiva', 'contra_ataque']} />
        <div style={grade(2)}><Lista label="Goleiro" path={['bp_defensiva', 'goleiro']} /><Lista label="Observações" path={['bp_defensiva', 'itens']} /></div>
        <Fonte k="bp_defensiva" />
      </>);
      case 'pontos': return (<>
        <Lista label="Pontos positivos (o que fazem bem)" path={['pontos', 'positivos']} linhas={5} />
        <Lista label="Pontos a explorar (fragilidades)" path={['pontos', 'explorar']} linhas={5} />
        <Fonte k="pontos" />
      </>);
      case 'final': return (<>
        <Lista label="Observações finais" path={['final', 'observacoes']} linhas={4} />
        <TextoLongo label="Mensagem principal para o jogo" path={['final', 'mensagem']} ph="A ideia principal para o grupo" />
        <Fonte k="final" />
      </>);
      default: return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Análise do adversário${opponentName ? ` · ${opponentName}` : ''}`}
      size="xl"
      footer={(
        <div style={{ display: 'flex', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: '0.78rem', color: colors.textSecondary }}>
            {sujo ? 'Alterações não salvas' : 'O relatório mostra só o que estiver preenchido.'}
          </span>
          <Button variant="outline" onClick={() => exportar('pdf')} disabled={!dados || !!gerando || salvando} icon={<FileDown size={15} />}>
            {gerando === 'pdf' ? 'Gerando…' : 'PDF (sem vídeos)'}
          </Button>
          <Button variant="outline" onClick={() => exportar('pptx')} disabled={!dados || !!gerando || salvando} icon={<Presentation size={15} />}>
            {gerando === 'pptx' ? 'Gerando…' : 'PowerPoint (com vídeos)'}
          </Button>
          {podeEditar && <Button onClick={salvar} disabled={!dados || !sujo || salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>}
        </div>
      )}
    >
      <Ctx.Provider value={{ dados, muda, colors, podeEditar, midias, enviar, remover, enviando, adicionarLink }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 210px) 1fr', gap: '1rem', alignItems: 'start' }}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', position: 'sticky', top: 0 }}>
          {SECOES.map(([k, r]) => (
            <button key={k} type="button" onClick={() => setSecao(k)} aria-current={secao === k ? 'page' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.45rem', textAlign: 'left', padding: '0.45rem 0.6rem', borderRadius: '0.4rem',
                border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: secao === k ? 700 : 500,
                background: secao === k ? `${colors.primary}1f` : 'transparent', color: secao === k ? colors.primary : colors.text,
              }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: preenchidas.has(k) ? colors.primary : colors.border }} />
              {r}
            </button>
          ))}
        </nav>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: colors.text }}>{SECOES.find(([k]) => k === secao)?.[1]}</h3>
          {formulario()}
          {dados && secao !== 'capa' && <VideosDaSecao key={secao} secao={secao} />}
        </div>
      </div>
      </Ctx.Provider>
    </Modal>
  );
}

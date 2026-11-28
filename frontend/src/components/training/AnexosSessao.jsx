import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Upload, Trash2, FileText, FileSpreadsheet, FileImage, FileVideo, File as FileIcon, Link2, Plus } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useCan } from '../../hooks/useCan';
import { api } from '../../services/api';
import { SideSheet } from '../common/SideSheet';
import { Button } from '../common/Button';
import { notify } from '../../lib/notify';

// ANEXOS DA SESSÃO (26/11/2026): material extra do treino que não pertence a uma atividade (planilha de carga, PDF do
// plano, vídeo…). training_activity_files com activity_id NULL. Não entram nas estatísticas; fotos aparecem no fim da
// ficha (PDF). Botão no topo do resumo do dia; dia com 2+ períodos mostra uma seção por período.
// LINKS (28/11/2026): vídeo do YouTube, pasta do Drive… — mesma lista, sem arquivo (mime MIME_LINK, POST /files/link).
const ACEITA = '.pdf,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm';

function iconeDe(mime) {
  const m = String(mime || '');
  if (m.startsWith('image/')) return FileImage;
  if (m.startsWith('video/')) return FileVideo;
  if (m.includes('sheet') || m.includes('excel') || m === 'text/csv') return FileSpreadsheet;
  if (m === 'application/pdf' || m.includes('word') || m.includes('presentation') || m.includes('powerpoint')) return FileText;
  return FileIcon;
}
export const MIME_LINK = 'text/uri-list';
const ehLink = (a) => a?.mime_type === MIME_LINK;
const hostDe = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const tamanho = (b) => (!b ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// periodos: [{ id, label }] — os treinos (sessões) do dia que podem receber anexo
export function AnexosSessao({ periodos = [], estiloBotao }) {
  const { colors } = useTheme();
  const { can } = useCan();
  const podeEnviar = can('training:edit');
  const podeApagar = can('training:delete');
  const input = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [porSessao, setPorSessao] = useState({}); // id → lista
  const [alvo, setAlvo] = useState(null); // sessão que recebe o próximo envio
  const [enviando, setEnviando] = useState(0);
  const [apagando, setApagando] = useState(null);
  const [linkPara, setLinkPara] = useState(null); // sessão com o formulário de link aberto
  const [link, setLink] = useState({ url: '', titulo: '' });
  const [salvandoLink, setSalvandoLink] = useState(false);
  const ids = periodos.map((p) => p.id).filter(Boolean).join(',');

  const carregar = async () => {
    const out = {};
    for (const p of periodos) {
      if (!p.id) continue;
      try {
        const r = await api.get(`/files/session/${p.id}`);
        out[p.id] = (Array.isArray(r) ? r : r?.data || []).filter((f) => !f.activity_id);
      } catch { out[p.id] = []; }
    }
    setPorSessao(out);
  };
  useEffect(() => { setPorSessao({}); if (ids) carregar(); }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  const escolher = (id) => { setAlvo(id); input.current?.click(); };
  const enviar = async (files) => {
    const arr = Array.from(files || []);
    if (!arr.length || !alvo) return;
    setEnviando(arr.length);
    for (const f of arr) {
      const fd = new FormData();
      fd.append('session_id', alvo);
      fd.append('file', f);
      try { await api.upload('/files/upload', fd); }
      catch (e) { notify.error(`${f.name}: ${e.message || 'não foi possível enviar'}`); }
      setEnviando((n) => n - 1);
    }
    setEnviando(0);
    if (input.current) input.current.value = '';
    carregar();
  };
  const salvarLink = async (sessionId) => {
    if (!link.url.trim()) return;
    setSalvandoLink(true);
    try {
      await api.post('/files/link', { session_id: sessionId, url: link.url.trim(), title: link.titulo.trim() || undefined });
      setLink({ url: '', titulo: '' });
      setLinkPara(null);
      carregar();
    } catch (e) { notify.error(e.message || 'Não foi possível salvar o link.'); }
    finally { setSalvandoLink(false); }
  };
  const excluir = async (a) => {
    try { await api.delete(`/files/${a.id}`); setApagando(null); carregar(); }
    catch (e) { notify.error(e.message || 'Não foi possível excluir.'); }
  };

  if (!ids) return null;
  const total = Object.values(porSessao).reduce((t, l) => t + l.length, 0);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Anexos do treino que não são de uma atividade (planilhas, PDFs, vídeos)" style={estiloBotao}>
        <FolderOpen size={17} strokeWidth={1.75} /> Anexos da sessão{total ? ` (${total})` : ''}
      </button>

      <SideSheet isOpen={aberto} onClose={() => setAberto(false)} title="Anexos da sessão" width={480}>
        <p style={{ margin: '0 0 0.9rem', fontSize: '0.84rem', color: colors.textSecondary, lineHeight: 1.5 }}>
          Material extra do treino, fora das atividades (planilha de carga, plano em PDF, vídeo, link). Não entra nas estatísticas; as fotos saem no fim da ficha.
        </p>
        {periodos.filter((p) => p.id).map((p) => {
          const lista = porSessao[p.id];
          return (
            <section key={p.id} style={{ marginBottom: '1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: colors.text }}>{periodos.length > 1 ? p.label : 'Arquivos'}</span>
                {podeEnviar && (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <Button size="sm" variant="secondary" onClick={() => { setLinkPara(linkPara === p.id ? null : p.id); setLink({ url: '', titulo: '' }); }} icon={<Link2 size={14} />}>
                      Link
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => escolher(p.id)} disabled={enviando > 0} icon={<Upload size={14} />}>
                      {enviando > 0 && alvo === p.id ? `Enviando (${enviando})…` : 'Enviar'}
                    </Button>
                  </span>
                )}
              </div>
              {linkPara === p.id && (
                <form onSubmit={(e) => { e.preventDefault(); salvarLink(p.id); }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0.6rem', marginBottom: 8, border: `1px solid ${colors.border}`, borderRadius: 8, backgroundColor: colors.surface }}>
                  <input type="url" inputMode="url" autoFocus required placeholder="Cole o link (YouTube, Drive, planilha online…)" aria-label="Endereço do link"
                    value={link.url} onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))} maxLength={2000}
                    style={{ padding: '0.5rem 0.6rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontFamily: 'inherit', fontSize: '0.85rem' }} />
                  <input type="text" placeholder="Título (opcional)" aria-label="Título do link"
                    value={link.titulo} onChange={(e) => setLink((l) => ({ ...l, titulo: e.target.value }))} maxLength={255}
                    style={{ padding: '0.5rem 0.6rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontFamily: 'inherit', fontSize: '0.85rem' }} />
                  <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <Button size="sm" variant="secondary" type="button" onClick={() => setLinkPara(null)}>Cancelar</Button>
                    <Button size="sm" type="submit" disabled={salvandoLink || !link.url.trim()} icon={<Plus size={14} />}>{salvandoLink ? 'Salvando…' : 'Adicionar link'}</Button>
                  </span>
                </form>
              )}
              {!lista ? <p style={{ fontSize: '0.82rem', color: colors.textSecondary, margin: 0 }}>Carregando…</p>
                : lista.length === 0 ? (
                  <div style={{ border: `1px dashed ${colors.border}`, borderRadius: 8, padding: '0.9rem', textAlign: 'center', fontSize: '0.82rem', color: colors.textSecondary }}>Nenhum anexo.</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {lista.map((a) => {
                      const Icone = ehLink(a) ? Link2 : iconeDe(a.mime_type);
                      return (
                        <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.5rem 0.65rem', border: `1px solid ${colors.border}`, borderRadius: 8, backgroundColor: colors.surface }}>
                          <Icone size={19} color={colors.primary} style={{ flexShrink: 0 }} aria-hidden="true" />
                          <a href={a.url || a.file_path} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: colors.text }}>
                            <span style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || a.file_name}</span>
                            <span style={{ display: 'block', fontSize: '0.72rem', color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ehLink(a) ? hostDe(a.url) : tamanho(Number(a.file_size))}</span>
                          </a>
                          {podeApagar && (apagando === a.id ? (
                            <span style={{ display: 'inline-flex', gap: 4 }}>
                              <Button size="sm" variant="secondary" onClick={() => setApagando(null)}>Não</Button>
                              <Button size="sm" variant="danger" onClick={() => excluir(a)}>Excluir</Button>
                            </span>
                          ) : (
                            <button type="button" onClick={() => setApagando(a.id)} title="Excluir" aria-label={`Excluir ${a.title || a.file_name}`}
                              style={{ border: 'none', background: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
                              <Trash2 size={16} />
                            </button>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                )}
            </section>
          );
        })}
        <p style={{ fontSize: '0.74rem', color: colors.textMuted, margin: 0 }}>PDF, planilha, Word, PowerPoint, foto, vídeo ou link · até 50 MB · até 15 por treino</p>
        <input ref={input} type="file" multiple accept={ACEITA} hidden aria-label="Enviar anexos da sessão" onChange={(e) => enviar(e.target.files)} />
      </SideSheet>
    </>
  );
}

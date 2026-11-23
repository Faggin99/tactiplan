import { useEffect, useRef, useState } from 'react';
import { Paperclip, Upload, Trash2, FileText, FileSpreadsheet, FileImage, FileVideo, File as FileIcon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useCan } from '../../hooks/useCan';
import { api } from '../../services/api';
import { trainingService } from '../../services/trainingService';
import { SideSheet } from '../common/SideSheet';
import { Button } from '../common/Button';
import { notify } from '../../lib/notify';

// ARQUIVOS DA SEMANA (23/11/2026, migration 072): material da comissão ligado ao microciclo — planilhas, PDFs,
// vídeos, fotos. Não entram em estatísticas nem relatórios. Botão no topo da Programação + gaveta com a lista.
const ACEITA = '.pdf,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm';

function iconeDe(mime) {
  const m = String(mime || '');
  if (m.startsWith('image/')) return FileImage;
  if (m.startsWith('video/')) return FileVideo;
  if (m.includes('sheet') || m.includes('excel') || m === 'text/csv') return FileSpreadsheet;
  if (m === 'application/pdf' || m.includes('word') || m.includes('presentation') || m.includes('powerpoint')) return FileText;
  return FileIcon;
}
const tamanho = (b) => (!b ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const quando = (ts) => { if (!ts) return ''; const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function ArquivosSemana({ week, clubId, isMobile }) {
  const { colors } = useTheme();
  const { can } = useCan();
  const podeEditar = can('training:edit');
  const input = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState(null);
  const [enviando, setEnviando] = useState(0); // arquivos na fila
  const [apagando, setApagando] = useState(null);

  const carregar = () => {
    if (!week || !clubId) return;
    api.get(`/arquivos-semana?week=${week}&club_id=${clubId}`).then((r) => setLista(r.data || [])).catch(() => setLista([]));
  };
  useEffect(() => { setLista(null); carregar(); }, [week, clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (files) => {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    setEnviando(arr.length);
    try {
      await trainingService.ensureMicrocycleStructure(week, clubId); // semana ainda não criada
      for (const f of arr) {
        const fd = new FormData();
        fd.append('week', week);
        fd.append('club_id', clubId);
        fd.append('file', f);
        try { await api.upload('/arquivos-semana', fd); }
        catch (e) { notify.error(`${f.name}: ${e.message || 'não foi possível enviar'}`); }
        setEnviando((n) => n - 1);
      }
    } catch (e) {
      notify.error(e.message || 'Não foi possível enviar.');
    } finally {
      setEnviando(0);
      if (input.current) input.current.value = '';
      carregar();
    }
  };

  const excluir = async (a) => {
    try { await api.delete(`/arquivos-semana/${a.id}`); setApagando(null); carregar(); }
    catch (e) { notify.error(e.message || 'Não foi possível excluir.'); }
  };

  const n = lista?.length || 0;
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Arquivos da comissão para esta semana (não entram nas estatísticas)"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: isMobile ? '0.4rem 0.6rem' : '0.45rem 0.8rem', borderRadius: '0.5rem', border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text, fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
        <Paperclip size={15} />
        {isMobile ? '' : 'Arquivos da semana'}
        {n > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, backgroundColor: colors.primary, color: colors.primaryText || '#fff', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>}
      </button>

      <SideSheet isOpen={aberto} onClose={() => setAberto(false)} title={`Arquivos da semana ${String(week || '').split('-')[1] || ''}`} width={480}
        footer={podeEditar ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>PDF, planilha, Word, PowerPoint, foto ou vídeo · até 50 MB</span>
            <Button size="sm" onClick={() => input.current?.click()} disabled={enviando > 0} icon={<Upload size={15} />}>
              {enviando > 0 ? `Enviando (${enviando})…` : 'Enviar arquivos'}
            </Button>
          </div>
        ) : null}>
        <p style={{ margin: '0 0 0.9rem', fontSize: '0.84rem', color: colors.textSecondary, lineHeight: 1.5 }}>
          Material da comissão para esta semana (planejamento, planilhas, vídeos). Fica só aqui: não entra nas estatísticas nem nos relatórios.
        </p>
        {lista === null ? (
          <p style={{ color: colors.textSecondary, fontSize: '0.85rem' }}>Carregando…</p>
        ) : lista.length === 0 ? (
          <div style={{ border: `1px dashed ${colors.border}`, borderRadius: 10, padding: '1.6rem 1rem', textAlign: 'center', color: colors.textSecondary, fontSize: '0.86rem' }}>
            Nenhum arquivo nesta semana.
            {podeEditar && <div style={{ marginTop: '0.7rem' }}><Button size="sm" variant="secondary" onClick={() => input.current?.click()} icon={<Upload size={15} />}>Enviar arquivos</Button></div>}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lista.map((a) => {
              const Icone = iconeDe(a.mime_type);
              return (
                <li key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.55rem 0.65rem', border: `1px solid ${colors.border}`, borderRadius: 8, backgroundColor: colors.surface }}>
                  <Icone size={20} color={colors.primary} style={{ flexShrink: 0 }} aria-hidden="true" />
                  <a href={a.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: colors.text }}>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || a.file_name}</span>
                    <span style={{ display: 'block', fontSize: '0.72rem', color: colors.textSecondary }}>
                      {[tamanho(Number(a.file_size)), a.enviado_por, quando(a.created_at)].filter(Boolean).join(' · ')}
                    </span>
                  </a>
                  {podeEditar && (apagando === a.id ? (
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: '0.78rem' }}>
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
        <input ref={input} type="file" multiple accept={ACEITA} hidden onChange={(e) => enviar(e.target.files)} />
      </SideSheet>
    </>
  );
}

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, BookmarkCheck } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useCan } from '../../hooks/useCan';
import { trainingService } from '../../services/trainingService';
import { COR_PILAR } from '../../lib/estilos';
import { notify } from '../../lib/notify';

// "Sessões salvas" no catálogo de atividades (21/11/2026, migration 070): os modelos de treino da conta, com os
// blocos de cada um. Salvar e usar ficam na Programação (clique direito no dia → Modelos de treino).
export function SessoesSalvas() {
  const { colors } = useTheme();
  const { can } = useCan();
  const [modelos, setModelos] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [apagando, setApagando] = useState(null); // id em confirmação

  const carregar = () => trainingService.listarModelos().then(setModelos).catch(() => setModelos([]));
  useEffect(() => { carregar(); }, []);

  const excluir = async (m) => {
    try {
      await trainingService.excluirModelo(m.id);
      notify.success(`Modelo "${m.nome}" excluído.`);
      setApagando(null);
      carregar();
    } catch (e) {
      notify.error(e.message || 'Não foi possível excluir.');
    }
  };

  if (!modelos) return null;
  const card = { backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.6rem' };

  return (
    <section aria-label="Sessões salvas" style={{ ...card, padding: '0.9rem 1rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: colors.text, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <BookmarkCheck size={18} color={colors.primary} /> Sessões salvas <span style={{ fontSize: '0.85rem', fontWeight: 500, color: colors.textSecondary }}>({modelos.length})</span>
        </h2>
        <span style={{ fontSize: '0.8rem', color: colors.textSecondary }}>
          Para salvar ou usar: na Programação, clique com o botão direito no dia → Modelos de treino.
        </span>
      </div>
      {modelos.length === 0 ? (
        <p style={{ margin: '0.6rem 0 0', fontSize: '0.86rem', color: colors.textSecondary }}>
          Nenhuma sessão salva ainda. Monte um treino na Programação e salve-o como modelo para repetir em outros dias.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {modelos.map((m) => {
            const open = aberto === m.id;
            return (
              <li key={m.id} style={{ border: `1px solid ${colors.border}`, borderRadius: '0.5rem', backgroundColor: colors.background }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.7rem' }}>
                  <button type="button" onClick={() => setAberto(open ? null : m.id)} aria-expanded={open}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: colors.text }}>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
                    <span style={{ fontSize: '0.8rem', color: colors.textSecondary, whiteSpace: 'nowrap' }}>
                      {m.atividades} {m.atividades === 1 ? 'atividade' : 'atividades'}{m.minutos ? ` · ${m.minutos} min` : ''}
                    </span>
                  </button>
                  {can('training:edit') && (apagando === m.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.8rem', color: colors.text }}>
                      Excluir?
                      <button type="button" onClick={() => excluir(m)} style={{ border: 'none', background: '#dc2626', color: '#fff', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Sim</button>
                      <button type="button" onClick={() => setApagando(null)} style={{ border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' }}>Não</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setApagando(m.id)} title="Excluir modelo" aria-label={`Excluir ${m.nome}`}
                      style={{ border: 'none', background: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 4 }}>
                      <Trash2 size={16} />
                    </button>
                  ))}
                </div>
                {open && (
                  <ol style={{ listStyle: 'none', margin: 0, padding: '0 0.9rem 0.7rem 2.2rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {m.blocos.map((b) => (
                      <li key={b.ordem} style={{ display: 'grid', gridTemplateColumns: '9rem 1fr auto', gap: 8, fontSize: '0.82rem', alignItems: 'baseline' }}>
                        <span style={{ color: colors.textSecondary }}>{b.nome}</span>
                        <span style={{ color: b.titulo || b.conteudo ? colors.text : colors.textMuted, display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          {b.pilar && <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: COR_PILAR[b.pilar], flexShrink: 0 }} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[b.conteudo, b.titulo].filter(Boolean).join(' · ') || (b.descricao ? b.descricao.slice(0, 60) : '—')}</span>
                        </span>
                        <span style={{ color: colors.textSecondary }}>{b.minutos ? `${b.minutos}'` : ''}</span>
                      </li>
                    ))}
                    {m.criado_por && <li style={{ fontSize: '0.75rem', color: colors.textMuted, marginTop: 2 }}>Salvo por {m.criado_por}</li>}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

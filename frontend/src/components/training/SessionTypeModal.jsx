import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Dribbble, Moon, Trophy, Plus, Trash2, Sun, Sunset, MoonStar } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useTheme } from '../../contexts/ThemeContext';
import { PERIODOS, MAX_PERIODOS, rotuloPeriodo, periodosDoDia, periodosLivres } from '../../lib/periodos';

const ICONE_PERIODO = { manha: Sun, tarde: Sunset, noite: MoonStar };

// Menu do dia (clique direito / toque longo): tipo do dia — ou do período, no
// dia com 2+ períodos — e os períodos (Adicionar / Trocar horário / Remover).
// session = o período em exibição; day = o dia (com `periodos` quando houver).
export function SessionTypeModal({ isOpen, onClose, session, day = null, onSave, onAddPeriod, onRemovePeriod, onRenamePeriod, podeApagar = true }) {
  const { colors } = useTheme();
  const [sessionType, setSessionType] = useState('training');
  const [opponentName, setOpponentName] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [atual, setAtual] = useState('manha');
  const [novo, setNovo] = useState('tarde');
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const periodos = periodosDoDia(day);
  const livres = periodos ? periodosLivres(day) : PERIODOS;
  const outroJogo = !!periodos?.some((p) => p.id !== session?.id && p.session_type === 'match');
  const rotuloAtual = rotuloPeriodo(session?.periodo);

  useEffect(() => {
    if (session) {
      setSessionType(session.session_type || 'training');
      setOpponentName(session.opponent_name || '');
    }
    setAdicionando(false);
    setConfirmarRemocao(false);
    setOcupado(false);
  }, [session, isOpen]);

  useEffect(() => {
    // sugestão: o treino que existe é Manhã, o novo é Tarde; com períodos, o 1º livre
    if (!periodos) { setAtual('manha'); setNovo('tarde'); } else { setNovo(livres[0] || 'noite'); }
  }, [adicionando]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    onSave({
      session_type: sessionType,
      opponent_name: sessionType === 'match' ? opponentName : null,
    });
  };

  async function rodar(fn) {
    if (ocupado) return;
    setOcupado(true);
    try { await fn(); } finally { setOcupado(false); }
  }

  const typeOptions = [
    { value: 'training', label: 'Treino Normal', Icon: Dribbble },
    // Descanso é do dia inteiro: some no dia com 2+ períodos
    ...(periodos ? [] : [{ value: 'rest', label: 'Descanso', Icon: Moon }]),
    { value: 'match', label: 'Jogo', Icon: Trophy, disabled: outroJogo },
  ];

  const optionStyle = (isSelected, disabled) => ({
    padding: '1.5rem',
    border: `2px solid ${isSelected ? colors.primary : colors.border}`,
    borderRadius: '0.5rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'all 0.2s',
    backgroundColor: isSelected ? `${colors.primary}10` : colors.surface,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
  });

  const labelStyle = { fontSize: '1rem', fontWeight: '500', color: colors.text };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '0.375rem',
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: '1rem',
  };

  const chip = (on, disabled = false) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.4rem 0.75rem',
    borderRadius: 999,
    border: `1.5px solid ${on ? colors.primary : colors.border}`,
    background: on ? `${colors.primary}18` : colors.surface,
    color: colors.text,
    fontSize: '0.85rem',
    fontWeight: on ? 700 : 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  });

  const escolhaPeriodo = (valor, setValor, bloqueados = []) => (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {PERIODOS.map((p) => {
        const Ic = ICONE_PERIODO[p];
        const off = bloqueados.includes(p);
        return (
          <button key={p} type="button" disabled={off} aria-pressed={valor === p} style={chip(valor === p, off)} onClick={() => !off && setValor(p)}>
            <Ic size={14} />{rotuloPeriodo(p)}
          </button>
        );
      })}
    </div>
  );

  const ehDescanso = (session?.session_type || 'training') === 'rest';
  const cheio = (periodos?.length || 1) >= MAX_PERIODOS;
  const tituloDia = `${session?.day_name || day?.day_name || ''}${rotuloAtual ? ` · ${rotuloAtual}` : ''}`;
  const ehJogo = session?.session_type === 'match';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Tipo de Sessão - ${tituloDia}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Tipo de Sessão */}
        <div>
          <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: '500', color: colors.text }}>
            {periodos ? `Tipo do período (${rotuloAtual}):` : 'Selecione o tipo de sessão:'}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${typeOptions.length}, 1fr)`, gap: '1rem' }}>
            {typeOptions.map((option) => (
              <div
                key={option.value}
                style={optionStyle(sessionType === option.value, option.disabled)}
                title={option.disabled ? 'O dia já tem um período de jogo' : undefined}
                onClick={() => { if (!option.disabled) setSessionType(option.value); }}
                onMouseEnter={(e) => {
                  if (sessionType !== option.value && !option.disabled) {
                    e.currentTarget.style.borderColor = colors.primary;
                    e.currentTarget.style.backgroundColor = `${colors.primary}05`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (sessionType !== option.value) {
                    e.currentTarget.style.borderColor = colors.border;
                    e.currentTarget.style.backgroundColor = colors.surface;
                  }
                }}
              >
                <option.Icon size={48} strokeWidth={1.5} />
                <div style={labelStyle}>{option.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Campo de Adversário (apenas para Jogo) */}
        {sessionType === 'match' && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: colors.text }}>
              Adversário:
            </label>
            <input
              type="text"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
              placeholder="Digite o nome do adversário..."
              style={inputStyle}
              autoFocus
            />
          </div>
        )}

        {/* Descrição do tipo selecionado */}
        <div style={{
          padding: '1rem',
          backgroundColor: `${colors.primary}10`,
          borderRadius: '0.375rem',
          fontSize: '0.875rem',
          color: colors.textSecondary,
        }}>
          {sessionType === 'training' && 'Treino normal com 6 subdivisões de atividades.'}
          {sessionType === 'rest' && 'Dia de descanso - sem atividades programadas.'}
          {sessionType === 'match' && 'Dia de jogo - informação do adversário + 1 bloco "Não relacionados".'}
        </div>

        {/* Períodos do dia */}
        {(onAddPeriod || onRemovePeriod) && (
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <div style={{ fontWeight: 600, color: colors.text }}>Períodos do dia</div>
              <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginTop: '0.2rem' }}>
                {periodos
                  ? `${periodos.length} períodos: ${periodos.map((p) => rotuloPeriodo(p.periodo)).join(' · ')}. Cada um tem os seus 6 blocos.`
                  : 'Treino em um período só. Treina duas vezes no dia? Adicione um período (até 3).'}
              </div>
            </div>

            {periodos && onRenamePeriod && (
              <div>
                <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>Horário deste período</div>
                {escolhaPeriodo(session?.periodo, (p) => { if (p !== session?.periodo) rodar(() => onRenamePeriod(p)); }, periodos.filter((p) => p.id !== session?.id).map((p) => p.periodo))}
              </div>
            )}

            {!adicionando && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {onAddPeriod && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ehDescanso || cheio || ocupado}
                    onClick={() => setAdicionando(true)}
                    title={ehDescanso ? 'Dia de descanso não tem períodos' : cheio ? 'Máximo de 3 períodos' : undefined}
                  >
                    <Plus size={14} style={{ marginRight: 4 }} />Adicionar período
                  </Button>
                )}
                {periodos && onRemovePeriod && podeApagar && (
                  <Button variant="danger" size="sm" disabled={ocupado} onClick={() => setConfirmarRemocao(true)}>
                    <Trash2 size={14} style={{ marginRight: 4 }} />Remover período ({rotuloAtual})
                  </Button>
                )}
              </div>
            )}
            {ehDescanso && !periodos && (
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>Dia de descanso não tem períodos.</div>
            )}

            {adicionando && (
              <div style={{ border: `1px solid ${colors.border}`, borderRadius: '0.5rem', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {!periodos && (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>O treino que já existe é de:</div>
                    {escolhaPeriodo(atual, (p) => { setAtual(p); if (p === novo) setNovo(PERIODOS.find((x) => x !== p)); })}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>Novo período:</div>
                  {escolhaPeriodo(novo, setNovo, periodos ? PERIODOS.filter((p) => !livres.includes(p)) : [atual])}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <Button variant="secondary" size="sm" onClick={() => setAdicionando(false)}>Voltar</Button>
                  <Button
                    size="sm"
                    disabled={ocupado || (!periodos && atual === novo)}
                    onClick={() => rodar(async () => { await onAddPeriod({ atual: periodos ? null : atual, novo }); })}
                  >
                    {ocupado ? 'Adicionando…' : `Adicionar ${rotuloPeriodo(novo)}`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmarRemocao && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tp-remover-periodo-titulo"
          onClick={() => !ocupado && setConfirmarRemocao(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 100%)', background: colors.surface, color: colors.text, borderRadius: '0.75rem', padding: '1.25rem', boxShadow: '0 20px 40px rgba(0,0,0,0.35)', border: `1px solid ${colors.border}` }}>
            <div id="tp-remover-periodo-titulo" style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.5rem' }}>Remover o período {rotuloAtual}?</div>
            <div style={{ fontSize: '0.875rem', color: colors.textSecondary, lineHeight: 1.5 }}>
              As atividades e os anexos {ehJogo ? 'e o jogo (escalação e eventos) ' : ''}deste período serão apagados. Isso não tem volta.
              {periodos?.length === 2 && ' O dia volta a ter um período só.'}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.1rem' }}>
              <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => setConfirmarRemocao(false)}>Cancelar</Button>
              <Button variant="danger" size="sm" disabled={ocupado} onClick={() => rodar(async () => { await onRemovePeriod(); setConfirmarRemocao(false); })}>
                {ocupado ? 'Removendo…' : 'Remover'}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </Modal>
  );
}

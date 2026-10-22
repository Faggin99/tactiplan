import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Dribbble, Moon, Trophy, Plus, Trash2, Sun, Sunset, MoonStar, ClipboardCheck } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useTheme } from '../../contexts/ThemeContext';
import { PERIODOS, MAX_PERIODOS, rotuloPeriodo, periodoEfetivo, periodosDoDia, periodosLivres, TIPOS_AVALIACAO, ROTULO_AVALIACAO, MAX_OUTRA, normalizarAvaliacao } from '../../lib/periodos';

const ICONE_PERIODO = { manha: Sun, tarde: Sunset, noite: MoonStar };

// Chips do tipo de avaliação (seleção múltipla) + "Outra" com texto curto.
function EscolhaAvaliacao({ tipos, setTipos, outra, setOutra, chip, inputStyle, colors }) {
  const alternar = (t) => setTipos(tipos.includes(t) ? tipos.filter((x) => x !== t) : [...tipos, t]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div role="group" aria-label="Tipo de avaliação" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {TIPOS_AVALIACAO.map((t) => (
          <button key={t} type="button" aria-pressed={tipos.includes(t)} style={chip(tipos.includes(t))} onClick={() => alternar(t)}>
            {ROTULO_AVALIACAO[t]}
          </button>
        ))}
      </div>
      {tipos.includes('outra') && (
        <div>
          <input
            type="text"
            value={outra}
            maxLength={MAX_OUTRA}
            onChange={(e) => setOutra(e.target.value)}
            placeholder="Qual avaliação? (ex.: Teste de Yo-Yo)"
            aria-label="Outra avaliação"
            style={{ ...inputStyle, padding: '0.55rem 0.75rem', fontSize: '0.9rem' }}
            autoFocus
          />
          <div style={{ fontSize: '0.7rem', color: colors.textSecondary, textAlign: 'right', marginTop: 2 }}>{outra.length}/{MAX_OUTRA}</div>
        </div>
      )}
    </div>
  );
}

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
  // avaliação (tipo do período) e avaliação do período novo
  const [avTipos, setAvTipos] = useState([]);
  const [avOutra, setAvOutra] = useState('');
  const [novoTipo, setNovoTipo] = useState('training');
  const [novoAvTipos, setNovoAvTipos] = useState([]);
  const [novoAvOutra, setNovoAvOutra] = useState('');

  const periodos = periodosDoDia(day);
  const livres = periodos ? periodosLivres(day) : PERIODOS;
  const outroJogo = !!periodos?.some((p) => p.id !== session?.id && p.session_type === 'match');
  const rotuloAtual = rotuloPeriodo(session?.periodo);
  // dia de período único (treino): o horário dele (Manhã é o padrão do dia sem nome)
  const efetivoUnico = !periodos && ['training', 'assessment'].includes(session?.session_type || 'training') ? periodoEfetivo(session) : null;

  useEffect(() => {
    if (session) {
      setSessionType(session.session_type || 'training');
      setOpponentName(session.opponent_name || '');
      setAvTipos(Array.isArray(session.assessment_types) ? session.assessment_types : []);
      setAvOutra(session.assessment_other || '');
    }
    setNovoTipo('training'); setNovoAvTipos([]); setNovoAvOutra('');
    setAdicionando(false);
    setConfirmarRemocao(false);
    setOcupado(false);
  }, [session, isOpen]);

  useEffect(() => {
    // sugestão: o treino que existe é Manhã, o novo é Tarde; com períodos, o 1º livre
    if (!periodos) {
      const a = efetivoUnico || 'manha';
      setAtual(a); setNovo(PERIODOS.find((p) => p !== a));
    } else { setNovo(livres[0] || 'noite'); }
  }, [adicionando]); // eslint-disable-line react-hooks/exhaustive-deps

  const avaliacaoAtual = normalizarAvaliacao({ tipos: avTipos, outra: avTipos.includes('outra') ? avOutra : '' });
  const avaliacaoNova = normalizarAvaliacao({ tipos: novoAvTipos, outra: novoAvTipos.includes('outra') ? novoAvOutra : '' });
  const salvarBloqueado = sessionType === 'assessment' && !avaliacaoAtual.ok;

  const handleSave = () => {
    if (salvarBloqueado) return;
    onSave({
      session_type: sessionType,
      opponent_name: sessionType === 'match' ? opponentName : null,
      ...(sessionType === 'assessment' ? { assessment_types: avaliacaoAtual.tipos, assessment_other: avaliacaoAtual.outra } : {}),
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
    { value: 'assessment', label: 'Avaliação', Icon: ClipboardCheck },
  ];

  const optionStyle = (isSelected, disabled) => ({
    padding: '1.1rem 0.5rem',
    minWidth: 0,
    textAlign: 'center',
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

  const labelStyle = { fontSize: '0.95rem', fontWeight: '500', color: colors.text };

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
          <Button onClick={handleSave} disabled={salvarBloqueado} title={salvarBloqueado ? 'Diga qual é a outra avaliação' : undefined}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '0.75rem' }}>
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
                <option.Icon size={40} strokeWidth={1.5} />
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

        {/* Tipo de avaliação (única informação do período de avaliação) */}
        {sessionType === 'assessment' && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: colors.text }}>
              Tipo de avaliação:
            </label>
            <EscolhaAvaliacao tipos={avTipos} setTipos={setAvTipos} outra={avOutra} setOutra={setAvOutra} chip={chip} inputStyle={inputStyle} colors={colors} />
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
          {sessionType === 'assessment' && 'Período de avaliação - sem blocos de atividade. Não soma minutos nem entra nas estatísticas.'}
        </div>

        {/* Períodos do dia */}
        {(onAddPeriod || onRemovePeriod) && (
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div>
              <div style={{ fontWeight: 600, color: colors.text }}>Períodos do dia</div>
              <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginTop: '0.2rem' }}>
                {periodos
                  ? `${periodos.length} períodos: ${periodos.map((p) => rotuloPeriodo(p.periodo)).join(' · ')}. Cada um tem os seus 6 blocos.`
                  : efetivoUnico
                    ? `${session?.session_type === 'assessment' ? 'Avaliação' : 'Treino'} em um período só (${rotuloPeriodo(efetivoUnico)}). Treina ou avalia duas vezes no dia? Adicione um período (até 3).`
                    : 'Treino em um período só. Treina duas vezes no dia? Adicione um período (até 3).'}
              </div>
            </div>

            {!periodos && efetivoUnico && onRenamePeriod && !adicionando && (
              <div>
                <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>{session?.session_type === 'assessment' ? 'Horário da avaliação' : 'Horário do treino'}</div>
                {escolhaPeriodo(efetivoUnico, (p) => { if (p !== efetivoUnico) rodar(() => onRenamePeriod(p)); })}
              </div>
            )}

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
                    <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>{session?.session_type === 'assessment' ? 'A avaliação que já existe é de:' : session?.session_type === 'match' ? 'O jogo que já existe é de:' : 'O treino que já existe é de:'}</div>
                    {escolhaPeriodo(atual, (p) => { setAtual(p); if (p === novo) setNovo(PERIODOS.find((x) => x !== p)); })}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>Novo período:</div>
                  {escolhaPeriodo(novo, setNovo, periodos ? PERIODOS.filter((p) => !livres.includes(p)) : [atual])}
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>O novo período é de:</div>
                  <div role="group" aria-label="Tipo do novo período" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button type="button" aria-pressed={novoTipo === 'training'} style={chip(novoTipo === 'training')} onClick={() => setNovoTipo('training')}><Dribbble size={14} />Treino</button>
                    <button type="button" aria-pressed={novoTipo === 'assessment'} style={chip(novoTipo === 'assessment')} onClick={() => setNovoTipo('assessment')}><ClipboardCheck size={14} />Avaliação</button>
                  </div>
                </div>
                {novoTipo === 'assessment' && (
                  <div>
                    <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.35rem' }}>Tipo de avaliação:</div>
                    <EscolhaAvaliacao tipos={novoAvTipos} setTipos={setNovoAvTipos} outra={novoAvOutra} setOutra={setNovoAvOutra} chip={chip} inputStyle={inputStyle} colors={colors} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <Button variant="secondary" size="sm" onClick={() => setAdicionando(false)}>Voltar</Button>
                  <Button
                    size="sm"
                    disabled={ocupado || (!periodos && atual === novo) || (novoTipo === 'assessment' && !avaliacaoNova.ok)}
                    onClick={() => rodar(async () => {
                      await onAddPeriod({
                        atual: periodos ? null : atual,
                        novo,
                        tipo: novoTipo,
                        ...(novoTipo === 'assessment' ? { assessment_types: avaliacaoNova.tipos, assessment_other: avaliacaoNova.outra } : {}),
                      });
                    })}
                  >
                    {ocupado ? 'Adicionando…' : `Adicionar ${rotuloPeriodo(novo)}${novoTipo === 'assessment' ? ' (avaliação)' : ''}`}
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

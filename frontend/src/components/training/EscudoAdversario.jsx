import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { gameService } from '../../services/gameService';
import { api } from '../../services/api';
import { notify } from '../../lib/notify';

// Escudo do ADVERSÁRIO no topo do jogo (21/11/2026): a vaga fica ao lado do nome, sempre à vista.
// Sem escudo: quadrado tracejado "Escudo". Clique = escolher a imagem (substitui). Jogo sem escudo próprio mostra
// o último enviado para o mesmo adversário (herdado, com aviso). Grava na hora (mídia 'escudo' da análise).
// onMudou(): avisa o pai para recarregar a Programação (os logos aparecem no dia do jogo).
export function EscudoAdversario({ sessionId, opponentName, podeEditar = true, onMudou, tamanho = 38 }) {
  const { colors } = useTheme();
  const input = useRef(null);
  const [escudo, setEscudo] = useState(null); // { url, midia_id, herdado, de_data }
  const [ocupado, setOcupado] = useState(false);

  const carregar = () => {
    if (!sessionId) return;
    api.get(`/games/${sessionId}/escudo`).then(setEscudo).catch(() => setEscudo(null));
  };
  // recarrega ao abrir e quando o nome muda (pode herdar de outro jogo contra o mesmo time)
  useEffect(() => { carregar(); }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify.error('O escudo precisa ser uma imagem (PNG, JPG ou WEBP).'); return; }
    setOcupado(true);
    try {
      await gameService.uploadAnaliseMidia(sessionId, file, { tipo: 'escudo' });
      notify.success(`Escudo${opponentName ? ` do ${opponentName}` : ''} salvo.`);
      carregar();
      onMudou?.();
    } catch (e) {
      notify.error(e.message || 'Não foi possível enviar o escudo.');
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = '';
    }
  };

  const remover = async (e) => {
    e.stopPropagation();
    if (!escudo?.midia_id) return;
    setOcupado(true);
    try {
      await gameService.deleteAnaliseMidia(sessionId, escudo.midia_id);
      carregar();
      onMudou?.();
    } catch (err) {
      notify.error(err.message || 'Não foi possível remover.');
    } finally { setOcupado(false); }
  };

  if (!sessionId) return null;
  const tem = !!escudo?.url;
  const dica = !podeEditar ? 'Escudo do adversário'
    : tem ? (escudo.herdado ? `Escudo usado no jogo de ${escudo.de_data?.split('-').reverse().join('/')} contra o mesmo time. Clique para trocar.` : 'Clique para trocar o escudo do adversário')
      : 'Adicionar o escudo do adversário (aparece na Programação e nos relatórios)';

  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button type="button" onClick={() => podeEditar && !ocupado && input.current?.click()} disabled={!podeEditar || ocupado}
        title={dica} aria-label={dica}
        style={{
          width: tamanho, height: tamanho, borderRadius: 8, padding: tem ? 3 : 0, cursor: podeEditar ? 'pointer' : 'default',
          border: tem ? `1px solid ${colors.border}` : `1.5px dashed ${colors.primary}`,
          backgroundColor: tem ? '#fff' : `${colors.primary}10`, color: colors.primary,
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
          opacity: ocupado ? 0.6 : 1, fontFamily: 'inherit',
        }}>
        {tem
          ? <img src={escudo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: escudo.herdado ? 0.85 : 1 }} />
          : <><ImagePlus size={Math.round(tamanho * 0.42)} strokeWidth={1.75} /><span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1 }}>ESCUDO</span></>}
      </button>
      {tem && !escudo.herdado && podeEditar && (
        <button type="button" onClick={remover} disabled={ocupado} title="Remover escudo" aria-label="Remover escudo"
          style={{ position: 'absolute', top: -6, right: -6, width: 17, height: 17, borderRadius: '50%', border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textSecondary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}>
          <X size={11} />
        </button>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => enviar(e.target.files?.[0])} />
    </span>
  );
}

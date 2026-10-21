import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { usePlanFeatures } from '../../hooks/usePlanFeatures';
import { isNative } from '../../lib/platform';
import { notify } from '../../lib/notify';
import { Button } from './Button';
import { NOME_CLUBE } from '../../config/planos';

// Recursos dos planos pagos. No app NATIVO o texto é 100% neutro (sem chamada
// pra compra). Na web a gente pode apontar pros planos.
export const FEATURE_META = {
  quadro_tatico: { title: 'Quadro Tático', desc: 'Monte jogadas, anime quadro a quadro e exporte em vídeo.' },
  pdf_export:    { title: 'Exportações',   desc: 'Relatórios em PDF e planilhas pra apresentar e arquivar.' },
  max_athletes:  { title: 'Mais atletas',  desc: 'Plantel sem limite de atletas.' },
  multi_user:    { title: 'Categorias',    desc: 'Várias categorias e comissão técnica completa no mesmo clube.' },
  equipe:        { title: 'Convidar membros', desc: 'Convide quem trabalha com você na comissão técnica.' },
};

export function featureLockedMessage(feature) {
  const title = FEATURE_META[feature]?.title || 'Este recurso';
  return isNative()
    ? `${title} não está incluído no seu plano atual.`
    : `${title} está disponível no plano ${NOME_CLUBE}.`;
}

// Hook pra gatear ações pontuais (botões de exportar etc.): retorna uma função
// que devolve true se pode seguir, ou avisa e devolve false.
export function useFeatureGuard() {
  const { has, loading } = usePlanFeatures();
  return (feature) => {
    if (loading || has(feature)) return true;
    notify.info(featureLockedMessage(feature));
    return false;
  };
}

// Gate de página inteira (ex.: rota do Quadro Tático).
export function PlanGate({ feature, children }) {
  const { has, loading } = usePlanFeatures();
  const { colors } = useTheme();
  const navigate = useNavigate();
  if (loading) return null;
  if (has(feature)) return children;

  const meta = FEATURE_META[feature] || {};
  const native = isNative();
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, backgroundColor: colors.background,
    }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: `${colors.primary}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <Lock size={28} color={colors.primary} />
        </div>
        <h2 style={{ color: colors.text, margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 700 }}>
          {meta.title || 'Recurso indisponível'}
        </h2>
        <p style={{ color: colors.textSecondary, margin: '0 0 20px', lineHeight: 1.55, fontSize: '0.95rem' }}>
          {native
            ? `${meta.title || 'Este recurso'} não está incluído no seu plano atual.`
            : `${meta.desc ? meta.desc + ' ' : ''}Disponível no plano ${NOME_CLUBE}.`}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => navigate('/home')}>Voltar ao início</Button>
          {!native && <Button onClick={() => navigate('/billing')}>Ver o plano {NOME_CLUBE}</Button>}
        </div>
      </div>
    </div>
  );
}

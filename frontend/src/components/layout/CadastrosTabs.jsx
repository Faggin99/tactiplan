import { NavLink, Navigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useCan } from '../../hooks/useCan';
import { usePlanFeatures } from '../../hooks/usePlanFeatures';
import { CADASTROS_EXTRA, abasVisiveis } from '../../lib/cadastros';

// Barra de abas no topo das telas de Cadastros.
export function CadastrosTabs() {
  const { colors } = useTheme();
  const { can } = useCan();
  const plan = usePlanFeatures();
  const { pathname } = useLocation();
  const abas = abasVisiveis(can);
  const ativa = CADASTROS_EXTRA[Object.keys(CADASTROS_EXTRA).find((p) => pathname.startsWith(p))] || pathname;
  if (abas.length <= 1) return null;
  return (
    <div role="tablist" aria-label="Cadastros" style={{
      display: 'flex', gap: '0.25rem', overflowX: 'auto', scrollbarWidth: 'none',
      borderBottom: `1px solid ${colors.border}`, margin: '0 0 1rem', flexShrink: 0,
    }}>
      {abas.map((t) => {
        const on = ativa === t.to || ativa.startsWith(t.to + '/');
        const travada = !!t.gated && !plan.has(t.gated);
        return (
          <NavLink key={t.to} to={t.to} role="tab" aria-selected={on}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap',
              padding: '0.6rem 0.85rem', fontSize: '0.86rem', fontWeight: on ? 650 : 500, textDecoration: 'none',
              color: on ? colors.primary : colors.textSecondary,
              borderBottom: `2px solid ${on ? colors.primary : 'transparent'}`, marginBottom: -1,
            }}>
            {t.label}{travada && <Lock size={12} color={colors.warning} />}
          </NavLink>
        );
      })}
    </div>
  );
}

// /settings/cadastros → primeira aba que a pessoa pode abrir.
export function CadastrosIndex() {
  const { can } = useCan();
  const abas = abasVisiveis(can);
  return <Navigate to={(abas[0] || { to: '/settings/clubs' }).to} replace />;
}

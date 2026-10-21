import { Link } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useClub } from '../../contexts/ClubContext';

// Faixa quando o clube aberto está ARQUIVADO: só leitura (histórico e relatórios).
// O servidor recusa qualquer edição (409 CLUB_ARCHIVED); aqui só avisamos e damos a saída.
export function ArchivedClubBanner() {
  const { colors } = useTheme();
  const { selectedClub, isSelectedArchived, clubs, selectClub } = useClub();
  if (!isSelectedArchived) return null;
  const ativo = clubs[0] || null;
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0.625rem 1.25rem', backgroundColor: `${colors.textSecondary}14`, borderBottom: `1px solid ${colors.border}`, color: colors.text, fontSize: '0.875rem' }}>
      <Archive size={16} color={colors.textSecondary} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 200 }}>
        <strong>{selectedClub?.name}</strong> está arquivado: dá para consultar o histórico e gerar relatórios, mas não editar.
      </span>
      {ativo && (
        <button type="button" onClick={() => selectClub(ativo)} style={{ padding: '0.375rem 0.875rem', background: colors.primary, color: colors.primaryText, border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Voltar para {ativo.name}
        </button>
      )}
      <Link to="/settings/clubs" style={{ color: colors.primary, fontWeight: 600, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
        Gerenciar clubes
      </Link>
    </div>
  );
}

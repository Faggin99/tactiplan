import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookmarkCheck, ArrowRight } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { trainingService } from '../../services/trainingService';

// Atalho no catálogo de atividades para a página "Sessões salvas" (/sessoes-salvas), onde ficam os treinos
// completos guardados (ver, usar em um dia, renomear, excluir).
export function SessoesSalvas() {
  const { colors } = useTheme();
  const [n, setN] = useState(null);
  useEffect(() => { trainingService.listarModelos().then((l) => setN(l.length)).catch(() => setN(null)); }, []);
  return (
    <Link to="/sessoes-salvas" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.8rem 1rem', marginBottom: '1.25rem', borderRadius: '0.6rem', border: `1px solid ${colors.border}`, backgroundColor: colors.surface, color: colors.text, textDecoration: 'none' }}>
      <BookmarkCheck size={18} color={colors.primary} aria-hidden="true" />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ fontWeight: 600 }}>Sessões salvas</strong>
        <span style={{ color: colors.textSecondary, fontSize: '0.85rem' }}>
          {n == null ? '' : n === 0 ? ' · nenhuma ainda' : ` · ${n} ${n === 1 ? 'treino completo' : 'treinos completos'} para repetir`}
        </span>
      </span>
      <ArrowRight size={16} color={colors.textSecondary} aria-hidden="true" />
    </Link>
  );
}

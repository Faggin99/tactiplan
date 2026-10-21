import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Save, Users, List, Grid } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useClub } from '../../../contexts/ClubContext';
import { Button } from '../../../components/common/Button';
import { athleteService } from '../services/athleteService';
import { categoryService } from '../../../services/categoryService';
import PlayerModal from '../components/plantel/PlayerModal';
import PlayersTable from '../components/plantel/PlayersTable';
import GroupColumn from '../components/plantel/GroupColumn';
import { generatePlantelPDF, generatePlantelExcel } from '../utils/pdfGenerator';
import { ExportMenu } from '../../../components/common/ExportMenu';
import { TourGuide } from '../../../components/common/TourGuide';
import { useTour, useTourReplayListener } from '../../../hooks/useTour';
import { notify } from '../../../lib/notify';

export default function PlantelPage() {
  const { colors } = useTheme();
  const isMobile = useIsMobile();
  const { selectedClub } = useClub();
  const [athletes, setAthletes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all' | 'none' | <id>
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [groupChanges, setGroupChanges] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('table'); // 'table' or 'groups'
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('name'); // 'name' or 'position'
  const itemsPerPage = 10;

  const tour = useTour('plantel');
  useTourReplayListener('plantel', () => tour.setIsOpen(true));
  const tourSteps = [
    { title: 'Plantel de Atletas', content: 'Aqui você gerencia todos os atletas do clube. Vamos te mostrar rapidinho.' },
    { selector: '[data-tour="new-athlete"]', title: 'Novo atleta', content: 'Cadastre nome, posição, status, grupo e categoria. Você também pode adicionar dados pessoais (data de nascimento, altura, pé preferencial, último clube) e uma foto que aparecerá no PDF do plantel e nas convocações.', placement: 'bottom' },
    { selector: '[data-tour="generate-pdf"]', title: 'Exportar plantel', content: 'O PDF do plantel inclui a foto de cada atleta ao lado do nome (quando cadastrada). Excel sai com aba por grupo e filtros automáticos.', placement: 'bottom' },
    { selector: '[data-tour="plantel-tabs"]', title: 'Lista ou Grupos', content: 'Veja seu plantel em tabela (com mais detalhes) ou agrupado (G1, G2, G3, Transição, DM). Para mover atletas entre grupos use "Grupos de Treino".', placement: 'bottom' },
    { title: 'Próximos passos', content: 'Edite um atleta clicando na linha pra anexar foto e dados pessoais. Em seguida vá em "Treinos" no menu superior pra montar a semana com esses atletas.' },
  ];

  useEffect(() => {
    loadAthletes();
  }, [selectedClub?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedClub?.id) { setCategories([]); return; }
    categoryService.listByClub(selectedClub.id).then(setCategories).catch(() => setCategories([]));
  }, [selectedClub?.id]);

  const loadAthletes = async () => {
    try {
      setLoading(true);
      // Plantel é DO CLUBE aberto (com clubes arquivados a conta pode ter vários clubes).
      if (!selectedClub?.id) { setAthletes([]); return; }
      const data = await athleteService.getAll({ club_id: selectedClub.id });
      setAthletes(data);
      setError(null);
    } catch (err) {
      console.error('Error loading athletes:', err);
      setError('Erro ao carregar atletas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlayer = async (data) => {
    try {
      if (!selectedClub?.id) {
        notify.error('Selecione um clube antes de cadastrar atletas.');
        return;
      }
      await athleteService.create({
        ...data,
        club_id: selectedClub.id,
        status: data.status || 'active',
        group: data.group ?? null,
      });
      await loadAthletes();
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error creating player:', err);
      throw err;
    }
  };

  const handleEditPlayer = (player) => {
    setEditingPlayer(player);
    setIsModalOpen(true);
  };

  const handleUpdatePlayer = async (id, data) => {
    try {
      await athleteService.update(id, data);
      await loadAthletes();
    } catch (err) {
      console.error('Error updating player:', err);
      throw err;
    }
  };

  const handleSaveEditedPlayer = async (data) => {
    if (editingPlayer) {
      // Preserva o club_id atual do atleta para o PUT não setar NULL na coluna.
      await handleUpdatePlayer(editingPlayer.id, {
        ...data,
        club_id: editingPlayer.club_id || selectedClub?.id,
      });
      setEditingPlayer(null);
      setIsModalOpen(false);
    }
  };

  const handleDeletePlayer = async (id) => {
    const ok = await notify.confirm('Tem certeza que deseja excluir este atleta?', {
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
    });
    if (!ok) return;
    try {
      await athleteService.delete(id);
      await loadAthletes();
      notify.success('Atleta excluído.');
    } catch (err) {
      console.error('Error deleting player:', err);
      notify.error('Erro ao excluir atleta');
    }
  };

  const handleAthleteMove = (athlete, newGroup) => {
    // Update local state
    setGroupChanges(prev => ({
      ...prev,
      [athlete.id]: newGroup,
    }));
    setHasChanges(true);

    // Update athletes list locally for immediate feedback
    setAthletes(prev =>
      prev.map(a =>
        a.id === athlete.id ? { ...a, group: newGroup } : a
      )
    );
  };

  const handleSaveGroupChanges = async () => {
    try {
      setSaving(true);
      const updates = Object.entries(groupChanges).map(([id, group]) => ({
        id: id, // ID is ULID string, don't parse to int
        group: group === null ? null : String(group),
      }));

      console.log('Sending batch update:', updates);

      if (updates.length > 0) {
        await athleteService.batchUpdateGroups(updates);
        setGroupChanges({});
        setHasChanges(false);
        await loadAthletes();
      }
    } catch (err) {
      console.error('Error saving group changes:', err);
      console.error('Error details:', err.response?.data);
      notify.error('Erro ao salvar alterações de grupo');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    try {
      await generatePlantelPDF(athletes, {
        clubName: selectedClub?.name || '',
        primaryColor: selectedClub?.primary_color || null,
      });
    } catch (err) {
      console.error('Error generating PDF:', err);
      notify.error('Erro ao gerar PDF do plantel');
    }
  };

  const getAthletesByGroup = (groupNumber) => {
    return athletes.filter(a => String(a.group) === String(groupNumber));
  };

  // Ordem de posições para ordenação (códigos antigos = sinônimos, dado legado)
  const positionOrder = {
    GOL: 1, GR: 1,
    LD: 2, DD: 2,
    ZAG: 3, DC: 3, Z: 3,
    LE: 4, DE: 4,
    VOL: 5, MC: 5,
    MEI: 6, MD: 6, ME: 6, MOF: 6, M: 6,
    ED: 7, EE: 8,
    CA: 9, PL: 9, SA: 9, A: 9,
    // Futsal
    FIX: 3, 'ALA-D': 5, 'ALA-E': 6, PIV: 9,
  };

  // Filtrar por categoria + ordenar
  const sortedAthletes = useMemo(() => {
    let list = athletes;
    if (categoryFilter === 'none') {
      list = list.filter(a => !a.category_id);
    } else if (categoryFilter !== 'all') {
      list = list.filter(a => a.category_id === categoryFilter);
    }

    let sorted = [...list];
    if (sortBy === 'position') {
      sorted.sort((a, b) => {
        const orderA = positionOrder[a.position] || 999;
        const orderB = positionOrder[b.position] || 999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });
    } else {
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    return sorted;
  }, [athletes, sortBy, categoryFilter]);

  const paginatedAthletes = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedAthletes.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedAthletes, currentPage]);

  const totalPages = Math.ceil(sortedAthletes.length / itemsPerPage);

  const pageStyle = {
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: isMobile ? 'flex-start' : 'center',
    marginBottom: '1rem',
    flexShrink: 0,
    flexDirection: isMobile ? 'column' : 'row',
    gap: isMobile ? '0.75rem' : 0,
  };

  const titleStyle = {
    fontSize: isMobile ? '1.2rem' : '1.5rem',
    fontWeight: '700',
    color: colors.text,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  const actionsStyle = {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    width: isMobile ? '100%' : 'auto',
  };

  const sectionStyle = {
    marginBottom: '1rem',
    flexShrink: 0,
  };

  const sectionTitleStyle = {
    fontSize: '1rem',
    fontWeight: '600',
    color: colors.text,
    marginBottom: '0.65rem',
  };

  const tabsContainerStyle = {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
    overflowX: isMobile ? 'auto' : 'visible',
    WebkitOverflowScrolling: 'touch',
  };

  const tabStyle = (isActive) => ({
    padding: isMobile ? '0.5rem 0.75rem' : '0.65rem 1.25rem',
    fontSize: isMobile ? '0.8rem' : '0.875rem',
    fontWeight: '500',
    color: isActive ? colors.primary : colors.text,
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: `2px solid ${isActive ? colors.primary : 'transparent'}`,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
  });

  const contentSectionStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  };

  const groupsContainerStyle = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    gap: '0.65rem',
    width: '100%',
    height: isMobile ? 'auto' : '100%',
  };

  const paginationStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '0.5rem',
    marginTop: '1rem',
    padding: '0.75rem',
    flexShrink: 0,
  };

  const pageButtonStyle = (isActive) => ({
    padding: '0.4rem 0.75rem',
    fontSize: '0.875rem',
    fontWeight: isActive ? '600' : '400',
    color: isActive ? colors.primary : colors.text,
    backgroundColor: isActive ? `${colors.primary}15` : 'transparent',
    border: `1px solid ${isActive ? colors.primary : colors.border}`,
    borderRadius: '0.25rem',
    cursor: isActive ? 'default' : 'pointer',
    transition: 'all 0.2s',
  });

  const saveButtonContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    padding: '1rem',
    backgroundColor: colors.surface,
    borderRadius: '0.5rem',
    border: `1px solid ${colors.border}`,
  };

  const loadingStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '3rem',
    color: colors.textMuted,
  };

  const errorStyle = {
    padding: '1rem',
    backgroundColor: '#fee',
    border: '1px solid #fcc',
    borderRadius: '0.5rem',
    color: '#c33',
    marginBottom: '1rem',
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={loadingStyle}>
          <Users size={40} strokeWidth={1.5} style={{ marginRight: '0.5rem' }} />
          Carregando plantel...
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <TourGuide isOpen={tour.isOpen} onClose={tour.stop} steps={tourSteps} storageKey={tour.storageKey} />
      {error && <div style={errorStyle}>{error}</div>}

      <div style={headerStyle}>
        <h1 style={titleStyle}>
          <Users size={40} strokeWidth={1.5} />
          Plantel de Atletas
        </h1>
        <div style={actionsStyle}>
          <div data-tour="generate-pdf">
            <ExportMenu
              variant="outline"
              onExportPDF={handleGeneratePDF}
              onExportExcel={() => generatePlantelExcel(athletes)}
            />
          </div>
          <div data-tour="new-athlete">
            <Button
              icon={<Plus size={22} strokeWidth={1.5} />}
              onClick={() => {
                setEditingPlayer(null);
                setIsModalOpen(true);
              }}
            >
              Novo Atleta
            </Button>
          </div>
        </div>
      </div>

      <div style={tabsContainerStyle} data-tour="plantel-tabs">
        <button
          style={tabStyle(activeTab === 'table')}
          onClick={() => setActiveTab('table')}
        >
          <List size={20} strokeWidth={1.5} />
          Lista de Atletas
        </button>
        <button
          style={tabStyle(activeTab === 'groups')}
          onClick={() => setActiveTab('groups')}
        >
          <Grid size={20} strokeWidth={1.5} />
          Grupos de Treino
        </button>
      </div>

      <div style={contentSectionStyle}>
        {activeTab === 'table' ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexShrink: 0, flexWrap: 'wrap', gap: '0.5rem' }}>
              <h2 style={sectionTitleStyle}>Lista de Atletas</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {categories.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', color: colors.text }}>Categoria:</label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      style={{
                        padding: '0.4rem 0.75rem', fontSize: '0.875rem',
                        border: `1px solid ${colors.border}`, borderRadius: '0.375rem',
                        backgroundColor: colors.background, color: colors.text, cursor: 'pointer',
                      }}
                    >
                      <option value="all">Todas</option>
                      <option value="none">Sem categoria</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}{c.age_group ? ` (${c.age_group})` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', color: colors.text }}>Ordenar por:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      fontSize: '0.875rem',
                      border: `1px solid ${colors.border}`,
                      borderRadius: '0.375rem',
                      backgroundColor: colors.background,
                      color: colors.text,
                      cursor: 'pointer',
                    }}
                  >
                    <option value="name">Nome</option>
                    <option value="position">Posição</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <PlayersTable
                players={sortedAthletes}
                onEdit={handleEditPlayer}
                onDelete={handleDeletePlayer}
              />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexShrink: 0 }}>
              <h2 style={sectionTitleStyle}>Grupos de Treino</h2>
              {hasChanges && (
                <Button
                  icon={<Save size={20} strokeWidth={1.5} />}
                  onClick={handleSaveGroupChanges}
                  disabled={saving}
                  size="sm"
                >
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              )}
            </div>

            <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <div style={groupsContainerStyle}>
                <GroupColumn
                  groupNumber={null}
                  groupName="Sem Grupo"
                  athletes={getAthletesByGroup(null)}
                  onAthleteMove={handleAthleteMove}
                />
                <GroupColumn
                  groupNumber="1"
                  groupName="Grupo 1"
                  athletes={getAthletesByGroup('1')}
                  onAthleteMove={handleAthleteMove}
                />
                <GroupColumn
                  groupNumber="2"
                  groupName="Grupo 2"
                  athletes={getAthletesByGroup('2')}
                  onAthleteMove={handleAthleteMove}
                />
                <GroupColumn
                  groupNumber="3"
                  groupName="Grupo 3"
                  athletes={getAthletesByGroup('3')}
                  onAthleteMove={handleAthleteMove}
                />
                <GroupColumn
                  groupNumber="Transição"
                  groupName="Transição"
                  athletes={getAthletesByGroup('Transição')}
                  onAthleteMove={handleAthleteMove}
                />
                <GroupColumn
                  groupNumber="DM"
                  groupName="DM"
                  athletes={getAthletesByGroup('DM')}
                  onAthleteMove={handleAthleteMove}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <PlayerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingPlayer(null);
        }}
        onSave={editingPlayer ? handleSaveEditedPlayer : handleCreatePlayer}
        player={editingPlayer}
      />
    </div>
  );
}

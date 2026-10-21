import { useState, useEffect } from 'react';
import { Plus, Edit2, Archive, Search, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { trainingService } from '../services/trainingService';
import { CreateTitleModal } from '../components/training/CreateTitleModal';
import { EditActivityModal } from '../components/training/EditActivityModal';
import { ActivityActionModal } from '../components/training/ActivityActionModal';
import { Select } from '../components/common/Select';

export function ActivitiesConfigPage() {
  const { colors } = useTheme();
  const isMobile = useIsMobile();
  const [contents, setContents] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContent, setSelectedContent] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [actionType, setActionType] = useState(null); // 'edit' | 'delete'
  const [pendingEditData, setPendingEditData] = useState(null);

  useEffect(() => {
    loadData();
  }, [showArchived]);

  async function loadData() {
    try {
      setLoading(true);

      // Load contents
      const contentsResponse = await trainingService.getContents();
      setContents(contentsResponse?.data || []);

      // Load activity titles with content info
      const activitiesResponse = await trainingService.getTitlesWithContent(showArchived);
      setActivities(activitiesResponse?.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleCreateClick() {
    setShowCreateModal(true);
  }

  function handleEditClick(activity) {
    setSelectedActivity(activity);
    setShowEditModal(true);
  }

  async function handleEditSave(formData) {
    // Store the pending edit data and show confirmation modal
    setPendingEditData(formData);
    setShowEditModal(false);
    setActionType('edit');
    setShowActionModal(true);
  }

  async function confirmEdit() {
    if (!selectedActivity || !pendingEditData) {
      console.warn('confirmEdit called but missing data:', { selectedActivity, pendingEditData });
      return;
    }

    console.log('Updating title:', selectedActivity.id, pendingEditData);
    try {
      await trainingService.updateTitle(selectedActivity.id, pendingEditData);
      console.log('Title updated successfully');
      setPendingEditData(null);
      await loadData();
    } catch (error) {
      console.error('Error updating title:', error);
      throw error; // Re-throw to be caught by ActivityActionModal
    }
  }

  function handleArchiveClick(activity) {
    setSelectedActivity(activity);
    setActionType('delete');
    setShowActionModal(true);
  }

  async function confirmArchive() {
    if (!selectedActivity) {
      console.warn('confirmArchive called but no selectedActivity');
      return;
    }

    console.log('Archiving title:', selectedActivity.id);
    try {
      await trainingService.archiveTitle(selectedActivity.id);
      console.log('Title archived successfully');
      await loadData();
    } catch (error) {
      console.error('Error archiving title:', error);
      throw error; // Re-throw to be caught by ActivityActionModal
    }
  }

  async function handleUnarchive(activity) {
    try {
      await trainingService.unarchiveTitle(activity.id);
      await loadData();
    } catch (error) {
      console.error('Error unarchiving activity:', error);
      alert('Erro ao restaurar atividade: ' + error.message);
    }
  }

  function handleActionConfirm() {
    if (actionType === 'edit') {
      return confirmEdit();
    } else if (actionType === 'delete') {
      return confirmArchive();
    }
  }

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = activity.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesContent = selectedContent === 'all' || activity.content_id === selectedContent;
    return matchesSearch && matchesContent;
  });

  // Separate active and archived
  const activeActivities = filteredActivities.filter(a => !a.is_archived);
  const archivedActivities = filteredActivities.filter(a => a.is_archived);

  const pageStyle = {
    padding: isMobile ? '1rem' : '1.5rem 2rem',
    width: '100%',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: isMobile ? 'flex-start' : 'center',
    gap: isMobile ? '0.75rem' : '0',
    marginBottom: '2rem',
  };

  const titleStyle = {
    fontSize: isMobile ? '1.25rem' : '1.875rem',
    fontWeight: '700',
    color: colors.text,
  };

  const addButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.625rem 1rem',
    backgroundColor: colors.primary,
    color: colors.primaryText,
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  };

  const filtersStyle = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    gap: '1rem',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
    alignItems: isMobile ? 'stretch' : 'center',
  };

  const searchBoxStyle = {
    flex: '1',
    minWidth: isMobile ? '100%' : '250px',
    position: 'relative',
  };

  const searchInputStyle = {
    width: '100%',
    padding: '0.625rem 0.625rem 0.625rem 2.5rem',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem',
    color: colors.text,
    fontSize: '0.875rem',
  };

  const searchIconStyle = {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: colors.textSecondary,
  };

  const selectStyle = {
    padding: '0.625rem',
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.375rem',
    color: colors.text,
    fontSize: '0.875rem',
    minWidth: isMobile ? '100%' : '200px',
  };

  const toggleButtonStyle = (isActive) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.625rem 1rem',
    backgroundColor: isActive ? `${colors.primary}15` : colors.surface,
    border: `1px solid ${isActive ? colors.primary : colors.border}`,
    borderRadius: '0.375rem',
    color: isActive ? colors.primary : colors.text,
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  const tableContainerStyle = {
    backgroundColor: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '0.5rem',
    overflow: 'hidden',
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
  };

  const thStyle = {
    padding: '1rem',
    textAlign: 'left',
    fontSize: '0.875rem',
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.background,
    borderBottom: `1px solid ${colors.border}`,
  };

  const tdStyle = {
    padding: '1rem',
    fontSize: '0.875rem',
    color: colors.text,
    borderBottom: `1px solid ${colors.border}`,
  };

  const contentBadgeStyle = (contentColor) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.25rem 0.75rem',
    backgroundColor: (contentColor || colors.primary) + '20',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '500',
  });

  const contentDotStyle = (contentColor) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: contentColor || colors.primary,
  });

  const actionsStyle = {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'center',
  };

  const iconButtonStyle = (variant = 'default') => ({
    padding: '0.5rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '0.25rem',
    color: variant === 'danger' ? (colors.danger || '#ef4444') : variant === 'success' ? '#10b981' : colors.text,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'background-color 0.2s',
  });

  const archivedBadgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.125rem 0.5rem',
    backgroundColor: `${colors.textSecondary}20`,
    borderRadius: '9999px',
    fontSize: '0.7rem',
    color: colors.textSecondary,
    marginLeft: '0.5rem',
  };

  const sectionTitleStyle = {
    fontSize: '1rem',
    fontWeight: '600',
    color: colors.text,
    marginTop: '2rem',
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  };

  if (loading) {
    return (
      <div style={{ padding: '4rem 2rem 2rem 2rem', maxWidth: '1400px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: colors.textSecondary }}>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Configurar Atividades</h1>
        <button
          style={addButtonStyle}
          onClick={handleCreateClick}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          <Plus size={18} />
          Nova Atividade
        </button>
      </div>

      <div style={filtersStyle}>
        <div style={searchBoxStyle}>
          <Search size={18} style={searchIconStyle} />
          <input
            type="text"
            placeholder="Buscar atividades..."
            style={searchInputStyle}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Select
          value={selectedContent}
          onChange={(e) => setSelectedContent(e.target.value)}
          options={[
            { value: 'all', label: 'Todos os conteúdos' },
            ...contents.map((c) => ({ value: c.id, label: c.name })),
          ]}
          placeholder="Todos os conteúdos"
        />

        <button
          style={toggleButtonStyle(showArchived)}
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? <EyeOff size={18} /> : <Eye size={18} />}
          {showArchived ? 'Ocultar Arquivadas' : 'Mostrar Arquivadas'}
        </button>
      </div>

      {/* Active Activities Table */}
      {isMobile ? (
        activeActivities.length === 0 ? (
          <div style={{ backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '0.5rem', padding: '2rem', textAlign: 'center', color: colors.textSecondary }}>
            Nenhuma atividade encontrada
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeActivities.map(activity => (
              <div key={activity.id} style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
                borderRadius: '0.75rem',
                padding: '1rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.95rem', color: colors.text, marginBottom: '0.25rem' }}>{activity.title}</div>
                    {activity.content && <div style={contentBadgeStyle(activity.content.color)}><div style={contentDotStyle(activity.content.color)} />{activity.content.name}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button style={iconButtonStyle('default')} onClick={() => handleEditClick(activity)}><Edit2 size={18} /></button>
                    <button style={iconButtonStyle('danger')} onClick={() => handleArchiveClick(activity)}><Archive size={18} /></button>
                  </div>
                </div>
                {activity.description && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: colors.textSecondary }}>{activity.description}</div>}
              </div>
            ))}
          </div>
        )
      ) : (
        <div style={tableContainerStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Atividade</th>
                <th style={thStyle}>Conteudo</th>
                <th style={thStyle}>Descricao</th>
                <th style={{ ...thStyle, width: '120px', textAlign: 'center' }}>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {activeActivities.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ ...tdStyle, textAlign: 'center', padding: '2rem', color: colors.textSecondary }}>
                    Nenhuma atividade encontrada
                  </td>
                </tr>
              ) : (
                activeActivities.map((activity) => (
                  <tr
                    key={activity.id}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surfaceHover}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={tdStyle}>
                      <span style={{ fontWeight: '500' }}>{activity.title}</span>
                    </td>
                    <td style={tdStyle}>
                      {activity.content && (
                        <div style={contentBadgeStyle(activity.content.color)}>
                          <div style={contentDotStyle(activity.content.color)} />
                          {activity.content.name}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ color: colors.textSecondary }}>
                        {activity.description || '-'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <div style={actionsStyle}>
                        <button
                          style={iconButtonStyle('default')}
                          onClick={() => handleEditClick(activity)}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.background}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          style={iconButtonStyle('danger')}
                          onClick={() => handleArchiveClick(activity)}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${colors.danger || '#ef4444'}10`}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          title="Arquivar"
                        >
                          <Archive size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Archived Activities Section */}
      {showArchived && archivedActivities.length > 0 && (
        <>
          <div style={sectionTitleStyle}>
            <Archive size={18} />
            Atividades Arquivadas ({archivedActivities.length})
          </div>
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: 0.8 }}>
              {archivedActivities.map(activity => (
                <div key={activity.id} style={{
                  backgroundColor: colors.surface,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '0.75rem',
                  padding: '1rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.95rem', color: colors.textSecondary, marginBottom: '0.25rem' }}>
                        {activity.title}
                        <span style={archivedBadgeStyle}>arquivada</span>
                      </div>
                      {activity.content && <div style={{ ...contentBadgeStyle(activity.content.color), opacity: 0.6 }}><div style={contentDotStyle(activity.content.color)} />{activity.content.name}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button style={iconButtonStyle('success')} onClick={() => handleUnarchive(activity)}><RotateCcw size={18} /></button>
                    </div>
                  </div>
                  {activity.description && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: colors.textSecondary }}>{activity.description}</div>}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...tableContainerStyle, opacity: 0.8 }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Atividade</th>
                    <th style={thStyle}>Conteudo</th>
                    <th style={thStyle}>Descricao</th>
                    <th style={{ ...thStyle, width: '120px', textAlign: 'center' }}>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedActivities.map((activity) => (
                    <tr
                      key={activity.id}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surfaceHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontWeight: '500', color: colors.textSecondary }}>
                          {activity.title}
                        </span>
                        <span style={archivedBadgeStyle}>arquivada</span>
                      </td>
                      <td style={tdStyle}>
                        {activity.content && (
                          <div style={{ ...contentBadgeStyle(activity.content.color), opacity: 0.6 }}>
                            <div style={contentDotStyle(activity.content.color)} />
                            {activity.content.name}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: colors.textSecondary }}>
                          {activity.description || '-'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={actionsStyle}>
                          <button
                            style={iconButtonStyle('success')}
                            onClick={() => handleUnarchive(activity)}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#10b98115'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            title="Restaurar"
                          >
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeActivities.length > 0 && (
        <div style={{
          marginTop: '1rem',
          fontSize: '0.875rem',
          color: colors.textSecondary,
          textAlign: 'center',
        }}>
          Mostrando {activeActivities.length} atividade{activeActivities.length !== 1 ? 's' : ''} ativa{activeActivities.length !== 1 ? 's' : ''}
          {showArchived && archivedActivities.length > 0 && ` e ${archivedActivities.length} arquivada${archivedActivities.length !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* Create Modal */}
      <CreateTitleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={() => {
          setShowCreateModal(false);
          loadData();
        }}
      />

      {/* Edit Modal */}
      <EditActivityModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedActivity(null);
        }}
        activity={selectedActivity}
        onSave={handleEditSave}
      />

      {/* Action Confirmation Modal */}
      <ActivityActionModal
        isOpen={showActionModal}
        onClose={() => {
          setShowActionModal(false);
          setSelectedActivity(null);
          setActionType(null);
          setPendingEditData(null);
        }}
        activity={selectedActivity}
        action={actionType}
        onConfirm={handleActionConfirm}
      />
    </div>
  );
}

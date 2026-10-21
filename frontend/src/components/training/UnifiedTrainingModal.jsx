import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, ChevronLeft, ChevronRight, Upload, FileText, Video, X, Eye, Paperclip } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { MultiSelect } from '../common/MultiSelect';
import { Select } from '../common/Select';
import { Textarea } from '../common/Textarea';
import { useTheme } from '../../contexts/ThemeContext';
import { useClub } from '../../contexts/ClubContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { trainingService } from '../../services/trainingService';
import { CreateTitleModal } from './CreateTitleModal';
import { notify } from '../../lib/notify';
import { formatKm, parseKmInput, toKm } from '../../utils/distancia';

export function UnifiedTrainingModal({ isOpen, onClose, session, onSave, initialTab = 0, isMatchDay = false }) {
  const { colors } = useTheme();
  const { selectedClub } = useClub();
  const isMobile = useIsMobile();
  const modality = selectedClub?.modality || 'football_11';
  const [loading, setLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [contents, setContents] = useState([]);
  const [stages, setStages] = useState([]);
  const [titles, setTitles] = useState([]);
  const [showCreateTitle, setShowCreateTitle] = useState(false);
  const [blockData, setBlockData] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [existingFiles, setExistingFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  // Info do DIA (não por atividade): distância média percorrida por jogador, em km.
  // Só em dia de treino — no dia de jogo este modal edita apenas os "Não
  // relacionados" (quem não foi pro jogo), então o número não representaria o dia.
  const [distanceInput, setDistanceInput] = useState('');
  const showDistance = !isMatchDay;

  // Abas = blocos. Anexos ficam DENTRO de cada bloco (por atividade), sem aba própria.
  const [activeTab, setActiveTab] = useState(0);

  // Chave do bloco no modal: id real, ou "order_N" pra bloco ainda não criado no banco
  const blockKeyOf = (block) => block?.id || `order_${block?.order}`;

  // Para dias de jogo, mostrar apenas o primeiro bloco como "Não relacionados"
  const tabs = isMatchDay && session?.blocks?.length > 0
    ? [{
        id: 0,
        label: 'Não relacionados',
        blockKey: blockKeyOf(session.blocks[0]),
      }]
    : (session?.blocks || []).map((block, index) => ({
        id: index,
        label: block.name,
        blockKey: blockKeyOf(block),
      }));

  // Ref for tab scroll container
  const tabScrollRef = useRef(null);

  // Scroll active tab into center
  const scrollTabIntoView = useCallback((tabId) => {
    if (!tabScrollRef.current) return;
    const container = tabScrollRef.current;
    const activeBtn = container.querySelector(`[data-tab-id="${tabId}"]`);
    if (activeBtn) {
      const containerWidth = container.offsetWidth;
      const btnLeft = activeBtn.offsetLeft;
      const btnWidth = activeBtn.offsetWidth;
      container.scrollTo({
        left: btnLeft - (containerWidth / 2) + (btnWidth / 2),
        behavior: 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      // initialTab now directly refers to the block index (0-based)
      setActiveTab(Math.max(0, initialTab));
      setDistanceInput(formatKm(session?.avg_distance_km));
      loadData();
    } else {
      // Reset state when modal closes
      setBlockData({});
      setUploadedFiles([]);
      setExistingFiles([]);
      setContents([]);
      setStages([]);
      setTitles([]);
      setActiveTab(0);
      setPreviewFile(null);
      setDistanceInput('');
    }
  }, [isOpen, initialTab, session]);

  // Ao abrir num bloco do meio (ex.: Atividade 2 no celular), traz a aba ativa pra vista
  useEffect(() => {
    if (isOpen && !isLoadingData) {
      const t = setTimeout(() => scrollTabIntoView(activeTab), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, isLoadingData]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setIsLoadingData(true);
    try {
      const [contentsData, stagesData, titlesData, filesData] = await Promise.all([
        trainingService.getContents(),
        trainingService.getStages(null, modality),
        trainingService.getTitles(),
        session?.id ? trainingService.getSessionFiles(session.id) : Promise.resolve({ data: [] }),
      ]);

      const loadedContents = (contentsData?.data || []).filter(c => c.active !== false);
      const loadedStages = (stagesData?.data || []).filter(s => s.active !== false);
      const loadedTitles = titlesData?.data || [];
      const loadedFiles = filesData?.data || [];

      setContents(loadedContents);
      setStages(loadedStages);
      setTitles(loadedTitles);
      // Distribui os anexos pelas abas: cada um pertence à atividade de um bloco
      setExistingFiles(loadedFiles.map((f) => {
        const block = (session?.blocks || []).find((b) =>
          (f.activity_id && b.activity?.id === f.activity_id) || (f.block_id && b.id === f.block_id));
        return { ...f, blockKey: block ? blockKeyOf(block) : null, savedTitle: f.title || '' };
      }));

      // Initialize block data with existing activity data
      // Use block.id as key if available, otherwise use block.order as fallback key
      const initialData = {};
      session?.blocks?.forEach((block) => {
        const activity = block?.activity;
        // Use block.id if it exists, otherwise use order as key (prefixed to avoid confusion)
        const blockKey = block.id || `order_${block.order}`;

        if (activity) {
          // Map activity stages to stage IDs — prefer stage_id (novo), fallback no stage_name (legado)
          const stageIds = activity.stages
            ?.map(activityStage => {
              if (activityStage.stage_id && loadedStages.some(s => s.id === activityStage.stage_id)) {
                return activityStage.stage_id;
              }
              const byName = loadedStages.find(s => s.name === activityStage.stage_name);
              return byName?.id;
            })
            .filter(id => id) || [];

          // Map contents - handle both nested {content: {id}} and flat {id} structures
          const contentIds = activity.contents?.map((c) => {
            // Nested structure (legacy/joined): { content: { id, name } }
            if (c.content && c.content.id) {
              return c.content.id;
            }
            // If it's flat structure: { id, name }
            return c.id;
          }).filter(id => id) || [];

          // Derive selectedDimension a partir do content snapshot
          const firstContent = contentIds[0] ? loadedContents.find(c => c.id === contentIds[0]) : null;
          initialData[blockKey] = {
            selectedDimension: firstContent?.dimension || '',
            selectedContents: contentIds,
            selectedStages: stageIds,
            titleId: activity.title_id || '',
            description: activity.description || '',
            selectedGroups: activity.groups || [],
            durationMinutes: activity.duration_minutes || '',
            blockOrder: block.order, // Include order for mapping when saving
          };
        } else {
          initialData[blockKey] = {
            selectedDimension: '',
            selectedContents: [],
            selectedStages: [],
            titleId: '',
            description: '',
            selectedGroups: [],
            durationMinutes: '',
            blockOrder: block.order, // Include order for mapping when saving
          };
        }
      });
      setBlockData(initialData);
    } catch (error) {
      console.error('Error loading data:', error);
      setContents([]);
      setStages([]);
      setTitles([]);
    } finally {
      setIsLoadingData(false);
    }
  }

  const handleFieldChange = (blockId, field, value) => {
    setBlockData((prev) => {
      const updated = {
        ...prev,
        [blockId]: { ...(prev[blockId] || {}), [field]: value },
      };

      // Se mudou os conteúdos, limpar o tema selecionado se ele não for compatível
      if (field === 'selectedContents') {
        const currentTitleId = updated[blockId].titleId;
        if (currentTitleId) {
          const selectedTitle = titles.find(t => t.id === currentTitleId);
          // Se o tema tem um conteúdo e não está na lista de conteúdos selecionados, limpar
          if (selectedTitle?.content_id && !value.includes(selectedTitle.content_id)) {
            updated[blockId].titleId = '';
          }
        }
        // Mantém só as etapas dos conteúdos ainda selecionados
        const set = new Set(value);
        updated[blockId].selectedStages = (updated[blockId].selectedStages || []).filter((sid) => {
          const s = stages.find((x) => x.id === sid);
          return s && set.has(s.content_id);
        });
      }

      return updated;
    });
  };

  // Filtra etapas pelos conteúdos selecionados (via content_id direto).
  // Quando há múltiplos conteúdos selecionados, agrupa pelo nome do conteúdo no label
  // para diferenciar etapas homônimas (ex.: "Falta" em BPO vs BPD).
  const getAvailableStages = (blockId) => {
    const blockInfo = blockData[blockId];
    if (!blockInfo?.selectedContents?.length) return [];

    const selectedSet = new Set(blockInfo.selectedContents);
    const filtered = stages.filter((s) => selectedSet.has(s.content_id));

    if (blockInfo.selectedContents.length === 1) return filtered;

    // Múltiplos contents — prefixa o nome com o conteúdo para evitar confusão
    return filtered.map((s) => ({
      ...s,
      name: s.content_name ? `${s.content_name} · ${s.name}` : s.name,
    }));
  };

  // Limite: até 5 anexos POR ATIVIDADE (bloco). Antes eram 5 no dia inteiro.
  const MAX_FILES_PER_ACTIVITY = 5;

  const filesForBlock = (blockKey) => [
    ...existingFiles.filter((f) => f.blockKey === blockKey),
    ...uploadedFiles.filter((f) => f.blockKey === blockKey),
  ];

  // Mesmo critério do salvar (TrainingPage): bloco "vazio" não vira atividade.
  const isBlockFilled = (blockKey) => {
    const d = blockData[blockKey];
    return !!(d && (d.titleId || d.description || d.selectedContents?.length || d.selectedStages?.length || d.durationMinutes));
  };

  const tituloDoArquivo = (name) => String(name || '').replace(/\.[a-z0-9]+$/i, '').slice(0, 120);

  const handleFileUpload = (blockKey, e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length === 0) return;
    if (!isBlockFilled(blockKey)) {
      notify.error('Preencha a atividade deste bloco antes de anexar arquivos.');
      return;
    }
    const restantes = MAX_FILES_PER_ACTIVITY - filesForBlock(blockKey).length;
    if (restantes <= 0) {
      notify.error(`Máximo de ${MAX_FILES_PER_ACTIVITY} anexos por atividade.`);
      return;
    }
    if (picked.length > restantes) {
      notify.error(`Só cabem mais ${restantes} anexo(s) nesta atividade — os demais foram ignorados.`);
    }
    const novos = picked.slice(0, restantes).map((file) => ({
      id: Math.random().toString(36).slice(2, 11),
      blockKey,
      file,
      title: tituloDoArquivo(file.name),
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file),
    }));
    setUploadedFiles((prev) => [...prev, ...novos]);
  };

  const handleTitleChange = (fileId, isExisting, value) => {
    const setter = isExisting ? setExistingFiles : setUploadedFiles;
    setter((prev) => prev.map((f) => (f.id === fileId ? { ...f, title: value } : f)));
  };

  // Anexo já salvo: renomeia ao sair do campo (anexo novo vai com o título no salvar)
  const commitExistingTitle = async (file) => {
    const title = String(file.title || '').trim();
    if (!title) {
      handleTitleChange(file.id, true, file.savedTitle);
      return;
    }
    if (title === file.savedTitle) return;
    try {
      await trainingService.renameSessionFile(file.id, title);
      setExistingFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, title, savedTitle: title } : f)));
    } catch (error) {
      handleTitleChange(file.id, true, file.savedTitle);
      notify.error('Não foi possível renomear o anexo: ' + error.message);
    }
  };

  const handleRemoveFile = async (fileId, isExisting = false) => {
    if (isExisting) {
      // Delete from server
      const ok = await notify.confirm(
        'Tem certeza que deseja excluir este arquivo? Esta ação não pode ser desfeita.',
        { confirmText: 'Excluir', cancelText: 'Cancelar' }
      );
      if (ok) {
        try {
          await trainingService.deleteSessionFile(fileId);
          setExistingFiles((prev) => prev.filter((f) => f.id !== fileId));
        } catch (error) {
          console.error('Error deleting file:', error);
          notify.error('Erro ao excluir arquivo: ' + error.message);
        }
      }
    } else {
      // Remove from local state only
      const file = uploadedFiles.find(f => f.id === fileId);
      if (file?.url) {
        URL.revokeObjectURL(file.url);
      }
      setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
    }
  };

  const handlePreviewFile = (file) => {
    // Normalize file object for preview
    const normalizedFile = {
      id: file.id,
      name: file.name || file.file_name,
      url: file.url,
      type: file.type || file.mime_type,
      size: file.size || file.file_size,
    };
    setPreviewFile(normalizedFile);
  };

  const handleSave = async () => {
    // Todo anexo precisa de atividade: bloco esvaziado com anexo não salva
    // (apagar a atividade levaria os anexos junto).
    const orfao = tabs.find((t) => !isBlockFilled(t.blockKey) && filesForBlock(t.blockKey).length > 0);
    if (orfao) {
      setActiveTab(orfao.id);
      notify.error(`"${orfao.label}" tem anexo(s) mas está sem atividade. Preencha a atividade ou remova os anexos.`);
      return;
    }

    // Distância do dia: valida antes de qualquer coisa (sem salvar meia alteração)
    let distance = { changed: false, value: null };
    if (showDistance) {
      const parsed = parseKmInput(distanceInput);
      if (!parsed.ok) {
        notify.error(parsed.error);
        return;
      }
      const atual = toKm(session?.avg_distance_km);
      distance = { changed: parsed.value !== atual, value: parsed.value };
    }

    // Check if session date is in the past
    if (session?.date) {
      const [sy, sm, sd] = session.date.split('-').map(Number);
      const sessionDate = new Date(sy, sm - 1, sd);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (sessionDate < today) {
        const confirmed = await notify.confirm(
          'Você está alterando um treino de uma data passada.\n\n' +
          'Esta alteração pode indicar que o treino foi realizado de forma diferente do planejado.\n\n' +
          'Deseja continuar?',
          { confirmText: 'Continuar', cancelText: 'Cancelar' }
        );

        if (!confirmed) {
          return; // Cancel save
        }
      }
    }

    setLoading(true);
    try {
      const files = uploadedFiles
        .filter((f) => tabs.some((t) => t.blockKey === f.blockKey))
        .map((f) => ({ ...f, title: String(f.title || '').trim() || tituloDoArquivo(f.name) }));
      await onSave({ blockData, files, avgDistanceKm: distance.value, distanceChanged: distance.changed });
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
      notify.error('Erro ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTitleCreated = async (newTitle) => {
    const titlesData = await trainingService.getTitles();
    setTitles(Array.isArray(titlesData) ? titlesData : titlesData?.data || []);
    setShowCreateTitle(false);
  };

  const tabIndex = tabs.findIndex(t => t.id === activeTab);

  const goToPreviousTab = () => {
    if (tabIndex > 0) {
      const newTab = tabs[tabIndex - 1].id;
      setActiveTab(newTab);
      setTimeout(() => scrollTabIntoView(newTab), 50);
    }
  };

  const goToNextTab = () => {
    if (tabIndex < tabs.length - 1) {
      const newTab = tabs[tabIndex + 1].id;
      setActiveTab(newTab);
      setTimeout(() => scrollTabIntoView(newTab), 50);
    }
  };

  // Filtrar temas baseado nos conteúdos selecionados
  const getFilteredTitles = (blockId) => {
    const selectedContents = blockData[blockId]?.selectedContents || [];

    // Se nenhum conteúdo selecionado, retornar array vazio (não mostrar temas)
    if (selectedContents.length === 0) {
      return [];
    }

    // Filtrar temas que pertencem aos conteúdos selecionados
    return titles.filter(title =>
      title.content_id && selectedContents.includes(title.content_id)
    );
  };

  const groupOptions = [
    { value: 'G1', label: 'Grupo 1' },
    { value: 'G2', label: 'Grupo 2' },
    { value: 'G3', label: 'Grupo 3' },
    { value: 'Transição', label: 'Transição' },
    // DM não aparece nas opções para marcar em atividades
  ];

  // Não precisa mais filtrar - apenas os 6 conteúdos corretos existem no DB

  // Styles
  const tabContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    borderBottom: `2px solid ${colors.border}`,
    marginBottom: '1rem',
    padding: '0 0.5rem',
  };

  const tabButtonStyle = (isActive) => ({
    padding: '0.5rem 1rem',
    border: 'none',
    background: isActive ? colors.primary : 'transparent',
    color: isActive ? '#fff' : colors.text,
    cursor: 'pointer',
    borderRadius: '0.375rem 0.375rem 0 0',
    fontWeight: isActive ? '600' : '500',
    fontSize: '0.875rem',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
    opacity: isActive ? 1 : 0.7,
  });

  const navButtonStyle = (disabled) => ({
    padding: '0.4rem',
    border: `1px solid ${colors.border}`,
    background: colors.background,
    color: colors.text,
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderRadius: '0.375rem',
    display: 'flex',
    alignItems: 'center',
    opacity: disabled ? 0.4 : 1,
  });

  const contentAreaStyle = {
    maxHeight: 'calc(100vh - 280px)',
    overflowY: 'auto',
    overflowX: 'visible',
    padding: '0.5rem',
  };

  const blockFormStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    padding: '0.5rem',
  };

  const previewOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '2rem',
  };

  const previewContentStyle = {
    maxWidth: '90vw',
    maxHeight: '90vh',
    backgroundColor: colors.background,
    borderRadius: '0.5rem',
    padding: '1rem',
    position: 'relative',
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Treino - ${session?.day_name} (${session?.date ? session.date.split('-').reverse().slice(0, 2).join('/') : ''})`}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading} icon={<Save size={18} />}>
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </>
        }
      >
        {isLoadingData ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: colors.textSecondary }}>
            Carregando dados...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Conteúdo em largura total (sem painel lateral de anexos) */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              {/* Info do dia — fixa acima das abas (vale pro dia todo, não pra um bloco) */}
              {showDistance && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: isMobile ? 'stretch' : 'center',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? '0.4rem' : '0.75rem',
                    padding: '0.6rem 0.75rem',
                    marginBottom: '0.75rem',
                    border: `1px solid ${colors.border}`,
                    borderRadius: '0.5rem',
                    backgroundColor: `${colors.primary}08`,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: colors.textSecondary }}>
                      Info do dia
                    </span>
                    <label htmlFor="avg-distance-km" style={{ fontSize: '0.8rem', fontWeight: 600, color: colors.text }}>
                      Distância ideal (km)
                    </label>
                  </div>
                  <input
                    id="avg-distance-km"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={distanceInput}
                    onChange={(e) => setDistanceInput(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="Ex.: 5,2"
                    aria-describedby="avg-distance-km-hint"
                    style={{
                      width: isMobile ? '100%' : '140px',
                      padding: '0.5rem 0.75rem',
                      fontSize: isMobile ? '16px' : '0.875rem',
                      border: `1px solid ${parseKmInput(distanceInput).ok ? colors.border : '#ef4444'}`,
                      borderRadius: '0.375rem',
                      backgroundColor: colors.background,
                      color: colors.text,
                    }}
                  />
                  <span id="avg-distance-km-hint" style={{ fontSize: '0.7rem', color: colors.textSecondary }}>
                    Opcional · por jogador, no dia
                  </span>
                </div>
              )}

              {/* Tab Navigation */}
              <div style={tabContainerStyle}>
                <button
                  onClick={goToPreviousTab}
                  disabled={tabIndex === 0}
                  style={navButtonStyle(tabIndex === 0)}
                >
                  <ChevronLeft size={20} />
                </button>

                <div ref={tabScrollRef} style={{ display: 'flex', gap: '0.25rem', flex: 1, overflowX: 'auto', scrollBehavior: 'smooth', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      data-tab-id={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        setTimeout(() => scrollTabIntoView(tab.id), 50);
                      }}
                      style={{ ...tabButtonStyle(activeTab === tab.id), display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      {tab.label}
                      {(() => {
                        const n = filesForBlock(tab.blockKey).length;
                        return n > 0 ? (
                          <span aria-label={`${n} anexo(s)`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.1rem', fontSize: '0.75rem', fontWeight: 600 }}>
                            · <Paperclip size={12} />{n}
                          </span>
                        ) : null;
                      })()}
                    </button>
                  ))}
                </div>

                <button
                  onClick={goToNextTab}
                  disabled={tabIndex === tabs.length - 1}
                  style={navButtonStyle(tabIndex === tabs.length - 1)}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Tab Content */}
              <div style={contentAreaStyle}>
                {/* Block Form - renderiza o bloco atual */}
                {(() => {
                  const block = session?.blocks?.[activeTab];
                  if (!block) return null;

                  const blockKey = blockKeyOf(block);

                  const DIM_LIST = [
                    { key: 'tatico',  label: 'Tático',  color: '#3b82f6' },
                    { key: 'fisico',  label: 'Físico',  color: '#f59e0b' },
                    { key: 'tecnico', label: 'Técnico', color: '#a855f7' },
                    { key: 'mental',  label: 'Mental',  color: '#10b981' },
                  ];
                  const currentContentId = blockData[blockKey]?.selectedContents?.[0] || '';
                  const currentContent = contents.find(c => c.id === currentContentId);
                  const currentDimension = currentContent?.dimension || blockData[blockKey]?.selectedDimension || '';
                  const contentsOfDimension = contents.filter(c => c.dimension === currentDimension);
                  const hasContent = !!currentContentId;
                  const hasDimension = !!currentDimension;
                  const isTatic = currentDimension === 'tatico';
                  const contentLabel = isTatic ? 'Momento do Jogo' : 'Conteúdo';
                  const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 600, color: colors.text, marginBottom: '0.4rem' };
                  const hintStyle = { fontSize: '0.7rem', color: colors.textSecondary, marginLeft: '0.4rem', fontWeight: 400 };

                  return (
                    <div style={blockFormStyle} data-tour="unified-modal-body">
                      {/* Linha 1: Pilar (chips) + Tempo (compacto) */}
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 120px', gap: isMobile ? '0.75rem' : '1rem', alignItems: 'start' }}>
                      <div>
                        <label style={labelStyle}>
                         Pilar <span style={hintStyle}>obrigatório</span>
                        </label>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {DIM_LIST.map((d) => {
                            const isSelected = currentDimension === d.key;
                            return (
                              <button
                                key={d.key}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    handleFieldChange(blockKey, 'selectedDimension', '');
                                    handleFieldChange(blockKey, 'selectedContents', []);
                                  } else {
                                    handleFieldChange(blockKey, 'selectedDimension', d.key);
                                    handleFieldChange(blockKey, 'selectedContents', []);
                                  }
                                }}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                  padding: '0.4rem 0.8rem', borderRadius: '999px',
                                  border: `1.5px solid ${isSelected ? d.color : colors.border}`,
                                  backgroundColor: isSelected ? `${d.color}1A` : 'transparent',
                                  color: isSelected ? d.color : colors.text,
                                  fontSize: '0.825rem', fontWeight: isSelected ? 600 : 500,
                                  cursor: 'pointer', transition: 'all 0.15s',
                                }}
                              >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: d.color }} />
                                {d.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                        <div>
                          <label style={labelStyle}>Tempo (min)</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={blockData[blockKey]?.durationMinutes || ''}
                            onChange={(e) => handleFieldChange(blockKey, 'durationMinutes', e.target.value)}
                            placeholder="30"
                            style={{
                              width: '100%',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.875rem',
                              border: `1px solid ${colors.border}`,
                              borderRadius: '0.375rem',
                              backgroundColor: colors.background,
                              color: colors.text,
                            }}
                          />
                        </div>
                      </div>

                      {/* Conteúdo (aparece quando pilar selecionada).
                          Pra tático: select de momento + submomentos lado a lado.
                          Pra outras dimensões: só o select de conteúdo. */}
                      {hasDimension && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : (isTatic ? '1fr 1fr 1.2fr' : '1fr 1.2fr'),
                          gap: isMobile ? '0.75rem' : '1rem',
                        }}>
                          <div>
                            <label style={labelStyle}>
                              {contentLabel} <span style={hintStyle}>obrigatório</span>
                            </label>
                            <Select
                              fullWidth
                              options={contentsOfDimension.map((c) => ({ value: c.id, label: c.name }))}
                              value={currentContentId}
                              onChange={(e) => handleFieldChange(blockKey, 'selectedContents', e.target.value ? [e.target.value] : [])}
                              placeholder={isTatic ? 'Selecione um momento...' : 'Selecione um conteúdo...'}
                            />
                          </div>
                          {isTatic && (
                            <div>
                              <label style={labelStyle}>
                                Submomentos <span style={hintStyle}>opcional</span>
                              </label>
                              <MultiSelect
                                options={getAvailableStages(blockKey).map((s) => ({ value: s.id, label: s.name }))}
                                value={blockData[blockKey]?.selectedStages || []}
                                onChange={(value) => handleFieldChange(blockKey, 'selectedStages', value)}
                                placeholder={hasContent ? 'Marque um ou mais...' : 'Selecione o momento primeiro'}
                                disabled={!hasContent}
                              />
                            </div>
                          )}
                          {/* Atividade (na mesma linha do conteúdo no desktop) */}
                          {hasContent && (
                        <div>
                          <label style={labelStyle}>
                            Atividade <span style={hintStyle}>obrigatório</span>
                          </label>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Select
                                fullWidth
                                options={getFilteredTitles(blockKey).map((t) => ({ value: t.id, label: t.title }))}
                                value={blockData[blockKey]?.titleId || ''}
                                onChange={(e) => handleFieldChange(blockKey, 'titleId', e.target.value)}
                                placeholder="Selecione uma atividade..."
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowCreateTitle(true)}
                              title="Cadastrar nova atividade"
                              style={{
                                padding: '0 0.8rem',
                                border: `1px solid ${colors.border}`,
                                borderRadius: '0.375rem',
                                backgroundColor: colors.surface,
                                color: colors.text,
                                fontSize: '0.825rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              + Novo
                            </button>
                          </div>
                        </div>
                      )}
                        </div>
                      )}


                      {/* Grupos como chips */}
                      <div>
                        <div>
                          <label style={labelStyle}>Grupos</label>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {groupOptions.map((g) => {
                              const isSelected = (blockData[blockKey]?.selectedGroups || []).includes(g.value);
                              return (
                                <button
                                  key={g.value}
                                  type="button"
                                  onClick={() => {
                                    const cur = blockData[blockKey]?.selectedGroups || [];
                                    const next = isSelected ? cur.filter(x => x !== g.value) : [...cur, g.value];
                                    handleFieldChange(blockKey, 'selectedGroups', next);
                                  }}
                                  style={{
                                    padding: '0.35rem 0.7rem',
                                    borderRadius: '999px',
                                    border: `1.5px solid ${isSelected ? colors.primary : colors.border}`,
                                    backgroundColor: isSelected ? `${colors.primary}1A` : 'transparent',
                                    color: isSelected ? colors.primary : colors.text,
                                    fontSize: '0.8rem',
                                    fontWeight: isSelected ? 600 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  {g.label}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => {
                                const all = groupOptions.map(g => g.value);
                                const cur = blockData[blockKey]?.selectedGroups || [];
                                const allSelected = all.every(g => cur.includes(g));
                                handleFieldChange(blockKey, 'selectedGroups', allSelected ? [] : all);
                              }}
                              style={{
                                marginLeft: '0.25rem',
                                padding: '0.3rem 0.65rem',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: colors.textSecondary,
                                backgroundColor: 'transparent',
                                border: `1px dashed ${colors.border}`,
                                borderRadius: '999px',
                                cursor: 'pointer',
                              }}
                            >
                              {(() => {
                                const all = groupOptions.map(g => g.value);
                                const cur = blockData[blockKey]?.selectedGroups || [];
                                return all.every(g => cur.includes(g)) ? 'Limpar' : 'Todos';
                              })()}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Linha 4: Descrição */}
                      <div>
                        <label style={labelStyle}>
                          Descrição <span style={hintStyle}>opcional</span>
                        </label>
                        <Textarea
                          fullWidth
                          rows={3}
                          value={blockData[blockKey]?.description || ''}
                          onChange={(e) => handleFieldChange(blockKey, 'description', e.target.value)}
                          placeholder="Detalhes sobre a atividade..."
                        />
                      </div>

                      {/* Linha 5: Anexos DESTA atividade (vão pro relatório embaixo deste bloco) */}
                      {(() => {
                        const blockFiles = filesForBlock(blockKey);
                        const filled = isBlockFilled(blockKey);
                        const cheio = blockFiles.length >= MAX_FILES_PER_ACTIVITY;
                        const podeAnexar = filled && !cheio;
                        return (
                          <div data-testid="anexos-atividade" style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: colors.text }}>
                                <Paperclip size={15} />
                                Anexos desta atividade
                                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: colors.textSecondary }}>
                                  {blockFiles.length}/{MAX_FILES_PER_ACTIVITY}
                                </span>
                              </div>
                              <label
                                title={!filled ? 'Preencha a atividade deste bloco antes de anexar' : cheio ? `Máximo de ${MAX_FILES_PER_ACTIVITY} por atividade` : 'Foto, vídeo ou PDF'}
                                onClick={(e) => {
                                  if (!filled) { e.preventDefault(); notify.error('Preencha a atividade deste bloco antes de anexar arquivos.'); }
                                  else if (cheio) { e.preventDefault(); notify.error(`Máximo de ${MAX_FILES_PER_ACTIVITY} anexos por atividade.`); }
                                }}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                  padding: '0.45rem 0.85rem', borderRadius: '0.375rem',
                                  backgroundColor: podeAnexar ? colors.primary : colors.surfaceHover,
                                  color: podeAnexar ? '#fff' : colors.textMuted,
                                  fontSize: '0.825rem', fontWeight: 600,
                                  cursor: podeAnexar ? 'pointer' : 'not-allowed',
                                }}
                              >
                                <Upload size={15} />
                                Adicionar anexo
                                <input
                                  type="file"
                                  multiple
                                  disabled={!podeAnexar}
                                  onChange={(e) => handleFileUpload(blockKey, e)}
                                  style={{ display: 'none' }}
                                  accept="image/*,video/*,.pdf"
                                />
                              </label>
                            </div>

                            {!filled && blockFiles.length === 0 && (
                              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, padding: '0.6rem 0.75rem', border: `1px dashed ${colors.border}`, borderRadius: '0.5rem' }}>
                                Preencha a atividade deste bloco para poder anexar fotos, vídeos ou PDF.
                              </div>
                            )}
                            {!filled && blockFiles.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginBottom: '0.5rem' }}>
                                Este bloco ficou sem atividade: preencha a atividade ou remova os anexos para salvar.
                              </div>
                            )}
                            {filled && blockFiles.length === 0 && (
                              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, padding: '0.6rem 0.75rem', border: `1px dashed ${colors.border}`, borderRadius: '0.5rem' }}>
                                Nenhum anexo. Fotos desta atividade podem sair no relatório logo abaixo do bloco.
                              </div>
                            )}

                            {blockFiles.length > 0 && (
                              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 140 : 160}px, 1fr))`, gap: '0.6rem' }}>
                                {blockFiles.map((file) => {
                                  const isExisting = !!file.file_path;
                                  const mime = file.type || file.mime_type || '';
                                  const sizeMb = ((file.size || file.file_size || 0) / 1024 / 1024).toFixed(1);
                                  return (
                                    <div key={file.id} data-testid="anexo-card" style={{ border: `1px solid ${colors.border}`, borderRadius: '0.5rem', overflow: 'hidden', backgroundColor: colors.background, display: 'flex', flexDirection: 'column' }}>
                                      <button
                                        type="button"
                                        onClick={() => handlePreviewFile(file)}
                                        title="Visualizar"
                                        style={{ position: 'relative', aspectRatio: '16 / 10', width: '100%', border: 'none', padding: 0, cursor: 'pointer', backgroundColor: colors.surfaceHover, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                                      >
                                        {mime.startsWith('image/') ? (
                                          <img src={file.url} alt={file.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : mime.startsWith('video/') ? (
                                          <Video size={28} color={colors.textMuted} />
                                        ) : (
                                          <FileText size={28} color={colors.textMuted} />
                                        )}
                                        {!isExisting && (
                                          <span style={{ position: 'absolute', top: 6, left: 6, fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 999, backgroundColor: '#f59e0b', color: '#fff' }}>
                                            ao salvar
                                          </span>
                                        )}
                                      </button>
                                      <div style={{ padding: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                        <input
                                          type="text"
                                          value={file.title || ''}
                                          maxLength={120}
                                          aria-label="Título do anexo"
                                          placeholder="Título do anexo"
                                          onChange={(e) => handleTitleChange(file.id, isExisting, e.target.value)}
                                          onBlur={() => { if (isExisting) commitExistingTitle(file); }}
                                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                          style={{ width: '100%', padding: '0.3rem 0.45rem', fontSize: isMobile ? '16px' : '0.78rem', border: `1px solid ${colors.border}`, borderRadius: '0.3rem', backgroundColor: colors.surface, color: colors.text, minWidth: 0 }}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                          <span style={{ flex: 1, fontSize: '0.65rem', color: colors.textSecondary }}>{sizeMb} MB</span>
                                          <button type="button" onClick={() => handlePreviewFile(file)} title="Visualizar" aria-label="Visualizar"
                                            style={{ padding: '0.3rem', background: 'transparent', color: colors.primary, border: `1px solid ${colors.border}`, borderRadius: '0.3rem', cursor: 'pointer', display: 'flex' }}>
                                            <Eye size={14} />
                                          </button>
                                          <button type="button" onClick={() => handleRemoveFile(file.id, isExisting)} title="Remover" aria-label="Remover anexo"
                                            style={{ padding: '0.3rem', background: 'transparent', color: colors.danger || '#ef4444', border: `1px solid ${colors.border}`, borderRadius: '0.3rem', cursor: 'pointer', display: 'flex' }}>
                                            <X size={14} />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            </div>

          </div>
        )}
      </Modal>

      {/* File Preview Modal */}
      {previewFile && (
        <div style={previewOverlayStyle} onClick={() => setPreviewFile(null)}>
          <div style={previewContentStyle} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewFile(null)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: colors.danger || '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 1,
              }}
            >
              <X size={20} />
            </button>

            <div style={{ marginBottom: '1rem', fontWeight: '600', color: colors.text }}>
              {previewFile.name}
            </div>

            {previewFile.type.startsWith('image/') && (
              <img
                src={previewFile.url}
                alt={previewFile.name}
                style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 100px)', objectFit: 'contain' }}
              />
            )}

            {previewFile.type.startsWith('video/') && (
              <video
                src={previewFile.url}
                controls
                style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 100px)' }}
              />
            )}

            {previewFile.type.includes('pdf') && (
              <iframe
                src={previewFile.url}
                style={{ width: '80vw', height: 'calc(90vh - 100px)', border: 'none' }}
                title={previewFile.name}
              />
            )}
          </div>
        </div>
      )}

      <CreateTitleModal
        isOpen={showCreateTitle}
        onClose={() => setShowCreateTitle(false)}
        onSave={handleTitleCreated}
      />
    </>
  );
}

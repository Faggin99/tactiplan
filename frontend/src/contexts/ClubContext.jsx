import { createContext, useContext, useState, useEffect } from 'react';
import { clubService } from '../services/clubService';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { useTheme, effectiveClubBranding } from './ThemeContext';

const ClubContext = createContext();

export function ClubProvider({ children }) {
  const [clubs, setClubs] = useState([]);
  const [selectedClub, setSelectedClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const { isAuthenticated } = useAuth();
  const { setClubBranding } = useTheme();

  // Sempre que o clube ativo mudar (ou sua personalização), injeta as cores dele no tema.
  // Sem branding salvo vale a primary_color legada (ver effectiveClubBranding).
  const brandingKey = JSON.stringify([selectedClub?.id, selectedClub?.branding || null, selectedClub?.primary_color || null]);
  useEffect(() => {
    setClubBranding(effectiveClubBranding(selectedClub));
  }, [brandingKey, setClubBranding]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load clubs when auth state changes
  useEffect(() => {
    if (isAuthenticated) {
      loadClubs();
    } else {
      setClubs([]);
      setSelectedClub(null);
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Recarrega quando a workspace ativa muda (Slack-style switch)
  useEffect(() => {
    function handler() {
      // Limpa club selecionado pra evitar mostrar de outra workspace por um instante
      setSelectedClub(null);
      localStorage.removeItem('selectedClubId');
      if (isAuthenticated) loadClubs();
    }
    window.addEventListener('workspace-changed', handler);
    return () => window.removeEventListener('workspace-changed', handler);
  }, [isAuthenticated]);

  async function loadClubs() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await clubService.getAll();
      setClubs(data);

      // Auto-select first club or previously selected club from localStorage
      const savedClubId = localStorage.getItem('selectedClubId');
      if (savedClubId && data.find(c => c.id === savedClubId)) {
        setSelectedClub(data.find(c => c.id === savedClubId));
      } else if (data.length > 0) {
        setSelectedClub(data[0]);
      }
    } catch (error) {
      console.error('Error loading clubs:', error);
      // Captura erros de assinatura (402) pra evitar mostrar modal de onboarding indevidamente
      setLoadError(error?.statusCode === 402 || error?.code ? { kind: 'subscription', code: error.code } : { kind: 'unknown' });
    } finally {
      setLoading(false);
    }
  }

  function selectClub(club) {
    setSelectedClub(club);
    if (club) {
      localStorage.setItem('selectedClubId', club.id);
    } else {
      localStorage.removeItem('selectedClubId');
    }
  }

  async function createClub(clubData) {
    try {
      // Check for duplicate name
      const duplicate = clubs.find(c => c.name.toLowerCase() === clubData.name.toLowerCase());
      if (duplicate) {
        throw new Error('Já existe um clube com este nome');
      }

      const newClub = await clubService.create({ ...clubData, modality: clubData.modality });

      // If this is the first club, migrate old data
      const isFirstClub = clubs.length === 0;
      if (isFirstClub) {
        await migrateOldDataToClub(newClub.id);
      }

      setClubs([...clubs, newClub]);
      // Auto-select newly created club
      selectClub(newClub);
      return newClub;
    } catch (error) {
      console.error('Error creating club:', error);
      throw error;
    }
  }

  async function migrateOldDataToClub(clubId) {
    try {
      // Call backend endpoint to migrate orphaned data
      await api.post(`/clubs/${clubId}/migrate-data`);
      console.log('Migrated old data to club:', clubId);
    } catch (error) {
      console.error('Error migrating old data:', error);
    }
  }

  async function updateClub(clubId, clubData) {
    try {
      // Check for duplicate name (excluding current club)
      const duplicate = clubs.find(c =>
        c.id !== clubId &&
        c.name.toLowerCase() === clubData.name.toLowerCase()
      );
      if (duplicate) {
        throw new Error('Já existe um clube com este nome');
      }

      const updatedClub = await clubService.update(clubId, clubData);
      setClubs(clubs.map(c => c.id === clubId ? updatedClub : c));
      if (selectedClub?.id === clubId) {
        setSelectedClub(updatedClub);
      }
      return updatedClub;
    } catch (error) {
      console.error('Error updating club:', error);
      throw error;
    }
  }

  async function deleteClub(clubId) {
    try {
      await clubService.delete(clubId);
      const newClubs = clubs.filter(c => c.id !== clubId);
      setClubs(newClubs);

      // If deleted club was selected, select first available club
      if (selectedClub?.id === clubId) {
        if (newClubs.length > 0) {
          selectClub(newClubs[0]);
        } else {
          selectClub(null);
        }
      }
    } catch (error) {
      console.error('Error deleting club:', error);
      throw error;
    }
  }

  async function uploadLogo(clubId, file) {
    try {
      const updatedClub = await clubService.uploadLogo(clubId, file);
      setClubs(clubs.map(c => c.id === clubId ? updatedClub : c));
      if (selectedClub?.id === clubId) {
        setSelectedClub(updatedClub);
      }
      return updatedClub;
    } catch (error) {
      console.error('Error uploading logo:', error);
      throw error;
    }
  }

  // Substitui um clube na lista (e no ativo) pela versão devolvida pelo servidor
  // (Personalização: branding/logos salvos).
  function replaceClub(updated) {
    if (!updated?.id) return;
    setClubs((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
    setSelectedClub((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
  }

  const value = {
    replaceClub,
    clubs,
    selectedClub,
    loading,
    loadError,
    selectClub,
    createClub,
    updateClub,
    deleteClub,
    uploadLogo,
    refreshClubs: loadClubs,
    getLogoUrl: clubService.getLogoUrl,
  };

  return (
    <ClubContext.Provider value={value}>
      {children}
    </ClubContext.Provider>
  );
}

export function useClub() {
  const context = useContext(ClubContext);
  if (!context) {
    throw new Error('useClub must be used within a ClubProvider');
  }
  return context;
}

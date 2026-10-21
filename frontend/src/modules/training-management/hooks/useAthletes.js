import { useState, useEffect } from 'react';
import { athleteService } from '../services/athleteService';
import { useClub } from '../../../contexts/ClubContext';

export function useAthletes() {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Atletas do CLUBE aberto (com clubes arquivados a conta pode ter vários clubes).
  const { selectedClub } = useClub();
  const clubId = selectedClub?.id || null;

  const fetchAthletes = async () => {
    try {
      setLoading(true);
      if (!clubId) { setAthletes([]); return; }
      const data = await athleteService.getAll({ status: 'active', club_id: clubId });
      setAthletes(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAthletes();
  }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateGroups = async (updates) => {
    try {
      await athleteService.batchUpdateGroups(updates);
      await fetchAthletes();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return { athletes, loading, error, updateGroups };
}

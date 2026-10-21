import { useState, useCallback } from 'react';
import { playService } from '../services/playService';

export function usePlays() {
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPlays = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await playService.getAll();
      setPlays(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createPlay = useCallback(async (data) => {
    setError(null);
    try {
      const play = await playService.create(data);
      setPlays((prev) => [play, ...prev]);
      return play;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const updatePlay = useCallback(async (id, data) => {
    setError(null);
    try {
      const play = await playService.update(id, data);
      setPlays((prev) => prev.map((p) => (p.id === id ? play : p)));
      return play;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const deletePlay = useCallback(async (id) => {
    setError(null);
    try {
      await playService.delete(id);
      setPlays((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return {
    plays,
    loading,
    error,
    fetchPlays,
    createPlay,
    updatePlay,
    deletePlay,
  };
}

import { api } from '../../../services/api';

export const microcycleService = {
  async get(weekIdentifier, clubId) {
    if (!clubId) {
      console.log('No club selected, returning null');
      return null;
    }

    try {
      const data = await api.get(`/microcycles?week=${weekIdentifier}&club_id=${clubId}`);
      if (!data || !data.id) return null;
      return data;
    } catch (error) {
      console.error('Error loading microcycle:', error);
      return null;
    }
  },

  async ensureStructure(weekIdentifier, clubId) {
    if (!clubId) {
      throw new Error('Nenhum clube selecionado');
    }
    return await api.post('/microcycles/ensure', { week: weekIdentifier, club_id: clubId });
  },
};

/**
 * Create empty week structure for UI display (no database records)
 * @param {string} weekIdentifier - ISO week format "YYYY-WW"
 * @returns {Object} Empty week structure with null IDs
 */
export function createEmptyWeekStructure(weekIdentifier) {
  const parts = weekIdentifier.includes('-W')
    ? weekIdentifier.split('-W')
    : weekIdentifier.split('-');
  const year = parseInt(parts[0]);
  const week = parseInt(parts[1]);

  const startDate = getDateOfISOWeek(week, year);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  const dayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

  return {
    id: null, // No database ID
    week_identifier: weekIdentifier,
    name: `Semana ${week}/${year}`,
    start_date: formatLocalDate(startDate),
    end_date: formatLocalDate(endDate),
    sessions: Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);

      return {
        id: null, // No database ID
        microcycle_id: null,
        date: formatLocalDate(date),
        day_name: dayNames[i],
        day_of_week: i + 1,
        session_type: 'training',
        blocks: [
          { id: null, name: 'Academia', order: 1, activity: null },
          { id: null, name: 'Ativação', order: 2, activity: null },
          { id: null, name: 'Atividade 1', order: 3, activity: null },
          { id: null, name: 'Atividade 2', order: 4, activity: null },
          { id: null, name: 'Atividade 3', order: 5, activity: null },
          { id: null, name: 'Treino de goleiro', order: 6, activity: null },
        ]
      };
    })
  };
}

// Helper function to get date of ISO week
// Format date as YYYY-MM-DD using local timezone (avoids UTC offset shifting the day)
function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getDateOfISOWeek(week, year) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4)
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  return ISOweekStart;
}

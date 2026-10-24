import { api } from './api';

export const gameStatsService = {
  async getStats(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);
    if (params.clubId) queryParams.append('clubId', params.clubId);
    if (params.competitionId) queryParams.append('competition_id', params.competitionId);

    const query = queryParams.toString();
    return await api.get(`/stats/games${query ? '?' + query : ''}`);
  },
};

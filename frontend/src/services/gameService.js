import { api } from './api';

export const gameService = {
  // Análise do adversário do jogo (migration 062)
  async getAnalise(sessionId) {
    return await api.get(`/games/${sessionId}/analise`);
  },
  async saveAnalise(sessionId, data) {
    return await api.put(`/games/${sessionId}/analise`, { data });
  },

  async getMatchData(sessionId) {
    return await api.get(`/games/${sessionId}`);
  },

  async saveMatchPlayers(sessionId, players) {
    return await api.post(`/games/${sessionId}`, { players });
  },

  async saveMatchEvents(sessionId, events) {
    return await api.post(`/games/${sessionId}`, { events });
  },

  async updateMatchInfo(sessionId, data) {
    return await api.put(`/sessions/${sessionId}/type`, {
      session_type: 'match',
      opponent_name: data.opponent_name,
      match_duration: data.match_duration,
    });
  },

  async saveAllMatchData(sessionId, data) {
    return await api.post(`/games/${sessionId}`, {
      ...(data.formation !== undefined ? { formation: data.formation } : {}),
      opponent_name: data.opponent_name,
      match_duration: data.match_duration,
      players: data.players,
      events: data.events,
      competition_id: data.competition_id ?? null,
      match_round: data.match_round ?? null,
      match_location: data.match_location ?? null,
      video_full_url: data.video_full_url ?? null,
      // formulário novo de substituição: o servidor pode recusar substituição inválida (400)
      ...(data.subs_check ? { subs_check: true } : {}),
    });
  },
};

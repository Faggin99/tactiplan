import { api } from './api';

// Análise do jogo em vídeo (/api/video-analise, migration 065). O arquivo de vídeo não sobe: só os lances.
export const videoAnaliseService = {
  carregar: (sessionId) => api.get(`/video-analise/${sessionId}`),
  salvarMeta: (sessionId, meta) => api.put(`/video-analise/${sessionId}/meta`, meta),
  criarLance: (sessionId, lance) => api.post(`/video-analise/${sessionId}/lances`, lance),
  salvarLance: (sessionId, id, lance) => api.patch(`/video-analise/${sessionId}/lances/${id}`, lance),
  apagarLance: (sessionId, id) => api.delete(`/video-analise/${sessionId}/lances/${id}`),
  salvarTags: (sessionId, tags) => api.put(`/video-analise/${sessionId}/tags`, { tags }),
};

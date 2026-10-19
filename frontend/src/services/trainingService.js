import { api } from './api';
import { createEmptyWeekStructure } from '../modules/training-management/services/microcycleService';
import { cache } from '../utils/cache';

export const trainingService = {
  async getMicrocycle(weekIdentifier, clubId) {
    try {
      const data = await api.get(`/microcycles?week=${weekIdentifier}&club_id=${clubId}`);
      if (!data || !data.id) {
        return { data: createEmptyWeekStructure(weekIdentifier) };
      }
      return { data };
    } catch (error) {
      console.log('Microcycle not found, returning empty structure');
      return { data: createEmptyWeekStructure(weekIdentifier) };
    }
  },

  async ensureMicrocycleStructure(weekIdentifier, clubId) {
    const data = await api.post('/microcycles/ensure', { week: weekIdentifier, club_id: clubId });
    return { data };
  },

  async getSession(sessionId) {
    const data = await api.get(`/sessions/${sessionId}`);
    return { data };
  },

  async updateSession(sessionId, data) {
    // Not used directly - activities are managed individually
    return { data: {} };
  },

  async updateSessionType(sessionId, data) {
    const result = await api.put(`/sessions/${sessionId}/type`, {
      session_type: data.session_type,
      opponent_name: data.opponent_name || null,
    });
    return { data: result };
  },

  // Distância ideal no dia (km). null limpa.
  async updateSessionDistance(sessionId, avgDistanceKm) {
    const result = await api.put(`/sessions/${sessionId}/distance`, {
      avg_distance_km: avgDistanceKm ?? null,
    });
    return { data: result };
  },

  async updateActivity(activityId, data) {
    const result = await api.put(`/activities/${activityId}`, {
      title_id: data.titleId || data.title_id || null,
      description: data.description || null,
      duration_minutes: data.duration_minutes || data.durationMinutes || null,
      groups: data.groups || data.selectedGroups || [],
      is_rest: data.is_rest || false,
      selectedContents: data.selectedContents || [],
      selectedStages: data.selectedStages || [],
    });
    return { data: result };
  },

  async createActivity(data) {
    const result = await api.post('/activities', {
      block_id: data.block_id,
      title_id: data.titleId || data.title_id || null,
      description: data.description || null,
      duration_minutes: data.duration_minutes || data.durationMinutes || null,
      groups: data.groups || data.selectedGroups || [],
      is_rest: data.is_rest || false,
      selectedContents: data.selectedContents || [],
      selectedStages: data.selectedStages || [],
    });
    return { data: result };
  },

  async upsertActivityForBlock(blockId, data) {
    const result = await api.post('/activities/upsert', {
      block_id: blockId,
      title_id: data.titleId || data.title_id || null,
      description: data.description || null,
      duration_minutes: data.duration_minutes || data.durationMinutes || null,
      groups: data.groups || data.selectedGroups || [],
      is_rest: data.is_rest || false,
      selectedContents: data.selectedContents || [],
      selectedStages: data.selectedStages || [],
    });
    return { data: result };
  },

  async deleteActivityByBlockId(blockId) {
    const result = await api.delete(`/activities/block/${blockId}`);
    return { data: result };
  },

  async getContents() {
    const cacheKey = 'training_contents';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const data = await api.get('/contents');
    const result = { data: data || [] };
    cache.set(cacheKey, result, 300000);
    return result;
  },

  async createContent(payload) {
    const data = await api.post('/contents', payload);
    cache.clearPattern?.('training_contents');
    return { data };
  },

  async updateContent(id, payload) {
    const data = await api.put(`/contents/${id}`, payload);
    cache.clearPattern?.('training_contents');
    return { data };
  },

  async deleteContent(id) {
    const data = await api.delete(`/contents/${id}`);
    cache.clearPattern?.('training_contents');
    // Subconteúdos do content deletado caíram com cascade
    cache.clearPattern?.('training_stages');
    return { data };
  },

  async toggleContentActive(id, active) {
    const data = await api.patch(`/contents/${id}/active`, { active });
    cache.clearPattern?.('training_contents');
    return { data };
  },

  async getStages(contentId = null, modality = null) {
    // Cache inclui modality pra não vazar submomentos de modalidade errada entre trocas de clube
    const cacheKey = `training_stages_${contentId || 'all'}_${modality || 'any'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    if (contentId) params.append('content_id', contentId);
    if (modality)  params.append('modality', modality);
    const qs = params.toString() ? `?${params}` : '';
    const data = await api.get(`/stages${qs}`);
    const result = { data: data || [] };
    cache.set(cacheKey, result, 300000);
    return result;
  },

  async createStage(payload) {
    const data = await api.post('/stages', payload);
    cache.clearPattern?.('training_stages');
    return { data };
  },

  async updateStage(id, payload) {
    const data = await api.put(`/stages/${id}`, payload);
    cache.clearPattern?.('training_stages');
    return { data };
  },

  async deleteStage(id) {
    const data = await api.delete(`/stages/${id}`);
    cache.clearPattern?.('training_stages');
    return { data };
  },

  async toggleStageActive(id, active) {
    const data = await api.patch(`/stages/${id}/active`, { active });
    cache.clearPattern?.('training_stages');
    return { data };
  },

  async getTitles(includeArchived = false) {
    const query = includeArchived ? '?includeArchived=true' : '';
    const data = await api.get(`/titles${query}`);
    return { data: data || [] };
  },

  async getTitlesWithContent(includeArchived = false) {
    const query = includeArchived ? '?includeArchived=true' : '';
    const data = await api.get(`/titles/with-content${query}`);
    return { data: data || [] };
  },

  async createTitle(titleData) {
    const data = await api.post('/titles', titleData);
    return { data };
  },

  async updateTitle(titleId, titleData) {
    const data = await api.put(`/titles/${titleId}`, {
      title: titleData.title,
      content_id: titleData.content_id,
      description: titleData.description,
    });
    return { data };
  },

  async archiveTitle(titleId) {
    const data = await api.put(`/titles/${titleId}/archive`);
    return { data };
  },

  async unarchiveTitle(titleId) {
    const data = await api.put(`/titles/${titleId}/unarchive`);
    return { data };
  },

  async getTitleUsageCount(titleId) {
    const data = await api.get(`/titles/${titleId}/usage-count`);
    return { count: data.count || 0 };
  },

  // Session Files
  async uploadSessionFile(sessionId, file, title) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    formData.append('title', title || '');
    const data = await api.upload('/files/upload', formData);
    return { data };
  },

  async getSessionFiles(sessionId) {
    const data = await api.get(`/files/session/${sessionId}`);
    return { data: data || [] };
  },

  async deleteSessionFile(fileId) {
    await api.delete(`/files/${fileId}`);
    return { data: { message: 'Arquivo deletado' } };
  },

  async getSessionFile(fileId) {
    const data = await api.get(`/files/${fileId}`);
    return { data };
  },

  // Statistics
  async getStats(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.period) queryParams.append('period', params.period);
    if (params.start_date) queryParams.append('start_date', params.start_date);
    if (params.end_date) queryParams.append('end_date', params.end_date);
    if (params.clubId) queryParams.append('clubId', params.clubId);

    const query = queryParams.toString();
    const data = await api.get(`/stats/training${query ? '?' + query : ''}`);
    return { data };
  },
};

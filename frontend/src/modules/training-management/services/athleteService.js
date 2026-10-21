import { api } from '../../../services/api';
import { formatarNome } from '../../../lib/formatarNome';

// Nome do atleta sai com a primeira letra maiúscula (o servidor aplica a mesma regra).
const comNome = (data) => (data && typeof data.name === 'string' ? { ...data, name: formatarNome(data.name) } : data);

export const athleteService = {
  async getAll(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.club_id) queryParams.append('club_id', params.club_id);
    if (params.group) queryParams.append('group', params.group);
    if (params.status) queryParams.append('status', params.status);
    const query = queryParams.toString();
    return await api.get(`/athletes${query ? '?' + query : ''}`);
  },

  async getById(id) {
    return await api.get(`/athletes/${id}`);
  },

  async create(data) {
    return await api.post('/athletes', comNome(data));
  },

  async update(id, data) {
    return await api.put(`/athletes/${id}`, comNome(data));
  },

  async delete(id) {
    return await api.delete(`/athletes/${id}`);
  },

  async batchUpdateGroups(athletes) {
    return await api.put('/athletes/batch-groups', { athletes });
  },

  async uploadPhoto(id, file) {
    const fd = new FormData();
    fd.append('photo', file);
    return await api.upload(`/athletes/${id}/photo`, fd);
  },

  async deletePhoto(id) {
    return await api.delete(`/athletes/${id}/photo`);
  },
};

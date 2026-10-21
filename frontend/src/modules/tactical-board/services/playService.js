import { api } from '../../../services/api';

export const playService = {
  // Jogadas são da conta (todos os clubes); club_id fica só como "criada em".
  async getAll() {
    return await api.get('/plays');
  },

  async getById(id) {
    return await api.get(`/plays/${id}`);
  },

  async create(data) {
    return await api.post('/plays', data);
  },

  async update(id, data) {
    return await api.put(`/plays/${id}`, data);
  },

  async delete(id) {
    return await api.delete(`/plays/${id}`);
  },
};

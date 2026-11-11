import { api } from './api';

export const homeService = {
  async getDashboard(clubId = null, { semanaDe = null } = {}) {
    const p = new URLSearchParams();
    if (clubId) p.set('clubId', clubId);
    if (semanaDe) p.set('semanaDe', semanaDe); // prévia: quadro de outra semana
    const qs = p.toString() ? `?${p}` : '';
    return await api.get(`/home/dashboard${qs}`);
  },
  async dismissAnnouncement(id) {
    return await api.post(`/announcements/${id}/dismiss`, {});
  },
};

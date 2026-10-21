import { api } from './api';

export const clubService = {
  async getAll() {
    return await api.get('/clubs');
  },

  getLogoUrl(logoPath) {
    if (!logoPath) return null;
    if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) return logoPath;
    if (logoPath.startsWith('/')) return logoPath;
    return `/uploads/club-logos/${logoPath}`;
  },

  async getById(clubId) {
    return await api.get(`/clubs/${clubId}`);
  },

  async create(clubData) {
    return await api.post('/clubs', clubData);
  },

  async update(clubId, clubData) {
    return await api.put(`/clubs/${clubId}`, {
      name: clubData.name,
      description: clubData.description,
      modality: clubData.modality,
      primary_color: clubData.primary_color,
      secondary_color: clubData.secondary_color,
    });
  },

  // variant 'dark' = logo do tema escuro (opcional); padrão = logo principal.
  async uploadLogo(clubId, file, variant) {
    const formData = new FormData();
    formData.append('logo', file);
    return await api.upload(`/clubs/${clubId}/logo${variant === 'dark' ? '?variant=dark' : ''}`, formData);
  },

  async deleteLogo(clubId, variant) {
    return await api.delete(`/clubs/${clubId}/logo${variant === 'dark' ? '?variant=dark' : ''}`);
  },

  // Personalização (cores do app por clube). branding = { light?: {6 cores}, dark?: {6 cores} }.
  async saveBranding(clubId, branding) {
    return await api.put(`/clubs/${clubId}/branding`, { branding });
  },

  async delete(clubId) {
    return await api.delete(`/clubs/${clubId}`);
  },
};

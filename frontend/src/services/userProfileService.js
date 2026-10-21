import { api } from './api';
import { formatarNome } from '../lib/formatarNome';

export const userProfileService = {
  async getProfile() {
    return await api.get('/auth/me');
  },

  async updateProfile(profileData) {
    return await api.put('/auth/profile', {
      name: formatarNome(profileData.name), // mesma regra do servidor
      phone: profileData.phone,
      bio: profileData.bio,
    });
  },

  getPhotoUrl(photoPath) {
    if (!photoPath) return null;
    if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) return photoPath;
    if (photoPath.startsWith('/')) return photoPath;
    return `/uploads/profile-photos/${photoPath}`;
  },

  async uploadPhoto(file) {
    const formData = new FormData();
    formData.append('photo', file);
    return await api.upload('/auth/upload-photo', formData);
  },

  async changePassword(currentPassword, newPassword) {
    await api.put('/auth/password', {
      currentPassword,
      newPassword,
    });
    return true;
  },
};

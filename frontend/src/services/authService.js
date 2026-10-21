import { api } from './api';

export const authService = {
  async login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    return {
      user: data.user,
      token: data.token,
      tenant: null,
    };
  },

  async logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    return { data: { message: 'Logout realizado com sucesso' } };
  },

  async register({ email, password, name, phone, accept_terms, tipo }) {
    const data = await api.post('/auth/register', { email, password, name, phone, tipo, accept_terms: accept_terms ? 'true' : 'false' });
    return { user: data.user, token: data.token };
  },

  async googleLogin(credential) {
    const data = await api.post('/auth/google', { credential });
    return { user: data.user, token: data.token };
  },

  async appleLogin(identityToken, name = null) {
    const data = await api.post('/auth/apple', { identityToken, name });
    return { user: data.user, token: data.token };
  },

  async forgotPassword(email) {
    return await api.post('/auth/forgot', { email });
  },

  async resetPassword(token, password) {
    return await api.post('/auth/reset', { token, password });
  },

  async deleteMe(password) {
    // Backend: DELETE /api/auth/me — exige senha atual quando a conta tem senha;
    // apaga/anonimiza dados e cancela assinatura ativa (LGPD).
    const body = password ? { password } : {};
    return await api.delete('/auth/me', body);
  },

  async me() {
    const data = await api.get('/auth/me');
    return {
      user: {
        id: data.id,
        email: data.email,
        name: data.name || data.email?.split('@')[0] || 'Usuário',
        role: data.role || 'trainer',
        tenant_id: data.id,
        avatar_url: data.profile_photo ? `/uploads/profile-photos/${data.profile_photo}` : null,
        profile_photo: data.profile_photo,
        phone: data.phone,
        bio: data.bio,
        requires_password: !!data.requires_password,
      },
      tenant: null,
    };
  },
};

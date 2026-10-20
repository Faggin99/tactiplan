import { notify } from '../lib/notify';
const API_URL = import.meta.env.VITE_API_URL || '/api';

class ApiClient {
  constructor() {
    this.baseURL = API_URL;
  }

  getHeaders(isFormData = false) {
    const headers = {};
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
      headers['Accept'] = 'application/json';
    }
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Workspace ativa (injetada em todas as chamadas pra backend filtrar pela conta certa)
    const workspaceId = localStorage.getItem('active_workspace_id');
    if (workspaceId) {
      headers['X-Workspace-Id'] = workspaceId;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(options.isFormData),
        ...options.headers,
      },
    };
    delete config.isFormData;

    const response = await fetch(url, config);

    if (!response.ok) {
      if (response.status === 401) {
        // Endpoints de autenticação usam 401 pra ERRO DE NEGÓCIO (senha
        // incorreta, e-mail não encontrado, conta removida na exclusão). Nesses
        // casos a mensagem do backend precisa subir pra UI — não é sessão
        // expirada, então NÃO desloga nem redireciona.
        const isAuthEndpoint = endpoint.startsWith('/auth/');
        const body = await response.json().catch(() => ({}));
        if (!isAuthEndpoint) {
          localStorage.removeItem('auth_token');
          // Volta para onde a pessoa estava depois do login (ex.: link de convite).
          const atual = (window.location.hash || '').replace(/^#/, '');
          const voltar = atual && !atual.startsWith('/login') && atual !== '/' ? `?redirect=${encodeURIComponent(atual)}` : '';
          window.location.href = `/#/login${voltar}`;
          throw new Error(body.error || body.message || 'Sessão expirada');
        }
        const err = new Error(body.error || body.message || 'Falha na autenticação');
        err.statusCode = 401;
        throw err;
      }
      if (response.status === 402) {
        const body = await response.json().catch(() => ({}));
        const err = new Error(body.error || body.message || 'Assinatura necessária');
        err.code = body.code || body.error || 'subscription_required';
        err.required_feature = body.required_feature;
        err.statusCode = 402;

        // Auto-swap: se a workspace ativa expirou MAS o user é member de outra workspace
        // com sub válida, troca silenciosamente em vez de mostrar paywall.
        // Códigos que dispara swap: subscription_required, trial_expired, subscription_expired, payment_pending.
        const swapCodes = ['subscription_required', 'trial_expired', 'subscription_expired', 'payment_pending'];
        if (swapCodes.includes(err.code) && !window.__swappingWorkspace) {
          try {
            window.__swappingWorkspace = true;
            const wsRes = await fetch(`${this.baseURL}/workspaces`, {
              headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
            });
            if (wsRes.ok) {
              const data = await wsRes.json();
              const activeId = localStorage.getItem('active_workspace_id');
              const usable = (data.data || []).find(w => w.usable && w.id !== activeId);
              if (usable) {
                // Grava info pro toast pós-reload
                const prevId = activeId;
                const prev = (data.data || []).find(w => w.id === prevId);
                sessionStorage.setItem('workspace_swap_notice', JSON.stringify({
                  fromName: prev?.name || 'Conta anterior',
                  toName: usable.name || 'Outra conta',
                  reason: err.code,
                }));
                localStorage.setItem('active_workspace_id', usable.id);
                window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: usable.id, auto: true } }));
                window.__swappingWorkspace = false;
                window.location.reload();
                throw err;
              }
            }
          } catch (swapErr) {
            // se swap falhou, segue pro paywall normal
          } finally {
            window.__swappingWorkspace = false;
          }
        }

        err.read_only = !!body.read_only;
        err.limit = body.limit;
        // Só redireciona automaticamente quando NÃO é gate de feature, só leitura
        // (a tela continua visível, com o banner) nem limite de membros.
        const semRedirecionar = ['PLAN_REQUIRED', 'READ_ONLY', 'MEMBER_LIMIT'];
        if (!semRedirecionar.includes(err.code) && !window.location.hash.startsWith('#/billing')) {
          window.location.hash = '#/billing?reason=' + encodeURIComponent(err.code);
        }
        throw err;
      }
      if (response.status === 403) {
        const body = await response.json().catch(() => ({}));
        const msg = body.error || body.message || '';
        // "Sem permissão pra editar treinos" / "Sem acesso a essa categoria"…
        // vira aviso amigável dizendo o que fazer (pedir ao responsável).
        if (/^Sem (permiss|acesso)/i.test(msg)) {
          const m = msg.match(/^Sem permissão (?:pra|para) (.+)$/i);
          const texto = notify.semPermissao(m ? m[1] : null);
          const err = new Error(texto);
          err.code = 'NO_PERMISSION';
          err.statusCode = 403;
          throw err;
        }
        const err = new Error(msg || 'Acesso negado');
        err.statusCode = 403;
        throw err;
      }
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  delete(endpoint, data) {
    const config = { method: 'DELETE' };
    if (data !== undefined) config.body = JSON.stringify(data);
    return this.request(endpoint, config);
  }

  async upload(endpoint, formData) {
    return this.request(endpoint, {
      method: 'POST',
      body: formData,
      isFormData: true,
    });
  }
}

export const api = new ApiClient();

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

const WorkspaceContext = createContext(null);

const STORAGE_KEY = 'active_workspace_id';
// Workspace escolhida À MÃO no seletor: a escolha automática não troca ela.
const MANUAL_KEY = 'active_workspace_manual';

export function WorkspaceProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeId, setActiveIdState] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [loading, setLoading] = useState(true);

  const setActiveId = useCallback((id, { auto = false } = {}) => {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
    try {
      if (!auto && id) localStorage.setItem(MANUAL_KEY, id);
      else if (auto) localStorage.removeItem(MANUAL_KEY);
    } catch (_) { /* storage indisponível */ }
    setActiveIdState(id);
    // Notifica outros hooks (useSubscription, etc) que workspace mudou
    window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: id } }));
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/workspaces');
      const list = res?.data || [];
      setWorkspaces(list);
      // Escolha da workspace ativa:
      // - a guardada, se ainda existe e está liberada;
      // - senão uma liberada (própria primeiro): ex. convidado cuja conta pessoal,
      //   criada no cadastro, está vazia e em só leitura;
      // - senão a guardada (só leitura) ou a primeira própria.
      const stored = localStorage.getItem(STORAGE_KEY);
      const atual = stored ? list.find(w => w.id === stored) : null;
      const liberada = list.find(w => w.usable && w.is_owner) || list.find(w => w.usable);
      const manual = atual && localStorage.getItem(MANUAL_KEY) === atual.id;
      if (list.length > 0 && !(atual && (atual.usable || manual))) {
        const escolhida = liberada || atual || list.find(w => w.is_owner) || list[0];
        if (escolhida.id !== stored) setActiveId(escolhida.id, { auto: true });
      } else if (list.length === 0) {
        setActiveId(null, { auto: true });
      }
    } catch (err) {
      console.error('load workspaces', err);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, setActiveId]);

  useEffect(() => { load(); }, [load]);

  const createWorkspace = useCallback(async (name) => {
    const ws = await api.post('/workspaces', { name });
    await load();
    if (ws?.id) setActiveId(ws.id);
    return ws;
  }, [load, setActiveId]);

  // Troca pra outra workspace com sub utilizável (auto-recover de paywall).
  // Retorna o id da workspace nova, ou null se nenhuma disponível.
  const swapToUsableWorkspace = useCallback(() => {
    const usable = workspaces.find(w => w.usable && w.id !== activeId);
    if (usable) {
      setActiveId(usable.id, { auto: true });
      return usable.id;
    }
    return null;
  }, [workspaces, activeId, setActiveId]);

  const renameWorkspace = useCallback(async (id, name) => {
    const ws = await api.put(`/workspaces/${id}`, { name });
    await load();
    return ws;
  }, [load]);

  // "Você é": 'clube' (clube/escolinha) ou 'comissao' (comissão técnica). Só muda textos.
  const setWorkspaceTipo = useCallback(async (id, tipo) => {
    const ws = await api.put(`/workspaces/${id}/tipo`, { tipo });
    setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, tipo } : w)));
    return ws;
  }, []);

  const activeWorkspace = workspaces.find(w => w.id === activeId) || null;

  const value = {
    workspaces,
    activeId,
    activeWorkspace,
    loading,
    setActiveId,
    refresh: load,
    createWorkspace,
    renameWorkspace,
    setWorkspaceTipo,
    swapToUsableWorkspace,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be inside WorkspaceProvider');
  return ctx;
}

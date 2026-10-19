import { toast } from 'react-hot-toast';
import { createElement } from 'react';

// Helper de notificações centralizado — substitui alert()/confirm() nativos.
// Usa react-hot-toast; o <Toaster /> global fica montado em App.jsx.

// Dispara toast.success padronizado
function success(message, options = {}) {
  return toast.success(message, { duration: 3500, ...options });
}

// Falta de permissão do membro (403 do servidor ou checagem na tela):
// mensagem única e amigável, sem cara de erro do sistema.
export const SEM_PERMISSAO_DICA = 'Peça ao responsável pelo clube para liberar em Staff.';
function semPermissao(acao) {
  const texto = acao
    ? `Você não tem permissão para ${acao} neste clube. ${SEM_PERMISSAO_DICA}`
    : `Você não tem permissão para fazer isso neste clube. ${SEM_PERMISSAO_DICA}`;
  // id fixo: várias chamadas negadas em sequência mostram um aviso só
  toast(texto, { id: 'sem-permissao', icon: '🔒', duration: 6000 });
  return texto;
}

// Dispara toast.error padronizado (fica mais tempo pra dar chance de ler)
function error(message, options = {}) {
  // O aviso de permissão já foi mostrado (ver semPermissao): não repete como
  // "Erro ao salvar…: Você não tem permissão…".
  if (typeof message === 'string' && message.includes(SEM_PERMISSAO_DICA)) return null;
  return toast.error(message, { duration: 6000, ...options });
}

// Info neutro — usa toast base (sem ícone de estado)
function info(message, options = {}) {
  return toast(message, { duration: 3500, ...options });
}

// Loading — devolve id pra depois trocar com toast.success/error
function loading(message, options = {}) {
  return toast.loading(message, options);
}

function dismiss(id) {
  toast.dismiss(id);
}

// Confirm reutilizável: renderiza um toast persistente com botões Sim/Não.
// Retorna Promise<boolean> (true = confirmado). Também suporta callbacks.
function confirm(message, opts = {}) {
  const {
    onConfirm,
    onCancel,
    confirmText = 'Sim',
    cancelText = 'Não',
    duration = Infinity,
  } = opts;

  return new Promise((resolve) => {
    const id = toast.custom(
      (t) => {
        const handleConfirm = () => {
          toast.dismiss(t.id);
          try { onConfirm && onConfirm(); } catch (_) { /* noop */ }
          resolve(true);
        };
        const handleCancel = () => {
          toast.dismiss(t.id);
          try { onCancel && onCancel(); } catch (_) { /* noop */ }
          resolve(false);
        };

        return createElement(
          'div',
          {
            style: {
              minWidth: 300,
              maxWidth: 420,
              background: 'var(--toast-bg, #1e293b)',
              color: 'var(--toast-color, #f8fafc)',
              padding: '14px 16px',
              borderRadius: 10,
              boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
              border: '1px solid var(--toast-border, #334155)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              opacity: t.visible ? 1 : 0,
              transform: t.visible ? 'translateY(0)' : 'translateY(-8px)',
              transition: 'opacity 150ms ease, transform 150ms ease',
              fontSize: 14,
              lineHeight: 1.4,
            },
          },
          createElement('div', { style: { whiteSpace: 'pre-line' } }, message),
          createElement(
            'div',
            { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
            createElement(
              'button',
              {
                type: 'button',
                onClick: handleCancel,
                style: {
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: '1px solid var(--toast-border, #334155)',
                  background: 'transparent',
                  color: 'var(--toast-color, #f8fafc)',
                  cursor: 'pointer',
                  fontSize: 13,
                },
              },
              cancelText,
            ),
            createElement(
              'button',
              {
                type: 'button',
                onClick: handleConfirm,
                style: {
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#ef4444',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                },
              },
              confirmText,
            ),
          ),
        );
      },
      { duration, id: opts.id },
    );
    // devolvemos o id via propriedade da promise pra quem quiser dismiss externo
    if (typeof opts.onId === 'function') opts.onId(id);
  });
}

export const notify = { success, error, info, loading, dismiss, confirm, semPermissao };
export default notify;

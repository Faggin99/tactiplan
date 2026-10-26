// Arrastar atleta para uma VAGA do campo da escalação (mouse e toque, pointer events).
// Quem começa: um atleta no campo (LineupField) ou numa lista (reservas, titulares sem vaga).
// Solta em cima de um elemento com data-slot="N" → onDrop(athleteId, N). Só vira arrasto
// depois de mexer alguns pixels: um toque parado continua sendo clique.

const LIMIAR = 6; // px até virar arrasto

/**
 * Liga o arrasto num pointerdown.
 * @param {PointerEvent} e
 * @param {{ athleteId: string, label: string, onDrop: (athleteId: string, slot: number) => void }} opts
 */
export function startLineupDrag(e, { athleteId, label, onDrop }) {
  if (e.button != null && e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  const alvo = e.currentTarget;
  let ghost = null;
  let sobre = null;

  const marcar = (el) => {
    if (sobre === el) return;
    if (sobre) sobre.removeAttribute('data-drop-over');
    sobre = el;
    if (sobre) sobre.setAttribute('data-drop-over', '1');
  };
  const vagaEm = (x, y) => {
    if (ghost) ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y)?.closest?.('[data-slot]') || null;
    if (ghost) ghost.style.display = '';
    return el;
  };

  const mover = (ev) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < LIMIAR) return;
      ghost = document.createElement('div');
      ghost.textContent = label;
      Object.assign(ghost.style, {
        position: 'fixed', zIndex: 10000, pointerEvents: 'none', transform: 'translate(-50%, -120%)',
        padding: '0.3rem 0.6rem', borderRadius: '999px', background: '#0f172a', color: '#fff',
        font: '600 0.78rem system-ui, sans-serif', boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
        border: '2px solid #facc15', whiteSpace: 'nowrap',
      });
      document.body.appendChild(ghost);
      try { alvo.setPointerCapture?.(ev.pointerId); } catch { /* sem captura: segue pelo document */ }
    }
    ev.preventDefault();
    ghost.style.left = `${ev.clientX}px`;
    ghost.style.top = `${ev.clientY}px`;
    marcar(vagaEm(ev.clientX, ev.clientY));
  };

  const fim = (ev) => {
    document.removeEventListener('pointermove', mover);
    document.removeEventListener('pointerup', fim);
    document.removeEventListener('pointercancel', fim);
    if (!ghost) return; // foi um clique
    const el = ev.type === 'pointerup' ? vagaEm(ev.clientX, ev.clientY) : null;
    ghost.remove();
    marcar(null);
    // o clique que viria depois do arrasto não deve abrir nada
    const engolir = (c) => { c.stopPropagation(); c.preventDefault(); };
    window.addEventListener('click', engolir, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', engolir, { capture: true }), 0);
    if (el) onDrop(athleteId, Number(el.getAttribute('data-slot')));
  };

  document.addEventListener('pointermove', mover, { passive: false });
  document.addEventListener('pointerup', fim);
  document.addEventListener('pointercancel', fim);
}

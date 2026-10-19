// Seletor de atleta para UMA vaga do campo.
// Lista o plantel inteiro (busca por nome). A posição cadastrada aparece só
// como informação — não restringe quem pode ocupar a vaga.
// Vaga ocupada: dá pra trocar o atleta, mover pra outra vaga ou tirar do campo.

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ArrowLeftRight, UserMinus } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { readJersey } from '../../lib/lineupLayout';
import { initials, slotRole } from '../../lib/formation';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function SlotAthletePicker({
  isOpen, onClose, slot, formation, occupant, athletes = [], players = [],
  onPick, onMove, onRemoveFromField, isMobile = false,
}) {
  const { colors } = useTheme();
  const [busca, setBusca] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setBusca('');
    // No celular não abre o teclado sozinho (cobriria a lista).
    if (!isMobile) setTimeout(() => inputRef.current?.focus(), 30);
  }, [isOpen, isMobile, slot?.index]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const porAtleta = useMemo(() => new Map(players.map((p) => [p.athlete_id, p])), [players]);

  const lista = useMemo(() => {
    const q = norm(busca.trim());
    // Plantel + quem já está no jogo e não veio na lista do plantel (ex.: no DM).
    const ids = new Set(athletes.map((a) => a.id));
    const extras = players
      .filter((p) => !ids.has(p.athlete_id))
      .map((p) => ({ ...(p.athlete || {}), id: p.athlete_id, name: p.name || p.athlete?.name, jersey_number: p.athlete?.jersey_number }));
    return [...athletes, ...extras]
      .filter((a) => a.id !== occupant?.athlete_id)
      .filter((a) => !q || norm(a.name).includes(q) || String(a.jersey_number ?? '') === busca.trim())
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  }, [athletes, players, busca, occupant?.athlete_id]);

  if (!isOpen || !slot) return null;

  const situacao = (athleteId) => {
    const p = porAtleta.get(athleteId);
    if (!p) return null;
    if (p.status === 'starter' && p.slot != null) return { txt: `Em campo · ${slotRole(formation, p.slot)}`, cor: '#22c55e' };
    if (p.status === 'starter') return { txt: 'Titular sem vaga', cor: '#f59e0b' };
    return { txt: 'Reserva', cor: colors.textSecondary };
  };

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 1100,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: isMobile ? 'flex-end' : 'center',
    justifyContent: 'center',
    padding: isMobile ? 0 : '1rem',
  };
  const sheet = {
    backgroundColor: colors.background,
    color: colors.text,
    width: '100%',
    maxWidth: isMobile ? '100%' : '460px',
    maxHeight: isMobile ? '88dvh' : '80vh',
    borderRadius: isMobile ? '0.9rem 0.9rem 0 0' : '0.75rem',
    border: `1px solid ${colors.border}`,
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
    display: 'flex', flexDirection: 'column',
    paddingBottom: isMobile ? 'env(safe-area-inset-bottom)' : 0,
  };
  const acao = {
    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
    minHeight: 40, padding: '0.45rem 0.6rem', borderRadius: '0.4rem',
    border: `1px solid ${colors.border}`, backgroundColor: colors.surface, color: colors.text,
    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  };
  const chipPos = {
    fontSize: '0.62rem', fontWeight: 600, padding: '0.08rem 0.35rem', borderRadius: '0.25rem',
    backgroundColor: colors.surface, border: `1px solid ${colors.border}`, color: colors.textSecondary,
    flexShrink: 0,
  };

  const content = (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Escolher atleta para a vaga ${slot.role}`}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.05em', color: '#fff',
            backgroundColor: colors.primary, borderRadius: '0.3rem', padding: '0.15rem 0.45rem',
          }}>{slot.role}</span>
          <span style={{ fontSize: '0.95rem', fontWeight: 600, flex: 1 }}>
            {occupant ? 'Trocar atleta da vaga' : 'Escolher atleta para a vaga'}
          </span>
          <span style={{ fontSize: '0.75rem', color: colors.textSecondary }}>{formation}</span>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary, padding: '0.35rem', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {occupant && (
          <div style={{ padding: '0.65rem 1rem', borderBottom: `1px solid ${colors.border}`, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <Avatar p={occupant} />
              <div style={{ flex: 1, minWidth: 0, fontSize: '0.88rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {occupant.name || occupant.athlete?.name}
              </div>
              {occupant.athlete?.position && <span style={chipPos} title="Posição cadastrada (só informação)">{occupant.athlete.position}</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" style={acao} onClick={onMove}>
                <ArrowLeftRight size={15} /> Mover para outra vaga
              </button>
              <button type="button" style={{ ...acao, color: '#ef4444' }} onClick={onRemoveFromField}>
                <UserMinus size={15} /> Tirar do campo
              </button>
            </div>
          </div>
        )}

        <div style={{ padding: '0.6rem 1rem 0.4rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textSecondary }} />
            <input
              ref={inputRef}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={occupant ? 'Buscar outro atleta pelo nome' : 'Buscar atleta pelo nome'}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '0.55rem 0.75rem 0.55rem 2rem',
                borderRadius: '0.4rem', border: `1px solid ${colors.border}`,
                backgroundColor: colors.surface, color: colors.text,
                fontSize: '16px', // 16px evita o zoom automático do iOS
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 0.5rem 0.75rem' }}>
          {lista.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: colors.textSecondary, fontSize: '0.85rem' }}>
              {athletes.length === 0 ? 'Nenhum atleta no plantel.' : 'Nenhum atleta com esse nome.'}
            </div>
          ) : lista.map((a) => {
            const sit = situacao(a.id);
            const p = porAtleta.get(a.id) || { athlete_id: a.id, name: a.name, athlete: a };
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onPick(a)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '0.6rem',
                  minHeight: 48, padding: '0.45rem 0.5rem', marginBottom: 2,
                  background: 'none', border: 'none', borderRadius: '0.4rem',
                  cursor: 'pointer', textAlign: 'left', color: colors.text, fontFamily: 'inherit',
                  touchAction: 'manipulation',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = colors.surface; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Avatar p={p} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                  {sit && <div style={{ fontSize: '0.68rem', color: sit.cor, fontWeight: 600 }}>{sit.txt}</div>}
                </div>
                {a.position && <span style={chipPos} title="Posição cadastrada (só informação)">{a.position}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function Avatar({ p }) {
  const num = readJersey(p);
  const name = p.name || p.athlete?.name;
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: '#ffffff', border: '2px solid #0f172a', color: '#0f172a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: (num != null && num !== '') ? '0.78rem' : '0.66rem', fontWeight: 800,
    }}>
      {num != null && num !== '' ? num : initials(name)}
    </div>
  );
}

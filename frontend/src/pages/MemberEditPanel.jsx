import { useEffect, useState } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Select } from '../components/common/Select';
import {
  ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_DEFAULTS,
  PERMISSION_GROUPS, PERMISSION_LABELS, PERMISSIONS,
} from '../lib/memberPermissions';

// Painel lateral pra editar permissões de um membro existente (ou pré-configurar no convite).
// member: { id, role, permissions (array|null), category_ids (array|null) }
// categories: lista pra checkboxes de escopo de categoria
// onSave: ({ role, permissions, category_ids }) => void
export function MemberEditPanel({ isOpen, onClose, member, categories = [], onSave, isInvite = false }) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('head_coach');
  const [permissions, setPermissions] = useState(null); // null = usa defaults do role
  const [scope, setScope] = useState('all'); // 'all' | 'some'
  const [selectedCats, setSelectedCats] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEmail('');
    if (member) {
      setRole(member.role || 'head_coach');
      setPermissions(member.permissions ?? null);
      if (Array.isArray(member.category_ids) && member.category_ids.length > 0) {
        setScope('some');
        setSelectedCats(member.category_ids);
      } else {
        setScope('all');
        setSelectedCats([]);
      }
      setShowAdvanced(Array.isArray(member.permissions));
    } else {
      setRole('head_coach');
      setPermissions(null);
      setScope('all');
      setSelectedCats([]);
      setShowAdvanced(false);
    }
    setSaving(false);
  }, [isOpen, member]);

  const effective = permissions ? new Set(permissions) : new Set(ROLE_DEFAULTS[role] || []);

  function togglePermission(p) {
    // Ao mexer no checkbox, vira override (permissions = array)
    const base = permissions ? [...permissions] : [...(ROLE_DEFAULTS[role] || [])];
    const set = new Set(base);
    if (set.has(p)) set.delete(p); else set.add(p);
    setPermissions(Array.from(set));
  }

  function resetPermissionsToRole() {
    setPermissions(null);
  }

  function handleRoleChange(newRole) {
    setRole(newRole);
    // Trocar de role reseta permissions pros defaults (a menos que advanced esteja com override explícito)
    if (!showAdvanced) setPermissions(null);
    // "Outros" não tem perfil pronto: abre as permissões para o dono escolher.
    if (newRole === 'other') setShowAdvanced(true);
  }

  function toggleCat(id) {
    setSelectedCats((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (isInvite && !email.trim()) return;
    setSaving(true);
    try {
      const payload = {
        role,
        permissions: permissions ?? null, // null = usar defaults; array = override
        category_ids: scope === 'some' ? selectedCats : null,
      };
      if (isInvite) payload.email = email.trim();
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 200,
      }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(520px, 100vw)',
        backgroundColor: colors.surface,
        borderLeft: `1px solid ${colors.border}`,
        zIndex: 201, overflowY: 'auto', color: colors.text,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              {isInvite ? 'Convidar membro' : 'Editar permissões'}
            </div>
            {member?.user_email && (
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>{member.user_email}</div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1rem 1.25rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Email (só no convite) */}
          {isInvite && (
            <Input
              label="E-mail *"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="convidado@email.com"
              fullWidth
              required
              autoFocus
            />
          )}

          {/* Papel */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Papel</label>
            <Select
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
              options={[...ROLES.filter(r => r !== 'owner'), ...(ROLES.includes(role) ? [] : [role])].map(r => ({ value: r, label: ROLE_LABELS[r] || r }))}
              fullWidth
            />
            {ROLE_DESCRIPTIONS[role] && (
              <div style={{ fontSize: '0.75rem', color: colors.textSecondary, marginTop: '0.4rem' }}>
                {ROLE_DESCRIPTIONS[role]}
              </div>
            )}
          </div>

          {/* Categorias (escopo) */}
          {categories.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Acesso a categorias</label>
              <Select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                options={[
                  { value: 'all', label: 'Todas as categorias do clube' },
                  { value: 'some', label: 'Apenas categorias específicas…' },
                ]}
                fullWidth
              />
              {scope === 'some' && (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 180, overflowY: 'auto' }}>
                  {categories.map((c) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedCats.includes(c.id)} onChange={() => toggleCat(c.id)} />
                      {c.name} {c.age_group ? <span style={{ opacity: 0.6 }}>· {c.age_group}</span> : null}
                    </label>
                  ))}
                </div>
              )}
              <div style={{ fontSize: '0.72rem', color: colors.textSecondary, marginTop: '0.4rem' }}>
                Quando limitado, o membro só vê e edita dados das categorias selecionadas.
              </div>
            </div>
          )}

          {/* Permissões granulares (avançado) */}
          <div>
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              style={{
                width: '100%', textAlign: 'left',
                background: 'transparent', border: 'none', padding: '0.5rem 0',
                color: colors.text, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600,
              }}
            >
              {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Personalizar permissões (avançado)
            </button>
            {showAdvanced && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontSize: '0.75rem', color: colors.textSecondary }}>
                  Marcadas: usa defaults do papel selecionado. Editar abaixo sobrescreve as permissões.
                  {permissions && (
                    <button onClick={resetPermissionsToRole}
                      style={{ marginLeft: '0.5rem', background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.75rem' }}>
                      voltar pros defaults
                    </button>
                  )}
                </div>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textSecondary, fontWeight: 600, marginBottom: '0.3rem' }}>
                      {group.label}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
                      {group.items.map((p) => (
                        <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={effective.has(p)} onChange={() => togglePermission(p)} />
                          {PERMISSION_LABELS[p]}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: '1rem 1.25rem', borderTop: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || (isInvite && !email.trim()) || (scope === 'some' && selectedCats.length === 0)}>
            {saving ? 'Salvando…' : (isInvite ? 'Enviar convite' : 'Salvar')}
          </Button>
        </div>
      </aside>
    </>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Users, Clock, CreditCard, Star, LogOut, Search, ExternalLink, X, Plus, Calendar } from 'lucide-react';
import { nomePlano } from '../../config/planos';

const DARK = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceAlt: '#0b1224',
  border: '#334155',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  accent: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

function adminFetch(path, opts = {}) {
  const token = localStorage.getItem('admin_token');
  return fetch(path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }).then(async (r) => {
    if (r.status === 401 || r.status === 403) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      window.location.href = '/#/admin/login';
      throw new Error('Sessão expirada');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}

function StatusBadge({ status, planId }) {
  if (!status) return <span style={{ color: DARK.textMuted, fontSize: '0.75rem' }}>—</span>;
  const map = {
    active:   { color: planId === 'lifetime' ? '#fbbf24' : DARK.success, label: planId === 'lifetime' ? 'Lifetime' : 'Ativa' },
    trialing: { color: DARK.accent, label: 'Trial' },
    canceled: { color: DARK.textMuted, label: 'Cancelada' },
    past_due: { color: DARK.danger, label: 'Atrasada' },
  };
  const m = map[status] || { color: DARK.textMuted, label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.7rem', fontWeight: 600,
      padding: '0.15rem 0.55rem',
      borderRadius: '999px',
      backgroundColor: `${m.color}22`,
      color: m.color,
      border: `1px solid ${m.color}55`,
    }}>
      {m.label}
    </span>
  );
}

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [openUserId, setOpenUserId] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem('admin_user');
    if (!raw || !localStorage.getItem('admin_token')) {
      navigate('/admin/login');
      return;
    }
    setAdminUser(JSON.parse(raw));
    loadAll();
  }, [navigate]);

  async function loadAll() {
    setLoading(true);
    try {
      const [d, u] = await Promise.all([
        adminFetch('/api/admin/dashboard'),
        adminFetch('/api/admin/users'),
      ]);
      setDashboard(d);
      setUsers(u);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/admin/login');
  }

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter && (u.status || 'none') !== statusFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q);
    });
  }, [users, search, statusFilter]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: DARK.bg, color: DARK.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Topbar */}
      <div style={{
        borderBottom: `1px solid ${DARK.border}`,
        backgroundColor: DARK.surface,
        padding: '0.875rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck size={20} color={DARK.accent} />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: DARK.accent, letterSpacing: '0.08em' }}>TACTIPLAN ADMIN</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.825rem', color: DARK.textMuted }}>{adminUser?.email}</span>
          <button onClick={handleLogout} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.4rem 0.7rem', backgroundColor: 'transparent',
            border: `1px solid ${DARK.border}`, borderRadius: '0.375rem',
            color: DARK.text, fontSize: '0.8rem', cursor: 'pointer',
          }}>
            <LogOut size={13} /> Sair
          </button>
        </div>
      </div>

      <div style={{ padding: '1.5rem', maxWidth: 1400, margin: '0 auto' }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <KpiCard icon={<Users size={18} />} label="Total de usuários" value={dashboard?.total_users || 0} color={DARK.accent} />
          <KpiCard icon={<Clock size={18} />} label="Em trial" value={dashboard?.in_trial || 0} color="#0ea5e9" />
          <KpiCard icon={<CreditCard size={18} />} label="Pagantes ativos" value={dashboard?.paying || 0} color={DARK.success} />
          <KpiCard icon={<Star size={18} />} label="Lifetime" value={dashboard?.lifetime || 0} color="#fbbf24" />
          <KpiCard icon={<Calendar size={18} />} label="Novos (7 dias)" value={dashboard?.new_this_week || 0} color="#a855f7" />
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={15} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: DARK.textMuted }} />
            <input
              type="text"
              placeholder="Buscar por email ou nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '0.5rem 0.75rem 0.5rem 2rem',
                backgroundColor: DARK.surface, border: `1px solid ${DARK.border}`,
                borderRadius: '0.375rem', color: DARK.text, fontSize: '0.875rem',
              }}
            />
          </div>
          {[
            { v: '', label: 'Todos' },
            { v: 'trialing', label: 'Trial' },
            { v: 'active', label: 'Ativos' },
            { v: 'canceled', label: 'Cancelados' },
            { v: 'none', label: 'Sem subscription' },
          ].map((f) => (
            <button key={f.v} onClick={() => setStatusFilter(f.v)} style={{
              padding: '0.4rem 0.75rem',
              backgroundColor: statusFilter === f.v ? DARK.accent : 'transparent',
              border: `1px solid ${statusFilter === f.v ? DARK.accent : DARK.border}`,
              color: statusFilter === f.v ? '#fff' : DARK.text,
              borderRadius: '0.375rem', fontSize: '0.8rem', cursor: 'pointer',
            }}>{f.label}</button>
          ))}
        </div>

        {/* Tabela */}
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: DARK.textMuted }}>Carregando...</div>
        ) : (
          <div style={{ backgroundColor: DARK.surface, border: `1px solid ${DARK.border}`, borderRadius: '0.5rem', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                <thead>
                  <tr style={{ backgroundColor: DARK.surfaceAlt, borderBottom: `1px solid ${DARK.border}` }}>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Nome</th>
                    <th style={thStyle}>Cadastro</th>
                    <th style={thStyle}>Plano</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Trial / Período</th>
                    <th style={thStyle}>Atividade</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: `1px solid ${DARK.border}` }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{u.email}</div>
                        {u.role === 'admin' && (
                          <span style={{ fontSize: '0.65rem', color: '#fbbf24' }}>● admin</span>
                        )}
                      </td>
                      <td style={tdStyle}>{u.name || '—'}</td>
                      <td style={tdStyle}>{fmtDate(u.created_at)}</td>
                      <td style={tdStyle}>{u.plan_id || '—'}</td>
                      <td style={tdStyle}><StatusBadge status={u.status} planId={u.plan_id} /></td>
                      <td style={tdStyle}>
                        {u.status === 'trialing' ? (
                          <span style={{ color: DARK.accent }}>até {fmtDate(u.trial_ends_at)}</span>
                        ) : u.current_period_end ? (
                          <span style={{ color: DARK.textMuted }}>até {fmtDate(u.current_period_end)}</span>
                        ) : '—'}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: '0.75rem', color: DARK.textMuted }}>
                          {u.clubs_count}c · {u.athletes_count}a · {u.templates_count}t · {u.activities_count}atv
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <button onClick={() => setOpenUserId(u.id)} style={{
                          padding: '0.3rem 0.6rem', backgroundColor: 'transparent',
                          border: `1px solid ${DARK.border}`, color: DARK.accent,
                          borderRadius: '0.3rem', fontSize: '0.75rem', cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        }}>
                          <ExternalLink size={12} /> Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: DARK.textMuted }}>Nenhum usuário encontrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {openUserId && (
        <UserDetailSheet userId={openUserId} onClose={() => setOpenUserId(null)} onAction={loadAll} />
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color }) {
  return (
    <div style={{
      backgroundColor: DARK.surface, border: `1px solid ${DARK.border}`,
      borderRadius: '0.625rem', padding: '0.875rem 1rem',
      display: 'flex', alignItems: 'center', gap: '0.75rem',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '0.5rem',
        backgroundColor: `${color}22`, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.65rem', color: DARK.textMuted, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: DARK.text, lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  );
}

function UserDetailSheet({ userId, onClose, onAction }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extendDays, setExtendDays] = useState(30);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    load();
  }, [userId]);

  async function load() {
    setLoading(true);
    try {
      const d = await adminFetch(`/api/admin/users/${userId}`);
      setData(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function grantLifetime() {
    if (!confirm('Conceder Lifetime a este usuário? Cancela subscriptions ativas e cria uma lifetime.')) return;
    setActionLoading(true);
    try {
      await adminFetch(`/api/admin/users/${userId}/grant-lifetime`, { method: 'POST' });
      await load();
      onAction?.();
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function extendTrial() {
    setActionLoading(true);
    try {
      await adminFetch(`/api/admin/users/${userId}/extend-trial`, {
        method: 'POST',
        body: JSON.stringify({ days: extendDays }),
      });
      await load();
      onAction?.();
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function changePlan(planId, planLabel) {
    if (!confirm(`Trocar o plano da assinatura atual deste usuário pra ${planLabel}?\n\nMantém status, data de expiração e dias restantes do trial. Não cria nova subscription.`)) return;
    setActionLoading(true);
    try {
      const res = await adminFetch(`/api/admin/users/${userId}/change-plan`, {
        method: 'POST',
        body: JSON.stringify({ plan_id: planId }),
      });
      if (res?.warning) alert('Atenção: ' + res.warning);
      await load();
      onAction?.();
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
        zIndex: 100, animation: 'fadeIn 0.15s',
      }} />
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(560px, 100vw)',
        backgroundColor: DARK.bg,
        borderLeft: `1px solid ${DARK.border}`,
        zIndex: 101, overflowY: 'auto', color: DARK.text,
      }}>
        <div style={{
          padding: '1rem 1.25rem', borderBottom: `1px solid ${DARK.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, backgroundColor: DARK.bg, zIndex: 1,
        }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Detalhes do usuário</div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: DARK.textMuted, cursor: 'pointer',
            padding: 4, display: 'flex',
          }}><X size={18} /></button>
        </div>

        {loading || !data ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: DARK.textMuted }}>Carregando...</div>
        ) : (
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Perfil */}
            <div>
              <SectionTitle>Perfil</SectionTitle>
              <KV label="Email" value={data.user.email} />
              <KV label="Nome" value={data.user.name || '—'} />
              <KV label="Role" value={data.user.role} />
              <KV label="Telefone" value={data.user.phone || '—'} />
              <KV label="Cadastro" value={fmtDate(data.user.created_at)} />
              <KV label="Última atualização" value={fmtDate(data.user.updated_at)} />
            </div>

            {/* Estatísticas de atividade */}
            <div>
              <SectionTitle>Atividade na plataforma</SectionTitle>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                <Stat label="Clubes" value={data.stats.clubs} />
                <Stat label="Atletas" value={data.stats.athletes} />
                <Stat label="Atividades-template" value={data.stats.templates} />
                <Stat label="Microciclos" value={data.stats.microcycles} />
                <Stat label="Sessões" value={data.stats.sessions} />
                <Stat label="Atividades de treino" value={data.stats.activities} />
                <Stat label="Plays táticos" value={data.stats.plays} />
              </div>
            </div>

            {/* Histórico subscriptions */}
            <div>
              <SectionTitle>Histórico de subscriptions</SectionTitle>
              {data.subscriptions.length === 0 ? (
                <div style={{ color: DARK.textMuted, fontSize: '0.825rem' }}>Sem subscriptions.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {data.subscriptions.map((s) => (
                    <div key={s.id} style={{
                      padding: '0.6rem 0.75rem',
                      backgroundColor: DARK.surface,
                      border: `1px solid ${DARK.border}`,
                      borderRadius: '0.4rem', fontSize: '0.8rem',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <div style={{ fontWeight: 600 }}>{s.plan_id}</div>
                        <StatusBadge status={s.status} planId={s.plan_id} />
                      </div>
                      <div style={{ fontSize: '0.7rem', color: DARK.textMuted }}>
                        Criada {fmtDate(s.created_at)}
                        {s.trial_ends_at && ` · Trial até ${fmtDate(s.trial_ends_at)}`}
                        {s.canceled_at && ` · Cancelada ${fmtDate(s.canceled_at)}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Billing events */}
            {data.billingEvents?.length > 0 && (
              <div>
                <SectionTitle>Eventos de billing</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 200, overflowY: 'auto' }}>
                  {data.billingEvents.map((e) => (
                    <div key={e.id} style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem', backgroundColor: DARK.surface, borderRadius: '0.3rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{e.event_type}</span>
                        <span style={{ color: DARK.textMuted }}>{fmtDate(e.created_at)}</span>
                      </div>
                      <div style={{ color: DARK.textMuted, fontSize: '0.7rem' }}>mp_status: {e.mp_status || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ações */}
            <div>
              <SectionTitle>Ações</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button onClick={grantLifetime} disabled={actionLoading} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  padding: '0.55rem 1rem', backgroundColor: '#fbbf24',
                  color: '#0f172a', border: 'none', borderRadius: '0.375rem',
                  fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                  opacity: actionLoading ? 0.5 : 1,
                }}>
                  <Star size={14} /> Conceder Lifetime
                </button>

                <div>
                  <div style={{ fontSize: '0.7rem', color: DARK.textMuted, marginBottom: '0.3rem', textTransform: 'uppercase', fontWeight: 600 }}>
                    Trocar plano da assinatura atual
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button onClick={() => changePlan('clube', nomePlano('clube'))} disabled={actionLoading} style={{
                      padding: '0.55rem 0.5rem', backgroundColor: '#22c55e',
                      color: '#fff', border: 'none', borderRadius: '0.375rem',
                      fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                      opacity: actionLoading ? 0.5 : 1,
                    }}>
                      → {nomePlano('clube')}
                    </button>
                    <button onClick={() => changePlan('clube_annual', nomePlano('clube_annual'))} disabled={actionLoading} style={{
                      padding: '0.55rem 0.5rem', backgroundColor: '#22c55e',
                      color: '#fff', border: 'none', borderRadius: '0.375rem',
                      fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                      opacity: actionLoading ? 0.5 : 1,
                    }}>
                      → {nomePlano('clube_annual')}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number" min="1" max="180"
                    value={extendDays}
                    onChange={(e) => setExtendDays(parseInt(e.target.value, 10) || 30)}
                    style={{
                      width: 70, padding: '0.5rem',
                      backgroundColor: DARK.surface,
                      border: `1px solid ${DARK.border}`,
                      borderRadius: '0.375rem', color: DARK.text,
                      fontSize: '0.85rem', textAlign: 'center',
                    }}
                  />
                  <button onClick={extendTrial} disabled={actionLoading} style={{
                    flex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    padding: '0.55rem 1rem', backgroundColor: DARK.accent,
                    color: '#fff', border: 'none', borderRadius: '0.375rem',
                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                    opacity: actionLoading ? 0.5 : 1,
                  }}>
                    <Plus size={14} /> Estender trial em {extendDays} dia{extendDays !== 1 ? 's' : ''}
                  </button>
                </div>
                <div style={{ fontSize: '0.7rem', color: DARK.textMuted, marginTop: '0.2rem' }}>
                  <strong>Trocar plano</strong> só muda o plan_id da sub atual (mantém status, datas e dias de trial). Útil pra migrar assinatura antiga do Essencial → Clube (único plano vendido). Se a sub tiver preapproval MP ativo, o valor cobrado NÃO muda automaticamente — só faça em trial ou após cancelar a cobrança.
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: '0.7rem', color: DARK.accent, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: '0.5rem' }}>{children}</div>;
}
function KV({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', padding: '0.25rem 0' }}>
      <span style={{ color: DARK.textMuted }}>{label}</span>
      <span style={{ color: DARK.text }}>{value}</span>
    </div>
  );
}
function Stat({ label, value }) {
  return (
    <div style={{ padding: '0.5rem 0.75rem', backgroundColor: DARK.surface, border: `1px solid ${DARK.border}`, borderRadius: '0.4rem' }}>
      <div style={{ fontSize: '0.65rem', color: DARK.textMuted, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const thStyle = {
  padding: '0.625rem 0.75rem',
  textAlign: 'left',
  fontSize: '0.7rem',
  fontWeight: 600,
  color: DARK.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
const tdStyle = {
  padding: '0.625rem 0.75rem',
  color: DARK.text,
};

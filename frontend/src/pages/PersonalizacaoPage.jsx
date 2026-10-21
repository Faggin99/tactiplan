// Personalização do CLUBE ATIVO (out/2026) — cores do app (temas claro e escuro) + logo no topo.
// Padrão copiado do Gestsport (escola/frontend/src/pages/PersonalizacaoPage.jsx), sem imagem de
// fundo, sem domínio próprio e sem trava de plano (conta só leitura não salva: o servidor
// responde 402 READ_ONLY e a tela já mostra o aviso).
//
// - A aba (Claro/Escuro) É o tema do app: escolher "Escuro" troca o app inteiro enquanto edita;
//   o tema de quem entrou volta ao sair, salvar ou descartar.
// - As 6 cores de cada tema aparecem sempre editáveis, pré-preenchidas com o salvo (ou o padrão).
//   Tema com as 6 cores iguais ao padrão é omitido no PUT (volta ao padrão).
// - Prévia ao vivo: o rascunho vai pro ThemeContext (setBrandingDraft) e o app inteiro mostra;
//   a barra fixa "Visualizando alterações · Descartar · Salvar" aparece enquanto houver mudança.
// - Logos: upload imediato (principal + opcional do tema escuro).
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Paintbrush, Sun, Moon, RotateCcw, ImagePlus, Trash2, Building2, AlertTriangle, Lock } from 'lucide-react';
import { useTheme, themes, resolveThemeColors, effectiveClubBranding, BRANDING_COLOR_KEYS } from '../contexts/ThemeContext';
import { useClub } from '../contexts/ClubContext';
import { useCan } from '../hooks/useCan';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { useIsMobile } from '../hooks/useIsMobile';
import { clubService } from '../services/clubService';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { isValidHex, normalizeHex, contrastRatio } from '../lib/color';
import notify from '../lib/notify';

const TOKENS = [
  { key: 'primary', label: 'Primária', hint: 'Botões, abas, links e gráficos' },
  { key: 'background', label: 'Fundo', hint: 'Cor de fundo das páginas' },
  { key: 'surface', label: 'Superfície', hint: 'Cards, menu lateral e painéis' },
  { key: 'border', label: 'Borda', hint: 'Contornos e divisores' },
  { key: 'text', label: 'Texto', hint: 'Texto principal' },
  { key: 'textSecondary', label: 'Texto secundário', hint: 'Legendas e apoios' },
];
const THEME_PT = { light: 'claro', dark: 'escuro' };
const IMG_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

// Seção completa do tema: salvo onde houver, padrão do tema no resto.
function themeSection(t, saved) {
  const s = (saved && saved[t]) || {};
  const full = {};
  for (const k of BRANDING_COLOR_KEYS) full[k] = s[k] || themes[t].colors[k];
  return full;
}
const toDraft = (saved) => ({ light: themeSection('light', saved), dark: themeSection('dark', saved) });
const isDefault = (sec, t) => BRANDING_COLOR_KEYS.every((k) => sec[k] === themes[t].colors[k]);

// Corpo do PUT: tema todo no padrão → omitido; senão as 6 cores.
function draftToPut(d) {
  const out = {};
  for (const t of ['light', 'dark']) {
    if (isDefault(d[t], t)) continue;
    out[t] = { ...d[t] };
  }
  return out;
}

function TokenSample({ tokenKey, pv, frameBorder }) {
  const frame = { width: '3.5rem', height: '2rem', borderRadius: '0.375rem', flexShrink: 0, border: `1px solid ${frameBorder}`, overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: pv.background };
  switch (tokenKey) {
    case 'primary':
      return <span style={frame} aria-hidden="true"><span style={{ padding: '0.1rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.6rem', fontWeight: 600, backgroundColor: pv.primary, color: pv.primaryText }}>Botão</span></span>;
    case 'background':
      return <span style={frame} aria-hidden="true"><span style={{ fontSize: '0.75rem', fontWeight: 600, color: pv.text }}>Aa</span></span>;
    case 'surface':
      return <span style={frame} aria-hidden="true"><span style={{ width: '2.25rem', height: '1.25rem', borderRadius: '0.25rem', backgroundColor: pv.surface, border: `1px solid ${pv.border}` }} /></span>;
    case 'border':
      return <span style={frame} aria-hidden="true"><span style={{ width: '2.25rem', height: '1.25rem', borderRadius: '0.25rem', border: `2px solid ${pv.border}` }} /></span>;
    case 'text':
      return <span style={{ ...frame, backgroundColor: pv.surface }} aria-hidden="true"><span style={{ fontSize: '0.8rem', fontWeight: 700, color: pv.text }}>Aa</span></span>;
    case 'textSecondary':
      return <span style={{ ...frame, backgroundColor: pv.surface }} aria-hidden="true"><span style={{ fontSize: '0.7rem', color: pv.textSecondary }}>Aa</span></span>;
    default:
      return null;
  }
}

function TokenRow({ themeName, token, value, onChange, colors, pv, disabled }) {
  const def = themes[themeName].colors[token.key];
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value, themeName]);
  const commitText = (raw) => {
    setText(raw);
    const hex = normalizeHex(raw.trim());
    if (hex) onChange(hex);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0', borderBottom: `1px solid ${colors.border}` }}>
      <span style={{ minWidth: '10rem', flex: '1 1 10rem' }}>
        <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: colors.text }}>{token.label}</span>
        <span style={{ display: 'block', fontSize: '0.72rem', color: colors.textMuted }}>{token.hint}</span>
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input type="color" value={isValidHex(text) ? text.toLowerCase() : value} disabled={disabled}
          onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
          aria-label={`Escolher cor: ${token.label}`}
          style={{ width: '2.5rem', height: '2rem', padding: 0, cursor: disabled ? 'default' : 'pointer', border: `1px solid ${colors.border}`, borderRadius: '0.375rem', backgroundColor: colors.surface }} />
        <input type="text" value={text} onChange={(e) => commitText(e.target.value)} placeholder={def} disabled={disabled}
          aria-label={`Hex: ${token.label}`} spellCheck={false} maxLength={7}
          style={{ width: '6.5rem', padding: '0.4rem 0.55rem', fontSize: '0.85rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', border: `1px solid ${isValidHex(text) ? colors.border : colors.error}`, borderRadius: '0.375rem', backgroundColor: colors.background, color: colors.text, boxSizing: 'border-box' }} />
        <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => onChange(def)} disabled={disabled || value === def} title={`Restaurar o padrão desta cor (${def})`}>
          Padrão
        </Button>
      </div>
      <span style={{ marginLeft: 'auto' }} title={`Amostra: ${token.label}`}>
        <TokenSample tokenKey={token.key} pv={pv} frameBorder={colors.border} />
      </span>
    </div>
  );
}

// Página em miniatura pintada só com a paleta rascunho da aba.
function PagePreviewMock({ pv, logoUrl, clubName }) {
  return (
    <div aria-hidden="true" style={{ borderRadius: '0.5rem', overflow: 'hidden', border: `1px solid ${pv.border}`, backgroundColor: pv.background, display: 'flex', minHeight: 210 }}>
      <div style={{ width: '34%', backgroundColor: pv.surface, borderRight: `1px solid ${pv.border}`, padding: '0.6rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
          {logoUrl
            ? <img src={logoUrl} alt="" style={{ height: 20, width: 'auto', maxWidth: 34, objectFit: 'contain', flexShrink: 0 }} />
            : <img src="/pwa-192.svg" alt="" style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0 }} />}
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: pv.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clubName}</span>
        </div>
        <span style={{ fontSize: '0.58rem', fontWeight: 600, padding: '0.25rem 0.35rem', borderRadius: 4, color: pv.primary, backgroundColor: `${pv.primary}14` }}>Programação</span>
        <span style={{ fontSize: '0.58rem', padding: '0 0.35rem', color: pv.textSecondary }}>Estatísticas</span>
        <span style={{ fontSize: '0.58rem', padding: '0 0.35rem', color: pv.textSecondary }}>Plantel</span>
      </div>
      <div style={{ flex: 1, padding: '0.6rem', display: 'grid', gap: '0.5rem', alignContent: 'start' }}>
        <div style={{ backgroundColor: pv.surface, border: `1px solid ${pv.border}`, borderRadius: '0.375rem', padding: '0.45rem 0.55rem' }}>
          <span style={{ display: 'block', fontSize: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: pv.textSecondary }}>Treinos no mês</span>
          <span style={{ display: 'block', fontSize: '1rem', fontWeight: 700, color: pv.text }}>18</span>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <span style={{ padding: '0.22rem 0.55rem', borderRadius: '0.25rem', fontSize: '0.6rem', fontWeight: 600, backgroundColor: pv.primary, color: pv.primaryText }}>Salvar</span>
          <span style={{ padding: '0.22rem 0.55rem', borderRadius: '0.25rem', fontSize: '0.6rem', backgroundColor: pv.surface, border: `1px solid ${pv.border}`, color: pv.text }}>Cancelar</span>
        </div>
        <div>
          <span style={{ display: 'block', fontSize: '0.65rem', fontWeight: 600, color: pv.text }}>Texto normal da página</span>
          <span style={{ display: 'block', fontSize: '0.58rem', color: pv.textSecondary }}>Texto secundário — legendas.</span>
          <span style={{ display: 'block', fontSize: '0.58rem', color: pv.primary, fontWeight: 600, marginTop: 2 }}>Um link</span>
        </div>
      </div>
    </div>
  );
}

// Avisos de legibilidade do rascunho (não bloqueiam o salvar).
function avisosContraste(pv) {
  const avisos = [];
  if (contrastRatio(pv.primary, pv.primaryText) < 4.5) avisos.push('O texto dos botões fica com pouco contraste sobre a cor primária. Escolha uma primária mais clara ou mais escura.');
  if (contrastRatio(pv.primary, pv.background) < 2) avisos.push('A cor primária quase some sobre o fundo: abas, links e ícones ativos ficam difíceis de ver.');
  if (contrastRatio(pv.text, pv.background) < 4.5 || contrastRatio(pv.text, pv.surface) < 4.5) avisos.push('O texto principal tem pouco contraste com o fundo ou a superfície.');
  if (contrastRatio(pv.textSecondary, pv.surface) < 3) avisos.push('O texto secundário fica apagado demais sobre a superfície.');
  return avisos;
}

function LogoSlot({ titulo, descricao, url, busy, disabled, onFile, onRemove, colors, fundo }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1rem' }}>
      <span style={{ width: '5.5rem', height: '5.5rem', borderRadius: '0.75rem', overflow: 'hidden', border: `1px solid ${colors.border}`, backgroundColor: fundo, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {url ? <img src={url} alt={titulo} style={{ maxWidth: '86%', maxHeight: '86%', objectFit: 'contain' }} /> : <Building2 size={28} color={colors.textMuted} />}
      </span>
      <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: colors.text }}>{titulo}</span>
        <span style={{ display: 'block', fontSize: '0.75rem', color: colors.textMuted, margin: '0.15rem 0 0.55rem' }}>{descricao}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', cursor: busy || disabled ? 'default' : 'pointer', padding: '0.45rem 0.9rem', fontSize: '0.85rem', fontWeight: 500, border: `1px solid ${colors.border}`, borderRadius: '0.375rem', backgroundColor: colors.surface, color: colors.text, opacity: busy || disabled ? 0.6 : 1 }}>
            <ImagePlus size={15} />
            {busy ? 'Enviando…' : url ? 'Trocar imagem' : 'Escolher imagem'}
            <input type="file" accept={IMG_ACCEPT} onChange={onFile} disabled={busy || disabled} style={{ display: 'none' }} />
          </label>
          {url && (
            <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={onRemove} disabled={busy || disabled}>Remover</Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PersonalizacaoPage() {
  const { colors, theme, setTheme, setBrandingDraft } = useTheme();
  const { selectedClub: club, replaceClub, getLogoUrl } = useClub();
  const { can } = useCan();
  const { readOnly } = usePlanFeatures();
  const isMobile = useIsMobile();
  const podeGerir = can('club_settings:manage');
  const canEdit = podeGerir && !readOnly;

  // Aba = tema do app (prévia total). O tema de quem entrou volta ao sair/salvar/descartar.
  const entryThemeRef = useRef(theme);
  const tab = theme === 'dark' ? 'dark' : 'light';
  const restoreEntryTheme = useCallback(() => setTheme(entryThemeRef.current), [setTheme]);
  useEffect(() => () => { setTheme(entryThemeRef.current); }, [setTheme]);

  const saved = useMemo(() => effectiveClubBranding(club) || {}, [club]);
  const [draft, setDraft] = useState(() => toDraft(saved));
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(null); // 'main' | 'dark' | null

  // Trocar de clube recarrega o rascunho (e derruba a prévia do clube anterior).
  const clubId = club?.id;
  useEffect(() => { setDraft(toDraft(effectiveClubBranding(club) || {})); }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftPut = useMemo(() => draftToPut(draft), [draft]);
  const savedPut = useMemo(() => draftToPut(toDraft(saved)), [saved]);
  const dirty = stableStringify(draftPut) !== stableStringify(savedPut);
  const previewColors = useMemo(() => resolveThemeColors(tab, draftPut), [tab, draftPut]);

  // Prévia ao vivo no app inteiro enquanto houver mudança; sair da página derruba.
  useEffect(() => { setBrandingDraft(canEdit && dirty ? draftPut : null); }, [canEdit, dirty, draftPut, setBrandingDraft]);
  useEffect(() => () => setBrandingDraft(null), [setBrandingDraft]);

  const setToken = useCallback((t, key, hex) => {
    setDraft((d) => ({ ...d, [t]: { ...d[t], [key]: String(hex).toLowerCase() } }));
  }, []);

  async function salvarBranding(body, msg) {
    setBusy(true);
    try {
      const atualizado = await clubService.saveBranding(club.id, body);
      replaceClub(atualizado);
      setBrandingDraft(null);
      notify.success(msg);
      return true;
    } catch (e) {
      notify.error(e?.code === 'READ_ONLY' ? 'Sua conta está em modo só leitura — assine um plano para salvar.' : (e?.message || 'Não foi possível salvar a personalização.'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const save = async () => {
    if (await salvarBranding(draftPut, 'Personalização salva.')) restoreEntryTheme();
  };
  const discard = () => { setDraft(toDraft(saved)); setBrandingDraft(null); restoreEntryTheme(); };

  const restoreTheme = async (t) => {
    const ok = await notify.confirm(`Restaurar o tema ${THEME_PT[t]} para as cores padrão do TactiPlan?`, { confirmText: 'Restaurar', cancelText: 'Cancelar' });
    if (!ok) return;
    const body = { ...savedPut };
    delete body[t];
    if (await salvarBranding(body, `Tema ${THEME_PT[t]} restaurado ao padrão.`)) {
      setDraft((d) => ({ ...d, [t]: themeSection(t, {}) }));
    }
  };

  async function enviarLogo(e, variant) {
    const f = e.target.files?.[0] || null;
    e.target.value = '';
    if (!f || !club) return;
    if (f.size > 5 * 1024 * 1024) { notify.error('Imagem muito grande — use até 5MB.'); return; }
    setLogoBusy(variant);
    try {
      replaceClub(await clubService.uploadLogo(club.id, f, variant));
      notify.success(variant === 'dark' ? 'Logo do tema escuro atualizada.' : 'Logo atualizada.');
    } catch (err) {
      notify.error(err?.code === 'READ_ONLY' ? 'Sua conta está em modo só leitura — assine um plano para alterar a logo.' : (err?.message || 'Não foi possível enviar a imagem.'));
    } finally { setLogoBusy(null); }
  }
  async function removerLogo(variant) {
    const ok = await notify.confirm(variant === 'dark' ? 'Remover a logo do tema escuro? A logo principal passa a valer nos dois temas.' : 'Remover a logo do clube? O topo volta a mostrar a marca TactiPlan (e os PDFs saem sem escudo).', { confirmText: 'Remover', cancelText: 'Cancelar' });
    if (!ok) return;
    setLogoBusy(variant);
    try {
      replaceClub(await clubService.deleteLogo(club.id, variant));
      notify.success('Logo removida.');
    } catch (err) {
      notify.error(err?.message || 'Não foi possível remover a logo.');
    } finally { setLogoBusy(null); }
  }

  const pageTitle = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
      <Paintbrush size={22} color={colors.primary} />
      <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: colors.text, margin: 0 }}>Personalização</h1>
    </div>
  );

  if (!club) {
    return <div>{pageTitle}<p style={{ color: colors.textSecondary }}>Selecione um clube para personalizar.</p></div>;
  }
  if (!podeGerir) {
    return (
      <div style={{ maxWidth: 720 }}>
        {pageTitle}
        <Card><p style={{ fontSize: '0.9rem', color: colors.textSecondary, margin: 0 }}>Só quem gerencia as configurações do clube pode alterar a personalização.</p></Card>
      </div>
    );
  }

  const logoUrl = getLogoUrl(club.logo_path);
  const logoDarkUrl = getLogoUrl(club.logo_dark_path);
  const mockLogo = tab === 'dark' ? (logoDarkUrl || logoUrl) : logoUrl;
  const themeIsCustom = !!(draftPut[tab] || savedPut[tab]);
  const avisos = avisosContraste(previewColors);
  const tabBtn = (t, Icon, label) => {
    const on = tab === t;
    return (
      <button type="button" onClick={() => setTheme(t)} aria-pressed={on}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem', borderRadius: '0.5rem', fontSize: '0.85rem', fontWeight: on ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${on ? colors.primary : colors.border}`, backgroundColor: on ? `${colors.primary}14` : 'transparent', color: on ? colors.primary : colors.textSecondary }}>
        <Icon size={15} /> {label}
      </button>
    );
  };

  return (
    <div style={{ maxWidth: 1120, paddingBottom: dirty ? '5rem' : 0 }}>
      {pageTitle}
      <p style={{ fontSize: '0.875rem', color: colors.textSecondary, margin: '0 0 1rem' }}>
        Cores do app e logo do topo de <b style={{ color: colors.text }}>{club.name}</b>. Valem para todos que usam este clube; cada clube tem a sua.
        A cor primária do tema claro também pinta os relatórios em PDF.
      </p>

      {readOnly && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem', padding: '0.7rem 0.85rem', borderRadius: '0.5rem', border: `1px solid ${colors.warning}`, backgroundColor: `${colors.warning}14` }}>
          <Lock size={16} color={colors.warning} style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: '0.85rem', color: colors.text }}>Sua conta está em modo só leitura. Assine um plano para alterar as cores e a logo.</span>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '1.1rem' }}>
        {tabBtn('light', Sun, 'Tema claro')}
        {tabBtn('dark', Moon, 'Tema escuro')}
        <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>O app inteiro mostra o tema selecionado enquanto você edita — ao sair, seu tema volta.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,21rem)', gap: '1.25rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>
          <Card title={`Cores — tema ${THEME_PT[tab]}`}
            actions={<Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={() => restoreTheme(tab)} disabled={!canEdit || busy || !themeIsCustom}>Restaurar padrão</Button>}>
            <div>
              {TOKENS.map((t) => (
                <TokenRow key={`${tab}-${t.key}`} themeName={tab} token={t} value={draft[tab][t.key]}
                  onChange={(hex) => setToken(tab, t.key, hex)} colors={colors} pv={previewColors} disabled={!canEdit} />
              ))}
              <p style={{ fontSize: '0.75rem', color: colors.textMuted, margin: '0.75rem 0 0' }}>
                O texto sobre a cor primária (botões) é escolhido automaticamente — branco ou escuro — para ficar legível. Cores de vitória/empate/derrota e de alerta não mudam.
              </p>
              {avisos.length > 0 && (
                <div role="status" style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${colors.warning}`, backgroundColor: `${colors.warning}14`, display: 'flex', gap: '0.5rem' }}>
                  <AlertTriangle size={16} color={colors.warning} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {avisos.map((a) => <span key={a} style={{ fontSize: '0.8rem', color: colors.text }}>{a}</span>)}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card title="Logo do clube">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <LogoSlot titulo="Logo principal" colors={colors} fundo={themes.light.colors.surface}
                descricao="Aparece no topo do menu no lugar da marca TactiPlan e nos relatórios em PDF. PNG sem fundo fica melhor (JPG, PNG, GIF ou WebP, até 5MB)."
                url={logoUrl} busy={logoBusy === 'main'} disabled={!canEdit}
                onFile={(e) => enviarLogo(e, 'main')} onRemove={() => removerLogo('main')} />
              <LogoSlot titulo="Logo para o tema escuro (opcional)" colors={colors} fundo={themes.dark.colors.surface}
                descricao="Use se a logo principal some no fundo escuro (ex.: versão branca). Sem ela, a principal vale nos dois temas."
                url={logoDarkUrl} busy={logoBusy === 'dark'} disabled={!canEdit}
                onFile={(e) => enviarLogo(e, 'dark')} onRemove={() => removerLogo('dark')} />
            </div>
          </Card>
        </div>

        <div style={{ minWidth: 0, position: isMobile ? 'static' : 'sticky', top: '1rem' }}>
          <Card title={`Prévia — tema ${THEME_PT[tab]}`} actions={tab === 'dark' ? <Moon size={16} color={colors.textMuted} /> : <Sun size={16} color={colors.textMuted} />}>
            <PagePreviewMock pv={previewColors} logoUrl={mockLogo} clubName={club.name} />
            <p style={{ fontSize: '0.72rem', color: colors.textMuted, margin: '0.5rem 0 0' }}>
              Miniatura do rascunho. O app inteiro também está mostrando as cores enquanto você edita.
            </p>
          </Card>
        </div>
      </div>

      {dirty && canEdit && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 400, backgroundColor: colors.surface, borderTop: `1px solid ${colors.border}`, boxShadow: '0 -6px 20px rgba(0,0,0,0.15)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: colors.text }}>Visualizando alterações</span>
            {!isMobile && <span style={{ fontSize: '0.75rem', color: colors.textMuted }}>O app está mostrando o rascunho — salve para aplicar de verdade.</span>}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <Button variant="secondary" onClick={discard} disabled={busy}>Descartar</Button>
              <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

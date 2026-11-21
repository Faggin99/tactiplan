import { useState } from 'react';

// Os dois escudos do jogo (21/11/2026): MANDANTE primeiro × visitante. Mando 'away' = o adversário em casa;
// casa, neutro ou sem mando = o nosso clube primeiro. Sem imagem: iniciais numa placa (nosso na cor do clube).
const sigla = (nome) => (String(nome || '').split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p))
  .map((p) => p[0]).join('').slice(0, 3).toUpperCase()) || '?';

function Logo({ url, nome, cor, tamanho }) {
  const [falhou, setFalhou] = useState(false);
  if (url && !falhou) {
    return <img src={url} alt={nome || 'Escudo'} title={nome || undefined} onError={() => setFalhou(true)}
      style={{ width: tamanho, height: tamanho, objectFit: 'contain', flexShrink: 0 }} />;
  }
  return (
    <span title={nome || undefined} aria-label={nome || 'Escudo'} role="img"
      style={{ width: tamanho, height: tamanho, borderRadius: Math.round(tamanho * 0.22), flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: cor, color: '#fff', fontWeight: 800, fontSize: Math.round(tamanho * (sigla(nome).length > 2 ? 0.3 : 0.38)), letterSpacing: '0.02em', fontFamily: 'Poppins, sans-serif' }}>
      {sigla(nome)}
    </span>
  );
}

export function LogosDoJogo({ clube, logoUrl, adversario, adversarioLogo, mando, tamanho = 40, corX }) {
  const nosso = { url: logoUrl, nome: clube?.name, cor: clube?.primary_color?.slice(0, 7) || '#15803D' };
  const deles = { url: adversarioLogo, nome: adversario || 'Adversário', cor: '#64748b' };
  const [casa, fora] = mando === 'away' ? [deles, nosso] : [nosso, deles];
  return (
    <span className="tp-logos-jogo" style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(tamanho * 0.22) }}
      aria-label={`${casa.nome || ''} × ${fora.nome || ''}`}>
      <Logo {...casa} tamanho={tamanho} />
      <span aria-hidden="true" style={{ fontWeight: 700, fontSize: Math.max(12, Math.round(tamanho * 0.36)), color: corX, lineHeight: 1 }}>×</span>
      <Logo {...fora} tamanho={tamanho} />
    </span>
  );
}

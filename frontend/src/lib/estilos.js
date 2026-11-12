// Estilos do app (11/11/2026): além de claro/escuro, cada pessoa escolhe a "cara" do TactiPlan.
// O estilo troca a base das cores (fundo, superfície, borda, texto) e a tipografia dos títulos;
// a cor PRIMÁRIA continua sendo a do clube (Personalização). No Clássico a Personalização do
// clube ainda pode trocar as 6 cores; nos outros estilos o estilo manda nas superfícies e o
// clube só pinta a primária (senão o quadro branco deixa de ser quadro).
// Escolha guardada por aparelho (localStorage 'estilo').

export const ESTILO_PADRAO = 'classico';

export const ESTILOS = {
  classico: {
    nome: 'Clássico',
    descricao: 'Limpo, o visual de sempre',
    light: {},
    dark: {},
    tokens: {
      fonteTitulo: "'Poppins', system-ui, sans-serif",
      pesoTitulo: 700,
      caixaTitulo: 'none',
      fonteTexto: "'Poppins', system-ui, sans-serif",
      raio: 10,
      borda: 1,
      capa: 'clube', // capa da Início: faixa na cor do clube com as linhas do campo
      fundoApp: null,
    },
  },
  prancheta: {
    nome: 'Quadro tático',
    descricao: 'O quadro branco da comissão: pincel e ímãs',
    light: {
      background: '#ECEEEC', surface: '#FAFAF7', surfaceHover: '#F0F0EB', border: '#9AA1A8',
      text: '#222222', textSecondary: '#55595E', textMuted: '#868B90',
    },
    dark: {
      background: '#14171A', surface: '#1E2226', surfaceHover: '#272C31', border: '#5B636B',
      text: '#ECEDEA', textSecondary: '#AEB2B6', textMuted: '#80868C',
    },
    tokens: {
      fonteTitulo: "'Pincel', 'Caveat', cursive",
      pesoTitulo: 700,
      caixaTitulo: 'none',
      fonteTexto: "'Hanken Grotesk', system-ui, sans-serif",
      raio: 4,
      borda: 2,
      capa: 'quadro', // quadro branco com o campo desenhado a pincel
      fundoApp: null,
    },
  },
  gramado: {
    nome: 'Gramado',
    descricao: 'Verde de campo, cartões com imagem',
    light: {
      background: '#EDF3EB', surface: '#FFFFFF', surfaceHover: '#F1F6EF', border: '#D2E0CE',
      text: '#10241A', textSecondary: '#4B6454', textMuted: '#7D9585',
    },
    dark: {
      background: '#0A150E', surface: '#112117', surfaceHover: '#182D20', border: '#24402F',
      text: '#E9F2EB', textSecondary: '#A2BAA9', textMuted: '#6F8A77',
    },
    tokens: {
      fonteTitulo: "'Poppins', system-ui, sans-serif",
      pesoTitulo: 800,
      caixaTitulo: 'none',
      fonteTexto: "'Poppins', system-ui, sans-serif",
      raio: 14,
      borda: 1,
      capa: 'gramado', // gramado visto de cima, com os jogadores
      fundoApp: null,
    },
  },
  placar: {
    nome: 'Placar',
    descricao: 'Contraste alto, letras de placar de estádio',
    light: {
      background: '#F1F1EF', surface: '#FFFFFF', surfaceHover: '#F4F4F2', border: '#CDCDC8',
      text: '#0A0A0A', textSecondary: '#52525B', textMuted: '#8A8A93',
    },
    dark: {
      background: '#060607', surface: '#131315', surfaceHover: '#1D1D20', border: '#34343A',
      text: '#F5F5F4', textSecondary: '#A6A6AE', textMuted: '#76767F',
    },
    tokens: {
      fonteTitulo: "'Barlow Condensed', 'Arial Narrow', sans-serif",
      pesoTitulo: 700,
      caixaTitulo: 'uppercase',
      fonteTexto: "'Poppins', system-ui, sans-serif",
      raio: 3,
      borda: 1,
      capa: 'placar', // painel escuro de placar com a faixa na cor do clube
      fundoApp: null,
    },
  },
};

export const LISTA_ESTILOS = Object.keys(ESTILOS);

export function estiloValido(id) {
  return Object.prototype.hasOwnProperty.call(ESTILOS, id) ? id : ESTILO_PADRAO;
}

// Cores dos PILARES (conteúdo) — os ímãs do quadro. Fixas em todo o app (mesmas das Estatísticas).
export const COR_PILAR = {
  tatico: '#3b82f6',
  tecnico: '#a855f7',
  fisico: '#f59e0b',
  mental: '#10b981',
};
export const NOME_PILAR = { tatico: 'Tático', tecnico: 'Técnico', fisico: 'Físico', mental: 'Mental' };

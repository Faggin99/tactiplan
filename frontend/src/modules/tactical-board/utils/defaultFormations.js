// Default formations with positions in percentage (0-100)
// x = horizontal (left to right), y = vertical (top to bottom)

export const FOOTBALL_11_FORMATIONS = {
  '4-4-2': {
    label: '4-4-2',
    positions: [
      { x: 5, y: 50, jerseyNumber: 1, name: 'GOL', isGoalkeeper: true },
      { x: 20, y: 15, jerseyNumber: 2, name: 'LD' },
      { x: 20, y: 38, jerseyNumber: 4, name: 'ZAG' },
      { x: 20, y: 62, jerseyNumber: 3, name: 'ZAG' },
      { x: 20, y: 85, jerseyNumber: 6, name: 'LE' },
      { x: 45, y: 15, jerseyNumber: 7, name: 'MEI' },
      { x: 45, y: 38, jerseyNumber: 8, name: 'VOL' },
      { x: 45, y: 62, jerseyNumber: 5, name: 'VOL' },
      { x: 45, y: 85, jerseyNumber: 11, name: 'MEI' },
      { x: 70, y: 35, jerseyNumber: 9, name: 'CA' },
      { x: 70, y: 65, jerseyNumber: 10, name: 'CA' },
    ],
  },
  '4-3-3': {
    label: '4-3-3',
    positions: [
      { x: 5, y: 50, jerseyNumber: 1, name: 'GOL', isGoalkeeper: true },
      { x: 20, y: 15, jerseyNumber: 2, name: 'LD' },
      { x: 20, y: 38, jerseyNumber: 4, name: 'ZAG' },
      { x: 20, y: 62, jerseyNumber: 3, name: 'ZAG' },
      { x: 20, y: 85, jerseyNumber: 6, name: 'LE' },
      { x: 45, y: 25, jerseyNumber: 8, name: 'VOL' },
      { x: 45, y: 50, jerseyNumber: 5, name: 'MEI' },
      { x: 45, y: 75, jerseyNumber: 10, name: 'MEI' },
      { x: 72, y: 15, jerseyNumber: 7, name: 'ED' },
      { x: 75, y: 50, jerseyNumber: 9, name: 'CA' },
      { x: 72, y: 85, jerseyNumber: 11, name: 'EE' },
    ],
  },
  '3-5-2': {
    label: '3-5-2',
    positions: [
      { x: 5, y: 50, jerseyNumber: 1, name: 'GOL', isGoalkeeper: true },
      { x: 20, y: 25, jerseyNumber: 4, name: 'ZAG' },
      { x: 20, y: 50, jerseyNumber: 3, name: 'ZAG' },
      { x: 20, y: 75, jerseyNumber: 5, name: 'ZAG' },
      { x: 40, y: 8, jerseyNumber: 2, name: 'LD' },
      { x: 42, y: 35, jerseyNumber: 8, name: 'VOL' },
      { x: 42, y: 50, jerseyNumber: 10, name: 'MEI' },
      { x: 42, y: 65, jerseyNumber: 6, name: 'VOL' },
      { x: 40, y: 92, jerseyNumber: 11, name: 'LE' },
      { x: 70, y: 35, jerseyNumber: 9, name: 'CA' },
      { x: 70, y: 65, jerseyNumber: 7, name: 'CA' },
    ],
  },
};

// Formações de Futebol 7 (7 jogadores: 1 GOL + 6 linha)
export const FOOTBALL_7_FORMATIONS = {
  '1-3-2-1': {
    label: '3-2-1 (clássica)',
    positions: [
      { x: 5,  y: 50, jerseyNumber: 1, name: 'GOL', isGoalkeeper: true },
      { x: 25, y: 20, jerseyNumber: 2, name: 'ZAG' },
      { x: 25, y: 50, jerseyNumber: 3, name: 'ZAG' },
      { x: 25, y: 80, jerseyNumber: 4, name: 'ZAG' },
      { x: 50, y: 30, jerseyNumber: 5, name: 'MEI' },
      { x: 50, y: 70, jerseyNumber: 6, name: 'MEI' },
      { x: 75, y: 50, jerseyNumber: 7, name: 'CA' },
    ],
  },
  '1-2-3-1': {
    label: '2-3-1',
    positions: [
      { x: 5,  y: 50, jerseyNumber: 1, name: 'GOL', isGoalkeeper: true },
      { x: 25, y: 30, jerseyNumber: 2, name: 'ZAG' },
      { x: 25, y: 70, jerseyNumber: 3, name: 'ZAG' },
      { x: 50, y: 20, jerseyNumber: 4, name: 'LD' },
      { x: 50, y: 50, jerseyNumber: 5, name: 'MEI' },
      { x: 50, y: 80, jerseyNumber: 6, name: 'LE' },
      { x: 75, y: 50, jerseyNumber: 7, name: 'CA' },
    ],
  },
  '1-3-1-2': {
    label: '3-1-2',
    positions: [
      { x: 5,  y: 50, jerseyNumber: 1, name: 'GOL', isGoalkeeper: true },
      { x: 25, y: 20, jerseyNumber: 2, name: 'ZAG' },
      { x: 25, y: 50, jerseyNumber: 3, name: 'ZAG' },
      { x: 25, y: 80, jerseyNumber: 4, name: 'ZAG' },
      { x: 50, y: 50, jerseyNumber: 5, name: 'MEI' },
      { x: 75, y: 30, jerseyNumber: 6, name: 'CA' },
      { x: 75, y: 70, jerseyNumber: 7, name: 'CA' },
    ],
  },
};

export const FUTSAL_FORMATIONS = {
  '1-2-2': {
    label: '1-2-2',
    positions: [
      { x: 5, y: 50, jerseyNumber: 1, name: 'GOL', isGoalkeeper: true },
      { x: 30, y: 30, jerseyNumber: 2, name: 'FIX' },
      { x: 30, y: 70, jerseyNumber: 3, name: 'FIX' },
      { x: 60, y: 30, jerseyNumber: 4, name: 'ALA' },
      { x: 60, y: 70, jerseyNumber: 5, name: 'ALA' },
    ],
  },
  '2-2': {
    label: '2-2 (Quadrado)',
    positions: [
      { x: 5, y: 50, jerseyNumber: 1, name: 'GOL', isGoalkeeper: true },
      { x: 30, y: 25, jerseyNumber: 2, name: 'FIX' },
      { x: 30, y: 75, jerseyNumber: 3, name: 'FIX' },
      { x: 60, y: 25, jerseyNumber: 4, name: 'PIV' },
      { x: 60, y: 75, jerseyNumber: 5, name: 'ALA' },
    ],
  },
  '1-2-1': {
    label: '1-2-1 (Losango)',
    positions: [
      { x: 5, y: 50, jerseyNumber: 1, name: 'GOL', isGoalkeeper: true },
      { x: 25, y: 50, jerseyNumber: 2, name: 'FIX' },
      { x: 45, y: 25, jerseyNumber: 3, name: 'ALA' },
      { x: 45, y: 75, jerseyNumber: 4, name: 'ALA' },
      { x: 65, y: 50, jerseyNumber: 5, name: 'PIV' },
    ],
  },
};

export function getFormationsForFieldType(fieldType) {
  if (fieldType === 'futsal') return FUTSAL_FORMATIONS;
  if (fieldType === 'football_7') return FOOTBALL_7_FORMATIONS;
  return FOOTBALL_11_FORMATIONS;
}

// Espelha uma formação pro Time B (que defende o gol direito).
// Rotação 180° (x E y) — não só espelho horizontal: preserva a lateralidade
// de formações assimétricas (o ala direito do B fica de frente pro ala
// esquerdo do A, como num jogo real). Goleiro do B cai em x≈95.
export function mirrorFormation(positions) {
  return positions.map((p) => ({ ...p, x: 100 - p.x, y: 100 - p.y }));
}

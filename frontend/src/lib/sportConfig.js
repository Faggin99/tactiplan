// Configuração esportiva por modalidade do clube.
// Fonte de verdade — mantenha sincronizado com backend (clubs.modality CHECK).

export const MODALITIES = ['football_11', 'football_7', 'futsal'];

export const MODALITY_LABELS = {
  football_11: 'Futebol 11',
  football_7:  'Futebol 7',
  futsal:      'Futsal',
};

export const MODALITY_DESCRIPTIONS = {
  football_11: '11 jogadores em campo, 2 tempos de 45 min. Campo gramado padrão.',
  football_7:  '7 jogadores em campo, 2 tempos de 25 min. Campo reduzido.',
  futsal:      '5 jogadores em quadra, 2 tempos de 20 min. Quadra coberta.',
};

// Posições aceitas por modalidade (códigos curtos + nomes)
// Futebol 11 e Futebol 7 usam a mesma lista (nomenclatura brasileira).
// Códigos antigos (GR, DD, DC, DE, MD, MC, ME, MOF, PL, SA, Z, M, A) foram
// migrados na migration 051_posicoes_br.sql; o setor ainda os aceita como
// sinônimo (backend-node/src/reports/positionSector.js e lib/formation.js).
const FIELD_POSITIONS = [
  { code: 'GOL', name: 'Goleiro' },
  { code: 'ZAG', name: 'Zagueiro' },
  { code: 'LD',  name: 'Lateral Direito' },
  { code: 'LE',  name: 'Lateral Esquerdo' },
  { code: 'VOL', name: 'Volante' },
  { code: 'MEI', name: 'Meia' },
  { code: 'ED',  name: 'Extremo Direito' },
  { code: 'EE',  name: 'Extremo Esquerdo' },
  { code: 'CA',  name: 'Centroavante' },
];

export const POSITIONS = {
  football_11: FIELD_POSITIONS,
  football_7:  FIELD_POSITIONS,
  futsal: [
    { code: 'GOL',   name: 'Goleiro' },
    { code: 'FIX',   name: 'Fixo' },
    { code: 'ALA-D', name: 'Ala Direito' },
    { code: 'ALA-E', name: 'Ala Esquerdo' },
    { code: 'PIV',   name: 'Pivô' },
  ],
};

// Duração padrão de uma partida (min) por modalidade
export const DEFAULT_MATCH_DURATION = {
  football_11: 90,
  football_7:  50,
  futsal:      40,
};

// Tipos de jogadores em campo por equipe (titulares)
export const STARTERS_COUNT = {
  football_11: 11,
  football_7:  7,
  futsal:      5,
};

// Tipos de evento permitidos por modalidade.
// FUTSAL não tem 'substitution' — substituição é rolling (livre, várias por
// minuto), não faz sentido rastrear como evento. Pra futsal a divisão fica só
// entre TITULAR / RESERVA e os minutos jogados não são contabilizados.
const FIELD_SPORTS_EVENTS = [
  { value: 'goal_scored',   label: 'Gol feito' },
  { value: 'goal_conceded', label: 'Gol tomado' },
  { value: 'yellow_card',   label: 'Cartão amarelo' },
  { value: 'red_card',      label: 'Cartão vermelho' },
  { value: 'substitution',  label: 'Substituição' },
];

export const EVENT_TYPES = {
  football_11: FIELD_SPORTS_EVENTS,
  football_7:  FIELD_SPORTS_EVENTS,
  futsal: [
    { value: 'goal_scored',      label: 'Gol feito' },
    { value: 'goal_conceded',    label: 'Gol tomado' },
    { value: 'yellow_card',      label: 'Cartão amarelo' },
    { value: 'red_card',         label: 'Cartão vermelho' },
    { value: 'accumulated_foul', label: 'Falta acumulada' },
    { value: 'sixth_foul',       label: '6ª falta da equipe' },
  ],
};

// Modalidades onde rastreamos minutos jogados (a partir de substituições).
// Futsal fica de fora porque substituição é livre/rolling.
export const TRACKS_MINUTES = {
  football_11: true,
  football_7:  true,
  futsal:      false,
};

// Subtipos de Bola Parada por modalidade
export const BOLA_PARADA_SUBTYPES = {
  football_11: [
    { value: 'falta_frontal', label: 'Falta Frontal' },
    { value: 'falta_lateral', label: 'Falta Lateral' },
    { value: 'escanteio',     label: 'Escanteio' },
    { value: 'lateral',       label: 'Lateral' },
    { value: 'penalti',       label: 'Pênalti' },
  ],
  football_7: [
    { value: 'falta_frontal', label: 'Falta Frontal' },
    { value: 'falta_lateral', label: 'Falta Lateral' },
    { value: 'escanteio',     label: 'Escanteio' },
    { value: 'lateral',       label: 'Lateral' },
    { value: 'shootout',      label: 'Shootout' },
  ],
  futsal: [
    { value: 'falta',           label: 'Falta' },
    { value: 'escanteio',       label: 'Escanteio' },
    { value: 'lateral',         label: 'Lateral' },
    { value: 'penalti',         label: 'Pênalti' },
    { value: 'tiro_livre',      label: 'Tiro Livre (10m)' },
    { value: 'falta_acumulada', label: 'Falta Acumulada' },
  ],
};

// Tipo de campo padrão pro Quadro Tático
export const DEFAULT_FIELD_TYPE = {
  football_11: 'football_11',
  football_7:  'football_7',
  futsal:      'futsal',
};

// Ranges de minutos pra stats (gols por período)
export const MINUTE_RANGES = {
  football_11: [
    { key: '0-15',  min: 0,  max: 15 },
    { key: '15-30', min: 15, max: 30 },
    { key: '30-45', min: 30, max: 45 },
    { key: '45-60', min: 45, max: 60 },
    { key: '60-75', min: 60, max: 75 },
    { key: '75-90+',min: 75, max: 120 },
  ],
  football_7: [
    { key: '0-10',  min: 0,  max: 10 },
    { key: '10-20', min: 10, max: 20 },
    { key: '20-30', min: 20, max: 30 },
    { key: '30-40', min: 30, max: 40 },
    { key: '40-50+',min: 40, max: 60 },
  ],
  futsal: [
    { key: '0-10',  min: 0,  max: 10 },
    { key: '10-20', min: 10, max: 20 },
    { key: '20-30', min: 20, max: 30 },
    { key: '30-40+',min: 30, max: 60 },
  ],
};

// Resolve a config de uma modalidade. Default football_11 se inválida.
export function getSportConfig(modality) {
  const m = MODALITIES.includes(modality) ? modality : 'football_11';
  return {
    modality:           m,
    label:              MODALITY_LABELS[m],
    description:        MODALITY_DESCRIPTIONS[m],
    positions:          POSITIONS[m],
    defaultDuration:    DEFAULT_MATCH_DURATION[m],
    startersCount:      STARTERS_COUNT[m],
    eventTypes:         EVENT_TYPES[m],
    bolaParadaSubtypes: BOLA_PARADA_SUBTYPES[m],
    defaultFieldType:   DEFAULT_FIELD_TYPE[m],
    minuteRanges:       MINUTE_RANGES[m],
    tracksMinutes:      TRACKS_MINUTES[m] ?? true,
  };
}

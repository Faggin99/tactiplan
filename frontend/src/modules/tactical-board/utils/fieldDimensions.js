// Field dimensions in percentage coordinates (0-100)
// All positions stored as percentages for resolution independence

export const FIELD_TYPES = {
  FOOTBALL_11: 'football_11',
  FOOTBALL_7: 'football_7',
  FUTSAL: 'futsal',
};

export const FIELD_VIEWS = {
  FULL: 'full',
  LEFT_HALF: 'left_half',
  RIGHT_HALF: 'right_half',
  THIRD_LEFT: 'third_left',
  THIRD_RIGHT: 'third_right',
};

// ─── Medidas reais (metros) ───────────────────────────────────────────────
// O retângulo de LINHAS é desenhado em escala uniforme (px/m) com a proporção
// real da modalidade; o gramado continua cobrindo o canvas inteiro.
//
// SISTEMA DE COORDENADAS DAS PEÇAS/DESENHOS (inalterado desde a v1):
//   x, y em % (0–100) do RETÂNGULO DE LINHAS visível (fieldView) —
//   x = 0 linha de fundo esquerda, 100 a direita; y = 0 lateral de cima,
//   100 a de baixo. Raio de zona circular = % da ALTURA desse retângulo.
// Antes da 2026-10 o retângulo de linhas ERA o canvas inteiro (2:1), então
// "% do canvas" == "% do campo" e as jogadas salvas valem sem conversão.
// Agora o campo fica centralizado com margem; valores < 0 ou > 100 são
// peças fora das linhas (permitido, dentro da margem).
export const PITCH_SPECS = {
  [FIELD_TYPES.FOOTBALL_11]: {
    length: 105, width: 68,
    penaltyArea: { depth: 16.5, width: 40.32 },
    goalArea: { depth: 5.5, width: 18.32 },
    penaltySpot: 11,
    penaltyArcRadius: 9.15,
    centerCircle: 9.15,
    cornerRadius: 1,
    goal: { width: 7.32, depth: 2 },
  },
  // Futebol 7 — mesmas medidas que o código já usava (55 × 35 m; área
  // retangular, sem meia-lua)
  [FIELD_TYPES.FOOTBALL_7]: {
    length: 55, width: 35,
    penaltyArea: { depth: 9.35, width: 19.6 },
    goalArea: { depth: 3.3, width: 8.4 },
    penaltySpot: 6.6,
    penaltyArcRadius: null,
    centerCircle: 4.2,
    cornerRadius: 0.5,
    goal: { width: 5, depth: 1.4 },
  },
  // Futsal 40 × 20 — área de 6 m em arco (semicírculo a partir do centro do
  // gol, como já era), pênalti a 6 m, 2º pênalti a 10 m, círculo r 3
  [FIELD_TYPES.FUTSAL]: {
    length: 40, width: 20,
    futsalAreaRadius: 6,
    penaltySpot: 6,
    secondPenaltySpot: 10,
    centerCircle: 3,
    cornerRadius: 0.25,
    goal: { width: 3, depth: 1 },
  },
};

export function getPitchSpec(fieldType) {
  return PITCH_SPECS[fieldType] || PITCH_SPECS[FIELD_TYPES.FOOTBALL_11];
}

// Janela visível do campo ao longo do comprimento, em metros [x0, x1]
export function getViewWindow(fieldType, fieldView = FIELD_VIEWS.FULL) {
  const L = getPitchSpec(fieldType).length;
  switch (fieldView) {
    case FIELD_VIEWS.LEFT_HALF:   return { x0: 0, x1: L / 2, cutLeft: false, cutRight: true };
    case FIELD_VIEWS.RIGHT_HALF:  return { x0: L / 2, x1: L, cutLeft: true, cutRight: false };
    case FIELD_VIEWS.THIRD_LEFT:  return { x0: 0, x1: L / 3, cutLeft: false, cutRight: true };
    case FIELD_VIEWS.THIRD_RIGHT: return { x0: (2 * L) / 3, x1: L, cutLeft: true, cutRight: false };
    default:                      return { x0: 0, x1: L, cutLeft: false, cutRight: false };
  }
}

// Proporção (largura:altura) do retângulo de linhas visível
export function getAspectRatio(fieldType, fieldView = FIELD_VIEWS.FULL) {
  const { x0, x1 } = getViewWindow(fieldType, fieldView);
  return (x1 - x0) / getPitchSpec(fieldType).width;
}

// Layout: o Stage ocupa o container inteiro (gramado em tudo) e o retângulo
// de linhas cabe ("contain") centralizado com respiro em volta, pra peças
// poderem ficar fora das linhas e os gols aparecerem.
export function calculateCanvasDimensions(containerWidth, containerHeight, fieldType, fieldView = FIELD_VIEWS.FULL) {
  const stageW = Math.max(1, Math.round(containerWidth));
  const stageH = Math.max(1, Math.round(containerHeight));
  const aspectRatio = getAspectRatio(fieldType, fieldView);

  // ≥ 5% de cada lado (mín. 24 px), um pouco mais na horizontal pros gols
  const padX = Math.max(stageW * 0.06, 28);
  const padY = Math.max(stageH * 0.06, 24);
  const availW = Math.max(40, stageW - padX * 2);
  const availH = Math.max(40, stageH - padY * 2);

  let fieldW, fieldH;
  if (availW / availH > aspectRatio) {
    fieldH = availH;
    fieldW = fieldH * aspectRatio;
  } else {
    fieldW = availW;
    fieldH = fieldW / aspectRatio;
  }

  const fieldX = (stageW - fieldW) / 2;
  const fieldY = (stageH - fieldH) / 2;
  return {
    stageWidth: stageW,
    stageHeight: stageH,
    fieldX: Math.round(fieldX),
    fieldY: Math.round(fieldY),
    width: Math.round(fieldW),   // largura do retângulo de linhas (px)
    height: Math.round(fieldH),  // altura do retângulo de linhas (px)
    offsetX: 0,
    offsetY: 0,
  };
}

// Limites de arrasto em % do campo: a peça pode sair da linha, mas não da tela
export function getDragBounds(dims, insetPx = 20) {
  const minX = toPercent(-dims.fieldX + insetPx, dims.width);
  const maxX = toPercent(dims.stageWidth - dims.fieldX - insetPx, dims.width);
  const minY = toPercent(-dims.fieldY + insetPx, dims.height);
  const maxY = toPercent(dims.stageHeight - dims.fieldY - insetPx, dims.height);
  return { minX, maxX, minY, maxY };
}

export function clampToBounds(x, y, b) {
  return {
    x: Math.max(b.minX, Math.min(b.maxX, x)),
    y: Math.max(b.minY, Math.min(b.maxY, y)),
  };
}

// Convert percentage position to pixel position
export function toPixel(percent, totalPixels) {
  return (percent / 100) * totalPixels;
}

// Convert pixel position to percentage
export function toPercent(pixel, totalPixels) {
  return (pixel / totalPixels) * 100;
}

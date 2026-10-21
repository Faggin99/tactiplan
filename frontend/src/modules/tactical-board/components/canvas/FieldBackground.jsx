import { useMemo } from 'react';
import { Group, Rect, Line, Circle, Arc, Shape } from 'react-konva';
import { FIELD_TYPES, FIELD_VIEWS, getPitchSpec, getViewWindow } from '../../utils/fieldDimensions';

// Gramado com listras cobrindo o canvas inteiro. As listras seguem a escala
// do campo (14 faixas no comprimento) e começam na linha de fundo, então
// ficam alinhadas com as linhas mesmo fora do retângulo.
function GrassStripes({ width, height, originX = 0, stripeWidth }) {
  const sw = Math.max(8, stripeWidth || width / 14);
  const first = Math.floor(-originX / sw) - 1;
  const last = Math.ceil((width - originX) / sw) + 1;
  const stripes = [];
  for (let i = first; i <= last; i++) {
    if (((i % 2) + 2) % 2 !== 1) continue;
    stripes.push(
      <Rect key={`stripe-${i}`} x={originX + sw * i} y={0} width={sw} height={height} fill="#369342" />
    );
  }
  return (
    <Group>
      <Rect x={0} y={0} width={width} height={height} fill="#2f7d3a" />
      {stripes}
      {/* Brilho sutil no topo simulando luz dos refletores */}
      <Rect x={0} y={0} width={width} height={height * 0.35} fill="rgba(255,255,255,0.04)" />
      {/* Sombra leve no rodapé pra dar profundidade */}
      <Rect x={0} y={height * 0.7} width={width} height={height * 0.3} fill="rgba(0,0,0,0.08)" />
    </Group>
  );
}

// Piso emborrachado azul-cobalto estilo Sportcourt indoor (quadra moderna de futsal).
// Base sólida + microtextura de poros via createPattern nativo do canvas + vinheta radial.
// Total: 3 nós Konva, escala em qualquer tamanho sem perder qualidade.
function CourtRubber({ width, height }) {
  // patternCanvas 8x8 — gerado UMA UNICA vez por instância (memo).
  const patternCanvas = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const pctx = c.getContext('2d');
    // Ponto claro (highlight do poro do PVC)
    pctx.fillStyle = 'rgba(255,255,255,0.05)';
    pctx.beginPath();
    pctx.arc(2, 2, 0.6, 0, Math.PI * 2);
    pctx.fill();
    // Ponto escuro (sombra do poro)
    pctx.fillStyle = 'rgba(0,0,0,0.08)';
    pctx.beginPath();
    pctx.arc(6, 6, 0.6, 0, Math.PI * 2);
    pctx.fill();
    return c;
  }, []);

  return (
    <Group listening={false}>
      {/* Camada 1 — Base sólida cobalto fosca */}
      <Rect x={0} y={0} width={width} height={height} fill="#1E5AA8" listening={false} />

      {/* Camada 2 — Microtextura de poros via createPattern nativo (1 nó Konva) */}
      <Shape
        x={0}
        y={0}
        width={width}
        height={height}
        listening={false}
        perfectDrawEnabled={false}
        sceneFunc={(ctx, shape) => {
          if (!patternCanvas) return;
          const w = shape.width();
          const h = shape.height();
          const pattern = ctx.createPattern(patternCanvas, 'repeat');
          if (!pattern) return;
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, w, h);
          ctx.fillStrokeShape(shape);
        }}
      />

      {/* Camada 3 — Vinheta radial cenital (iluminação de ginásio) */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientStartRadius={Math.min(width, height) * 0.15}
        fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 0.7}
        fillRadialGradientColorStops={[
          0, 'rgba(255,255,255,0.05)',
          1, 'rgba(0,0,0,0.15)',
        ]}
        listening={false}
      />
    </Group>
  );
}

// Gol — caixa branca semi-transparente, traves grossas, rede com padrão denso
function GoalBox({ x, y, width, height, side = 'left' }) {
  const netLines = [];
  const spacing = 3.5;
  // Vertical
  for (let i = 0; i <= Math.abs(width); i += spacing) {
    const lx = side === 'left' ? x + i : x + width - i;
    netLines.push(<Line key={`v-${i}`} points={[lx, y, lx, y + height]} stroke="rgba(255,255,255,0.35)" strokeWidth={0.5} />);
  }
  // Horizontal
  for (let i = 0; i <= height; i += spacing) {
    netLines.push(<Line key={`h-${i}`} points={[x, y + i, x + width, y + i]} stroke="rgba(255,255,255,0.35)" strokeWidth={0.5} />);
  }
  return (
    <Group>
      {/* Fundo da rede (área cinza-claro) */}
      <Rect x={x} y={y} width={width} height={height} fill="rgba(220,225,235,0.55)" />
      {/* Padrão da rede */}
      {netLines}
      {/* Traves (4 lados — grosso na trave da linha de fundo) */}
      <Rect
        x={x} y={y} width={width} height={height}
        stroke="#ffffff" strokeWidth={2.6} fill="transparent"
        shadowColor="rgba(0,0,0,0.6)" shadowBlur={4} shadowOpacity={0.45} shadowOffsetX={side === 'left' ? -1 : 1} shadowOffsetY={1}
      />
      {/* Traves sobre a linha de fundo (o gol fica pra fora do campo) */}
      <Line
        points={side === 'left'
          ? [x + width, y, x + width, y + height]
          : [x, y, x, y + height]}
        stroke="#ffffff" strokeWidth={3.2}
      />
    </Group>
  );
}

// Geometria comum: escala uniforme (px/m) a partir do retângulo visível.
function pitchGeometry(fieldType, fieldView, dims) {
  const spec = getPitchSpec(fieldType);
  const win = getViewWindow(fieldType, fieldView);
  const s = dims.width / (win.x1 - win.x0); // px por metro (== dims.height / spec.width)
  const ox = dims.fieldX - win.x0 * s;      // x (px) da linha de fundo esquerda
  const oy = dims.fieldY;
  const X = (m) => ox + m * s;
  const Y = (m) => oy + m * s;
  // Vista parcial: corta só o lado "cortado" (o gol do lado real continua visível)
  const clipX = win.cutLeft ? dims.fieldX : 0;
  const clipRight = win.cutRight ? dims.fieldX + dims.width : dims.stageWidth;
  const clipProps = (win.cutLeft || win.cutRight)
    ? { clipX, clipY: 0, clipWidth: clipRight - clipX, clipHeight: dims.stageHeight }
    : {};
  return { spec, s, ox, oy, X, Y, clipProps };
}

function Corners({ X, Y, L, W, r, lineColor, lineWidth }) {
  return [
    { x: X(0), y: Y(0), rotation: 0 },
    { x: X(L), y: Y(0), rotation: 90 },
    { x: X(L), y: Y(W), rotation: 180 },
    { x: X(0), y: Y(W), rotation: 270 },
  ].map((c, i) => (
    <Arc key={`corner-${i}`} x={c.x} y={c.y} innerRadius={r} outerRadius={r} angle={90} rotation={c.rotation} stroke={lineColor} strokeWidth={lineWidth} />
  ));
}

// Campo retangular (F11 ou F7) com medidas reais em metros.
function RectangularField({ fieldType, fieldView, dims }) {
  const { spec: f, s, X, Y, clipProps } = pitchGeometry(fieldType, fieldView, dims);
  const lineColor = '#ffffff';
  const lineWidth = 1.7;
  const L = f.length, W = f.width, cy = W / 2;
  const pa = f.penaltyArea, ga = f.goalArea;
  const spotR = Math.max(2.2, Math.min(3.2, s * 0.25));

  // Meia-lua: parte do círculo do pênalti (r) fora da grande área
  let arcHalfDeg = 0;
  if (f.penaltyArcRadius && f.penaltyArcRadius > pa.depth - f.penaltySpot) {
    arcHalfDeg = (Math.acos((pa.depth - f.penaltySpot) / f.penaltyArcRadius) * 180) / Math.PI;
  }
  const arcR = (f.penaltyArcRadius || 0) * s;

  return (
    <Group>
      <GrassStripes width={dims.stageWidth} height={dims.stageHeight} originX={X(0)} stripeWidth={(L * s) / 14} />
      <Group {...clipProps}>
        {/* Sombra interna pra valorizar o campo */}
        <Rect x={X(0)} y={Y(0)} width={L * s} height={W * s} stroke="rgba(0,0,0,0.35)" strokeWidth={3} fill="transparent" />
        {/* Linhas laterais e de fundo */}
        <Rect x={X(0)} y={Y(0)} width={L * s} height={W * s} stroke={lineColor} strokeWidth={lineWidth + 0.5} fill="transparent" />

        {/* Meio-campo */}
        <Line points={[X(L / 2), Y(0), X(L / 2), Y(W)]} stroke={lineColor} strokeWidth={lineWidth} />
        <Circle x={X(L / 2)} y={Y(cy)} radius={f.centerCircle * s} stroke={lineColor} strokeWidth={lineWidth} fill="transparent" />
        <Circle x={X(L / 2)} y={Y(cy)} radius={spotR} fill={lineColor} />

        {/* Grandes áreas */}
        <Rect x={X(0)} y={Y(cy - pa.width / 2)} width={pa.depth * s} height={pa.width * s} stroke={lineColor} strokeWidth={lineWidth} fill="transparent" />
        <Rect x={X(L - pa.depth)} y={Y(cy - pa.width / 2)} width={pa.depth * s} height={pa.width * s} stroke={lineColor} strokeWidth={lineWidth} fill="transparent" />
        {/* Pequenas áreas */}
        <Rect x={X(0)} y={Y(cy - ga.width / 2)} width={ga.depth * s} height={ga.width * s} stroke={lineColor} strokeWidth={lineWidth} fill="transparent" />
        <Rect x={X(L - ga.depth)} y={Y(cy - ga.width / 2)} width={ga.depth * s} height={ga.width * s} stroke={lineColor} strokeWidth={lineWidth} fill="transparent" />

        {/* Marcas do pênalti */}
        <Circle x={X(f.penaltySpot)} y={Y(cy)} radius={spotR} fill={lineColor} />
        <Circle x={X(L - f.penaltySpot)} y={Y(cy)} radius={spotR} fill={lineColor} />

        {/* Meias-luas */}
        {arcHalfDeg > 0 && (
          <>
            <Arc x={X(f.penaltySpot)} y={Y(cy)} innerRadius={arcR} outerRadius={arcR} angle={arcHalfDeg * 2} rotation={-arcHalfDeg} stroke={lineColor} strokeWidth={lineWidth} />
            <Arc x={X(L - f.penaltySpot)} y={Y(cy)} innerRadius={arcR} outerRadius={arcR} angle={arcHalfDeg * 2} rotation={180 - arcHalfDeg} stroke={lineColor} strokeWidth={lineWidth} />
          </>
        )}

        <Corners X={X} Y={Y} L={L} W={W} r={Math.max(3, f.cornerRadius * s)} lineColor={lineColor} lineWidth={lineWidth} />

        {/* Gols — um pouco pra fora da linha de fundo */}
        <GoalBox x={X(-f.goal.depth)} y={Y(cy - f.goal.width / 2)} width={f.goal.depth * s} height={f.goal.width * s} side="left" />
        <GoalBox x={X(L)} y={Y(cy - f.goal.width / 2)} width={f.goal.depth * s} height={f.goal.width * s} side="right" />
      </Group>
    </Group>
  );
}

function FutsalField({ fieldType, fieldView, dims }) {
  const { spec: f, s, X, Y, clipProps } = pitchGeometry(fieldType, fieldView, dims);
  const lineColor = '#ffffff';
  const lineWidth = 1.7;
  const L = f.length, W = f.width, cy = W / 2;
  const areaR = f.futsalAreaRadius * s;
  const spotR = Math.max(2.2, Math.min(3.2, s * 0.12));

  return (
    <Group>
      <CourtRubber width={dims.stageWidth} height={dims.stageHeight} />
      <Group {...clipProps}>
        {/* Sombra interna suavizada — sobre cobalto fosco fica leve */}
        <Rect x={X(0)} y={Y(0)} width={L * s} height={W * s} stroke="rgba(0,0,0,0.25)" strokeWidth={3} fill="transparent" listening={false} />
        <Rect x={X(0)} y={Y(0)} width={L * s} height={W * s} stroke={lineColor} strokeWidth={lineWidth + 0.5} fill="transparent" />

        <Line points={[X(L / 2), Y(0), X(L / 2), Y(W)]} stroke={lineColor} strokeWidth={lineWidth} />
        <Circle x={X(L / 2)} y={Y(cy)} radius={f.centerCircle * s} stroke={lineColor} strokeWidth={lineWidth} fill="transparent" />
        <Circle x={X(L / 2)} y={Y(cy)} radius={spotR} fill={lineColor} />

        {/* Áreas de 6 m (arco) */}
        <Arc x={X(0)} y={Y(cy)} innerRadius={areaR} outerRadius={areaR} angle={180} rotation={-90} stroke={lineColor} strokeWidth={lineWidth} />
        <Arc x={X(L)} y={Y(cy)} innerRadius={areaR} outerRadius={areaR} angle={180} rotation={90} stroke={lineColor} strokeWidth={lineWidth} />

        {/* Pênalti (6 m) e 2º pênalti (10 m) */}
        <Circle x={X(f.penaltySpot)} y={Y(cy)} radius={spotR} fill={lineColor} />
        <Circle x={X(L - f.penaltySpot)} y={Y(cy)} radius={spotR} fill={lineColor} />
        <Circle x={X(f.secondPenaltySpot)} y={Y(cy)} radius={spotR} fill={lineColor} />
        <Circle x={X(L - f.secondPenaltySpot)} y={Y(cy)} radius={spotR} fill={lineColor} />

        <Corners X={X} Y={Y} L={L} W={W} r={Math.max(3, f.cornerRadius * s)} lineColor={lineColor} lineWidth={lineWidth} />

        <GoalBox x={X(-f.goal.depth)} y={Y(cy - f.goal.width / 2)} width={f.goal.depth * s} height={f.goal.width * s} side="left" />
        <GoalBox x={X(L)} y={Y(cy - f.goal.width / 2)} width={f.goal.depth * s} height={f.goal.width * s} side="right" />
      </Group>
    </Group>
  );
}

// dims = calculateCanvasDimensions(...): { stageWidth, stageHeight, fieldX, fieldY, width, height }
export default function FieldBackground({ fieldType, fieldView = FIELD_VIEWS.FULL, dims }) {
  if (!dims || !dims.width || !dims.height) return null;
  if (fieldType === FIELD_TYPES.FUTSAL) {
    return <FutsalField fieldType={fieldType} fieldView={fieldView} dims={dims} />;
  }
  return <RectangularField fieldType={fieldType === FIELD_TYPES.FOOTBALL_7 ? FIELD_TYPES.FOOTBALL_7 : FIELD_TYPES.FOOTBALL_11} fieldView={fieldView} dims={dims} />;
}

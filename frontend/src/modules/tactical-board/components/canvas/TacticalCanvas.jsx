import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Group } from 'react-konva';
import FieldBackground from './FieldBackground';
import PlayerToken from './PlayerToken';
import BallToken from './BallToken';
import MarkerToken from './MarkerToken';
import TrajectoryLayer from './TrajectoryLayer';
import DrawingLayer, { DrawnElement } from './DrawingLayer';
import { FIELD_TYPES, FIELD_VIEWS, calculateCanvasDimensions, getDragBounds, clampToBounds, toPercent, toPixel } from '../../utils/fieldDimensions';

const TacticalCanvas = forwardRef(function TacticalCanvas({
  fieldType = FIELD_TYPES.FOOTBALL_11,
  fieldView = FIELD_VIEWS.FULL,
  elements = [],
  drawings = [],
  nextFrameElements = null,
  teamAColor = '#3b82f6',
  teamBColor = '#ef4444',
  isPlaying = false,
  drawingMode = null, // 'arrow_straight', 'arrow_curved', 'free_draw', 'zone_rect', 'zone_circle', 'text'
  drawingColor = '#ffffff',
  drawingDash = [],
  drawingStrokeWidth = 2.5,
  onElementMove,
  onElementSelect,
  onElementEdit,
  onDrawingSelect,
  onDrawingComplete,
  onDrawingUpdate,
  onBackgroundTap,
  selectedElementId,
  selectedDrawingId,
  bottomReserve = 0,
}, ref) {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  // width/height = retângulo de LINHAS (px); stageWidth/Height = canvas inteiro;
  // fieldX/fieldY = onde o retângulo começa dentro do canvas. Coordenadas
  // das peças continuam em % do retângulo de linhas (ver fieldDimensions.js).
  const [dimensions, setDimensions] = useState(() => calculateCanvasDimensions(800, 500, fieldType, fieldView));
  const [isDrawing, setIsDrawing] = useState(false);
  // Draft do desenho em andamento — renderizado ao vivo com opacity reduzida
  const [previewDrawing, setPreviewDrawing] = useState(null);
  const drawingStartRef = useRef(null);
  const freeDrawPointsRef = useRef([]);
  const rafRef = useRef(null);
  const isDrawingRef = useRef(false);

  // Editor de texto inline (substitui window.prompt, que não funciona no
  // Electron e não permite reedição)
  const [textEditor, setTextEditor] = useState(null); // { xPct, yPct, drawingId|null, value }
  // Espelho em ref — o mousedown do Konva dispara ANTES do blur do input;
  // sem isso, clicar no campo com o editor aberto descartaria o texto digitado
  const textEditorRef = useRef(null);
  useEffect(() => { textEditorRef.current = textEditor; }, [textEditor]);

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
    getCanvas: () => stageRef.current?.toCanvas(),
  }));

  const updateDimensions = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dims = calculateCanvasDimensions(rect.width, rect.height, fieldType, fieldView, bottomReserve);
    setDimensions(dims);
  }, [fieldType, fieldView, bottomReserve]);

  useEffect(() => {
    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) observer.observe(containerRef.current);

    // Ao girar o celular, o WebView às vezes dispara resize ANTES do layout
    // assentar, deixando dimensões defasadas (canvas em 0 ou tamanho errado).
    // Re-medimos algumas vezes após a rotação pra garantir o tamanho final.
    const onOrientation = () => {
      requestAnimationFrame(updateDimensions);
      setTimeout(updateDimensions, 150);
      setTimeout(updateDimensions, 400);
    };
    window.addEventListener('orientationchange', onOrientation);
    window.addEventListener('resize', onOrientation);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', onOrientation);
      window.removeEventListener('resize', onOrientation);
    };
  }, [updateDimensions]);

  const handleDragEnd = useCallback((elementId, e) => {
    if (isPlaying || !onElementMove) return;
    const node = e.target;
    const x = toPercent(node.x(), dimensions.width);
    const y = toPercent(node.y(), dimensions.height);
    // Pode sair da linha (margem em volta do campo), mas não sumir da tela
    const { x: clampedX, y: clampedY } = clampToBounds(x, y, getDragBounds(dimensions));
    node.x(toPixel(clampedX, dimensions.width));
    node.y(toPixel(clampedY, dimensions.height));
    onElementMove(elementId, clampedX, clampedY);
  }, [isPlaying, onElementMove, dimensions]);

  const handleElementClick = useCallback((elementId) => {
    if (drawingMode) return;
    if (onElementSelect) onElementSelect(elementId);
  }, [onElementSelect, drawingMode]);

  const handleElementDblClick = useCallback((elementId) => {
    if (drawingMode || isPlaying) return;
    if (onElementEdit) onElementEdit(elementId);
  }, [onElementEdit, drawingMode, isPlaying]);

  const handleStageClick = useCallback((e) => {
    if (drawingMode) return;
    if (e.target === stageRef.current || e.target.getParent()?.attrs?.name === 'field-background') {
      if (onElementSelect) onElementSelect(null);
      if (onDrawingSelect) onDrawingSelect(null);
      // Toque no campo vazio: alterna o chrome (esconde a barra, deixa só o campo).
      if (onBackgroundTap) onBackgroundTap();
    }
  }, [onElementSelect, onDrawingSelect, onBackgroundTap, drawingMode]);

  // ── Draft helpers ──
  const cancelDraft = useCallback(() => {
    setIsDrawing(false);
    isDrawingRef.current = false;
    setPreviewDrawing(null);
    drawingStartRef.current = null;
    freeDrawPointsRef.current = [];
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  // Esc cancela o draft em andamento
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && isDrawingRef.current) cancelDraft();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelDraft]);

  // Raio do círculo em espaço de PIXELS (percentual é anisotrópico: 1% em x
  // ≠ 1% em y quando o campo não é quadrado). Devolve o raio como % da altura,
  // que é como o DrawingLayer o renderiza (py(radius)).
  const circleRadiusPct = useCallback((x1, y1, x2, y2) => {
    const dxPx = toPixel(x2 - x1, dimensions.width);
    const dyPx = toPixel(y2 - y1, dimensions.height);
    const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
    return toPercent(distPx, dimensions.height);
  }, [dimensions]);

  const buildDraft = useCallback((x2, y2) => {
    const start = drawingStartRef.current;
    if (!start) return null;
    const { x: x1, y: y1 } = start;
    const base = { id: '__preview__', color: drawingColor, strokeWidth: drawingStrokeWidth, dash: drawingDash };
    switch (drawingMode) {
      case 'arrow_straight':
        return { ...base, drawType: 'arrow_straight', x1, y1, x2, y2 };
      case 'arrow_curved': {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        return { ...base, drawType: 'arrow_curved', x1, y1, x2, y2, cx: midX - dy * 0.3, cy: midY + dx * 0.3 };
      }
      case 'free_draw':
        return { ...base, drawType: 'free_draw', points: [...freeDrawPointsRef.current] };
      case 'zone_rect':
        return {
          ...base,
          drawType: 'zone_rect',
          x: Math.min(x1, x2), y: Math.min(y1, y2),
          w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
          color: hexToRgba(drawingColor, 0.15),
          strokeColor: hexToRgba(drawingColor, 0.5),
        };
      case 'zone_circle':
        return {
          ...base,
          drawType: 'zone_circle',
          cx: x1, cy: y1,
          radius: circleRadiusPct(x1, y1, x2, y2),
          color: hexToRgba(drawingColor, 0.15),
          strokeColor: hexToRgba(drawingColor, 0.5),
        };
      default:
        return null;
    }
  }, [drawingMode, drawingColor, drawingStrokeWidth, drawingDash, circleRadiusPct]);

  // ── Editor de texto inline ──
  // Lê do ref (não do state) pra poder ser chamado do mousedown do Konva,
  // que dispara antes do blur do input
  const commitTextEditor = useCallback(() => {
    const editor = textEditorRef.current;
    if (!editor) return;
    const value = editor.value.trim();
    if (value) {
      if (editor.drawingId) {
        onDrawingUpdate?.(editor.drawingId, { text: value });
      } else {
        onDrawingComplete?.({
          drawType: 'text',
          x: editor.xPct, y: editor.yPct,
          text: value,
          color: drawingColor,
          fontSize: 14,
        });
      }
    }
    textEditorRef.current = null;
    setTextEditor(null);
  }, [onDrawingComplete, onDrawingUpdate, drawingColor]);

  // Drawing mode mouse handlers
  const handleMouseDown = useCallback(() => {
    if (!drawingMode || isPlaying) return;
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const x = toPercent(pointer.x - dimensions.fieldX, dimensions.width);
    const y = toPercent(pointer.y - dimensions.fieldY, dimensions.height);

    if (drawingMode === 'text') {
      // Se já há um editor aberto com texto digitado, commita ele primeiro
      // (o mousedown chega antes do blur do input)
      if (textEditorRef.current) {
        commitTextEditor();
        return; // este clique só fecha/commita; próximo clique abre novo
      }
      setTextEditor({ xPct: x, yPct: y, drawingId: null, value: '' });
      return;
    }

    setIsDrawing(true);
    isDrawingRef.current = true;
    drawingStartRef.current = { x, y };

    if (drawingMode === 'free_draw') {
      freeDrawPointsRef.current = [x, y];
    }
  }, [drawingMode, isPlaying, dimensions, commitTextEditor]);

  const handleMouseMove = useCallback(() => {
    if (!isDrawingRef.current || !drawingMode || drawingMode === 'text') return;
    const stage = stageRef.current;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const x = toPercent(pointer.x - dimensions.fieldX, dimensions.width);
    const y = toPercent(pointer.y - dimensions.fieldY, dimensions.height);

    if (drawingMode === 'free_draw') {
      freeDrawPointsRef.current.push(x, y);
    }

    // Preview ao vivo com throttle via rAF
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setPreviewDrawing(buildDraft(x, y));
      });
    }
  }, [drawingMode, dimensions, buildDraft]);

  const finishDrawing = useCallback((clientPointer = null) => {
    if (!isDrawingRef.current || !drawingMode) return;
    const start = drawingStartRef.current;
    // Captura os pontos ANTES do cancelDraft — ele limpa o ref
    const freePts = [...freeDrawPointsRef.current];
    cancelDraft();
    if (!start) return;

    const stage = stageRef.current;
    const pointer = clientPointer || stage?.getPointerPosition();
    if (!pointer) return;

    const { x: x2, y: y2 } = clampToBounds(
      toPercent(pointer.x - dimensions.fieldX, dimensions.width),
      toPercent(pointer.y - dimensions.fieldY, dimensions.height),
      getDragBounds(dimensions, 4),
    );
    const { x: x1, y: y1 } = start;

    // Distância mínima em pixels (não em % anisotrópico)
    const dxPx = toPixel(x2 - x1, dimensions.width);
    const dyPx = toPixel(y2 - y1, dimensions.height);
    const distPx = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
    if (distPx < 8 && drawingMode !== 'free_draw') return;

    switch (drawingMode) {
      case 'arrow_straight':
        onDrawingComplete?.({
          drawType: 'arrow_straight',
          x1, y1, x2, y2,
          color: drawingColor,
          strokeWidth: drawingStrokeWidth,
          dash: drawingDash,
        });
        break;
      case 'arrow_curved': {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        onDrawingComplete?.({
          drawType: 'arrow_curved',
          x1, y1, x2, y2,
          cx: midX - dy * 0.3, cy: midY + dx * 0.3,
          color: drawingColor,
          strokeWidth: drawingStrokeWidth,
          dash: drawingDash,
        });
        break;
      }
      case 'free_draw': {
        if (freePts.length >= 4) {
          onDrawingComplete?.({
            drawType: 'free_draw',
            points: freePts,
            color: drawingColor,
            strokeWidth: drawingStrokeWidth,
          });
        }
        break;
      }
      case 'zone_rect': {
        onDrawingComplete?.({
          drawType: 'zone_rect',
          x: Math.min(x1, x2), y: Math.min(y1, y2),
          w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
          color: hexToRgba(drawingColor, 0.15),
          strokeColor: hexToRgba(drawingColor, 0.5),
        });
        break;
      }
      case 'zone_circle': {
        onDrawingComplete?.({
          drawType: 'zone_circle',
          cx: x1, cy: y1,
          radius: circleRadiusPct(x1, y1, x2, y2),
          color: hexToRgba(drawingColor, 0.15),
          strokeColor: hexToRgba(drawingColor, 0.5),
        });
        break;
      }
    }
  }, [drawingMode, dimensions, drawingColor, drawingStrokeWidth, drawingDash, onDrawingComplete, cancelDraft, circleRadiusPct]);

  const handleMouseUp = useCallback(() => {
    // free_draw usa os pontos acumulados; demais usam a posição atual do ponteiro
    finishDrawing();
  }, [finishDrawing]);

  // Soltar o ponteiro FORA do Stage também finaliza (senão isDrawing trava
  // em true e o traço continua ao reentrar no canvas)
  useEffect(() => {
    const onGlobalUp = () => {
      if (isDrawingRef.current) {
        // Sem posição válida do stage aqui — finaliza com o último ponto conhecido
        const stage = stageRef.current;
        const pointer = stage?.getPointerPosition();
        if (pointer) finishDrawing(pointer);
        else cancelDraft();
      }
    };
    window.addEventListener('mouseup', onGlobalUp);
    window.addEventListener('touchend', onGlobalUp);
    return () => {
      window.removeEventListener('mouseup', onGlobalUp);
      window.removeEventListener('touchend', onGlobalUp);
    };
  }, [finishDrawing, cancelDraft]);

  // Duplo-clique num texto existente reabre o editor
  const handleTextEdit = useCallback((drawing) => {
    if (isPlaying) return;
    setTextEditor({ xPct: drawing.x, yPct: drawing.y, drawingId: drawing.id, value: drawing.text || '' });
  }, [isPlaying]);

  const renderElement = (element) => {
    const pixelX = toPixel(element.x, dimensions.width);
    const pixelY = toPixel(element.y, dimensions.height);
    const isSelected = selectedElementId === element.id;
    const color = element.team === 'A' ? teamAColor : element.team === 'B' ? teamBColor : null;

    const commonProps = {
      x: pixelX,
      y: pixelY,
      draggable: !isPlaying && !drawingMode,
      isSelected,
      onDragEnd: (e) => handleDragEnd(element.id, e),
      onClick: () => handleElementClick(element.id),
      onDblClick: () => handleElementDblClick(element.id),
    };

    switch (element.type) {
      case 'player':
        return (
          <PlayerToken
            key={element.id}
            {...commonProps}
            jerseyNumber={element.jerseyNumber}
            name={element.name}
            color={color}
            isGoalkeeper={element.isGoalkeeper || false}
          />
        );
      case 'ball':
        return <BallToken key={element.id} {...commonProps} />;
      case 'marker':
        return <MarkerToken key={element.id} {...commonProps} markerType={element.markerType} rotation={element.rotation || 0} />;
      default:
        return null;
    }
  };

  const cursorStyle = drawingMode
    ? 'crosshair'
    : isPlaying
      ? 'default'
      : 'pointer';

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Stage
        ref={stageRef}
        width={dimensions.stageWidth}
        height={dimensions.stageHeight}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        style={{ cursor: cursorStyle }}
      >
        {/* Layer 1: Field background (static) */}
        <Layer name="field-background" listening={false}>
          <FieldBackground
            fieldType={fieldType}
            fieldView={fieldView}
            dims={dimensions}
          />
        </Layer>

        {/* Layer 2: Drawings (zones, arrows, free draw, text) */}
        <Layer>
          <Group x={dimensions.fieldX} y={dimensions.fieldY}>
          <DrawingLayer
            drawings={drawings}
            fieldWidth={dimensions.width}
            fieldHeight={dimensions.height}
            selectedDrawingId={selectedDrawingId}
            onSelectDrawing={onDrawingSelect}
            onTextEdit={handleTextEdit}
            draggable={!isPlaying && !drawingMode}
            onDragEnd={(drawingId, patch) => onDrawingUpdate?.(drawingId, patch)}
          />
          {/* Preview ao vivo do desenho em andamento */}
          {previewDrawing && (
            <DrawnElement
              element={previewDrawing}
              fieldWidth={dimensions.width}
              fieldHeight={dimensions.height}
              isSelected={false}
              opacity={0.6}
            />
          )}
          </Group>
        </Layer>

        {/* Layer 3: Movement arrows */}
        <Layer listening={false}>
          <Group x={dimensions.fieldX} y={dimensions.fieldY}>
          <TrajectoryLayer
            currentElements={elements}
            nextElements={nextFrameElements}
            fieldWidth={dimensions.width}
            fieldHeight={dimensions.height}
            teamAColor={teamAColor}
            teamBColor={teamBColor}
            visible={!isPlaying}
          />
          </Group>
        </Layer>

        {/* Layer 4: Interactive elements (players, ball, markers) */}
        <Layer>
          <Group x={dimensions.fieldX} y={dimensions.fieldY}>
            {elements.map(renderElement)}
          </Group>
        </Layer>
      </Stage>

      {/* Editor de texto inline sobre o Stage */}
      {textEditor && (
        <div style={{
          position: 'absolute',
          left: dimensions.fieldX + toPixel(textEditor.xPct, dimensions.width),
          top: dimensions.fieldY + toPixel(textEditor.yPct, dimensions.height),
          transform: 'translateY(-50%)',
          zIndex: 30,
        }}>
          <input
            autoFocus
            type="text"
            value={textEditor.value}
            maxLength={60}
            placeholder="Texto…"
            onChange={(e) => setTextEditor((t) => ({ ...t, value: e.target.value }))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitTextEditor();
              else if (e.key === 'Escape') setTextEditor(null);
            }}
            onBlur={commitTextEditor}
            style={{
              backgroundColor: 'rgba(10,14,26,0.92)',
              border: `1.5px solid ${drawingColor}`,
              borderRadius: '0.3rem',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 600,
              padding: '0.25rem 0.5rem',
              outline: 'none',
              minWidth: 120,
              boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      )}
    </div>
  );
});

function hexToRgba(hex, alpha) {
  if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length < 7) {
    // Cor inválida pra conversão (nome css, rgba, hex curto) — fallback branco
    return `rgba(255,255,255,${alpha})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default TacticalCanvas;

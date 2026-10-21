import { Group, Circle, RegularPolygon, Line } from 'react-konva';

// Bola de futebol "de verdade": branca com o pentágono preto no centro e os
// gomos em volta (cortados pela borda), sombra no chão — e não um botão.
export default function BallToken({
  x,
  y,
  isSelected = false,
  draggable = true,
  onDragEnd,
  onClick,
  onDblClick,
}) {
  const r = 10;
  const pent = r * 0.36;            // pentágono central
  const out = r * 0.86;             // centro dos gomos da borda
  const angles = [0, 72, 144, 216, 288].map((a) => ((a - 90) * Math.PI) / 180);

  return (
    <Group
      x={x}
      y={y}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onTap={onClick}
      onDblClick={onDblClick}
      onDblTap={onDblClick}
    >
      {isSelected && (
        <Circle radius={r + 5} stroke="#fbbf24" strokeWidth={2} dash={[4, 4]} fill="transparent" />
      )}

      {/* sombra no gramado */}
      <Circle x={1.5} y={2.5} radius={r} fill="rgba(0,0,0,0.28)" />

      {/* esfera + gomos, recortados no círculo */}
      <Group clipFunc={(ctx) => { ctx.arc(0, 0, r, 0, Math.PI * 2, false); }}>
        <Circle radius={r} fill="#ffffff" />
        {/* costuras do pentágono central para os gomos */}
        {angles.map((a, i) => (
          <Line
            key={`l${i}`}
            points={[Math.cos(a) * pent, Math.sin(a) * pent, Math.cos(a) * out, Math.sin(a) * out]}
            stroke="#1f2937" strokeWidth={0.9}
          />
        ))}
        <RegularPolygon sides={5} radius={pent} fill="#111827" />
        {angles.map((a, i) => (
          <RegularPolygon
            key={`p${i}`}
            x={Math.cos(a) * (r * 1.02)}
            y={Math.sin(a) * (r * 1.02)}
            sides={5}
            radius={r * 0.34}
            rotation={(i * 72) + 36}
            fill="#111827"
          />
        ))}
        {/* brilho */}
        <Circle x={-r * 0.35} y={-r * 0.4} radius={r * 0.32} fill="rgba(255,255,255,0.55)" />
      </Group>
      <Circle radius={r} stroke="#374151" strokeWidth={1} />
    </Group>
  );
}

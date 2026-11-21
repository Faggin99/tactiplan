// Escudo do ADVERSÁRIO de um jogo (21/11/2026). Guardado como mídia 'escudo' da análise do adversário
// (opponent_analysis_media). Jogo sem escudo próprio HERDA o último escudo enviado para o mesmo adversário
// (mesmo nome, mesma conta) — o treinador manda uma vez e vale para os próximos jogos contra ele.
const { query } = require('../config/database');

// sessionIds de jogos → Map(sessionId → { url, midia_id|null, herdado, de_data|null })
async function escudosDosJogos(sessionIds) {
  const ids = (sessionIds || []).filter(Boolean);
  if (!ids.length) return new Map();
  const r = await query(
    `SELECT DISTINCT ON (s.id) s.id AS session_id, m.id AS midia_id, m.file_path AS url, (o.id = s.id) AS proprio, o.date AS de_data
       FROM training_sessions s
       JOIN training_sessions o ON o.workspace_id = s.workspace_id AND o.session_type = 'match'
            AND (o.id = s.id OR (btrim(COALESCE(s.opponent_name, '')) <> ''
                 AND lower(btrim(o.opponent_name)) = lower(btrim(s.opponent_name))))
       JOIN opponent_analysis_media m ON m.session_id = o.id AND m.tipo = 'escudo'
      WHERE s.id = ANY($1)
      ORDER BY s.id, (o.id = s.id) DESC, m.created_at DESC`, [ids]);
  return new Map(r.rows.map((x) => [x.session_id, {
    url: x.url,
    midia_id: x.proprio ? x.midia_id : null,
    herdado: !x.proprio,
    de_data: x.proprio ? null : (x.de_data instanceof Date ? x.de_data.toISOString().slice(0, 10) : String(x.de_data).slice(0, 10)),
  }]));
}

module.exports = { escudosDosJogos };

// Mídia da Análise do adversário mais leve (08/11/2026): o PowerPoint com 3 vídeos de celular passava de
// 100 MB e não dava para mandar por WhatsApp/e-mail.
//   - FOTO: reduzida na hora (lado maior 1920 px, JPEG 82, orientação do celular) pelo mesmo processo
//     filho dos relatórios (sharp).
//   - VÍDEO: comprimido DEPOIS da resposta, um por vez (fila), com ffmpeg em prioridade baixa: até 1280 px
//     de largura, H.264 CRF 28, áudio AAC 96k, faststart. Só troca o arquivo se o novo ficar menor.
const fs = require('fs');
const { execFile } = require('child_process');
const { query } = require('../config/database');
const { resolveUploadPath, resizeInWorker } = require('../reports/photos');

const FOTO_LADO = 1920;
const FOTO_QUALIDADE = 82;
const VIDEO_TIMEOUT_MS = 15 * 60 * 1000;

/** Reduz a foto enviada. Devolve { file_path, size_bytes, mime_type } novos ou null (fica a original). */
async function otimizarFoto(filePath) {
  const full = resolveUploadPath(filePath);
  if (!full) return null;
  const [buf] = await resizeInWorker([{ path: full }], { maxSide: FOTO_LADO, quality: FOTO_QUALIDADE });
  if (!buf) return null;
  const novoFull = full.replace(/\.[^./]*$/, '') + '.jpg';
  await fs.promises.writeFile(novoFull, buf);
  if (novoFull !== full) await fs.promises.unlink(full).catch(() => {});
  return { file_path: filePath.replace(/\.[^./]*$/, '') + '.jpg', size_bytes: buf.length, mime_type: 'image/jpeg' };
}

function ffmpeg(entrada, saida) {
  return new Promise((resolve, reject) => {
    execFile('nice', ['-n', '15', 'ffmpeg', '-y', '-v', 'error', '-i', entrada,
      '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-threads', '1', saida],
    { timeout: VIDEO_TIMEOUT_MS }, (err) => (err ? reject(err) : resolve()));
  });
}

/** Comprime um vídeo já gravado (linha de opponent_analysis_media). Troca arquivo e linha se ficar menor. */
async function comprimirVideo(midiaId) {
  const r = await query(`SELECT id, file_path, size_bytes FROM opponent_analysis_media WHERE id = $1 AND tipo = 'video'`, [midiaId]);
  const m = r.rows[0];
  const full = m && resolveUploadPath(m.file_path);
  if (!full || !fs.existsSync(full)) return null;
  const tmp = full.replace(/\.[^./]*$/, '') + '.comprimindo.mp4';
  try {
    await ffmpeg(full, tmp);
    const novo = (await fs.promises.stat(tmp)).size;
    const antigo = (await fs.promises.stat(full)).size;
    if (!novo || novo >= antigo * 0.9) { await fs.promises.unlink(tmp); return { trocou: false, antigo, novo }; }
    const finalFull = full.replace(/\.[^./]*$/, '') + '.mp4';
    await fs.promises.rename(tmp, finalFull);
    if (finalFull !== full) await fs.promises.unlink(full).catch(() => {});
    const filePath = m.file_path.replace(/\.[^./]*$/, '') + '.mp4';
    const up = await query(
      `UPDATE opponent_analysis_media SET file_path = $2, size_bytes = $3, mime_type = 'video/mp4' WHERE id = $1 RETURNING id`,
      [m.id, filePath, novo]);
    // apagaram o vídeo enquanto comprimia: some o arquivo novo também
    if (!up.rows[0]) await fs.promises.unlink(finalFull).catch(() => {});
    return { trocou: true, antigo, novo };
  } catch (e) {
    await fs.promises.unlink(tmp).catch(() => {});
    console.error('analise: comprimir vídeo falhou', midiaId, e.message);
    return null;
  }
}

// Fila: um vídeo por vez (VPS pequena).
let fila = Promise.resolve();
function comprimirVideoDepois(midiaId) {
  fila = fila.then(() => comprimirVideo(midiaId)).catch(() => {});
  return fila;
}

module.exports = { otimizarFoto, comprimirVideo, comprimirVideoDepois };

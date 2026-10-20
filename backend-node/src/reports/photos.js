// Fotos dos anexos do treino (training_activity_files) para os relatórios.
// Lê do DISCO (nunca pela URL pública), reduz no servidor e devolve buffers
// JPEG prontos para o template. Arquivo ausente/corrompido é ignorado.
const fs = require('fs');
const path = require('path');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.gif']);
const MAX_SIDE = 1400;
const JPEG_QUALITY = 78;

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads'));
}

// Só anexos de imagem: mime image/* (ou, sem mime, extensão de imagem).
function isImageAttachment(file) {
  if (!file || !file.file_path) return false;
  const mime = String(file.mime_type || '').toLowerCase();
  if (mime) return mime.startsWith('image/') && mime !== 'image/svg+xml';
  return IMAGE_EXT.has(path.extname(String(file.file_name || file.file_path)).toLowerCase());
}

function filterImageAttachments(files) {
  return (files || []).filter(isImageAttachment);
}

// "/uploads/session-files/x.jpg" → "<UPLOAD_DIR>/session-files/x.jpg".
// Recusa qualquer caminho que escape da pasta de uploads.
function resolveUploadPath(filePath, root = uploadRoot()) {
  if (!filePath) return null;
  const rel = String(filePath).replace(/^\/+/, '').replace(/^uploads\//, '');
  const full = path.resolve(root, rel);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

// A redução roda num processo filho de vida curta (imageWorker.js): o libvips
// fragmenta o malloc e o RSS da API subia ~200MB e não devolvia; no filho a
// memória volta pro sistema quando ele sai.
const WORKER = path.join(__dirname, 'imageWorker.js');
const WORKER_TIMEOUT_MS = 30 * 1000;

// jobs: [{ path }] → [Buffer|null] na mesma ordem
function resizeInWorker(jobs, { maxSide = MAX_SIDE, quality = JPEG_QUALITY } = {}) {
  if (!jobs.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    const { fork } = require('child_process');
    let done = false;
    const child = fork(WORKER, [], {
      serialization: 'advanced',
      execArgv: [],
      env: { ...process.env, MALLOC_ARENA_MAX: '2' },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    const finish = (out) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (child.connected) child.disconnect();
      child.kill();
      resolve(out);
    };
    const timer = setTimeout(() => finish(jobs.map(() => null)), WORKER_TIMEOUT_MS);
    child.on('message', (msg) => finish((msg && msg.results || []).map((b) => (b ? Buffer.from(b) : null))));
    child.on('error', () => finish(jobs.map(() => null)));
    child.on('exit', () => finish(jobs.map(() => null)));
    child.send({ jobs, maxSide, quality });
  });
}

// Escudo do clube: arquivo pequeno, vai como está (sem processar).
const LOGO_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
async function loadLogo(logoPath) {
  const full = resolveUploadPath(logoPath);
  const type = full && LOGO_TYPES[path.extname(full).toLowerCase()];
  if (!type) return null;
  try {
    const st = await fs.promises.stat(full);
    if (!st.isFile() || st.size > 3 * 1024 * 1024) return null;
    return { body: await fs.promises.readFile(full), contentType: type };
  } catch (_) {
    return null;
  }
}

// Carrega uma lista de anexos (já filtrados/ordenados) até `limit` fotos válidas.
// Arquivo ausente no disco ou ilegível é pulado. Retorna { photos: [{...file,
// buffer}], hidden } — hidden = imagens existentes que ficaram de fora pelo limite.
async function loadPhotos(files, limit) {
  const existing = files
    .map((f) => ({ f, full: resolveUploadPath(f.file_path) }))
    .filter((x) => x.full && fs.existsSync(x.full));
  const candidates = existing.slice(0, limit + 3); // folga p/ arquivo que não decodifica
  const buffers = await resizeInWorker(candidates.map((x) => ({ path: x.full })));
  const photos = [];
  let used = 0;
  for (let i = 0; i < candidates.length && photos.length < limit; i++) {
    used = i + 1;
    if (buffers[i]) photos.push({ ...candidates[i].f, buffer: buffers[i] });
  }
  return { photos, hidden: Math.max(0, existing.length - used) };
}

module.exports = {
  MAX_SIDE,
  JPEG_QUALITY,
  isImageAttachment,
  filterImageAttachments,
  resolveUploadPath,
  resizeInWorker,
  loadLogo,
  loadPhotos,
};

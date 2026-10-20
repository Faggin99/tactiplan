// Processo filho que reduz as fotos dos relatórios (sharp/libvips) e sai.
// Entrada (IPC): { jobs: [{ path }], maxSide, quality } → saída: { results: [Buffer|null] }
const fs = require('fs');

process.on('message', async ({ jobs, maxSide, quality }) => {
  let sharp = null;
  try {
    sharp = require('sharp');
    sharp.cache(false);
    sharp.concurrency(1);
  } catch (_) { /* sem sharp: nenhuma foto */ }
  const results = [];
  for (const job of jobs || []) {
    if (!sharp) { results.push(null); continue; }
    try {
      const input = await fs.promises.readFile(job.path);
      const out = await sharp(input, { failOn: 'none', sequentialRead: true })
        .rotate() // orientação EXIF do celular
        .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      results.push(out);
    } catch (_) {
      results.push(null); // sumiu do disco ou formato que o sharp não lê (ex.: HEIC)
    }
  }
  process.send({ results }, () => process.exit(0));
});

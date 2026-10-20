// POST /api/reports/:tipo — relatórios PDF gerados no servidor (HTML → Chromium).
//   tipo = treino | jogos | sessao
//   body treino/jogos: { club_id, start_date, end_date, filter_type?, period_label?, include_photos? }
//   body sessao:       { session_id, include_photos? }
//   + fotos?   { ids: [ordem], layout, proporcao, legendas, agrupar, legendasCustom } (modal "Fotos do relatório")
//   + formato? 'pdf' (padrão) | 'fotos' (JSON: miniaturas p/ o modal) | 'html' (JSON { html }: prévia
//              só das páginas de fotos, sem Chromium)
// Permissões iguais às telas (stats:view / training:view, workspace ativa,
// categoria do membro) + feature de plano `pdf_export` (conta só leitura não exporta,
// como o ExportMenu do front).
const express = require('express');
const authMiddleware = require('../middleware/auth');
const { hasFeature } = require('../utils/planFeatures');
const { generateReport, listReportPhotos, previewReportPhotos, viewSessionSheet, ReportError, PERMISSION } = require('../reports');
const { featureMessage } = require('../middleware/requireActiveSubscription');

const router = express.Router();
router.use(authMiddleware);

router.post('/:tipo', async (req, res) => {
  const tipo = req.params.tipo;
  const perm = PERMISSION[tipo];
  if (!perm) return res.status(404).json({ error: 'Tipo de relatório desconhecido' });
  if (!req.user.can(perm)) return res.status(403).json({ error: 'Sem permissão' });
  try {
    // Ver a ficha do dia na tela não é exportar: vale para qualquer um com training:view
    if (tipo === 'sessao' && (req.body || {}).formato === 'visualizar') {
      return res.set('Cache-Control', 'no-store').json(await viewSessionSheet(req.body, req.user));
    }
    if (!(await hasFeature(req.user, 'pdf_export'))) {
      return res.status(402).json({ error: featureMessage('pdf_export'), code: 'PLAN_REQUIRED', required_feature: 'pdf_export' });
    }
    const body = req.body || {};
    if (body.formato === 'fotos') {
      return res.set('Cache-Control', 'no-store').json(await listReportPhotos(tipo, body, req.user));
    }
    if (body.formato === 'html') {
      return res.set('Cache-Control', 'no-store').json(await previewReportPhotos(tipo, body, req.user));
    }
    // quem desistiu (fechou a conexão) não ocupa o Chromium: a fila descarta
    let gone = false;
    res.on('close', () => { if (!res.writableEnded) gone = true; });
    const t0 = Date.now();
    const { pdf, pages, filename } = await generateReport(tipo, body, req.user, { isStale: () => gone });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Report-Pages': String(pages || ''),
      'Cache-Control': 'no-store',
    });
    console.log(`[reports] ${tipo} ${pages}p ${Math.round(pdf.length / 1024)}KB ${Date.now() - t0}ms`);
    return res.end(pdf);
  } catch (err) {
    if (err instanceof ReportError) return res.status(err.status).json({ error: err.message });
    if (err.code === 'REPORT_CANCELED') return res.end();
    if (err.code === 'REPORT_BUSY') return res.status(503).json({ error: err.message, code: err.code });
    if (err.code === 'REPORT_TIMEOUT') return res.status(504).json({ error: 'A geração do PDF demorou demais. Tente de novo.', code: err.code });
    console.error('Report error:', err);
    return res.status(500).json({ error: 'Falha ao gerar o relatório' });
  }
});

module.exports = router;

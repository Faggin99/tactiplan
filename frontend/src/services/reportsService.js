// Relatórios PDF gerados no servidor (POST /api/reports/:tipo → application/pdf).
// Funciona igual na web e no app nativo: devolve um Blob e quem chama entrega
// com deliverFile (download na web, folha de compartilhar no Capacitor).
import { api } from './api';
import { deliverFile } from '../lib/deliverFile';

async function fetchReport(tipo, body) {
  const res = await fetch(`${api.baseURL}/reports/${encodeURIComponent(tipo)}`, {
    method: 'POST',
    headers: { ...api.getHeaders(), Accept: 'application/pdf' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || 'Não foi possível gerar o PDF. Tente de novo.');
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return res.blob();
}

// Modal "Fotos do relatório": lista das fotos (miniaturas) e prévia em HTML
// das páginas de fotos. Mesma rota, `formato` no body; aceitam AbortSignal
// para a prévia descartar pedidos velhos.
async function fetchReportJson(tipo, body, signal) {
  const res = await fetch(`${api.baseURL}/reports/${encodeURIComponent(tipo)}`, {
    method: 'POST',
    headers: api.getHeaders(),
    body: JSON.stringify(body || {}),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Não foi possível carregar as fotos.');
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

export const fetchReportPhotos = (tipo, body, { signal } = {}) => fetchReportJson(tipo, { ...body, formato: 'fotos' }, signal);
export const fetchReportPreview = (tipo, body, { signal } = {}) => fetchReportJson(tipo, { ...body, formato: 'html' }, signal);
// Ficha do dia inteira em HTML, para ver na tela (resumo do dia) — mesmo modelo do PDF.
// soPeriodo: dia com 2+ períodos, só o período de sessionId (senão o dia inteiro)
export const fetchSessionSheetView = (sessionId, { signal, soPeriodo = false } = {}) => fetchReportJson('sessao', { session_id: sessionId, formato: 'visualizar', ...(soPeriodo ? { so_periodo: true } : {}) }, signal);

// Nomes de arquivo no mesmo padrão dos PDFs antigos.
export const safeFileName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^\w-]/g, '');

export async function downloadReport(tipo, body, filename, dialogTitle = 'Compartilhar PDF') {
  const blob = await fetchReport(tipo, body);
  await deliverFile(blob, filename, dialogTitle);
}

export const reportsService = { fetchReport, downloadReport, fetchReportPhotos, fetchReportPreview };

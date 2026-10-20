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

// Nomes de arquivo no mesmo padrão dos PDFs antigos.
export const safeFileName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^\w-]/g, '');

export async function downloadReport(tipo, body, filename) {
  const blob = await fetchReport(tipo, body);
  await deliverFile(blob, filename, 'Compartilhar PDF');
}

export const reportsService = { fetchReport, downloadReport };

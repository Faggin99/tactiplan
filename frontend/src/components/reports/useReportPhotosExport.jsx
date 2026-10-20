import { useCallback, useState } from 'react';
import { ReportPhotosModal } from './ReportPhotosModal';
import { downloadReport, fetchReportPhotos } from '../../services/reportsService';

// Fluxo do botão "Exportar PDF" com fotos: busca as fotos do período; sem
// fotos gera direto (como antes), com fotos abre o modal.
export function useReportPhotosExport() {
  const [state, setState] = useState(null);
  const close = useCallback(() => setState(null), []);
  const start = useCallback(async (tipo, body, filename) => {
    let list = null;
    try {
      list = await fetchReportPhotos(tipo, body);
    } catch (err) {
      if (err.status === 402 || err.status === 403) throw err;
      list = null; // lista falhou: segue com o padrão
    }
    if (!list || !Array.isArray(list.fotos) || !list.fotos.length) {
      await downloadReport(tipo, body, filename);
      return;
    }
    setState({ tipo, body, filename, list });
  }, []);
  const modal = state ? <ReportPhotosModal {...state} onClose={close} /> : null;
  return { start, modal };
}

import SwiftUI
import UIKit
import WebKit
import QuickLook
import TactiPlanKit

// Peças da T1 que só existem no iPhone (o resto mora no TactiPlanKit, testado no Linux):
// upload com progresso (URLSession com delegate), WebView da ficha/prévia, folha de
// compartilhar e o QuickLook dos anexos (foto, vídeo e PDF). Padrões do Gestsport.

// MARK: montagem da API de treino da sessão em uso

extension AppEstado {
    /// Rotas de treino do web com o token do app e a conta escolhida (X-Workspace-Id).
    func servicoTreino(_ sessao: Sessao, _ ctx: ContextoClube) -> ServicoTreino {
        ServicoTreino(api: ApiTreinoHttp(
            api: Api(base: base),
            relatorios: Api(base: base, transporte: TransporteURLSession(timeout: TIMEOUT_RELATORIO_S)),
            upload: TransporteUploadURLSession(),
            token: sessao.token, workspaceId: ctx.escolha.workspaceId))
    }
}

/// Upload multipart contando o progresso de envio (URLSessionTaskDelegate por tarefa).
final class TransporteUploadURLSession: NSObject, TransporteUpload, @unchecked Sendable {
    private let sessao: URLSession

    override init() {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = TIMEOUT_UPLOAD_S
        c.timeoutIntervalForResource = TIMEOUT_UPLOAD_S
        c.urlCache = nil
        c.httpShouldSetCookies = false
        sessao = URLSession(configuration: c)
        super.init()
    }

    func enviar(_ r: Requisicao, progresso: @escaping @Sendable (Double) -> Void) async throws -> Resposta {
        var req = URLRequest(url: r.url)
        req.httpMethod = r.metodo
        for (nome, valor) in r.cabecalhos { req.setValue(valor, forHTTPHeaderField: nome) }
        let delegado = DelegadoProgresso(progresso)
        let (dados, resposta) = try await sessao.upload(for: req, from: r.corpo ?? Data(), delegate: delegado)
        guard let http = resposta as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        progresso(1)
        return Resposta(status: http.statusCode, corpo: dados)
    }
}

private final class DelegadoProgresso: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    let aoMudar: @Sendable (Double) -> Void
    init(_ aoMudar: @escaping @Sendable (Double) -> Void) { self.aoMudar = aoMudar }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        aoMudar(min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend)))
    }
}

// MARK: WebView (ficha do dia, prévia das fotos)

/// HTML do servidor (mesmo template do PDF) num WKWebView: JS ligado só para a paginação do
/// próprio template; navegação para fora bloqueada; sem acesso a arquivos.
struct WebViewHTML: UIViewRepresentable {
    let html: String
    var aoTerminar: (() -> Void)?

    func makeCoordinator() -> Coordenador { Coordenador(aoTerminar: aoTerminar) }

    func makeUIView(context: Context) -> WKWebView {
        let conf = WKWebViewConfiguration()
        conf.websiteDataStore = .nonPersistent()
        let w = WKWebView(frame: .zero, configuration: conf)
        w.navigationDelegate = context.coordinator
        w.isOpaque = false
        w.backgroundColor = .systemGray5
        w.scrollView.backgroundColor = .systemGray5
        w.allowsLinkPreview = false
        w.accessibilityLabel = "Prévia do relatório"
        return w
    }

    func updateUIView(_ w: WKWebView, context: Context) {
        guard context.coordinator.ultimo != html else { return }
        context.coordinator.ultimo = html
        w.loadHTMLString(htmlParaWebView(html), baseURL: nil)
    }

    final class Coordenador: NSObject, WKNavigationDelegate {
        var ultimo: String?
        let aoTerminar: (() -> Void)?
        init(aoTerminar: (() -> Void)?) { self.aoTerminar = aoTerminar }

        func webView(_ webView: WKWebView, decidePolicyFor acao: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // Só o próprio HTML carregado (about:blank / data:); link nenhum sai do app.
            let esquema = acao.request.url?.scheme ?? "about"
            decisionHandler(esquema == "about" || esquema == "data" ? .allow : .cancel)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { aoTerminar?() }
    }
}

// MARK: compartilhar e ver arquivos

/// Grava `dados` num arquivo temporário com `nome` (substitui o anterior da mesma pasta).
func arquivoTemporario(_ dados: Data, nome: String, pasta: String) throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent(pasta, isDirectory: true)
    try? FileManager.default.removeItem(at: dir)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appendingPathComponent(nome)
    try dados.write(to: url, options: .atomic)
    return url
}

/// Folha de compartilhar do sistema (WhatsApp, Mail, AirDrop, Arquivos, Imprimir).
struct FolhaCompartilhar: UIViewControllerRepresentable {
    let itens: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: itens, applicationActivities: nil)
    }
    func updateUIViewController(_ c: UIActivityViewController, context: Context) {}
}

/// Item identificável para `.sheet(item:)` com um arquivo local.
struct ArquivoLocal: Identifiable, Equatable {
    let id = UUID()
    let url: URL
}

/// QuickLook (foto, vídeo e PDF) de um arquivo local.
struct VisualizadorArquivo: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Fonte { Fonte(url: url) }

    func makeUIViewController(context: Context) -> UINavigationController {
        let q = QLPreviewController()
        q.dataSource = context.coordinator
        return UINavigationController(rootViewController: q)
    }

    func updateUIViewController(_ c: UINavigationController, context: Context) {}

    final class Fonte: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> any QLPreviewItem { url as NSURL }
    }
}

/// Baixa o anexo do servidor para o cache temporário (para o QuickLook). /uploads é público.
func baixarAnexo(_ a: Anexo, base: String) async throws -> URL {
    guard let s = urlDoServidor(a.caminho, base: base), let url = URL(string: s) else { throw ErroApi.offline() }
    let (dados, resp) = try await URLSession.shared.data(from: url)
    guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw ErroApi.offline() }
    let ext = (a.nomeArquivo as NSString?)?.pathExtension ?? url.pathExtension
    let nome = nomeArquivoSeguro(tituloDoArquivo(a.rotulo)) + (ext.isEmpty ? "" : ".\(ext)")
    return try arquivoTemporario(dados, nome: nome, pasta: "anexo-\(a.id)")
}

// MARK: avisos

/// Aviso de baixo (toast) com o texto; some sozinho.
struct AvisoTemporario: ViewModifier {
    @Binding var texto: String?
    @Environment(\.tema) private var tema

    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let t = texto {
                Text(t)
                    .tipo(Tipos.corpo13.comPeso(.medio))
                    .foregroundColor(.white)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(Capsule().fill(Color.black.opacity(0.85)))
                    .padding(.horizontal, 24).padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .accessibilityAddTraits(.updatesFrequently)
                    .onAppear {
                        UIAccessibility.post(notification: .announcement, argument: t)
                        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) { withAnimation { if texto == t { texto = nil } } }
                    }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: texto)
    }
}

extension View {
    func avisoTemporario(_ texto: Binding<String?>) -> some View { modifier(AvisoTemporario(texto: texto)) }
}

/// Cor de um pilar (Kit `PILARES`).
func corDoPilar(_ id: String?) -> Color {
    guard let p = pilarDe(id) else { return Color.gray }
    return Cor(hex: p.corHex).color
}

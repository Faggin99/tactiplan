import SwiftUI
import UIKit
import SafariServices

// Copiado do Gestsport (paridade: Custom Tabs no Android). Link externo (privacidade,
// termos, esqueci a senha) abre DENTRO do app num SFSafariViewController,
// apresentado por cima de tudo — inclusive de uma folha aberta.

@MainActor
enum AbrirLink {
    /// Abre `url` (http/https) no Safari embutido; o resto é ignorado.
    static func abrir(_ url: String) {
        guard let u = URL(string: url), let esquema = u.scheme?.lowercased(),
              esquema == "http" || esquema == "https",
              let topo = controladorDoTopo()
        else { return }
        let safari = SFSafariViewController(url: u)
        safari.dismissButtonStyle = .close
        topo.present(safari, animated: true)
    }

    /// Folha "Compartilhar" do sistema com um texto/link (Bloco B: link do portal pedido na hora).
    static func compartilhar(_ texto: String) {
        guard let topo = controladorDoTopo() else { return }
        let folha = UIActivityViewController(activityItems: [URL(string: texto) ?? texto], applicationActivities: nil)
        // iPad: a folha precisa de uma âncora (o meio da tela).
        folha.popoverPresentationController?.sourceView = topo.view
        folha.popoverPresentationController?.sourceRect = CGRect(x: topo.view.bounds.midX, y: topo.view.bounds.midY, width: 0, height: 0)
        folha.popoverPresentationController?.permittedArrowDirections = []
        topo.present(folha, animated: true)
    }

    /// O controlador mais de cima da janela ativa (folhas incluídas).
    private static func controladorDoTopo() -> UIViewController? {
        let cenas = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let cena = cenas.first { $0.activationState == .foregroundActive } ?? cenas.first
        let janela = cena?.windows.first { $0.isKeyWindow } ?? cena?.windows.first
        var topo = janela?.rootViewController
        while let apresentado = topo?.presentedViewController, !apresentado.isBeingDismissed {
            topo = apresentado
        }
        return topo
    }
}

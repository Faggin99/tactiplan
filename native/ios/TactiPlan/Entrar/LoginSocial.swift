import SwiftUI
import UIKit
import AuthenticationServices
import CryptoKit
import TactiPlanKit

// Login social no iPhone (copiado do Gestsport). Só obtém a credencial; quem confere tudo é o
// servidor (POST /api/app/auth/apple | google), que NÃO cria conta (o app é só por convite).
//  • Sign in with Apple (AuthenticationServices) — botão oficial da Apple;
//  • Google SEM SDK: OAuth com PKCE no ASWebAuthenticationSession (client iOS vem do servidor).

/// O build tem a capability Sign in with Apple? (Info.plist TactiPlanAppleLogin = YES só com o
/// entitlement — TACTIPLAN_APPLE_ATIVO=1 no Codemagic.)
enum AppleNoBuild {
    static var ativo: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "TactiPlanAppleLogin") as? String)?.uppercased() == "YES"
    }
}

enum ResultadoApple {
    case ok(token: String, nome: String?)
    case cancelado
    case falhou
}

func lerResultadoApple(_ r: Result<ASAuthorization, Error>) -> ResultadoApple {
    switch r {
    case .success(let auth):
        guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
              let dados = cred.identityToken, let token = String(data: dados, encoding: .utf8) else { return .falhou }
        let partes = [cred.fullName?.givenName, cred.fullName?.familyName].compactMap { $0 }.filter { !$0.isEmpty }
        return .ok(token: token, nome: partes.isEmpty ? nil : partes.joined(separator: " "))
    case .failure(let erro):
        if let e = erro as? ASAuthorizationError, e.code == .canceled { return .cancelado }
        return .falhou
    }
}

/// Google pelo navegador do sistema com PKCE. Devolve o id_token.
final class LoginGoogleIOS: NSObject, ASWebAuthenticationPresentationContextProviding {
    enum Erro: Error { case cancelado, falhou }
    private var sessao: ASWebAuthenticationSession?
    private var ancora: ASPresentationAnchor?

    @MainActor
    func entrar(clientId: String) async throws -> String {
        let verificador = base64Url(LoginGoogleIOS.aleatorio(32))
        let desafio = base64Url(Array(SHA256.hash(data: Data(verificador.utf8))))
        let estado = base64Url(LoginGoogleIOS.aleatorio(16))
        guard let url = URL(string: urlAutorizacaoGoogle(clientId: clientId, desafio: desafio, estado: estado)) else { throw Erro.falhou }
        let cenas = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        ancora = cenas.flatMap { $0.windows }.first { $0.isKeyWindow } ?? cenas.first?.windows.first
        let retorno: URL = try await withCheckedThrowingContinuation { cont in
            let s = ASWebAuthenticationSession(url: url, callbackURLScheme: esquemaRetornoGoogle(clientId)) { u, e in
                if let u { cont.resume(returning: u); return }
                if let e = e as? ASWebAuthenticationSessionError, e.code == .canceledLogin { cont.resume(throwing: Erro.cancelado); return }
                cont.resume(throwing: Erro.falhou)
            }
            s.presentationContextProvider = self
            s.prefersEphemeralWebBrowserSession = true
            self.sessao = s
            if !s.start() { cont.resume(throwing: Erro.falhou) }
        }
        sessao = nil
        guard let codigo = codigoDoRetornoGoogle(retorno.absoluteString, estado: estado) else { throw Erro.falhou }
        var req = URLRequest(url: URL(string: GOOGLE_TOKEN_URL)!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = Data(corpoTrocaGoogle(codigo: codigo, clientId: clientId, verificador: verificador).utf8)
        let (dados, _) = try await URLSession.shared.data(for: req)
        guard let j = try? Json.ler(dados), let id = idTokenGoogle(j) else { throw Erro.falhou }
        return id
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ancora ?? ASPresentationAnchor()
    }

    private static func aleatorio(_ n: Int) -> [UInt8] {
        var b = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &b)
        return b
    }
}

/// "Continuar com o Google" no estilo dos botões do app (neutro, com o "G").
struct BotaoGoogle: View {
    var habilitado = true
    let acao: () -> Void
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        let forma = RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous)
        Button(action: acao) {
            HStack(spacing: 10) {
                Text("G").font(.system(size: 18, weight: .bold)).foregroundColor(Color(red: 0.26, green: 0.52, blue: 0.96))
                Text("Continuar com o Google").font(Tipo.corpo(15, peso: .semibold)).foregroundColor(c.tinta.color)
            }
            .frame(maxWidth: .infinity, minHeight: ALTURA_BOTAO)
            .background(forma.fill(c.superficie.color))
            .overlay(forma.stroke(c.borda.color, lineWidth: 1.5))
            .contentShape(forma)
        }
        .buttonStyle(.plain)
        .disabled(!habilitado)
        .opacity(habilitado ? 1 : 0.5)
    }
}

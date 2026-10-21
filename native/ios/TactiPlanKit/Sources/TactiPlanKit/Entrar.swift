import Foundation

// Tela Entrar: e-mail e senha + "Entrar com a Apple"/"Continuar com o Google" (atrás das flags
// do servidor e do build). Não há "Criar conta": o app é só por convite. Toda regra aqui; a
// tela só desenha. Paridade: ui/entrar/EntrarModelo.kt (Android).

public struct EstadoEntrar: Equatable, Sendable {
    public var email = ""
    public var senha = ""
    public var carregando = false
    public var erro: String?
    public var config = ConfigApp.padrao

    public init() {}

    public var camposHabilitados: Bool { !carregando }
    public var podeEntrar: Bool { !carregando && !email.trimmingCharacters(in: .whitespaces).isEmpty && !senha.isEmpty }
    public var esqueciSenhaUrl: String { config.esqueciSenhaUrl ?? ESQUECI_SENHA_URL_PADRAO }
}

@MainActor
public final class EntrarModelo {
    public private(set) var estado = EstadoEntrar() { didSet { if estado != oldValue { aoMudar?(estado) } } }
    public var aoMudar: ((EstadoEntrar) -> Void)?

    private let api: ApiApp
    private let aparelho: Aparelho
    private let aoEntrar: (RespostaLogin) -> Void

    public init(api: ApiApp, aparelho: Aparelho, aoEntrar: @escaping (RespostaLogin) -> Void) {
        self.api = api
        self.aparelho = aparelho
        self.aoEntrar = aoEntrar
    }

    /// Flags do servidor (Google/Apple, links). Falhou: fica tudo desligado (só e-mail e senha).
    public func carregarConfig() async {
        if let c = try? await api.config() { estado.config = c }
    }

    public func mudarEmail(_ v: String) { estado.email = v; estado.erro = nil }
    public func mudarSenha(_ v: String) { estado.senha = v; estado.erro = nil }

    public func entrar() async {
        guard !estado.carregando else { return }
        let email = estado.email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard emailPlausivel(email) else { estado.erro = MSG_EMAIL_INVALIDO; return }
        guard !estado.senha.isEmpty else { estado.erro = MSG_SENHA_VAZIA; return }
        await tentar { [api, aparelho, estado] in
            try await api.entrar(email: email, senha: estado.senha, aparelho: aparelho)
        }
    }

    public func entrarComGoogle(_ idToken: String) async {
        guard !estado.carregando else { return }
        await tentar { [api, aparelho] in try await api.entrarComGoogle(idToken: idToken, aparelho: aparelho) }
    }

    public func entrarComApple(_ identityToken: String, nome: String?) async {
        guard !estado.carregando else { return }
        await tentar { [api, aparelho] in
            try await api.entrarComApple(identityToken: identityToken, nome: nome, aparelho: aparelho)
        }
    }

    /// O botão social não conseguiu a credencial (cancelado = nil: nada aparece).
    public func falhaSocial(_ mensagem: String?) {
        estado.carregando = false
        estado.erro = mensagem
    }

    private func tentar(_ chamada: @escaping @Sendable () async throws -> RespostaLogin) async {
        estado.carregando = true
        estado.erro = nil
        do {
            let r = try await chamada()
            estado.carregando = false
            estado.senha = ""
            aoEntrar(r)
        } catch {
            estado.carregando = false
            estado.erro = mensagemDoLogin(error)
        }
    }
}

/// Erro do login → frase da tela. A mensagem do servidor é neutra e já em português (e-mail ou
/// senha incorretos, sem conta, muitas tentativas); sem rede/servidor fora, a do app.
public func mensagemDoLogin(_ e: Error) -> String {
    if semRede(e) { return (e as? ErroApi)?.status == 0 ? ErroApi.MSG_OFFLINE : ErroApi.MSG_FALHA }
    return mensagemDeErro(e, padrao: MSG_SOCIAL_FALHOU)
}

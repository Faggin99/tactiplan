import Foundation

// As chamadas do app ao BFF /api/app (backend-node/src/routes/app*.js), atrás de um protocolo:
// o `ControleSessao` e o `EntrarModelo` só conhecem `ApiApp` — nos testes, um falso.
// Paridade: dados/ApiApp.kt (Android).

/// Quem é o aparelho (vai no login; ajuda a pessoa a reconhecer sessões no futuro).
public struct Aparelho: Equatable, Sendable {
    public var plataforma: String
    public var nome: String?
    public var versaoApp: String?
    public init(plataforma: String, nome: String? = nil, versaoApp: String? = nil) {
        self.plataforma = plataforma; self.nome = nome; self.versaoApp = versaoApp
    }

    var json: Json {
        var o: [String: Json] = ["plataforma": .texto(plataforma)]
        if let nome { o["nome"] = .texto(nome) }
        if let versaoApp { o["versao_app"] = .texto(versaoApp) }
        return .objeto(o)
    }
}

public let PLATAFORMA_IOS = "ios"
public let PLATAFORMA_ANDROID = "android"

public protocol ApiApp: Sendable {
    func config() async throws -> ConfigApp
    func entrar(email: String, senha: String, aparelho: Aparelho) async throws -> RespostaLogin
    func entrarComGoogle(idToken: String, aparelho: Aparelho) async throws -> RespostaLogin
    func entrarComApple(identityToken: String, nome: String?, aparelho: Aparelho) async throws -> RespostaLogin
    func me(token: String) async throws -> Me
    func aceitarConvite(token: String, convite: String) async throws -> RespostaConvite
    func sair(token: String) async throws
    func registrarPush(token: String, tokenPush: String, plataforma: String) async throws
}

/// O de verdade, sobre o [Api] (HTTP).
public final class ApiAppHttp: ApiApp {
    private let api: Api
    public init(api: Api) { self.api = api }

    public func config() async throws -> ConfigApp {
        try await api.chamar("/app/auth/config")
    }

    public func entrar(email: String, senha: String, aparelho: Aparelho) async throws -> RespostaLogin {
        try await api.chamar("/app/auth/entrar", metodo: "POST", corpo: [
            "email": .texto(email.trimmingCharacters(in: .whitespacesAndNewlines)),
            "senha": .texto(senha), "aparelho": aparelho.json,
        ])
    }

    public func entrarComGoogle(idToken: String, aparelho: Aparelho) async throws -> RespostaLogin {
        try await api.chamar("/app/auth/google", metodo: "POST", corpo: ["id_token": .texto(idToken), "aparelho": aparelho.json])
    }

    public func entrarComApple(identityToken: String, nome: String?, aparelho: Aparelho) async throws -> RespostaLogin {
        var corpo: [String: Json] = ["identity_token": .texto(identityToken), "aparelho": aparelho.json]
        if let nome, !nome.isEmpty { corpo["nome"] = .texto(nome) }
        return try await api.chamar("/app/auth/apple", metodo: "POST", corpo: .objeto(corpo))
    }

    public func me(token: String) async throws -> Me {
        try await api.chamar("/app/me", token: token)
    }

    public func aceitarConvite(token: String, convite: String) async throws -> RespostaConvite {
        try await api.chamar("/app/convites/\(codificarComponente(convite))/aceitar", metodo: "POST", token: token)
    }

    public func sair(token: String) async throws {
        _ = try await api.chamarJson("/app/auth/sair", metodo: "POST", token: token)
    }

    public func registrarPush(token: String, tokenPush: String, plataforma: String) async throws {
        _ = try await api.chamarJson("/app/push/registrar", metodo: "POST",
                                     corpo: ["token": .texto(tokenPush), "plataforma": .texto(plataforma)], token: token)
    }
}

// Porte do `encodeURIComponent` do JS (copiado do Gestsport, util/Url).
private let NAO_CODIFICA: Set<UInt8> = Set("-_.!~*'()".utf8)
private let HEX = Array("0123456789ABCDEF".utf8)

public func codificarComponente(_ s: String) -> String {
    var saida: [UInt8] = []
    for c in s.utf8 {
        let livre = (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || (c >= 0x30 && c <= 0x39) || NAO_CODIFICA.contains(c)
        if livre {
            saida.append(c)
        } else {
            saida.append(0x25)
            saida.append(HEX[Int(c >> 4)])
            saida.append(HEX[Int(c & 0xF)])
        }
    }
    return String(decoding: saida, as: UTF8.self)
}

// MARK: login social (flags do servidor × do build)

/// "Entrar com a Apple" aparece se o SERVIDOR liga (APP_LOGIN_APPLE=on) E o build tem a
/// capability (entitlement Sign in with Apple — flag TACTIPLAN_APPLE_ATIVO no Codemagic).
public func mostrarApple(_ c: ConfigApp, appleNoBuild: Bool) -> Bool {
    appleNoBuild && (c.apple?.ativo ?? false)
}

/// Google no iPhone: servidor ligado + client iOS configurado + a Apple junto (regra 4.8 da
/// App Store: quem oferece Google precisa oferecer "Entrar com a Apple").
public func googleIOSClientId(_ c: ConfigApp, appleNoBuild: Bool) -> String? {
    guard c.google?.ativo == true, let id = c.google?.iosClientId, !id.isEmpty,
          mostrarApple(c, appleNoBuild: appleNoBuild) else { return nil }
    return id
}

/// Google no Android: servidor ligado + o client WEB (serverClientId do Credential Manager).
/// A regra 4.8 é da Apple: no Android não há botão da Apple.
public func googleAndroidServerClientId(_ c: ConfigApp) -> String? {
    guard c.google?.ativo == true, let id = c.google?.androidServerClientId, !id.isEmpty else { return nil }
    return id
}

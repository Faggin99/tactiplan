import Foundation

// Erros da API (mesma semântica do Gestsport). Paridade: dados/ErroApi.kt (Android).

/// Erro de qualquer chamada à API.
/// - Sem conexão/timeout: status 0, codigo "OFFLINE".
/// - Resposta não-2xx: status HTTP, mensagem do `{error}` do corpo, `codigo` do `{code}`.
public struct ErroApi: Error, Equatable, Sendable, LocalizedError, CustomStringConvertible {
    public let status: Int
    public let codigo: String?
    public let mensagem: String
    public let demo: Bool
    /// Os outros campos de TEXTO do corpo do erro.
    public let extras: [String: String]

    public init(status: Int, codigo: String?, mensagem: String, demo: Bool = false, extras: [String: String] = [:]) {
        self.status = status
        self.codigo = codigo
        self.mensagem = mensagem
        self.demo = demo
        self.extras = extras
    }

    public static let OFFLINE = "OFFLINE"
    public static let MSG_OFFLINE = "Sem conexão. Confira a internet e tente de novo."
    public static let MSG_FALHA = "Não foi possível falar com o servidor agora. Tente de novo."

    public static func offline() -> ErroApi { ErroApi(status: 0, codigo: OFFLINE, mensagem: MSG_OFFLINE) }

    public var errorDescription: String? { mensagem }
    public var description: String { "ErroApi(\(status), \(codigo ?? "nil")): \(mensagem)" }
}

/// "Sem rede" = não dá pra falar com o servidor agora: OFFLINE, status 0 ou 5xx.
/// Só esses mantêm o último dado na tela (com a faixa "sem conexão"). 4xx NUNCA.
public func semRede(_ e: Error?) -> Bool {
    guard let erro = e as? ErroApi else { return false }
    return erro.codigo == ErroApi.OFFLINE || erro.status == 0 || erro.status >= 500
}

/// Regra ÚNICA de "sessão acabou": QUALQUER 401, seja qual for o código.
public func sessaoEncerrada(_ e: Error?) -> Bool { (e as? ErroApi)?.status == 401 }

/// O servidor recusou uma escrita porque a equipe está em só leitura (402 READ_ONLY).
public func ehSomenteLeitura(_ e: Error?) -> Bool {
    guard let erro = e as? ErroApi else { return false }
    return erro.codigo == "READ_ONLY" || (erro.status == 402 && erro.extras["read_only"] == "true")
}

/// Escrita em clube ARQUIVADO (409 CLUB_ARCHIVED, migration 055): o clube é só consulta.
public func ehClubeArquivado(_ e: Error?) -> Bool { (e as? ErroApi)?.codigo == "CLUB_ARCHIVED" }

/// Texto para a tela. Só leitura → SEMPRE a frase neutra (Apple 3.1.3: sem plano, preço,
/// site ou "assine"), mesmo que o servidor mande outra. O resto: a mensagem do servidor.
public func mensagemDeErro(_ e: Error, padrao: String = ErroApi.MSG_FALHA) -> String {
    if ehSomenteLeitura(e) { return TEXTO_NAO_EDITA }
    if ehClubeArquivado(e) { return TEXTO_CLUBE_ARQUIVADO }
    if let m = (e as? ErroApi)?.mensagem, !m.isEmpty { return m }
    return padrao
}

import Foundation

// "Entrar com Google" no iPhone SEM SDK: OAuth 2.0 para app instalado, com PKCE,
// pelo ASWebAuthenticationSession do sistema. O client iOS vem do servidor
// (GET /api/app/auth/config → google.ios_client_id, do .env); nada fixo no app. O app troca o
// `code` pelo `id_token` direto no Google (client iOS não tem segredo) e manda o id_token ao
// servidor, que o confere aceitando o client iOS como audiência.
// O SHA-256 do desafio é feito no app (CryptoKit); aqui fica o que dá para testar no Linux.

public let GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
public let GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

/// "1234-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.1234-abc" (o esquema
/// de retorno que o Google aceita para clients iOS).
public func esquemaRetornoGoogle(_ clientId: String) -> String {
    let sufixo = ".apps.googleusercontent.com"
    let base = clientId.hasSuffix(sufixo) ? String(clientId.dropLast(sufixo.count)) : clientId
    return "com.googleusercontent.apps.\(base)"
}

public func redirectGoogle(_ clientId: String) -> String { "\(esquemaRetornoGoogle(clientId)):/oauth2redirect" }

/// Base64 "url-safe" sem "=" (PKCE, RFC 7636).
public func base64Url(_ bytes: [UInt8]) -> String {
    Data(bytes).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

private let NAO_RESERVADOS = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
private func cod(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: NAO_RESERVADOS) ?? s }

/// URL de autorização (abre no ASWebAuthenticationSession).
public func urlAutorizacaoGoogle(clientId: String, desafio: String, estado: String) -> String {
    let q: [(String, String)] = [
        ("client_id", clientId), ("redirect_uri", redirectGoogle(clientId)), ("response_type", "code"),
        ("scope", "openid email profile"), ("code_challenge", desafio), ("code_challenge_method", "S256"),
        ("state", estado), ("prompt", "select_account"),
    ]
    return GOOGLE_AUTH_URL + "?" + q.map { "\($0.0)=\(cod($0.1))" }.joined(separator: "&")
}

/// O `code` do retorno, só se o `state` bate (senão nil — retorno forjado ou de outra tentativa).
public func codigoDoRetornoGoogle(_ url: String, estado: String) -> String? {
    guard let c = URLComponents(string: url), let itens = c.queryItems else { return nil }
    guard itens.first(where: { $0.name == "state" })?.value == estado else { return nil }
    guard let code = itens.first(where: { $0.name == "code" })?.value, !code.isEmpty else { return nil }
    return code
}

/// Corpo (form-urlencoded) da troca do `code` pelo token.
public func corpoTrocaGoogle(codigo: String, clientId: String, verificador: String) -> String {
    [("code", codigo), ("client_id", clientId), ("redirect_uri", redirectGoogle(clientId)),
     ("grant_type", "authorization_code"), ("code_verifier", verificador)]
        .map { "\($0.0)=\(cod($0.1))" }.joined(separator: "&")
}

/// O `id_token` da resposta do Google (nil se não veio).
public func idTokenGoogle(_ j: Json) -> String? {
    guard let t = j["id_token"]?.texto, !t.isEmpty else { return nil }
    return t
}

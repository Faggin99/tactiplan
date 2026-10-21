import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Cliente HTTP do app (copiado do Gestsport). Paridade: dados/Api.kt (Android).
// Uploads (anexos): ApiTreino.swift (multipart com progresso), mesma semântica de erro.

/// Requisição já montada e validada, pronta pro transporte.
public struct Requisicao: Sendable, Equatable {
    public let url: URL
    public let metodo: String
    /// Na ordem em que foram definidos; nomes únicos sem diferenciar caixa.
    public let cabecalhos: [(nome: String, valor: String)]
    public let corpo: Data?

    /// Valor de um cabeçalho, sem diferenciar caixa no nome.
    public func cabecalho(_ nome: String) -> String? {
        cabecalhos.first { $0.nome.lowercased() == nome.lowercased() }?.valor
    }

    public static func == (a: Requisicao, b: Requisicao) -> Bool {
        a.url == b.url && a.metodo == b.metodo && a.corpo == b.corpo
            && a.cabecalhos.map { "\($0.nome)\u{0}\($0.valor)" } == b.cabecalhos.map { "\($0.nome)\u{0}\($0.valor)" }
    }
}

/// Resposta crua: status HTTP + corpo.
public struct Resposta: Sendable, Equatable {
    public let status: Int
    public let corpo: Data
    public init(status: Int, corpo: Data) { self.status = status; self.corpo = corpo }
}

/// Quem fala HTTP. No app, [TransporteURLSession]; nos testes, um falso.
/// Qualquer erro lançado aqui (sem rede, DNS, timeout, TLS) vira OFFLINE no [Api].
public protocol Transporte: Sendable {
    func enviar(_ requisicao: Requisicao) async throws -> Resposta
}

/// Transporte real: URLSession efêmera (sem cookie/cache em disco), timeout de 15 s.
public final class TransporteURLSession: Transporte {
    private let sessao: URLSession
    /// Timeout (s) de requisição e de recurso desta sessão.
    public let timeout: TimeInterval

    public init(timeout: TimeInterval = 15) {
        self.timeout = timeout
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = timeout
        c.timeoutIntervalForResource = timeout
        c.urlCache = nil
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.httpShouldSetCookies = false
        sessao = URLSession(configuration: c)
    }

    public func enviar(_ r: Requisicao) async throws -> Resposta {
        var req = URLRequest(url: r.url)
        req.httpMethod = r.metodo
        for (nome, valor) in r.cabecalhos { req.setValue(valor, forHTTPHeaderField: nome) }
        req.httpBody = r.corpo
        let (dados, resposta) = try await sessao.data(for: req)
        guard let http = resposta as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return Resposta(status: http.statusCode, corpo: dados)
    }
}

// OkHttp/fetch exigem corpo nesses métodos; o fetch do Capacitor mandava sem corpo.
private let METODOS_COM_CORPO: Set<String> = ["POST", "PUT", "PATCH"]
// E recusam corpo nesses (o fetch lança TypeError → OFFLINE).
private let METODOS_SEM_CORPO: Set<String> = ["GET", "HEAD"]

/// Cliente da API. `base` = Info.plist API_BASE (ex.: "https://app.tactiplan.faggin.com.br/api").
/// Todo erro sai como [ErroApi], com a mesma semântica do `api()` do Capacitor.
public final class Api: Sendable {
    public let base: String
    private let transporte: Transporte

    public init(base: String, transporte: Transporte = TransporteURLSession()) {
        self.base = base
        self.transporte = transporte
    }

    /// Chamada crua: devolve o corpo JSON (ou `{}` se o corpo não for JSON).
    public func chamarJson(
        _ caminho: String,
        metodo: String = "GET",
        corpo: Json? = nil,
        token: String? = nil,
        cabecalhos: [(String, String)] = []
    ) async throws -> Json {
        // Como o fetch do JS lançando antes de sair (URL impossível, cabeçalho
        // inválido, método recusado): vira OFFLINE / "Sem conexão.".
        guard let req = montar(caminho, metodo: metodo, corpo: corpo, token: token, cabecalhos: cabecalhos) else {
            throw ErroApi.offline()
        }

        let resposta: Resposta
        do {
            resposta = try await transporte.enviar(req)
        } catch {
            // Cancelar a Task cancela a chamada e sobe como cancelamento, não OFFLINE.
            if error is CancellationError || Task.isCancelled { throw CancellationError() }
            throw ErroApi.offline()
        }

        return try respostaOuErro(resposta)
    }

    /// Chamada tipada: decodifica o corpo em `T` (campos desconhecidos são ignorados).
    public func chamar<T: Decodable>(
        _ caminho: String,
        como tipo: T.Type = T.self,
        metodo: String = "GET",
        corpo: Json? = nil,
        token: String? = nil,
        cabecalhos: [(String, String)] = []
    ) async throws -> T {
        try await chamarJson(caminho, metodo: metodo, corpo: corpo, token: token, cabecalhos: cabecalhos)
            .decodificar(T.self)
    }

    /// Chamada que devolve BYTES (PDF do relatório). 2xx → corpo cru; senão o mesmo [ErroApi].
    public func chamarDados(
        _ caminho: String,
        metodo: String = "POST",
        corpo: Json? = nil,
        token: String? = nil,
        cabecalhos: [(String, String)] = []
    ) async throws -> Data {
        guard let req = montar(caminho, metodo: metodo, corpo: corpo, token: token, cabecalhos: cabecalhos) else {
            throw ErroApi.offline()
        }
        let resposta: Resposta
        do {
            resposta = try await transporte.enviar(req)
        } catch {
            if error is CancellationError || Task.isCancelled { throw CancellationError() }
            throw ErroApi.offline()
        }
        guard (200...299).contains(resposta.status) else { _ = try respostaOuErro(resposta); return Data() }
        return resposta.corpo
    }

    /// Caminho assinado do servidor → URL absoluta na origem da API.
    public func urlDoServidor(_ caminho: String?) -> String? { TactiPlanKit.urlDoServidor(caminho, base: base) }

    // MARK: montagem

    func montar(
        _ caminho: String, metodo: String, corpo: Json?, token: String?, cabecalhos: [(String, String)]
    ) -> Requisicao? {
        guard let url = urlHttp(base + caminho), tokenHttpValido(metodo) else { return nil }
        let m = metodo.uppercased()

        // Mesma ordem do client.js: content-type, depois os extras (podem
        // sobrescrever, sem diferenciar caixa), depois o token.
        var hs: [(nome: String, valor: String)] = []
        func definir(_ nome: String, _ valor: String) {
            if let i = hs.firstIndex(where: { $0.nome.lowercased() == nome.lowercased() }) {
                hs[i] = (nome, valor)
            } else {
                hs.append((nome, valor))
            }
        }
        definir("content-type", "application/json")
        for (k, v) in cabecalhos { definir(k, v) }
        if let token { definir("authorization", "Bearer \(token)") }
        guard hs.allSatisfy({ tokenHttpValido($0.nome) && valorCabecalhoValido($0.valor) }) else { return nil }

        let dadosCorpo: Data?
        if let corpo {
            if METODOS_SEM_CORPO.contains(m) { return nil }
            guard let d = try? corpo.dados() else { return nil }
            dadosCorpo = d
        } else if METODOS_COM_CORPO.contains(m) {
            dadosCorpo = Data()
        } else {
            dadosCorpo = nil
        }
        return Requisicao(url: url, metodo: metodo, cabecalhos: hs, corpo: dadosCorpo)
    }
}

// MARK: compartilhado com o Upload (mesma semântica de erro)

/// Corpo → JSON; não-2xx → [ErroApi] com a mensagem do `{error}`, o `{code}` e o
/// `{demo:true}` da conta de demonstração.
func respostaOuErro(_ resposta: Resposta) throws -> Json {
    let dados = lerJson(resposta.corpo)
    guard (200...299).contains(resposta.status) else {
        let mensagem = dados["error"]?.texto
        let codigo = dados["code"]?.texto
        let demo = dados["demo"]?.booleano == true
        var extras: [String: String] = [:]
        if case .objeto(let o) = dados {
            for (k, v) in o where k != "error" && k != "code" { if let t = v.texto { extras[k] = t } }
        }
        throw ErroApi(
            status: resposta.status, codigo: codigo,
            mensagem: (mensagem?.isEmpty == false ? mensagem! : ErroApi.MSG_FALHA), demo: demo, extras: extras
        )
    }
    return dados
}

// Igual ao `r.json().catch(() => ({}))`: corpo que não é JSON válido vira `{}`.
private func lerJson(_ dados: Data) -> Json {
    guard !dados.isEmpty, let j = try? Json.ler(dados) else { return .objeto([:]) }
    return j
}

/// URL http(s) absoluta com host; qualquer outra coisa → nil (o `toHttpUrl` do OkHttp).
func urlHttp(_ s: String) -> URL? {
    guard let u = URL(string: s), let esquema = u.scheme?.lowercased(),
          esquema == "http" || esquema == "https", let host = u.host, !host.isEmpty
    else { return nil }
    return u
}

// Nome de cabeçalho/método: ASCII visível (0x21...0x7E), não vazio (regra do OkHttp).
func tokenHttpValido(_ s: String) -> Bool {
    !s.isEmpty && s.utf8.allSatisfy { (0x21...0x7E).contains($0) }
}

// Valor de cabeçalho: tab ou ASCII imprimível; quebra de linha/controle recusados.
func valorCabecalhoValido(_ s: String) -> Bool {
    s.utf8.allSatisfy { $0 == 0x09 || (0x20...0x7E).contains($0) }
}

/// Caminho do servidor (ex.: "/uploads/comprovantes/x.pdf?t=…", link assinado) →
/// URL absoluta na MESMA origem da API. URL já absoluta passa direto; vazio → nil.
/// Base não-absoluta (só no navegador do Capacitor) cai em http://localhost.
public func urlDoServidor(_ caminho: String?, base: String) -> String? {
    guard let caminho, !caminho.isEmpty else { return nil }
    if caminho.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) != nil { return caminho }
    let origem = urlHttp(base) ?? URL(string: "http://localhost/")!
    return URL(string: caminho, relativeTo: origem)?.absoluteURL.absoluteString
}

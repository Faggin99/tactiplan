import Foundation

// QUADRO TÁTICO (T5): /api/plays do web com o token do app (X-Workspace-Id). As jogadas são da
// CONTA; `club_id` é só "criada em" (vai na criação; no PUT o servidor ignora). Ver = tactical:view,
// criar/salvar/excluir = tactical:edit; conta só leitura → 402 READ_ONLY (só assistir).
// Paridade: dados/quadro/ApiQuadro.kt.

public enum CaminhosQuadro {
    public static let jogadas = "/plays"
    public static func jogada(_ id: String) -> String { "/plays/\(codificarComponente(id))" }
}

public protocol ApiQuadro: Sendable {
    func listar() async throws -> [Jogada]
    func abrir(_ id: String) async throws -> Jogada
    func criar(_ corpo: Json) async throws -> Jogada
    func atualizar(_ id: String, _ corpo: Json) async throws -> Jogada
    func excluir(_ id: String) async throws
}

public struct ApiQuadroHttp: ApiQuadro {
    let web: ClienteWeb
    public init(_ web: ClienteWeb) { self.web = web }

    public func listar() async throws -> [Jogada] { jogadasDaResposta(try await web.json(CaminhosQuadro.jogadas)) }
    public func abrir(_ id: String) async throws -> Jogada { Jogada(try await web.json(CaminhosQuadro.jogada(id))) }
    public func criar(_ corpo: Json) async throws -> Jogada { Jogada(try await web.json(CaminhosQuadro.jogadas, "POST", corpo)) }
    public func atualizar(_ id: String, _ corpo: Json) async throws -> Jogada {
        Jogada(try await web.json(CaminhosQuadro.jogada(id), "PUT", corpo))
    }
    public func excluir(_ id: String) async throws { _ = try await web.json(CaminhosQuadro.jogada(id), "DELETE") }
}

/// Quem pode o quê no Quadro: ver (aba aparece), editar (criar/salvar/duplicar/renomear/excluir).
/// Clube arquivado NÃO trava jogada (é da conta); conta só leitura trava.
public struct PermissoesQuadro: Equatable, Sendable {
    public let ver: Bool
    public let editar: Bool
    public init(ver: Bool, editar: Bool) { self.ver = ver; self.editar = editar }
}

public func permissoesQuadro(_ ctx: ContextoClube) -> PermissoesQuadro {
    let contaLeitura = ctx.conta.somenteLeitura ?? true
    let ver = ctx.permissoes.contains("tactical:view")
    return PermissoesQuadro(ver: ver, editar: ver && !contaLeitura && ctx.permissoes.contains("tactical:edit"))
}

/// Mesmo corpo que o web manda ao salvar a jogada `j` com outro nome/descrição (renomear, duplicar).
public func corpoDaJogada(_ j: Jogada, nome: String, descricao: String? = nil, clubeId: String?) -> Json {
    var e = EditorQuadro()
    e.abrir(j.bruto)
    return e.corpoSalvar(nome: nome, descricao: descricao ?? j.descricao, clubeId: clubeId)
}

/// "Saída de bola (cópia)".
public func nomeDaCopia(_ nome: String) -> String { "\(nome) (cópia)" }

/// Nome obrigatório ao salvar (o web não deixa salvar vazio).
public func nomeValidoJogada(_ nome: String) -> String? {
    let t = nome.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
}

/// Mensagem do erro ao salvar/abrir (402 do plano/só leitura, 403 sem permissão).
public func mensagemErroQuadro(_ e: Error) -> String {
    if let a = e as? ErroApi {
        if a.status == 403 { return "Você não tem permissão para editar o quadro tático." }
        return a.mensagem
    }
    return ErroApi.MSG_FALHA
}

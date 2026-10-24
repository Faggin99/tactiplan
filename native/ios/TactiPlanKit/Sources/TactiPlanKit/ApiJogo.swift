import Foundation

// As rotas de JOGO do web que o app chama com o token dele (T2), sempre com X-Workspace-Id.
// Paridade: dados/jogo/ApiJogo.kt (Android).

public enum CaminhosJogo {
    public static func jogo(_ sessaoId: String) -> String { "/games/\(codificarComponente(sessaoId))" }
    public static func dia(_ sessaoId: String) -> String { "/sessions/\(codificarComponente(sessaoId))" }
    public static func lista(clube: String, inicio: String, fim: String) -> String {
        "/stats/games?clubId=\(codificarComponente(clube))&start_date=\(codificarComponente(inicio))&end_date=\(codificarComponente(fim))"
    }
    public static func atletas(clube: String) -> String { "/athletes?status=active&club_id=\(codificarComponente(clube))" }
    public static func campeonatos(clube: String) -> String { "/competitions?clubId=\(codificarComponente(clube))" }
}

public protocol ApiJogo: Sendable {
    func listarJogos(clubeId: String, inicio: String, fim: String) async throws -> [JogoDaLista]
    func dia(_ sessaoId: String) async throws -> DiaDoJogo
    func jogo(_ sessaoId: String) async throws -> DadosDoJogo
    func atletas(clubeId: String) async throws -> [AtletaResumo]
    func campeonatos(clubeId: String) async throws -> [Campeonato]
    /// POST /api/games/:id com o corpo do editor.
    func salvar(_ sessaoId: String, corpo: Json) async throws
}

public final class ApiJogoHttp: ApiJogo {
    private let api: Api
    private let token: String
    private let workspaceId: String

    public init(api: Api, token: String, workspaceId: String) {
        self.api = api; self.token = token; self.workspaceId = workspaceId
    }

    private func json(_ caminho: String, _ metodo: String = "GET", _ corpo: Json? = nil) async throws -> Json {
        try await api.chamarJson(caminho, metodo: metodo, corpo: corpo, token: token, cabecalhos: [("X-Workspace-Id", workspaceId)])
    }

    public func listarJogos(clubeId: String, inicio: String, fim: String) async throws -> [JogoDaLista] {
        let j = try await json(CaminhosJogo.lista(clube: clubeId, inicio: inicio, fim: fim))
        return try (j["matchesHistory"] ?? .lista([])).decodificar([JogoDaLista].self)
    }

    public func dia(_ sessaoId: String) async throws -> DiaDoJogo { try await json(CaminhosJogo.dia(sessaoId)).decodificar(DiaDoJogo.self) }
    public func jogo(_ sessaoId: String) async throws -> DadosDoJogo { try await json(CaminhosJogo.jogo(sessaoId)).decodificar(DadosDoJogo.self) }

    public func atletas(clubeId: String) async throws -> [AtletaResumo] {
        try listaOuData(try await json(CaminhosJogo.atletas(clube: clubeId))).decodificar([AtletaResumo].self)
    }

    public func campeonatos(clubeId: String) async throws -> [Campeonato] {
        try listaOuData(try await json(CaminhosJogo.campeonatos(clube: clubeId))).decodificar([Campeonato].self)
    }

    public func salvar(_ sessaoId: String, corpo: Json) async throws {
        _ = try await json(CaminhosJogo.jogo(sessaoId), "POST", corpo)
    }
}

// MARK: mensagens

public let MSG_SEM_PERMISSAO_JOGO = "Você não tem permissão para editar jogos. Peça ao responsável pela equipe."
public let MSG_SALVE_ANTES_JOGO = "Salve o jogo antes de exportar: o relatório usa o jogo salvo."
public let MSG_SALVE_ANTES = "Salve o jogo antes de exportar: o PDF usa a convocação salva."
public let MSG_SELECIONE_ANTES = "Selecione jogadores antes de exportar"
public let MSG_ENVIE_ANTES = "Envie as alterações guardadas no aparelho antes de exportar: o PDF usa a convocação salva."
public let MSG_CRIAR_SEM_REDE = "Sem conexão. Para criar um jogo é preciso internet."

/// Texto de erro de uma ESCRITA de jogo: 403 vira o aviso de permissão; só leitura (402) e clube
/// arquivado (409) seguem as frases neutras; 400 (substituição inválida etc.) mostra o do servidor.
public func mensagemErroJogo(_ e: Error) -> String {
    if let erro = e as? ErroApi, erro.status == 403, !ehSomenteLeitura(e) { return MSG_SEM_PERMISSAO_JOGO }
    return mensagemErroTreino(e)
}

// MARK: estado completo da tela (o que se guarda para abrir sem sinal)

/// Tudo o que a tela do Jogo carrega (dia + jogo + plantel + campeonatos).
public struct PacoteJogo: Codable, Equatable, Sendable {
    public var dia: DiaDoJogo
    public var jogo: DadosDoJogo
    public var atletas: [AtletaResumo]
    public var campeonatos: [Campeonato]
    public init(dia: DiaDoJogo, jogo: DadosDoJogo, atletas: [AtletaResumo], campeonatos: [Campeonato]) {
        self.dia = dia; self.jogo = jogo; self.atletas = atletas; self.campeonatos = campeonatos
    }
}

public struct ServicoJogo: Sendable {
    public let api: ApiJogo
    public let clubeId: String
    public let modalidade: String?

    public init(api: ApiJogo, clubeId: String, modalidade: String?) {
        self.api = api; self.clubeId = clubeId; self.modalidade = modalidade
    }

    /// Carrega a tela (4 chamadas em paralelo). Plantel/campeonatos com erro de permissão viram
    /// lista vazia (a escalação ainda abre com quem já está no jogo).
    public func carregar(_ sessaoId: String) async throws -> PacoteJogo {
        async let d = api.dia(sessaoId)
        async let j = api.jogo(sessaoId)
        async let a: [AtletaResumo] = (try? await api.atletas(clubeId: clubeId)) ?? []
        async let c: [Campeonato] = (try? await api.campeonatos(clubeId: clubeId)) ?? []
        return PacoteJogo(dia: try await d, jogo: try await j, atletas: await a, campeonatos: await c)
    }

    /// A "versão" do jogo no servidor, para perceber se ele mudou enquanto o aparelho estava sem
    /// sinal: a assinatura do corpo que o editor montaria com o que está lá agora.
    public func assinaturaNoServidor(_ sessaoId: String) async throws -> String {
        async let d = api.dia(sessaoId)
        async let j = api.jogo(sessaoId)
        return EditorJogo.carregar(dia: try await d, jogo: try await j, modalidade: modalidade).assinaturaServidor
    }
}

extension EditorJogo {
    /// Assinatura para comparar com o servidor: o corpo sem o que só existe no aparelho (nomes e
    /// ids locais), com eventos e jogadores em ordem estável.
    public var assinaturaServidor: String {
        guard case .objeto(var o) = corpoSalvar() else { return "" }
        if case .lista(let ps) = o["players"] {
            o["players"] = .lista(ps.map { p in
                guard case .objeto(var q) = p else { return p }
                q.removeValue(forKey: "name")
                return .objeto(q)
            }.sorted { $0["athlete_id"]?.texto ?? "" < $1["athlete_id"]?.texto ?? "" })
        }
        if case .lista(let es) = o["events"] {
            o["events"] = .lista(es.sorted { $0.textoJson() < $1.textoJson() })
        }
        return Json.objeto(o).textoJson()
    }
}

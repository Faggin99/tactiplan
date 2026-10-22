import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Rotas do WEB que o Elenco, o Staff, as Estatísticas e os Cadastros (T3) chamam com o token do app,
// sempre com X-Workspace-Id. Paridade: dados/elenco/ApiElenco.kt (Android).

/// Cliente comum das rotas do web (token do app + X-Workspace-Id).
public struct ClienteWeb: Sendable {
    public let api: Api
    public let token: String
    public let workspaceId: String
    public let upload: TransporteUpload?
    let fronteira: @Sendable () -> String

    public init(api: Api, token: String, workspaceId: String, upload: TransporteUpload? = nil,
                fronteira: @escaping @Sendable () -> String = { "tactiplan-\(UUID().uuidString)" }) {
        self.api = api; self.token = token; self.workspaceId = workspaceId; self.upload = upload; self.fronteira = fronteira
    }

    var cabecalhos: [(String, String)] { [("X-Workspace-Id", workspaceId)] }

    public func json(_ caminho: String, _ metodo: String = "GET", _ corpo: Json? = nil) async throws -> Json {
        try await api.chamarJson(caminho, metodo: metodo, corpo: corpo, token: token, cabecalhos: cabecalhos)
    }

    /// Multipart com um arquivo (foto do atleta).
    func multipart(_ caminho: String, campo: String, arquivo: ArquivoUpload) async throws -> Json {
        guard let upload, let url = urlHttp(api.base + caminho), valorCabecalhoValido(arquivo.tipo) else { throw ErroApi.offline() }
        let f = fronteira()
        let req = Requisicao(url: url, metodo: "POST", cabecalhos: [
            ("content-type", "multipart/form-data; boundary=\(f)"),
            ("X-Workspace-Id", workspaceId),
            ("authorization", "Bearer \(token)"),
        ], corpo: corpoMultipart(campo: campo, arquivo: arquivo, fronteira: f))
        let resposta: Resposta
        do {
            resposta = try await upload.enviar(req, progresso: { _ in })
        } catch {
            if error is CancellationError || Task.isCancelled { throw CancellationError() }
            throw ErroApi.offline()
        }
        return try respostaOuErro(resposta)
    }
}

public enum CaminhosElenco {
    public static func atletas(clube: String) -> String { "/athletes?club_id=\(codificarComponente(clube))" }
    public static let criar = "/athletes"
    public static func atleta(_ id: String) -> String { "/athletes/\(codificarComponente(id))" }
    public static let grupos = "/athletes/batch-groups"
    public static func foto(_ id: String) -> String { "/athletes/\(codificarComponente(id))/photo" }
    public static let lesoesAtivas = "/injuries/active"
    public static func lesoesDoAtleta(_ id: String) -> String { "/athletes/\(codificarComponente(id))/injuries" }
    public static func lesao(_ id: String) -> String { "/injuries/\(codificarComponente(id))" }
    public static func categorias(clube: String) -> String { "/categories?clubId=\(codificarComponente(clube))" }
}

public protocol ApiElenco: Sendable {
    func atletas(clubeId: String) async throws -> [Atleta]
    func lesoesAtivas() async throws -> [Lesao]
    func lesoes(atletaId: String) async throws -> [Lesao]
    func categorias(clubeId: String) async throws -> [CategoriaCadastro]
    func criarAtleta(_ corpo: Json) async throws -> Atleta
    func atualizarAtleta(_ id: String, _ corpo: Json) async throws -> Atleta
    func removerAtleta(_ id: String) async throws
    func moverGrupo(_ ids: [String], para grupo: String?) async throws
    func enviarFoto(_ atletaId: String, _ arquivo: ArquivoUpload) async throws -> Atleta
    func removerFoto(_ atletaId: String) async throws -> Atleta
    func registrarLesao(_ atletaId: String, _ corpo: Json) async throws -> Lesao
    func darAlta(_ lesaoId: String, hoje: String) async throws
    func removerLesao(_ lesaoId: String) async throws
}

public struct ApiElencoHttp: ApiElenco {
    let web: ClienteWeb
    public init(_ web: ClienteWeb) { self.web = web }

    public func atletas(clubeId: String) async throws -> [Atleta] {
        try listaOuData(try await web.json(CaminhosElenco.atletas(clube: clubeId))).decodificar([Atleta].self)
    }
    public func lesoesAtivas() async throws -> [Lesao] {
        try listaOuData(try await web.json(CaminhosElenco.lesoesAtivas)).decodificar([Lesao].self)
    }
    public func lesoes(atletaId: String) async throws -> [Lesao] {
        try listaOuData(try await web.json(CaminhosElenco.lesoesDoAtleta(atletaId))).decodificar([Lesao].self)
    }
    public func categorias(clubeId: String) async throws -> [CategoriaCadastro] {
        try listaOuData(try await web.json(CaminhosElenco.categorias(clube: clubeId))).decodificar([CategoriaCadastro].self)
    }
    public func criarAtleta(_ corpo: Json) async throws -> Atleta {
        try await web.json(CaminhosElenco.criar, "POST", corpo).decodificar(Atleta.self)
    }
    public func atualizarAtleta(_ id: String, _ corpo: Json) async throws -> Atleta {
        try await web.json(CaminhosElenco.atleta(id), "PUT", corpo).decodificar(Atleta.self)
    }
    public func removerAtleta(_ id: String) async throws { _ = try await web.json(CaminhosElenco.atleta(id), "DELETE") }
    public func moverGrupo(_ ids: [String], para grupo: String?) async throws {
        _ = try await web.json(CaminhosElenco.grupos, "PUT", corpoMoverGrupo(ids, para: grupo))
    }
    public func enviarFoto(_ atletaId: String, _ arquivo: ArquivoUpload) async throws -> Atleta {
        try await web.multipart(CaminhosElenco.foto(atletaId), campo: CAMPO_FOTO_ATLETA, arquivo: arquivo).decodificar(Atleta.self)
    }
    public func removerFoto(_ atletaId: String) async throws -> Atleta {
        try await web.json(CaminhosElenco.foto(atletaId), "DELETE").decodificar(Atleta.self)
    }
    public func registrarLesao(_ atletaId: String, _ corpo: Json) async throws -> Lesao {
        try await web.json(CaminhosElenco.lesoesDoAtleta(atletaId), "POST", corpo).decodificar(Lesao.self)
    }
    public func darAlta(_ lesaoId: String, hoje: String) async throws {
        _ = try await web.json(CaminhosElenco.lesao(lesaoId), "PUT", ["resolved_at": .texto(hoje)])
    }
    public func removerLesao(_ lesaoId: String) async throws { _ = try await web.json(CaminhosElenco.lesao(lesaoId), "DELETE") }
}

/// O que a aba Elenco carrega: atletas do clube, lesões ativas e categorias (só para o filtro).
public struct PacoteElenco: Equatable, Sendable {
    public var atletas: [Atleta]
    public var lesoesAtivas: [Lesao]
    public var categorias: [CategoriaCadastro]
    public init(atletas: [Atleta], lesoesAtivas: [Lesao] = [], categorias: [CategoriaCadastro] = []) {
        self.atletas = atletas; self.lesoesAtivas = lesoesAtivas; self.categorias = categorias
    }
}

public struct ServicoElenco: Sendable {
    public let api: ApiElenco
    public let clubeId: String
    public init(api: ApiElenco, clubeId: String) { self.api = api; self.clubeId = clubeId }

    /// Atletas (obrigatório) + lesões ativas e categorias (erro vira lista vazia).
    public func carregar() async throws -> PacoteElenco {
        async let a = api.atletas(clubeId: clubeId)
        async let l: [Lesao] = (try? await api.lesoesAtivas()) ?? []
        async let c: [CategoriaCadastro] = (try? await api.categorias(clubeId: clubeId)) ?? []
        let atletas = try await a
        let ids = Set(atletas.map(\.id))
        return PacoteElenco(atletas: atletas, lesoesAtivas: (await l).filter { ids.contains($0.atletaId ?? "") }, categorias: await c)
    }

    /// Salva (cria ou atualiza) e, se veio foto nova, sobe a foto DEPOIS (o atleta novo ainda não
    /// tinha id). Devolve o atleta como ficou no servidor.
    public func salvar(_ a: Atleta, novo: Bool, foto: ArquivoUpload?) async throws -> Atleta {
        if let e = erroAtleta(nome: a.nome, posicao: a.posicao, camisa: a.camisa, altura: a.alturaCm) {
            throw ErroApi(status: 0, codigo: "VALIDACAO", mensagem: e)
        }
        if let foto, foto.dados.count > TAMANHO_MAX_FOTO { throw ErroApi(status: 0, codigo: "VALIDACAO", mensagem: MSG_FOTO_GRANDE) }
        let corpo = corpoAtleta(a, clubeId: clubeId)
        var salvo = novo ? try await api.criarAtleta(corpo) : try await api.atualizarAtleta(a.id, corpo)
        if let foto { salvo = try await api.enviarFoto(salvo.id, foto) }
        return salvo
    }

    public func registrarLesao(_ atletaId: String, tipo: String, local: String?, gravidade: String?, inicio: String?,
                               retornoPrevisto: String?, notas: String?, hoje: String) async throws -> Lesao {
        if let e = erroLesao(tipo: tipo) { throw ErroApi(status: 0, codigo: "VALIDACAO", mensagem: e) }
        return try await api.registrarLesao(atletaId, corpoLesao(tipo: tipo, local: local, gravidade: gravidade, inicio: inicio,
                                                                 retornoPrevisto: retornoPrevisto, notas: notas, hoje: hoje))
    }
}

/// Corpo do PDF do plantel (POST /api/reports/plantel).
public func corpoPdfPlantel(clubeId: String) -> [String: Json] { ["club_id": .texto(clubeId)] }

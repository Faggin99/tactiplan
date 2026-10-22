import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// As rotas de TREINO do web que o app chama com o token dele (T1): nada de BFF duplicando regra.
// Toda chamada leva `X-Workspace-Id` (a conta escolhida no "Onde entrar"): o servidor confere o
// acesso e aplica só leitura (402), clube arquivado (409) e permissões (403) iguais ao web.
// Paridade: dados/treino/ApiTreino.kt (Android).

/// Caminhos (um lugar só, testados).
public enum CaminhosTreino {
    public static func microciclo(_ semana: String, clube: String) -> String {
        "/microcycles?week=\(codificarComponente(semana))&club_id=\(codificarComponente(clube))"
    }
    public static let garantir = "/microcycles/ensure"
    public static let conteudos = "/contents"
    public static func etapas(_ modalidade: String?) -> String {
        guard let m = modalidade, !m.isEmpty else { return "/stages" }
        return "/stages?modality=\(codificarComponente(m))"
    }
    public static let titulos = "/titles"
    public static let atividades = "/activities"
    public static func atividade(_ id: String) -> String { "/activities/\(codificarComponente(id))" }
    public static func atividadeDoBloco(_ blocoId: String) -> String { "/activities/block/\(codificarComponente(blocoId))" }
    public static func tipoDoDia(_ id: String) -> String { "/sessions/\(codificarComponente(id))/type" }
    public static func distancia(_ id: String) -> String { "/sessions/\(codificarComponente(id))/distance" }
    public static func periodos(_ id: String) -> String { "/sessions/\(codificarComponente(id))/periodos" }
    public static func periodo(_ id: String) -> String { "/sessions/\(codificarComponente(id))/periodo" }
    public static func anexosDoDia(_ id: String) -> String { "/files/session/\(codificarComponente(id))" }
    public static let enviarAnexo = "/files/upload"
    public static func anexo(_ id: String) -> String { "/files/\(codificarComponente(id))" }
    public static func relatorio(_ tipo: String) -> String { "/reports/\(codificarComponente(tipo))" }
    public static func tema(_ mes: String, clube: String) -> String {
        "/themes/adherence?month=\(codificarComponente(mes))&club_id=\(codificarComponente(clube))"
    }
}

/// Campo do arquivo no POST /api/files/upload (multer `uploadSessionFile.single('file')`).
public let CAMPO_ANEXO = "file"
/// Tempo máximo de um upload / de um PDF (s). As chamadas JSON seguem com 15 s.
public let TIMEOUT_UPLOAD_S: TimeInterval = 120
public let TIMEOUT_RELATORIO_S: TimeInterval = 90

/// Arquivo pronto para subir (foto já reduzida no aparelho).
public struct ArquivoUpload: Sendable, Equatable {
    public let nome: String
    public let tipo: String
    public let dados: Data
    public init(nome: String, tipo: String, dados: Data) { self.nome = nome; self.tipo = tipo; self.dados = dados }
}

/// Quem sobe o multipart contando o progresso (0…1). No iPhone, a URLSession com delegate
/// (app); nos testes, um falso. Qualquer erro lançado vira OFFLINE.
public protocol TransporteUpload: Sendable {
    func enviar(_ requisicao: Requisicao, progresso: @escaping @Sendable (Double) -> Void) async throws -> Resposta
}

// Aspas e quebras de linha no nome/campo viram %22/%0D/%0A (como o OkHttp e os navegadores).
private func escaparParte(_ s: String) -> String {
    s.replacingOccurrences(of: "\"", with: "%22")
        .replacingOccurrences(of: "\r", with: "%0D")
        .replacingOccurrences(of: "\n", with: "%0A")
}

/// Corpo multipart/form-data: os campos de texto e, por último, o arquivo (copiado do Gestsport).
public func corpoMultipart(campo: String, arquivo: ArquivoUpload, fronteira: String, campos: [(String, String)] = []) -> Data {
    var d = Data()
    for (nome, valor) in campos {
        d.append(Data("--\(fronteira)\r\n".utf8))
        d.append(Data("Content-Disposition: form-data; name=\"\(escaparParte(nome))\"\r\n\r\n".utf8))
        d.append(Data(valor.utf8))
        d.append(Data("\r\n".utf8))
    }
    d.append(Data("--\(fronteira)\r\n".utf8))
    d.append(Data("Content-Disposition: form-data; name=\"\(escaparParte(campo))\"; filename=\"\(escaparParte(arquivo.nome))\"\r\n".utf8))
    d.append(Data("Content-Type: \(arquivo.tipo)\r\n\r\n".utf8))
    d.append(arquivo.dados)
    d.append(Data("\r\n--\(fronteira)--\r\n".utf8))
    return d
}

/// Lista de fotos do relatório (formato 'fotos' do POST /api/reports/:tipo).
public struct FotoRelatorio: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var data: String?
    public var dia: String?
    public var dd: String?
    public var titulo: String?
    public var origem: String?
    /// Miniatura em data URI (JPEG base64).
    public var thumb: String?
    /// Período da foto no dia com 2+ períodos ("manha"…; nil = período único).
    public var periodo: String?
    public var periodoRotulo: String?

    public init(id: String, data: String? = nil, dia: String? = nil, dd: String? = nil, titulo: String? = nil,
                origem: String? = nil, thumb: String? = nil, periodo: String? = nil, periodoRotulo: String? = nil) {
        self.id = id; self.data = data; self.dia = dia; self.dd = dd; self.titulo = titulo; self.origem = origem; self.thumb = thumb
        self.periodo = periodo; self.periodoRotulo = periodoRotulo
    }

    enum CodingKeys: String, CodingKey { case id, data = "date", dia, dd, titulo, origem, thumb, periodo, periodoRotulo }
}

public struct ListaFotosRelatorio: Codable, Equatable, Sendable {
    public struct Padrao: Codable, Equatable, Sendable {
        public var ids: [String]?
        public var layout: String?
        public var proporcao: String?
        public init(ids: [String]? = nil, layout: String? = nil, proporcao: String? = nil) {
            self.ids = ids; self.layout = layout; self.proporcao = proporcao
        }
    }
    public var fotos: [FotoRelatorio]
    public var total: Int?
    public var semana: Bool?
    public var limite: Int?
    public var padrao: Padrao?

    public init(fotos: [FotoRelatorio], total: Int? = nil, semana: Bool? = nil, limite: Int? = nil, padrao: Padrao? = nil) {
        self.fotos = fotos; self.total = total; self.semana = semana; self.limite = limite; self.padrao = padrao
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        fotos = (try? c.decodeIfPresent([FotoRelatorio].self, forKey: .fotos)) ?? []
        total = try? c.decodeIfPresent(Int.self, forKey: .total)
        semana = try? c.decodeIfPresent(Bool.self, forKey: .semana)
        limite = try? c.decodeIfPresent(Int.self, forKey: .limite)
        padrao = try? c.decodeIfPresent(Padrao.self, forKey: .padrao)
    }

    enum CodingKeys: String, CodingKey { case fotos, total, semana, limite, padrao }
}

/// As chamadas de treino (atrás de protocolo: o `ServicoTreino` e os testes só conhecem isto).
public protocol ApiTreino: Sendable {
    func microciclo(semana: String, clubeId: String) async throws -> Microciclo?
    func garantirMicrociclo(semana: String, clubeId: String) async throws -> Microciclo
    func cadastros(modalidade: String?) async throws -> CadastrosTreino
    func criarTitulo(titulo: String, conteudoId: String, descricao: String?) async throws -> TituloCadastro
    func anexosDoDia(_ diaId: String) async throws -> [Anexo]
    func criarAtividade(_ corpo: Json) async throws -> String
    func atualizarAtividade(_ id: String, _ corpo: Json) async throws
    func apagarAtividadeDoBloco(_ blocoId: String) async throws
    func mudarTipo(_ diaId: String, tipo: TipoDia, adversario: String?) async throws
    func mudarDistancia(_ diaId: String, km: Double?) async throws
    /// POST /api/sessions/:id/periodos — `atual` só no dia de 1 período. Devolve o id do novo.
    func adicionarPeriodo(_ diaId: String, novo: Periodo, atual: Periodo?) async throws -> String
    /// DELETE /api/sessions/:id/periodo — devolve quantos anexos foram apagados.
    func removerPeriodo(_ periodoId: String) async throws -> Int
    /// PUT /api/sessions/:id/periodo — troca o horário (Manhã/Tarde/Noite) do período.
    func trocarPeriodo(_ periodoId: String, para: Periodo) async throws
    func enviarAnexo(atividadeId: String, arquivo: ArquivoUpload, titulo: String,
                     progresso: @escaping @Sendable (Double) -> Void) async throws -> Anexo
    func renomearAnexo(_ id: String, titulo: String) async throws -> Anexo
    func apagarAnexo(_ id: String) async throws
    func temaDoMes(mes: String, clubeId: String) async throws -> TemaDoMes
    /// POST /api/reports/:tipo com `formato` 'fotos'.
    func fotosDoRelatorio(_ tipo: String, corpo: [String: Json]) async throws -> ListaFotosRelatorio
    /// POST /api/reports/:tipo com `formato` 'html' (prévia das fotos) ou 'visualizar' (ficha na tela).
    func htmlDoRelatorio(_ tipo: String, corpo: [String: Json]) async throws -> String
    /// POST /api/reports/:tipo → PDF.
    func pdfDoRelatorio(_ tipo: String, corpo: [String: Json]) async throws -> Data
}

/// O de verdade, sobre o [Api]. `token`/`workspaceId` da sessão em uso.
public final class ApiTreinoHttp: ApiTreino {
    private let api: Api
    private let relatorios: Api
    private let upload: TransporteUpload?
    private let token: String
    private let workspaceId: String
    private let fronteira: @Sendable () -> String

    public init(api: Api, relatorios: Api? = nil, upload: TransporteUpload?, token: String, workspaceId: String,
                fronteira: @escaping @Sendable () -> String = { "tactiplan-\(UUID().uuidString)" }) {
        self.api = api
        self.relatorios = relatorios ?? api
        self.upload = upload
        self.token = token
        self.workspaceId = workspaceId
        self.fronteira = fronteira
    }

    private var cabecalhos: [(String, String)] { [("X-Workspace-Id", workspaceId)] }

    private func json(_ caminho: String, _ metodo: String = "GET", _ corpo: Json? = nil) async throws -> Json {
        try await api.chamarJson(caminho, metodo: metodo, corpo: corpo, token: token, cabecalhos: cabecalhos)
    }

    public func microciclo(semana: String, clubeId: String) async throws -> Microciclo? {
        let j = try await json(CaminhosTreino.microciclo(semana, clube: clubeId))
        if case .nulo = j { return nil }
        if j.objeto?.isEmpty ?? false { return nil }
        return try j.decodificar(Microciclo.self)
    }

    public func garantirMicrociclo(semana: String, clubeId: String) async throws -> Microciclo {
        try await json(CaminhosTreino.garantir, "POST", ["week": .texto(semana), "club_id": .texto(clubeId)])
            .decodificar(Microciclo.self)
    }

    public func cadastros(modalidade: String?) async throws -> CadastrosTreino {
        async let c = json(CaminhosTreino.conteudos)
        async let e = json(CaminhosTreino.etapas(modalidade))
        async let t = json(CaminhosTreino.titulos)
        return CadastrosTreino(
            conteudos: try listaOuData(try await c).decodificar([ConteudoCadastro].self),
            etapas: try listaOuData(try await e).decodificar([EtapaCadastro].self),
            titulos: try listaOuData(try await t).decodificar([TituloCadastro].self))
    }

    public func criarTitulo(titulo: String, conteudoId: String, descricao: String?) async throws -> TituloCadastro {
        var corpo: [String: Json] = ["title": .texto(titulo), "content_id": .texto(conteudoId)]
        if let d = descricao, !d.isEmpty { corpo["description"] = .texto(d) }
        return try await json(CaminhosTreino.titulos, "POST", .objeto(corpo)).decodificar(TituloCadastro.self)
    }

    public func anexosDoDia(_ diaId: String) async throws -> [Anexo] {
        try listaOuData(try await json(CaminhosTreino.anexosDoDia(diaId))).decodificar([Anexo].self)
    }

    public func criarAtividade(_ corpo: Json) async throws -> String {
        let j = try await json(CaminhosTreino.atividades, "POST", corpo)
        guard let id = j["id"]?.texto else { throw ErroApi(status: 0, codigo: nil, mensagem: ErroApi.MSG_FALHA) }
        return id
    }

    public func atualizarAtividade(_ id: String, _ corpo: Json) async throws {
        _ = try await json(CaminhosTreino.atividade(id), "PUT", corpo)
    }

    public func apagarAtividadeDoBloco(_ blocoId: String) async throws {
        _ = try await json(CaminhosTreino.atividadeDoBloco(blocoId), "DELETE")
    }

    public func mudarTipo(_ diaId: String, tipo: TipoDia, adversario: String?) async throws {
        let a = (adversario ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        _ = try await json(CaminhosTreino.tipoDoDia(diaId), "PUT", [
            "session_type": .texto(tipo.rawValue),
            "opponent_name": tipo == .jogo && !a.isEmpty ? .texto(a) : .nulo,
        ])
    }

    public func mudarDistancia(_ diaId: String, km: Double?) async throws {
        _ = try await json(CaminhosTreino.distancia(diaId), "PUT", ["avg_distance_km": km.map { .numero($0) } ?? .nulo])
    }

    public func adicionarPeriodo(_ diaId: String, novo: Periodo, atual: Periodo?) async throws -> String {
        var corpo: [String: Json] = ["novo": .texto(novo.rawValue)]
        if let atual { corpo["atual"] = .texto(atual.rawValue) }
        let j = try await json(CaminhosTreino.periodos(diaId), "POST", .objeto(corpo))
        guard let id = j["id"]?.texto else { throw ErroApi(status: 0, codigo: nil, mensagem: ErroApi.MSG_FALHA) }
        return id
    }

    public func trocarPeriodo(_ periodoId: String, para: Periodo) async throws {
        _ = try await json(CaminhosTreino.periodo(periodoId), "PUT", ["periodo": .texto(para.rawValue)])
    }

    public func removerPeriodo(_ periodoId: String) async throws -> Int {
        let j = try await json(CaminhosTreino.periodo(periodoId), "DELETE")
        if case .numero(let n)? = j["anexos_apagados"] { return Int(n) }
        return 0
    }

    public func enviarAnexo(atividadeId: String, arquivo: ArquivoUpload, titulo: String,
                            progresso: @escaping @Sendable (Double) -> Void) async throws -> Anexo {
        guard let upload, let req = montarUpload(atividadeId: atividadeId, arquivo: arquivo, titulo: titulo) else {
            throw ErroApi.offline()
        }
        let resposta: Resposta
        do {
            resposta = try await upload.enviar(req, progresso: progresso)
        } catch {
            if error is CancellationError || Task.isCancelled { throw CancellationError() }
            throw ErroApi.offline()
        }
        return try respostaOuErro(resposta).decodificar(Anexo.self)
    }

    /// O multipart do anexo: activity_id e title antes do arquivo (o multer lê os campos na ordem).
    func montarUpload(atividadeId: String, arquivo: ArquivoUpload, titulo: String) -> Requisicao? {
        guard let url = urlHttp(api.base + CaminhosTreino.enviarAnexo), valorCabecalhoValido(arquivo.tipo) else { return nil }
        let f = fronteira()
        let hs: [(nome: String, valor: String)] = [
            ("content-type", "multipart/form-data; boundary=\(f)"),
            ("X-Workspace-Id", workspaceId),
            ("authorization", "Bearer \(token)"),
        ]
        guard hs.allSatisfy({ valorCabecalhoValido($0.valor) }) else { return nil }
        return Requisicao(url: url, metodo: "POST", cabecalhos: hs, corpo: corpoMultipart(
            campo: CAMPO_ANEXO, arquivo: arquivo, fronteira: f,
            campos: [("activity_id", atividadeId), ("title", titulo)]))
    }

    public func renomearAnexo(_ id: String, titulo: String) async throws -> Anexo {
        try await json(CaminhosTreino.anexo(id), "PATCH", ["title": .texto(titulo)]).decodificar(Anexo.self)
    }

    public func apagarAnexo(_ id: String) async throws {
        _ = try await json(CaminhosTreino.anexo(id), "DELETE")
    }

    public func temaDoMes(mes: String, clubeId: String) async throws -> TemaDoMes {
        try await json(CaminhosTreino.tema(mes, clube: clubeId)).decodificar(TemaDoMes.self)
    }

    public func fotosDoRelatorio(_ tipo: String, corpo: [String: Json]) async throws -> ListaFotosRelatorio {
        var c = corpo
        c["formato"] = "fotos"
        return try await relatorios.chamarJson(CaminhosTreino.relatorio(tipo), metodo: "POST", corpo: .objeto(c),
                                               token: token, cabecalhos: cabecalhos).decodificar(ListaFotosRelatorio.self)
    }

    public func htmlDoRelatorio(_ tipo: String, corpo: [String: Json]) async throws -> String {
        let j = try await relatorios.chamarJson(CaminhosTreino.relatorio(tipo), metodo: "POST", corpo: .objeto(corpo),
                                                token: token, cabecalhos: cabecalhos)
        return j["html"]?.texto ?? ""
    }

    public func pdfDoRelatorio(_ tipo: String, corpo: [String: Json]) async throws -> Data {
        var c = corpo
        c.removeValue(forKey: "formato")
        let d = try await relatorios.chamarDados(CaminhosTreino.relatorio(tipo), metodo: "POST", corpo: .objeto(c),
                                                 token: token, cabecalhos: cabecalhos)
        guard d.count > 4, d.prefix(4) == Data("%PDF".utf8) else {
            throw ErroApi(status: 0, codigo: nil, mensagem: MSG_PDF_FALHOU)
        }
        return d
    }
}

public let MSG_PDF_FALHOU = "Não foi possível gerar o PDF agora. Tente de novo."

/// Algumas rotas antigas embrulham a lista em `{ data: [...] }`; as de treino devolvem a lista.
func listaOuData(_ j: Json) -> Json {
    if case .lista = j { return j }
    if let d = j["data"], case .lista = d { return d }
    return .lista([])
}

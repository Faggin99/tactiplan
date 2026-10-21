import Foundation

// Contrato das rotas de TREINO do web, que o app usa com o próprio token (T1: o authMiddleware
// aceita o token do app). Os nomes no JSON são os do banco (snake_case): GET /api/microcycles,
// POST /api/microcycles/ensure, /api/contents, /api/stages, /api/titles, /api/files.
// Tudo opcional e tolerante: campo novo nunca quebra o app; número pode vir como texto
// (o pg devolve NUMERIC como "5.20"). Paridade: dados/treino/Treino.kt (Android).

/// Número que o servidor manda como número OU como texto ("5.20", "8229"). Vazio/inválido = nil.
public struct NumeroFlex: Codable, Equatable, Hashable, Sendable {
    public var valor: Double
    public init(_ valor: Double) { self.valor = valor }

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) { valor = d; return }
        if let s = try? c.decode(String.self), let d = Double(s.trimmingCharacters(in: .whitespaces)) { valor = d; return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "número inválido")
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(valor)
    }
}

extension KeyedDecodingContainer {
    /// Número opcional tolerante: ausente, null, "" ou lixo → nil (nunca derruba a tela).
    func numeroFlex(_ chave: Key) -> Double? {
        (try? decodeIfPresent(NumeroFlex.self, forKey: chave))?.valor
    }
}

/// Conteúdo de uma atividade (training_activity_contents + contents).
public struct ConteudoDaAtividade: Codable, Equatable, Sendable {
    public var id: String?
    public var nome: String?
    public var abreviacao: String?
    /// "tatico" | "fisico" | "tecnico" | "mental"
    public var dimensao: String?
    public var conteudoId: String?

    public init(id: String?, nome: String?, abreviacao: String? = nil, dimensao: String?, conteudoId: String? = nil) {
        self.id = id; self.nome = nome; self.abreviacao = abreviacao; self.dimensao = dimensao; self.conteudoId = conteudoId
    }

    enum CodingKeys: String, CodingKey {
        case id, nome = "name", abreviacao = "abbreviation", dimensao = "dimension", conteudoId = "content_id"
    }
}

/// Submomento marcado numa atividade (training_activity_stages).
public struct EtapaDaAtividade: Codable, Equatable, Sendable {
    public var id: String?
    public var stageId: String?
    public var nome: String?
    public var ordem: Int?

    public init(id: String? = nil, stageId: String?, nome: String?, ordem: Int? = nil) {
        self.id = id; self.stageId = stageId; self.nome = nome; self.ordem = ordem
    }

    enum CodingKeys: String, CodingKey { case id, stageId = "stage_id", nome = "stage_name", ordem = "order" }
}

/// A atividade de um bloco (no web, UMA por bloco).
public struct Atividade: Codable, Equatable, Sendable {
    public var id: String
    public var blocoId: String?
    public var tituloId: String?
    public var tituloNome: String?
    public var descricao: String?
    public var grupos: [String]?
    public var minutos: Int?
    public var anexos: Int?
    public var conteudos: [ConteudoDaAtividade]?
    public var etapas: [EtapaDaAtividade]?

    public init(id: String, blocoId: String? = nil, tituloId: String? = nil, tituloNome: String? = nil, descricao: String? = nil,
                grupos: [String]? = nil, minutos: Int? = nil, anexos: Int? = nil,
                conteudos: [ConteudoDaAtividade]? = nil, etapas: [EtapaDaAtividade]? = nil) {
        self.id = id; self.blocoId = blocoId; self.tituloId = tituloId; self.tituloNome = tituloNome; self.descricao = descricao
        self.grupos = grupos; self.minutos = minutos; self.anexos = anexos; self.conteudos = conteudos; self.etapas = etapas
    }

    enum CodingKeys: String, CodingKey {
        case id, blocoId = "block_id", tituloId = "title_id", tituloNome = "title_name", descricao = "description"
        case grupos = "groups", minutos = "duration_minutes", anexos = "files_count"
        case conteudos = "contents", etapas = "stages"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        blocoId = try? c.decodeIfPresent(String.self, forKey: .blocoId)
        tituloId = try? c.decodeIfPresent(String.self, forKey: .tituloId)
        tituloNome = try? c.decodeIfPresent(String.self, forKey: .tituloNome)
        descricao = try? c.decodeIfPresent(String.self, forKey: .descricao)
        grupos = try? c.decodeIfPresent([String].self, forKey: .grupos)
        minutos = c.numeroFlex(.minutos).map { Int($0) }
        anexos = c.numeroFlex(.anexos).map { Int($0) }
        conteudos = try? c.decodeIfPresent([ConteudoDaAtividade].self, forKey: .conteudos)
        etapas = try? c.decodeIfPresent([EtapaDaAtividade].self, forKey: .etapas)
    }

    /// Pilar da atividade (dimensão do 1º conteúdo).
    public var pilar: String? { conteudos?.compactMap(\.dimensao).first }
}

/// Bloco do dia (Aquecimento, Preparatório, Atividade 1–3, Complementos). `id` nil = ainda não
/// existe no banco (semana que ninguém abriu para editar).
public struct Bloco: Codable, Equatable, Sendable {
    public var id: String?
    public var nome: String
    public var ordem: Int
    public var atividade: Atividade?

    public init(id: String? = nil, nome: String, ordem: Int, atividade: Atividade? = nil) {
        self.id = id; self.nome = nome; self.ordem = ordem; self.atividade = atividade
    }

    enum CodingKeys: String, CodingKey { case id, nome = "name", ordem = "order", atividade = "activity" }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decodeIfPresent(String.self, forKey: .id)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        ordem = c.numeroFlex(.ordem).map { Int($0) } ?? 0
        atividade = try? c.decodeIfPresent(Atividade.self, forKey: .atividade)
    }
}

/// Tipo do dia (training_sessions.session_type). nil no banco = treino.
public enum TipoDia: String, Codable, Equatable, Sendable, CaseIterable {
    case treino = "training"
    case jogo = "match"
    case descanso = "rest"

    public static func de(_ s: String?) -> TipoDia { TipoDia(rawValue: s ?? "") ?? .treino }

    public var rotulo: String {
        switch self {
        case .treino: return "Treino"
        case .jogo: return "Jogo"
        case .descanso: return "Descanso"
        }
    }
}

/// Um dia (sessão de treino). `id` nil = dia ainda não criado no banco.
public struct Dia: Codable, Equatable, Sendable {
    public var id: String?
    /// "YYYY-MM-DD"
    public var data: String
    public var nomeDia: String?
    /// 1 = segunda … 7 = domingo
    public var diaDaSemana: Int
    public var tipoBruto: String?
    public var adversario: String?
    public var distanciaKm: Double?
    public var blocos: [Bloco]

    public init(id: String? = nil, data: String, nomeDia: String? = nil, diaDaSemana: Int, tipoBruto: String? = nil,
                adversario: String? = nil, distanciaKm: Double? = nil, blocos: [Bloco] = []) {
        self.id = id; self.data = data; self.nomeDia = nomeDia; self.diaDaSemana = diaDaSemana; self.tipoBruto = tipoBruto
        self.adversario = adversario; self.distanciaKm = distanciaKm; self.blocos = blocos
    }

    enum CodingKeys: String, CodingKey {
        case id, data = "date", nomeDia = "day_name", diaDaSemana = "day_of_week", tipoBruto = "session_type"
        case adversario = "opponent_name", distanciaKm = "avg_distance_km", blocos = "blocks"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try? c.decodeIfPresent(String.self, forKey: .id)
        // "2026-10-21" (ou "2026-10-21T00:00:00.000Z" de um pg sem parser de DATE)
        data = String(((try? c.decodeIfPresent(String.self, forKey: .data)) ?? "").prefix(10))
        nomeDia = try? c.decodeIfPresent(String.self, forKey: .nomeDia)
        diaDaSemana = c.numeroFlex(.diaDaSemana).map { Int($0) } ?? 0
        tipoBruto = try? c.decodeIfPresent(String.self, forKey: .tipoBruto)
        adversario = try? c.decodeIfPresent(String.self, forKey: .adversario)
        distanciaKm = c.numeroFlex(.distanciaKm)
        blocos = ((try? c.decodeIfPresent([Bloco].self, forKey: .blocos)) ?? []).sorted { $0.ordem < $1.ordem }
    }

    public var tipo: TipoDia { TipoDia.de(tipoBruto) }
}

/// Microciclo (a semana) de um clube. GET /api/microcycles devolve `null` quando a semana nunca
/// foi aberta para editar.
public struct Microciclo: Codable, Equatable, Sendable {
    public var id: String
    public var semana: String?
    public var inicio: String?
    public var fim: String?
    public var dias: [Dia]

    public init(id: String, semana: String? = nil, inicio: String? = nil, fim: String? = nil, dias: [Dia] = []) {
        self.id = id; self.semana = semana; self.inicio = inicio; self.fim = fim; self.dias = dias
    }

    enum CodingKeys: String, CodingKey {
        case id, semana = "week_identifier", inicio = "start_date", fim = "end_date", dias = "sessions"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        semana = try? c.decodeIfPresent(String.self, forKey: .semana)
        inicio = (try? c.decodeIfPresent(String.self, forKey: .inicio)).map { String($0.prefix(10)) }
        fim = (try? c.decodeIfPresent(String.self, forKey: .fim)).map { String($0.prefix(10)) }
        dias = ((try? c.decodeIfPresent([Dia].self, forKey: .dias)) ?? []).sorted { $0.data < $1.data }
    }
}

// MARK: cadastros (biblioteca da conta)

/// Conteúdo cadastrado (GET /api/contents). Filtrado pelo pilar (dimensão) no formulário.
public struct ConteudoCadastro: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var nome: String
    public var abreviacao: String?
    public var dimensao: String?
    public var ativo: Bool?

    public init(id: String, nome: String, abreviacao: String? = nil, dimensao: String?, ativo: Bool? = true) {
        self.id = id; self.nome = nome; self.abreviacao = abreviacao; self.dimensao = dimensao; self.ativo = ativo
    }

    enum CodingKeys: String, CodingKey { case id, nome = "name", abreviacao = "abbreviation", dimensao = "dimension", ativo = "active" }
}

/// Submomento cadastrado (GET /api/stages?modality=…), de um conteúdo.
public struct EtapaCadastro: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var nome: String
    public var conteudoId: String?
    public var conteudoNome: String?
    public var ordem: Int?
    public var ativo: Bool?

    public init(id: String, nome: String, conteudoId: String?, conteudoNome: String? = nil, ordem: Int? = nil, ativo: Bool? = true) {
        self.id = id; self.nome = nome; self.conteudoId = conteudoId; self.conteudoNome = conteudoNome; self.ordem = ordem; self.ativo = ativo
    }

    enum CodingKeys: String, CodingKey {
        case id, nome = "name", conteudoId = "content_id", conteudoNome = "content_name", ordem = "display_order", ativo = "active"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        conteudoId = try? c.decodeIfPresent(String.self, forKey: .conteudoId)
        conteudoNome = try? c.decodeIfPresent(String.self, forKey: .conteudoNome)
        ordem = c.numeroFlex(.ordem).map { Int($0) }
        ativo = try? c.decodeIfPresent(Bool.self, forKey: .ativo)
    }
}

/// Atividade da biblioteca (activity_titles): o "título" que se escolhe no bloco.
public struct TituloCadastro: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var titulo: String
    public var conteudoId: String?
    public var descricao: String?
    public var arquivado: Bool?

    public init(id: String, titulo: String, conteudoId: String?, descricao: String? = nil, arquivado: Bool? = false) {
        self.id = id; self.titulo = titulo; self.conteudoId = conteudoId; self.descricao = descricao; self.arquivado = arquivado
    }

    enum CodingKeys: String, CodingKey {
        case id, titulo = "title", conteudoId = "content_id", descricao = "description", arquivado = "is_archived"
    }
}

/// Os cadastros que o formulário de atividade usa (carregados juntos ao abrir).
public struct CadastrosTreino: Equatable, Sendable {
    public var conteudos: [ConteudoCadastro]
    public var etapas: [EtapaCadastro]
    public var titulos: [TituloCadastro]

    public init(conteudos: [ConteudoCadastro] = [], etapas: [EtapaCadastro] = [], titulos: [TituloCadastro] = []) {
        // Igual ao web: inativos ficam de fora da escolha.
        self.conteudos = conteudos.filter { $0.ativo != false }
        self.etapas = etapas.filter { $0.ativo != false }
        self.titulos = titulos.filter { $0.arquivado != true }
    }
}

// MARK: anexos

/// Anexo de uma atividade (training_activity_files).
public struct Anexo: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var atividadeId: String?
    public var blocoId: String?
    public var titulo: String?
    public var nomeArquivo: String?
    public var caminho: String?
    public var tipo: String?
    public var tamanho: Int?

    public init(id: String, atividadeId: String?, blocoId: String? = nil, titulo: String?, nomeArquivo: String? = nil,
                caminho: String?, tipo: String?, tamanho: Int? = nil) {
        self.id = id; self.atividadeId = atividadeId; self.blocoId = blocoId; self.titulo = titulo
        self.nomeArquivo = nomeArquivo; self.caminho = caminho; self.tipo = tipo; self.tamanho = tamanho
    }

    enum CodingKeys: String, CodingKey {
        case id, atividadeId = "activity_id", blocoId = "block_id", titulo = "title", nomeArquivo = "file_name"
        case url, caminho = "file_path", tipo = "mime_type", tamanho = "file_size"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        atividadeId = try? c.decodeIfPresent(String.self, forKey: .atividadeId)
        blocoId = try? c.decodeIfPresent(String.self, forKey: .blocoId)
        titulo = try? c.decodeIfPresent(String.self, forKey: .titulo)
        nomeArquivo = try? c.decodeIfPresent(String.self, forKey: .nomeArquivo)
        let url = try? c.decodeIfPresent(String.self, forKey: .url)
        let caminho = try? c.decodeIfPresent(String.self, forKey: .caminho)
        self.caminho = url ?? caminho
        tipo = try? c.decodeIfPresent(String.self, forKey: .tipo)
        tamanho = c.numeroFlex(.tamanho).map { Int($0) }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encodeIfPresent(atividadeId, forKey: .atividadeId)
        try c.encodeIfPresent(blocoId, forKey: .blocoId)
        try c.encodeIfPresent(titulo, forKey: .titulo)
        try c.encodeIfPresent(nomeArquivo, forKey: .nomeArquivo)
        try c.encodeIfPresent(caminho, forKey: .caminho)
        try c.encodeIfPresent(tipo, forKey: .tipo)
        try c.encodeIfPresent(tamanho, forKey: .tamanho)
    }

    public var especie: EspecieAnexo { especieDoAnexo(tipo: tipo, nome: nomeArquivo ?? caminho) }
    /// Título para a tela (o do usuário; sem título, o nome do arquivo).
    public var rotulo: String {
        let t = (titulo ?? "").trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? (nomeArquivo ?? "Anexo") : t
    }
}

public enum EspecieAnexo: String, Equatable, Sendable { case foto, video, pdf, outro }

/// Foto, vídeo ou PDF pelo MIME (ou, sem MIME, pela extensão).
public func especieDoAnexo(tipo: String?, nome: String?) -> EspecieAnexo {
    let t = (tipo ?? "").lowercased()
    if t.hasPrefix("image/") { return .foto }
    if t.hasPrefix("video/") { return .video }
    if t == "application/pdf" { return .pdf }
    let n = (nome ?? "").lowercased()
    if [".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"].contains(where: n.hasSuffix) { return .foto }
    if [".mp4", ".mov", ".webm", ".mpeg", ".m4v"].contains(where: n.hasSuffix) { return .video }
    if n.hasSuffix(".pdf") { return .pdf }
    return .outro
}

/// Tema do mês (GET /api/themes/adherence).
public struct TemaDoMes: Codable, Equatable, Sendable {
    public struct Conteudo: Codable, Equatable, Sendable {
        public var name: String?
        public init(name: String?) { self.name = name }
    }
    public var hasTheme: Bool?
    public var theme: Conteudo?
    public var adherencePercent: Int?

    public init(hasTheme: Bool?, theme: Conteudo? = nil, adherencePercent: Int? = nil) {
        self.hasTheme = hasTheme; self.theme = theme; self.adherencePercent = adherencePercent
    }

    /// "Tema do mês: Saída de pressão · 62%" (nil sem tema).
    public var frase: String? {
        guard hasTheme == true, let nome = theme?.name, !nome.isEmpty else { return nil }
        if let p = adherencePercent { return "Tema do mês: \(nome) · \(p)%" }
        return "Tema do mês: \(nome)"
    }
}

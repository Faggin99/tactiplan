import Foundation

// Mais › Cadastros (T3): Campeonatos, Categorias, Clubes, Conteúdos, Submomentos e Atividades,
// com as MESMAS rotas, validações e permissões do web (pages/*ConfigPage.jsx). Cores e logo do
// clube só para ver (edição no web). Textos sem plano/preço (Apple 3.1.3).
// Paridade: dados/cadastros/Cadastros.kt (Android).

public let MODALIDADES: [(String, String)] = [("football_11", "Futebol 11"), ("football_7", "Futebol 7"), ("futsal", "Futsal")]

private func txt(_ s: String?) -> Json {
    guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return .nulo }
    return .texto(t)
}

// MARK: categorias

public struct CategoriaCadastro: Codable, Equatable, Sendable, Identifiable, Hashable {
    public var id: String
    public var nome: String
    public var faixa: String?
    public var ordem: Int?
    public var notas: String?
    public var clubeId: String?
    public var atletas: Int

    public init(id: String, nome: String, faixa: String? = nil, ordem: Int? = nil, notas: String? = nil, clubeId: String? = nil, atletas: Int = 0) {
        self.id = id; self.nome = nome; self.faixa = faixa; self.ordem = ordem; self.notas = notas; self.clubeId = clubeId; self.atletas = atletas
    }
    enum CodingKeys: String, CodingKey { case id, nome = "name", faixa = "age_group", ordem = "display_order", notas = "notes", clubeId = "club_id", atletas = "athletes_count" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        faixa = try? c.decodeIfPresent(String.self, forKey: .faixa)
        ordem = c.numeroFlex(.ordem).map { Int($0) }
        notas = try? c.decodeIfPresent(String.self, forKey: .notas)
        clubeId = try? c.decodeIfPresent(String.self, forKey: .clubeId)
        atletas = Int(c.numeroFlex(.atletas) ?? 0)
    }
    /// "Sub-17 · Sub-17" → só um quando iguais.
    public var rotulo: String {
        guard let f = faixa, !f.isEmpty, f != nome else { return nome }
        return "\(nome) · \(f)"
    }
}

public let FAIXAS_ETARIAS = ["Sub-6", "Sub-7", "Sub-8", "Sub-9", "Sub-10", "Sub-11", "Sub-12", "Sub-13", "Sub-14", "Sub-15",
                             "Sub-17", "Sub-20", "Profissional", "Master"]
public let MSG_NOME_CATEGORIA = "Informe um nome"
public let MSG_LIMITE_CATEGORIAS = "Não é possível adicionar mais categorias neste clube agora. Fale com o responsável pela equipe."

public func corpoCategoria(nome: String, faixa: String?, ordem: Int?, notas: String?, clubeId: String) -> Json {
    .objeto(["club_id": .texto(clubeId), "name": .texto(nome.trimmingCharacters(in: .whitespacesAndNewlines)), "age_group": txt(faixa),
             "display_order": ordem.map { .numero(Double($0)) } ?? .nulo, "notes": txt(notas)])
}

public func textoRemoverCategoria(_ c: CategoriaCadastro) -> String {
    var t = "Remover \(c.nome)?"
    if c.atletas > 0 { t += " Os \(c.atletas) atletas vinculados ficarão sem categoria." }
    return t
}

// MARK: campeonatos

public struct CampeonatoCadastro: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var nome: String
    public var temporada: String?
    public var formato: String?
    public var inicio: String?
    public var fim: String?
    public var clubeId: String?
    public var arquivado: Bool

    public init(id: String, nome: String, temporada: String? = nil, formato: String? = nil, inicio: String? = nil, fim: String? = nil,
                clubeId: String? = nil, arquivado: Bool = false) {
        self.id = id; self.nome = nome; self.temporada = temporada; self.formato = formato; self.inicio = inicio; self.fim = fim
        self.clubeId = clubeId; self.arquivado = arquivado
    }
    enum CodingKeys: String, CodingKey { case id, nome = "name", temporada = "season", formato = "format", inicio = "start_date", fim = "end_date", clubeId = "club_id", arquivado = "is_archived" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        temporada = (try? c.decodeIfPresent(String.self, forKey: .temporada)) ?? c.numeroFlex(.temporada).map { String(Int($0)) }
        formato = try? c.decodeIfPresent(String.self, forKey: .formato)
        inicio = (try? c.decodeIfPresent(String.self, forKey: .inicio)).flatMap { $0.map { String($0.prefix(10)) } }
        fim = (try? c.decodeIfPresent(String.self, forKey: .fim)).flatMap { $0.map { String($0.prefix(10)) } }
        clubeId = try? c.decodeIfPresent(String.self, forKey: .clubeId)
        arquivado = (try? c.decodeIfPresent(Bool.self, forKey: .arquivado)) ?? false
    }
    /// "Pontos corridos · 01/03/2026 – 30/11/2026".
    public var detalhe: String {
        var p: [String] = []
        if let f = formato, !f.isEmpty { p.append(f) }
        let datas = [dataCurtaBR(inicio), dataCurtaBR(fim)].compactMap { $0 }
        if !datas.isEmpty { p.append(datas.joined(separator: " – ")) }
        return p.joined(separator: " · ")
    }
}

public let FORMATOS_CAMPEONATO = ["Pontos corridos", "Mata-mata", "Grupos + playoffs", "Liga + Copa", "Amistosos"]
public let MSG_NOME_CAMPEONATO = "Nome é obrigatório"

/// Corpo COMPLETO (o PUT do servidor grava season/format/datas mesmo se faltarem: faltou = nulo).
public func corpoCampeonato(_ c: CampeonatoCadastro, clubeId: String) -> Json {
    .objeto(["club_id": .texto(c.clubeId ?? clubeId), "name": .texto(c.nome.trimmingCharacters(in: .whitespacesAndNewlines)),
             "season": txt(c.temporada), "format": txt(c.formato), "start_date": txt(c.inicio), "end_date": txt(c.fim),
             "is_archived": .booleano(c.arquivado)])
}

public func textoRemoverCampeonato(_ c: CampeonatoCadastro) -> String {
    "Remover \(c.nome)? Os jogos vinculados ficarão sem campeonato (não serão apagados)."
}

// MARK: clubes

public struct ClubeCadastro: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var nome: String
    public var descricao: String?
    public var modalidade: String?
    public var arquivadoEm: String?
    public init(id: String, nome: String, descricao: String? = nil, modalidade: String? = "football_11", arquivadoEm: String? = nil) {
        self.id = id; self.nome = nome; self.descricao = descricao; self.modalidade = modalidade; self.arquivadoEm = arquivadoEm
    }
    enum CodingKeys: String, CodingKey { case id, nome = "name", descricao = "description", modalidade = "modality", arquivadoEm = "archived_at" }
    public var arquivado: Bool { !(arquivadoEm ?? "").isEmpty }
    /// "Futebol 11 · Sub-15 masculino" / "Futebol 11 · arquivado em 12/10/2026".
    public var detalhe: String {
        var p = [rotuloModalidade(modalidade)].filter { !$0.isEmpty }
        if arquivado { p.append("arquivado em \(dataCurtaBR(arquivadoEm) ?? "")") }
        else if let d = descricao, !d.isEmpty { p.append(d) }
        return p.joined(separator: " · ")
    }
}

public struct LimiteClubes: Codable, Equatable, Sendable {
    public var limite: Int
    public var atuais: Int
    public var doPlano: Int?
    public var extras: Int
    public init(limite: Int, atuais: Int, doPlano: Int? = nil, extras: Int = 0) { self.limite = limite; self.atuais = atuais; self.doPlano = doPlano; self.extras = extras }
    enum CodingKeys: String, CodingKey { case limite = "limit", atuais = "current", doPlano = "plan_limit", extras = "extra_slots" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        limite = Int(c.numeroFlex(.limite) ?? -1); atuais = Int(c.numeroFlex(.atuais) ?? 0)
        doPlano = c.numeroFlex(.doPlano).map { Int($0) }; extras = Int(c.numeroFlex(.extras) ?? 0)
    }
    public var cheio: Bool { limite >= 0 && atuais >= limite }
}

/// "Clubes ativos: 1 de 1 · clubes arquivados não contam." (sem preço) / "2 clubes ativos · sem limite nesta conta".
public func textoLimiteClubes(_ l: LimiteClubes) -> String {
    if l.limite < 0 { return "\(contagem(l.atuais, "clube ativo", "clubes ativos")) · sem limite nesta conta" }
    return "Clubes ativos: \(l.atuais) de \(l.limite) · clubes arquivados não contam."
}

public let MSG_LIMITE_CLUBES = "O limite de clubes ativos foi atingido. Arquive um clube ativo para liberar a vaga."
public let MSG_NOME_CLUBE = "Informe o nome do clube"
public let TEXTO_MODALIDADE_POSICOES = "Trocar a modalidade apaga a posição de todos os atletas do clube (as posições do futsal são outras)."

public func corpoClube(nome: String, modalidade: String, descricao: String?) -> Json {
    .objeto(["name": .texto(nome.trimmingCharacters(in: .whitespacesAndNewlines)), "modality": .texto(modalidade), "description": txt(descricao)])
}

public func textoArquivarClube(_ nome: String) -> String {
    "Arquivar \"\(nome)\"? O clube fica guardado em só leitura: o histórico de treinos, jogos e atletas e os relatórios continuam disponíveis, mas não dá para editar. Ele sai do seletor de clube e deixa de contar no limite de clubes ativos. Você pode desarquivar depois, se houver vaga."
}
public func textoDesarquivarClube(_ nome: String) -> String {
    "Desarquivar \"\(nome)\"? Ele volta a ser um clube ativo (editável) e passa a contar no limite de clubes ativos."
}
public func textoRemoverClube(_ c: ClubeCadastro) -> String {
    var t = "Remover \(c.nome)? Esta ação remove permanentemente atletas, treinos e estatísticas do clube. Não pode ser desfeita."
    if !c.arquivado { t += " Para guardar o histórico, prefira Arquivar." }
    return t
}

// MARK: conteúdos e submomentos

public struct ConteudoItem: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var nome: String
    public var abreviacao: String?
    public var descricao: String?
    public var dimensao: String?
    public var workspaceId: String?
    public var ativo: Bool
    public init(id: String, nome: String, abreviacao: String? = nil, descricao: String? = nil, dimensao: String? = nil, workspaceId: String? = nil, ativo: Bool = true) {
        self.id = id; self.nome = nome; self.abreviacao = abreviacao; self.descricao = descricao; self.dimensao = dimensao; self.workspaceId = workspaceId; self.ativo = ativo
    }
    enum CodingKeys: String, CodingKey { case id, nome = "name", abreviacao = "abbreviation", descricao = "description", dimensao = "dimension", workspaceId = "workspace_id", ativo = "active" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        abreviacao = try? c.decodeIfPresent(String.self, forKey: .abreviacao)
        descricao = try? c.decodeIfPresent(String.self, forKey: .descricao)
        dimensao = try? c.decodeIfPresent(String.self, forKey: .dimensao)
        workspaceId = try? c.decodeIfPresent(String.self, forKey: .workspaceId)
        ativo = (try? c.decodeIfPresent(Bool.self, forKey: .ativo)) ?? true
    }
    /// Da conta (editável/removível). Os padrão têm workspace_id nulo (NÃO use tenant_id).
    public var proprio: Bool { !(workspaceId ?? "").isEmpty }
}

public struct SubmomentoItem: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var conteudoId: String?
    public var nome: String
    public var descricao: String?
    public var ordem: Int?
    public var workspaceId: String?
    public var ativo: Bool
    public init(id: String, conteudoId: String?, nome: String, descricao: String? = nil, ordem: Int? = nil, workspaceId: String? = nil, ativo: Bool = true) {
        self.id = id; self.conteudoId = conteudoId; self.nome = nome; self.descricao = descricao; self.ordem = ordem; self.workspaceId = workspaceId; self.ativo = ativo
    }
    enum CodingKeys: String, CodingKey { case id, conteudoId = "content_id", nome = "name", descricao = "description", ordem = "display_order", workspaceId = "workspace_id", ativo = "active" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        conteudoId = try? c.decodeIfPresent(String.self, forKey: .conteudoId)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        descricao = try? c.decodeIfPresent(String.self, forKey: .descricao)
        ordem = c.numeroFlex(.ordem).map { Int($0) }
        workspaceId = try? c.decodeIfPresent(String.self, forKey: .workspaceId)
        ativo = (try? c.decodeIfPresent(Bool.self, forKey: .ativo)) ?? true
    }
    public var proprio: Bool { !(workspaceId ?? "").isEmpty }
}

public let DESCRICAO_PILAR: [String: String] = [
    "tatico": "Momentos do jogo: OO, OD, transições, bola parada",
    "fisico": "Capacidades físicas: aeróbio, anaeróbio, força",
    "tecnico": "Gestos técnicos: passe, recepção, drible, finalização",
    "mental": "Aspectos psicossociais e atividades recreativas",
]
public let MSG_NOME_CONTEUDO = "Informe o nome"
public let TEXTO_SEM_SUBMOMENTOS_NAO_TATICO = "Conteúdos não-táticos não têm submomentos."

/// Conteúdos de um pilar, por nome, com busca (no Tático a busca também casa submomentos).
public func conteudosDoPilarCadastro(_ todos: [ConteudoItem], pilar: String, busca: String, submomentos: [SubmomentoItem] = []) -> [ConteudoItem] {
    let q = dobrar(busca.trimmingCharacters(in: .whitespacesAndNewlines))
    return todos.filter { c in
        guard c.dimensao == pilar else { return false }
        if q.isEmpty { return true }
        if dobrar(c.nome).contains(q) || dobrar(c.abreviacao ?? "").contains(q) { return true }
        return submomentos.contains { $0.conteudoId == c.id && dobrar($0.nome).contains(q) }
    }.sorted { compararNome($0.nome, $1.nome) }
}

/// Submomentos de um conteúdo na ordem do servidor (display_order, nome).
public func submomentosDe(_ conteudoId: String, _ todos: [SubmomentoItem]) -> [SubmomentoItem] {
    todos.filter { $0.conteudoId == conteudoId }.sorted { ($0.ordem ?? 999, dobrar($0.nome)) < ($1.ordem ?? 999, dobrar($1.nome)) }
}

public func corpoConteudo(nome: String, abreviacao: String?, descricao: String?, pilar: String) -> Json {
    .objeto(["name": .texto(nome.trimmingCharacters(in: .whitespacesAndNewlines)), "abbreviation": txt(abreviacao),
             "description": txt(descricao), "dimension": .texto(pilar)])
}

public func corpoSubmomento(conteudoId: String, nome: String, descricao: String?, ordem: Int?) -> Json {
    .objeto(["content_id": .texto(conteudoId), "name": .texto(nome.trimmingCharacters(in: .whitespacesAndNewlines)),
             "description": txt(descricao), "display_order": .numero(Double(ordem ?? 999))])
}

public func textoRemoverConteudo(_ c: ConteudoItem) -> String { "Remover \(c.nome)? Os submomentos personalizados dele também serão removidos." }
public func textoRemoverSubmomento(_ s: SubmomentoItem) -> String { "Remover \(s.nome)? Atividades que o usavam perdem a ligação (o resto fica intacto)." }

// MARK: atividades (biblioteca)

public struct AtividadeBiblioteca: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var titulo: String
    public var conteudoId: String?
    public var conteudoNome: String?
    public var descricao: String?
    public var arquivada: Bool
    public init(id: String, titulo: String, conteudoId: String? = nil, conteudoNome: String? = nil, descricao: String? = nil, arquivada: Bool = false) {
        self.id = id; self.titulo = titulo; self.conteudoId = conteudoId; self.conteudoNome = conteudoNome; self.descricao = descricao; self.arquivada = arquivada
    }
    enum CodingKeys: String, CodingKey { case id, titulo = "title", conteudoId = "content_id", conteudoNome = "content_name", descricao = "description", arquivada = "is_archived" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        titulo = (try? c.decodeIfPresent(String.self, forKey: .titulo)) ?? ""
        conteudoId = try? c.decodeIfPresent(String.self, forKey: .conteudoId)
        conteudoNome = try? c.decodeIfPresent(String.self, forKey: .conteudoNome)
        descricao = try? c.decodeIfPresent(String.self, forKey: .descricao)
        arquivada = (try? c.decodeIfPresent(Bool.self, forKey: .arquivada)) ?? false
    }
}

/// Busca só no título (como o web), filtro por conteúdo; arquivadas à parte.
public func filtrarAtividades(_ l: [AtividadeBiblioteca], busca: String, conteudoId: String?, arquivadas: Bool) -> [AtividadeBiblioteca] {
    let q = dobrar(busca.trimmingCharacters(in: .whitespacesAndNewlines))
    return l.filter { a in
        a.arquivada == arquivadas && (q.isEmpty || dobrar(a.titulo).contains(q)) && (conteudoId == nil || a.conteudoId == conteudoId)
    }.sorted { compararNome($0.titulo, $1.titulo) }
}

public func erroAtividadeBiblioteca(pilar: String?, conteudoId: String?, titulo: String) -> String? {
    if (pilar ?? "").isEmpty { return "Selecione o pilar." }
    if (conteudoId ?? "").isEmpty { return "Selecione o conteúdo." }
    if titulo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Informe o nome da atividade." }
    return nil
}

public func corpoAtividadeBiblioteca(titulo: String, conteudoId: String, descricao: String?) -> Json {
    .objeto(["title": .texto(titulo.trimmingCharacters(in: .whitespacesAndNewlines)), "content_id": .texto(conteudoId), "description": txt(descricao)])
}

/// O aviso do web antes de editar/arquivar uma atividade já usada.
public func avisoUsoAtividade(usos: Int, arquivar: Bool) -> String? {
    guard usos > 0 else { return nil }
    let base = "Esta atividade foi utilizada em \(contagem(usos, "treino", "treinos")). "
    return base + (arquivar
        ? "Esta atividade já foi usada em treinos. Ao arquivá-la, ela não aparecerá mais para seleção em novos treinos, mas os treinos antigos continuarão mostrando o nome original."
        : "Esta atividade já foi usada em treinos. Ao editá-la, o novo nome/descrição será mostrado em TODOS os treinos que usaram esta atividade, incluindo os antigos.")
}

// MARK: erros

public let MSG_SEM_PERMISSAO_CADASTRO = "Você não tem permissão para mudar este cadastro neste clube. Peça ao responsável pelo clube para liberar em Staff."

/// Erro de uma escrita nos Cadastros, em frase neutra (402 sem plano/preço; 403 amigável).
public func mensagemErroCadastro(_ e: Error, limite: String? = nil) -> String {
    if let erro = e as? ErroApi {
        if erro.codigo == "ADDON_REQUIRED" && erro.extras["required_feature"] == "max_clubs" { return MSG_LIMITE_CLUBES }
        if erro.status == 402 && !ehSomenteLeitura(e) { return limite ?? TEXTO_NAO_EDITA }
        if erro.status == 403 && !ehSomenteLeitura(e) { return MSG_SEM_PERMISSAO_CADASTRO }
    }
    return mensagemDeErro(e)
}

// MARK: API

public enum CaminhosCadastros {
    public static func campeonatos(clube: String) -> String { "/competitions?clubId=\(codificarComponente(clube))&includeArchived=true" }
    public static let criarCampeonato = "/competitions"
    public static func campeonato(_ id: String) -> String { "/competitions/\(codificarComponente(id))" }
    public static let criarCategoria = "/categories"
    public static func categoria(_ id: String) -> String { "/categories/\(codificarComponente(id))" }
    public static let clubes = "/clubs"
    public static let limiteClubes = "/clubs/limit"
    public static func clube(_ id: String) -> String { "/clubs/\(codificarComponente(id))" }
    public static func arquivarClube(_ id: String) -> String { clube(id) + "/archive" }
    public static func desarquivarClube(_ id: String) -> String { clube(id) + "/unarchive" }
    public static let conteudos = "/contents"
    public static func conteudo(_ id: String) -> String { "/contents/\(codificarComponente(id))" }
    public static func conteudoAtivo(_ id: String) -> String { conteudo(id) + "/active" }
    public static func submomentos(modalidade: String?) -> String { CaminhosTreino.etapas(modalidade) }
    public static let criarSubmomento = "/stages"
    public static func submomento(_ id: String) -> String { "/stages/\(codificarComponente(id))" }
    public static func submomentoAtivo(_ id: String) -> String { submomento(id) + "/active" }
    public static let atividades = "/titles/with-content?includeArchived=true"
    public static let criarAtividade = "/titles"
    public static func atividade(_ id: String) -> String { "/titles/\(codificarComponente(id))" }
    public static func usoAtividade(_ id: String) -> String { atividade(id) + "/usage-count" }
    public static func arquivarAtividade(_ id: String) -> String { atividade(id) + "/archive" }
    public static func desarquivarAtividade(_ id: String) -> String { atividade(id) + "/unarchive" }
}

public protocol ApiCadastros: Sendable {
    func campeonatos(clubeId: String) async throws -> [CampeonatoCadastro]
    func salvarCampeonato(_ id: String?, _ corpo: Json) async throws
    func removerCampeonato(_ id: String) async throws
    func categorias(clubeId: String) async throws -> [CategoriaCadastro]
    func salvarCategoria(_ id: String?, _ corpo: Json) async throws
    func removerCategoria(_ id: String) async throws
    func clubes() async throws -> [ClubeCadastro]
    func limiteClubes() async throws -> LimiteClubes
    func salvarClube(_ id: String?, _ corpo: Json) async throws
    func arquivarClube(_ id: String, arquivar: Bool) async throws
    func removerClube(_ id: String) async throws
    func conteudos() async throws -> [ConteudoItem]
    func salvarConteudo(_ id: String?, _ corpo: Json) async throws
    func ativarConteudo(_ id: String, _ ativo: Bool) async throws
    func removerConteudo(_ id: String) async throws
    func submomentos(modalidade: String?) async throws -> [SubmomentoItem]
    func salvarSubmomento(_ id: String?, _ corpo: Json) async throws
    func ativarSubmomento(_ id: String, _ ativo: Bool) async throws
    func removerSubmomento(_ id: String) async throws
    func atividades() async throws -> [AtividadeBiblioteca]
    func salvarAtividade(_ id: String?, _ corpo: Json) async throws
    func usoAtividade(_ id: String) async throws -> Int
    func arquivarAtividade(_ id: String, arquivar: Bool) async throws
}

public struct ApiCadastrosHttp: ApiCadastros {
    let web: ClienteWeb
    public init(_ web: ClienteWeb) { self.web = web }
    typealias C = CaminhosCadastros

    private func salvar(_ criar: String, _ um: (String) -> String, _ id: String?, _ corpo: Json) async throws {
        if let id { _ = try await web.json(um(id), "PUT", corpo) } else { _ = try await web.json(criar, "POST", corpo) }
    }

    public func campeonatos(clubeId: String) async throws -> [CampeonatoCadastro] {
        try listaOuData(try await web.json(C.campeonatos(clube: clubeId))).decodificar([CampeonatoCadastro].self)
    }
    public func salvarCampeonato(_ id: String?, _ corpo: Json) async throws { try await salvar(C.criarCampeonato, C.campeonato, id, corpo) }
    public func removerCampeonato(_ id: String) async throws { _ = try await web.json(C.campeonato(id), "DELETE") }

    public func categorias(clubeId: String) async throws -> [CategoriaCadastro] {
        try listaOuData(try await web.json(CaminhosElenco.categorias(clube: clubeId))).decodificar([CategoriaCadastro].self)
    }
    public func salvarCategoria(_ id: String?, _ corpo: Json) async throws { try await salvar(C.criarCategoria, C.categoria, id, corpo) }
    public func removerCategoria(_ id: String) async throws { _ = try await web.json(C.categoria(id), "DELETE") }

    public func clubes() async throws -> [ClubeCadastro] { try listaOuData(try await web.json(C.clubes)).decodificar([ClubeCadastro].self) }
    public func limiteClubes() async throws -> LimiteClubes { try await web.json(C.limiteClubes).decodificar(LimiteClubes.self) }
    public func salvarClube(_ id: String?, _ corpo: Json) async throws { try await salvar(C.clubes, C.clube, id, corpo) }
    public func arquivarClube(_ id: String, arquivar: Bool) async throws {
        _ = try await web.json(arquivar ? C.arquivarClube(id) : C.desarquivarClube(id), "POST")
    }
    public func removerClube(_ id: String) async throws { _ = try await web.json(C.clube(id), "DELETE") }

    public func conteudos() async throws -> [ConteudoItem] { try listaOuData(try await web.json(C.conteudos)).decodificar([ConteudoItem].self) }
    public func salvarConteudo(_ id: String?, _ corpo: Json) async throws { try await salvar(C.conteudos, C.conteudo, id, corpo) }
    public func ativarConteudo(_ id: String, _ ativo: Bool) async throws { _ = try await web.json(C.conteudoAtivo(id), "PATCH", ["active": .booleano(ativo)]) }
    public func removerConteudo(_ id: String) async throws { _ = try await web.json(C.conteudo(id), "DELETE") }

    public func submomentos(modalidade: String?) async throws -> [SubmomentoItem] {
        try listaOuData(try await web.json(C.submomentos(modalidade: modalidade))).decodificar([SubmomentoItem].self)
    }
    public func salvarSubmomento(_ id: String?, _ corpo: Json) async throws { try await salvar(C.criarSubmomento, C.submomento, id, corpo) }
    public func ativarSubmomento(_ id: String, _ ativo: Bool) async throws { _ = try await web.json(C.submomentoAtivo(id), "PATCH", ["active": .booleano(ativo)]) }
    public func removerSubmomento(_ id: String) async throws { _ = try await web.json(C.submomento(id), "DELETE") }

    public func atividades() async throws -> [AtividadeBiblioteca] { try listaOuData(try await web.json(C.atividades)).decodificar([AtividadeBiblioteca].self) }
    public func salvarAtividade(_ id: String?, _ corpo: Json) async throws { try await salvar(C.criarAtividade, C.atividade, id, corpo) }
    public func usoAtividade(_ id: String) async throws -> Int {
        let j = try await web.json(C.usoAtividade(id))["count"]
        return Int(j?.numero ?? Double(j?.texto ?? "") ?? 0)
    }
    public func arquivarAtividade(_ id: String, arquivar: Bool) async throws {
        _ = try await web.json(arquivar ? C.arquivarAtividade(id) : C.desarquivarAtividade(id), "PUT")
    }
}

/// Corpo do Relatório do clube (ano corrente, como a Início do web).
public func corpoRelatorioClube(clubeId: String, ano: String) -> [String: Json] {
    ["club_id": .texto(clubeId), "start_date": .texto("\(ano)-01-01"), "end_date": .texto("\(ano)-12-31"), "period_label": .texto(ano)]
}
public func nomePdfRelatorioClube(_ clube: String, ano: String) -> String { "Relatorio_\(nomeDeArquivo(clube))_\(ano).pdf" }

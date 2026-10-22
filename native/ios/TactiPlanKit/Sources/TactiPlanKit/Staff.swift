import Foundation

// Staff (comissão técnica), como o TeamConfigPage/MemberEditPanel do web: membros, convites
// pendentes, papel, permissões por grupo e categorias. Só o DONO da conta (com members:manage)
// convida, edita e remove — regra do servidor (clubMembers.js). Paridade: dados/staff/Staff.kt e
// native/paridade/t3.json (gerado de frontend/src/lib/memberPermissions.js).

public let PERMISSOES: [String] = [
    "training:view", "training:edit", "training:delete", "games:view", "games:edit", "athletes:view", "athletes:edit",
    "injuries:manage", "tactical:view", "tactical:edit", "stats:view", "library:edit", "categories:manage",
    "members:manage", "club_settings:manage", "billing:manage",
]

public let ROTULOS_PERMISSAO: [String: String] = [
    "training:view": "Ver treinos", "training:edit": "Editar treinos", "training:delete": "Apagar treinos",
    "games:view": "Ver jogos", "games:edit": "Editar jogos",
    "athletes:view": "Ver atletas", "athletes:edit": "Editar atletas", "injuries:manage": "Gerenciar lesões",
    "tactical:view": "Ver quadro tático", "tactical:edit": "Editar quadro tático",
    "stats:view": "Ver estatísticas", "library:edit": "Editar biblioteca (conteúdos/atividades)",
    "categories:manage": "Gerenciar categorias", "members:manage": "Gerenciar equipe (convidar/remover)",
    "club_settings:manage": "Configurações do clube", "billing:manage": "Gerenciar assinatura",
]

public struct GrupoPermissao: Equatable, Sendable {
    public let rotulo: String
    public let permissoes: [String]
}

public let GRUPOS_PERMISSAO: [GrupoPermissao] = [
    GrupoPermissao(rotulo: "Treinos", permissoes: ["training:view", "training:edit", "training:delete"]),
    GrupoPermissao(rotulo: "Jogos", permissoes: ["games:view", "games:edit"]),
    GrupoPermissao(rotulo: "Atletas", permissoes: ["athletes:view", "athletes:edit", "injuries:manage"]),
    GrupoPermissao(rotulo: "Quadro Tático", permissoes: ["tactical:view", "tactical:edit"]),
    GrupoPermissao(rotulo: "Estatísticas e Biblioteca", permissoes: ["stats:view", "library:edit"]),
    GrupoPermissao(rotulo: "Administração", permissoes: ["categories:manage", "members:manage", "club_settings:manage", "billing:manage"]),
]

/// Permissões que o app mostra nos interruptores. "Gerenciar assinatura" fica de fora no app
/// (regra 3.1.3: nada de assinatura); o valor que já existir é mantido ao salvar.
public let PERMISSOES_OCULTAS_NO_APP: Set<String> = ["billing:manage"]

/// Papéis que dá para escolher no convite/edição (owner, manager e viewer só aparecem se já existirem).
public let PAPEIS_CONVITE: [String] = ["head_coach", "assistant_coach", "specialist", "other"]

public let ROTULOS_PAPEL: [String: String] = [
    "owner": "Proprietário", "manager": "Gerente", "head_coach": "Treinador Principal",
    "assistant_coach": "Treinador Auxiliar", "specialist": "Especialista (Fisio/PF/Analista)",
    "viewer": "Somente leitura", "other": "Outros",
]

public let DESCRICOES_PAPEL: [String: String] = [
    "manager": "Faz quase tudo, menos billing e gestão de membros",
    "head_coach": "Treinador principal — treinos, jogos, atletas, táticas",
    "assistant_coach": "Auxiliar — edita treinos, vê jogos/atletas/táticas",
    "specialist": "Fisio/PF/Analista — gerencia lesões, vê stats, edita biblioteca",
    "viewer": "Apenas leitura",
    "other": "Outra função: escolha abaixo o que a pessoa pode ver e editar",
]

public let PADROES_PAPEL: [String: [String]] = [
    "owner": PERMISSOES,
    "manager": ["training:view", "training:edit", "training:delete", "games:view", "games:edit", "athletes:view", "athletes:edit",
                "injuries:manage", "tactical:view", "tactical:edit", "stats:view", "library:edit", "categories:manage"],
    "head_coach": ["training:view", "training:edit", "training:delete", "games:view", "games:edit", "athletes:view", "athletes:edit",
                   "tactical:view", "tactical:edit", "stats:view", "library:edit"],
    "assistant_coach": ["training:view", "training:edit", "games:view", "athletes:view", "tactical:view", "stats:view"],
    "specialist": ["training:view", "games:view", "athletes:view", "athletes:edit", "injuries:manage", "stats:view", "library:edit"],
    "viewer": ["training:view", "games:view", "athletes:view", "tactical:view", "stats:view"],
    "other": ["training:view", "games:view", "athletes:view", "tactical:view", "stats:view"],
]

public func rotuloPapelStaff(_ papel: String?) -> String { papel.flatMap { ROTULOS_PAPEL[$0] } ?? (papel ?? "") }

/// As permissões que valem: dono = todas; lista própria substitui; senão o padrão do papel.
public func permissoesEfetivas(_ papel: String?, _ permissoes: [String]?) -> Set<String> {
    if papel == "owner" { return Set(PERMISSOES) }
    if let p = permissoes { return Set(p) }
    return Set(PADROES_PAPEL[papel ?? ""] ?? [])
}

/// "Treinos: ver e editar" — resumo em linguagem simples por grupo (só grupos com alguma).
public func resumoPermissoes(_ efetivas: Set<String>) -> [String] {
    GRUPOS_PERMISSAO.compactMap { g in
        let tem = g.permissoes.filter { efetivas.contains($0) && !PERMISSOES_OCULTAS_NO_APP.contains($0) }
        guard !tem.isEmpty else { return nil }
        let verbos = tem.map { (ROTULOS_PERMISSAO[$0] ?? $0).components(separatedBy: " ").first?.lowercased() ?? "" }
        let unicos = verbos.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        if g.rotulo == "Administração" {
            return "Administração: " + tem.map { (ROTULOS_PERMISSAO[$0] ?? $0).lowercased() }.joined(separator: ", ")
        }
        return "\(g.rotulo): " + listaE(unicos)
    }
}

/// ["ver", "editar", "apagar"] → "ver, editar e apagar".
func listaE(_ l: [String]) -> String {
    if l.count <= 1 { return l.joined() }
    return l.dropLast().joined(separator: ", ") + " e " + l[l.count - 1]
}

// MARK: limite de convidados

/// -1 = sem limite. "Responsável + 5 convidados · 2 em uso, contando convites pendentes".
public func textoLimiteEquipe(usados: Int, limite: Int?) -> String? {
    guard let limite else { return nil }
    if limite < 0 { return "Sem limite de convidados" }
    return "Responsável + \(contagem(limite, "convidado", "convidados")) · \(usados) em uso, contando convites pendentes"
}

public func podeConvidar(usados: Int, limite: Int?) -> Bool {
    guard let limite else { return false }
    return limite < 0 || usados < limite
}

public let MSG_LIMITE_EQUIPE = "A equipe já está no limite de pessoas. Remova um membro ou convite pendente para convidar outra pessoa."
public let MSG_SO_DONO_EQUIPE = "Só o responsável pela conta convida, edita e remove pessoas da comissão."
public let MSG_SEM_PERMISSAO_EQUIPE = "Você não tem permissão para gerenciar a equipe neste clube. Peça ao responsável pelo clube para liberar em Staff."
public let MSG_CONVITE_INDISPONIVEL = "Não é possível convidar pessoas agora. Fale com o responsável pela equipe."
public let TEXTO_SEM_MEMBROS = "Você ainda não convidou ninguém."
public let MSG_EMAIL_CONVITE = "Informe o e-mail de quem você quer convidar."
public let MSG_ESCOLHA_CATEGORIA = "Escolha pelo menos uma categoria."

/// Erro de uma escrita do Staff em frase neutra (402 do servidor fala de plano → não mostrar).
public func mensagemErroStaff(_ e: Error) -> String {
    if let erro = e as? ErroApi {
        if erro.codigo == "MEMBER_LIMIT" { return MSG_LIMITE_EQUIPE }
        if erro.status == 402 { return ehSomenteLeitura(e) ? TEXTO_NAO_EDITA : MSG_CONVITE_INDISPONIVEL }
        if erro.status == 403 && !ehSomenteLeitura(e) {
            return erro.mensagem.hasPrefix("Apenas o dono") ? MSG_SO_DONO_EQUIPE : MSG_SEM_PERMISSAO_EQUIPE
        }
    }
    return mensagemDeErro(e)
}

/// E-mail com cara de e-mail (o servidor confere de novo).
public func emailValido(_ s: String) -> Bool {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let arroba = t.firstIndex(of: "@"), arroba != t.startIndex else { return false }
    let dominio = t[t.index(after: arroba)...]
    return dominio.contains(".") && !dominio.hasPrefix(".") && !dominio.hasSuffix(".") && !t.contains(" ")
}

// MARK: modelos

public struct MembroEquipe: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var usuarioId: String?
    public var emailConvidado: String?
    public var papel: String
    public var categoriaIds: [String]?
    public var permissoes: [String]?
    public var convidadoEm: String?
    public var aceitoEm: String?
    public var nome: String?
    public var email: String?

    public init(id: String, usuarioId: String? = nil, emailConvidado: String? = nil, papel: String, categoriaIds: [String]? = nil,
                permissoes: [String]? = nil, convidadoEm: String? = nil, aceitoEm: String? = nil, nome: String? = nil, email: String? = nil) {
        self.id = id; self.usuarioId = usuarioId; self.emailConvidado = emailConvidado; self.papel = papel
        self.categoriaIds = categoriaIds; self.permissoes = permissoes; self.convidadoEm = convidadoEm; self.aceitoEm = aceitoEm
        self.nome = nome; self.email = email
    }

    enum CodingKeys: String, CodingKey {
        case id, usuarioId = "user_id", emailConvidado = "invited_email", papel = "role", categoriaIds = "category_ids",
             permissoes = "permissions", convidadoEm = "invited_at", aceitoEm = "accepted_at", nome = "user_name", email = "user_email"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        usuarioId = try? c.decodeIfPresent(String.self, forKey: .usuarioId)
        emailConvidado = try? c.decodeIfPresent(String.self, forKey: .emailConvidado)
        papel = (try? c.decodeIfPresent(String.self, forKey: .papel)) ?? "other"
        categoriaIds = try? c.decodeIfPresent([String].self, forKey: .categoriaIds)
        // permissions pode vir como lista ou como texto JSON (coluna jsonb antiga)
        if let l = try? c.decodeIfPresent([String].self, forKey: .permissoes) { permissoes = l }
        else if let s = try? c.decodeIfPresent(String.self, forKey: .permissoes), let d = s.data(using: .utf8),
                let l = try? JSONDecoder().decode([String].self, from: d) { permissoes = l }
        else { permissoes = nil }
        convidadoEm = try? c.decodeIfPresent(String.self, forKey: .convidadoEm)
        aceitoEm = try? c.decodeIfPresent(String.self, forKey: .aceitoEm)
        nome = try? c.decodeIfPresent(String.self, forKey: .nome)
        email = try? c.decodeIfPresent(String.self, forKey: .email)
    }

    public var pendente: Bool { (aceitoEm ?? "").isEmpty }
    public var nomeExibido: String { [nome, emailConvidado, email].compactMap { $0?.isEmpty == false ? $0 : nil }.first ?? "" }
    public var emailExibido: String { email ?? emailConvidado ?? "" }
    public var efetivas: Set<String> { permissoesEfetivas(papel, permissoes) }
    public var personalizadas: Bool { permissoes != nil }
}

public struct DonoEquipe: Codable, Equatable, Sendable {
    public var id: String
    public var nome: String?
    public var email: String?
    enum CodingKeys: String, CodingKey { case id, nome = "name", email }
}

public struct Equipe: Codable, Equatable, Sendable {
    public var dono: DonoEquipe?
    public var membros: [MembroEquipe]
    public var souDono: Bool
    public var limiteConvidados: Int?

    public init(dono: DonoEquipe? = nil, membros: [MembroEquipe], souDono: Bool, limiteConvidados: Int? = nil) {
        self.dono = dono; self.membros = membros; self.souDono = souDono; self.limiteConvidados = limiteConvidados
    }

    enum CodingKeys: String, CodingKey { case dono = "owner", membros = "members", souDono = "is_owner", limiteConvidados = "limite_convidados" }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dono = try? c.decodeIfPresent(DonoEquipe.self, forKey: .dono)
        membros = (try? c.decodeIfPresent([MembroEquipe].self, forKey: .membros)) ?? []
        souDono = (try? c.decodeIfPresent(Bool.self, forKey: .souDono)) ?? false
        limiteConvidados = c.numeroFlex(.limiteConvidados).map { Int($0) }
    }

    public var ativos: [MembroEquipe] { membros.filter { !$0.pendente } }
    public var pendentes: [MembroEquipe] { membros.filter(\.pendente) }
    /// Aceitos + pendentes (como o servidor conta o limite).
    public var usados: Int { membros.count }
}

/// "Todas as categorias" ou "Sub-15, Sub-17".
public func escopoCategorias(_ ids: [String]?, categorias: [CategoriaCadastro]) -> String {
    guard let ids, !ids.isEmpty else { return "Todas as categorias" }
    let nomes = ids.compactMap { id in categorias.first { $0.id == id }?.nome }
    return nomes.isEmpty ? "Categorias específicas" : nomes.joined(separator: ", ")
}

/// Rascunho do painel de convite/edição.
public struct RascunhoMembro: Equatable, Sendable {
    public var email: String
    public var papel: String
    /// nil = todas as categorias.
    public var categoriaIds: [String]?
    /// As permissões nos interruptores (começa com as efetivas).
    public var permissoes: Set<String>
    /// A pessoa mexeu nos interruptores? (senão o PUT não manda `permissions` e o servidor mantém)
    public var mexeuPermissoes: Bool
    /// Voltou para o padrão do papel (manda `permissions: null`).
    public var voltouPadrao: Bool

    public init(email: String = "", papel: String = "head_coach", categoriaIds: [String]? = nil,
                permissoes: Set<String>? = nil, mexeuPermissoes: Bool = false, voltouPadrao: Bool = false) {
        self.email = email; self.papel = papel; self.categoriaIds = categoriaIds
        self.permissoes = permissoes ?? permissoesEfetivas(papel, nil)
        self.mexeuPermissoes = mexeuPermissoes; self.voltouPadrao = voltouPadrao
    }

    public static func de(_ m: MembroEquipe) -> RascunhoMembro {
        RascunhoMembro(email: m.emailExibido, papel: m.papel, categoriaIds: m.categoriaIds?.isEmpty == true ? nil : m.categoriaIds,
                       permissoes: m.efetivas)
    }

    /// Trocar o papel: sem personalização, os interruptores seguem o padrão do papel novo.
    public mutating func trocarPapel(_ novo: String) {
        papel = novo
        if !mexeuPermissoes { permissoes = permissoesEfetivas(novo, nil) }
    }

    public mutating func alternar(_ p: String, _ ligado: Bool) {
        if ligado { permissoes.insert(p) } else { permissoes.remove(p) }
        mexeuPermissoes = true
        voltouPadrao = false
    }

    public mutating func voltarAoPadrao() {
        permissoes = permissoesEfetivas(papel, nil)
        mexeuPermissoes = false
        voltouPadrao = true
    }

    public func erro(convite: Bool) -> String? {
        if convite && !emailValido(email) { return MSG_EMAIL_CONVITE }
        if let c = categoriaIds, c.isEmpty { return MSG_ESCOLHA_CATEGORIA }
        return nil
    }

    /// As permissões na ordem do servidor.
    var listaPermissoes: [Json] { PERMISSOES.filter { permissoes.contains($0) }.map { .texto($0) } }

    /// POST /api/clubs/:id/invite.
    public func corpoConvite() -> Json {
        var o: [String: Json] = [
            "email": .texto(email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()),
            "role": .texto(papel),
            "category_ids": categoriaIds.map { .lista($0.map { .texto($0) }) } ?? .nulo,
        ]
        o["permissions"] = mexeuPermissoes ? .lista(listaPermissoes) : .nulo
        return .objeto(o)
    }

    /// PUT /api/clubs/:id/members/:memberId — `permissions` só se mexeu (ou voltou ao padrão → null).
    public func corpoEdicao() -> Json {
        var o: [String: Json] = [
            "role": .texto(papel),
            "category_ids": categoriaIds.map { .lista($0.map { .texto($0) }) } ?? .nulo,
        ]
        if mexeuPermissoes { o["permissions"] = .lista(listaPermissoes) }
        else if voltouPadrao { o["permissions"] = .nulo }
        return .objeto(o)
    }
}

/// Texto que acompanha o link do convite na folha de compartilhar.
public func textoConvite(clube: String, url: String) -> String {
    "Convite para a comissão do \(clube) no TactiPlan: \(url)"
}

// MARK: API

public enum CaminhosStaff {
    public static func membros(clube: String) -> String { "/clubs/\(codificarComponente(clube))/members" }
    public static func convidar(clube: String) -> String { "/clubs/\(codificarComponente(clube))/invite" }
    public static func membro(clube: String, _ id: String) -> String { "/clubs/\(codificarComponente(clube))/members/\(codificarComponente(id))" }
    public static func reenviar(clube: String, _ id: String) -> String { membro(clube: clube, id) + "/resend" }
}

public protocol ApiStaff: Sendable {
    func equipe(clubeId: String) async throws -> Equipe
    /// Devolve o link do convite (accept_url).
    func convidar(clubeId: String, _ corpo: Json) async throws -> String
    func atualizar(clubeId: String, membroId: String, _ corpo: Json) async throws
    func remover(clubeId: String, membroId: String) async throws
    func reenviar(clubeId: String, membroId: String) async throws -> String
    func categorias(clubeId: String) async throws -> [CategoriaCadastro]
}

public struct ApiStaffHttp: ApiStaff {
    let web: ClienteWeb
    public init(_ web: ClienteWeb) { self.web = web }

    public func equipe(clubeId: String) async throws -> Equipe {
        try await web.json(CaminhosStaff.membros(clube: clubeId)).decodificar(Equipe.self)
    }
    public func convidar(clubeId: String, _ corpo: Json) async throws -> String {
        try await web.json(CaminhosStaff.convidar(clube: clubeId), "POST", corpo)["accept_url"]?.texto ?? ""
    }
    public func atualizar(clubeId: String, membroId: String, _ corpo: Json) async throws {
        _ = try await web.json(CaminhosStaff.membro(clube: clubeId, membroId), "PUT", corpo)
    }
    public func remover(clubeId: String, membroId: String) async throws {
        _ = try await web.json(CaminhosStaff.membro(clube: clubeId, membroId), "DELETE")
    }
    public func reenviar(clubeId: String, membroId: String) async throws -> String {
        try await web.json(CaminhosStaff.reenviar(clube: clubeId, membroId), "POST")["accept_url"]?.texto ?? ""
    }
    public func categorias(clubeId: String) async throws -> [CategoriaCadastro] {
        try listaOuData(try await web.json(CaminhosElenco.categorias(clube: clubeId))).decodificar([CategoriaCadastro].self)
    }
}

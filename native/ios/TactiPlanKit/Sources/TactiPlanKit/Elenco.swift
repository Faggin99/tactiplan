import Foundation

// Elenco (T3): o plantel do clube aberto, como o PlantelPage do web. Regras puras aqui; as rotas
// em ApiElenco.swift. Paridade: dados/elenco/Elenco.kt (Android) e native/paridade/t3.json
// (gerado do código do web: formatarNome, POSITIONS, positionOrder).

// MARK: nome de pessoa (porte EXATO de frontend/src/lib/formatarNome.js)

let PARTICULAS_NOME: Set<String> = ["de", "da", "do", "das", "dos", "e", "di", "du", "van", "von"]
private let ROMANOS: Set<String> = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]
private let PT_BR = Locale(identifier: "pt_BR")

private func capitalizarParte(_ parte: String) -> String {
    guard let primeiro = parte.first else { return parte }
    return String(primeiro).uppercased(with: PT_BR) + parte.dropFirst()
}

/// ^\p{Lu}\p{Ll}+\p{Lu}\p{Ll} — CamelCase proposital ("McDonald").
private func ehCamel(_ palavra: String) -> Bool {
    let cs = Array(palavra)
    guard cs.count >= 4, cs[0].isUppercase else { return false }
    var i = 1
    while i < cs.count, cs[i].isLowercase { i += 1 }
    guard i > 1, i + 1 < cs.count else { return false }
    return cs[i].isUppercase && cs[i + 1].isLowercase
}

private func formatarPalavra(_ palavra: String, meio: Bool) -> String {
    let p = palavra.lowercased(with: PT_BR)
    if meio && PARTICULAS_NOME.contains(p) { return p }
    if ehCamel(palavra) { return palavra }
    if p.contains("-") {
        let pedacos = p.components(separatedBy: "-")
        return pedacos.enumerated().map { i, pedaco in
            formatarPalavra(pedaco, meio: i > 0 && i < pedacos.count - 1)
        }.joined(separator: "-")
    }
    if let i = p.firstIndex(where: { $0 == "'" || $0 == "’" }) {
        let antes = String(p[..<i])
        let ap = String(p[i])
        let depois = String(p[p.index(after: i)...])
        let prefixo = (meio && antes == "d") ? "d" : capitalizarParte(antes)
        return prefixo + ap + capitalizarParte(depois)
    }
    return capitalizarParte(p)
}

/// "alcindo de oliveira neto" → "Alcindo de Oliveira Neto" (igual ao web e ao servidor).
public func formatarNome(_ nome: String) -> String {
    let palavras = nome.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard !palavras.isEmpty else { return "" }
    let ultima = palavras.count - 1
    return palavras.enumerated().map { i, w in
        if i > 0 && i == ultima && ROMANOS.contains(w.lowercased(with: PT_BR)) { return w.uppercased(with: PT_BR) }
        return formatarPalavra(w, meio: i > 0 && i < ultima)
    }.joined(separator: " ")
}

// MARK: comparação de nomes (localeCompare pt-BR)

/// Texto sem acento e sem caixa (para comparar e buscar).
public func dobrar(_ s: String) -> String {
    s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: PT_BR)
}

/// Ordem de nomes como o `localeCompare(…, 'pt-BR')` do web: sem acento/caixa primeiro
/// (Alice < Álvaro < Bruno); empate, o texto cru.
public func compararNome(_ a: String, _ b: String) -> Bool {
    let x = dobrar(a), y = dobrar(b)
    if x != y { return x < y }
    // empate sem acento/caixa: minúscula antes (como o ICU) e depois o código
    let xl = a.lowercased() == a, yl = b.lowercased() == b
    if xl != yl { return xl }
    return a < b
}

// MARK: posições

/// Ordem por posição do web (PlantelPage `positionOrder`); desconhecida/nula = 999.
public let ORDEM_POSICAO: [String: Int] = [
    "GOL": 1, "GR": 1, "LD": 2, "DD": 2, "ZAG": 3, "DC": 3, "Z": 3, "LE": 4, "DE": 4, "VOL": 5, "MC": 5,
    "MEI": 6, "MD": 6, "ME": 6, "MOF": 6, "M": 6, "ED": 7, "EE": 8, "CA": 9, "PL": 9, "SA": 9, "A": 9,
    "FIX": 3, "ALA-D": 5, "ALA-E": 6, "PIV": 9,
]

public func ordemDaPosicao(_ p: String?) -> Int { p.flatMap { ORDEM_POSICAO[$0] } ?? 999 }

public struct Posicao: Equatable, Sendable, Hashable {
    public let codigo: String
    public let nome: String
    public init(_ codigo: String, _ nome: String) { self.codigo = codigo; self.nome = nome }
    /// "Zagueiro (ZAG)" — o <option> do web.
    public var rotulo: String { "\(nome) (\(codigo))" }
}

private let POSICOES_CAMPO = [
    Posicao("GOL", "Goleiro"), Posicao("ZAG", "Zagueiro"), Posicao("LD", "Lateral Direito"), Posicao("LE", "Lateral Esquerdo"),
    Posicao("VOL", "Volante"), Posicao("MEI", "Meia"), Posicao("ED", "Extremo Direito"), Posicao("EE", "Extremo Esquerdo"),
    Posicao("CA", "Centroavante"),
]
private let POSICOES_FUTSAL = [
    Posicao("GOL", "Goleiro"), Posicao("FIX", "Fixo"), Posicao("ALA-D", "Ala Direito"), Posicao("ALA-E", "Ala Esquerdo"),
    Posicao("PIV", "Pivô"),
]

/// As posições do cadastro pela modalidade do clube (nil/desconhecida = futebol 11).
public func posicoesDaModalidade(_ modalidade: String?) -> [Posicao] {
    modalidade == "futsal" ? POSICOES_FUTSAL : POSICOES_CAMPO
}

/// Nome da posição ("Zagueiro"); código antigo/desconhecido volta o próprio código.
public func nomeDaPosicao(_ codigo: String?, modalidade: String?) -> String? {
    guard let codigo, !codigo.isEmpty else { return nil }
    return (posicoesDaModalidade(modalidade) + POSICOES_CAMPO + POSICOES_FUTSAL).first { $0.codigo == codigo }?.nome ?? codigo
}

// MARK: modelo

public struct Atleta: Codable, Equatable, Sendable, Identifiable, Hashable {
    public var id: String
    public var nome: String
    public var posicao: String?
    public var camisa: Int?
    public var status: String?
    public var observacao: String?
    public var grupo: String?
    public var fotoUrl: String?
    public var clubeId: String?
    public var categoriaId: String?
    public var nascimento: String?
    public var alturaCm: Int?
    public var pe: String?
    public var clubeAnterior: String?

    public init(id: String, nome: String, posicao: String? = nil, camisa: Int? = nil, status: String? = "active",
                observacao: String? = nil, grupo: String? = nil, fotoUrl: String? = nil, clubeId: String? = nil,
                categoriaId: String? = nil, nascimento: String? = nil, alturaCm: Int? = nil, pe: String? = nil,
                clubeAnterior: String? = nil) {
        self.id = id; self.nome = nome; self.posicao = posicao; self.camisa = camisa; self.status = status
        self.observacao = observacao; self.grupo = grupo; self.fotoUrl = fotoUrl; self.clubeId = clubeId
        self.categoriaId = categoriaId; self.nascimento = nascimento; self.alturaCm = alturaCm; self.pe = pe
        self.clubeAnterior = clubeAnterior
    }

    enum CodingKeys: String, CodingKey {
        case id, nome = "name", posicao = "position", camisa = "jersey_number", status, observacao = "observation",
             grupo = "group", fotoUrl = "photo_url", clubeId = "club_id", categoriaId = "category_id",
             nascimento = "birthdate", alturaCm = "height_cm", pe = "preferred_foot", clubeAnterior = "previous_club"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        posicao = (try? c.decodeIfPresent(String.self, forKey: .posicao)).flatMap { $0?.isEmpty == true ? nil : $0 }
        camisa = c.numeroFlex(.camisa).map { Int($0) }
        status = try? c.decodeIfPresent(String.self, forKey: .status)
        observacao = try? c.decodeIfPresent(String.self, forKey: .observacao)
        if let g = try? c.decodeIfPresent(String.self, forKey: .grupo) { grupo = g.isEmpty ? nil : g }
        else { grupo = c.numeroFlex(.grupo).map { String(Int($0)) } }
        fotoUrl = try? c.decodeIfPresent(String.self, forKey: .fotoUrl)
        clubeId = try? c.decodeIfPresent(String.self, forKey: .clubeId)
        categoriaId = try? c.decodeIfPresent(String.self, forKey: .categoriaId)
        nascimento = (try? c.decodeIfPresent(String.self, forKey: .nascimento)).flatMap { $0.map { String($0.prefix(10)) } }
        alturaCm = c.numeroFlex(.alturaCm).map { Int($0) }
        pe = try? c.decodeIfPresent(String.self, forKey: .pe)
        clubeAnterior = try? c.decodeIfPresent(String.self, forKey: .clubeAnterior)
    }
}

/// Ordena como o web: por posição (999 = desconhecida) e nome, ou só por nome.
public func ordenarAtletas(_ lista: [Atleta], porPosicao: Bool) -> [Atleta] {
    lista.sorted { a, b in
        if porPosicao {
            let oa = ordemDaPosicao(a.posicao), ob = ordemDaPosicao(b.posicao)
            if oa != ob { return oa < ob }
        }
        return compararNome(a.nome, b.nome)
    }
}

// MARK: grupos

public struct GrupoElenco: Equatable, Sendable, Hashable {
    /// Valor de `athletes.group` (nil = sem grupo).
    public let valor: String?
    public let nome: String
    public let sigla: String
    public init(_ valor: String?, _ nome: String, _ sigla: String) { self.valor = valor; self.nome = nome; self.sigla = sigla }
    public var id: String { valor ?? "_sem" }
}

public let GRUPOS_ELENCO: [GrupoElenco] = [
    GrupoElenco("1", "Grupo 1", "G1"), GrupoElenco("2", "Grupo 2", "G2"), GrupoElenco("3", "Grupo 3", "G3"),
    GrupoElenco("Transição", "Transição", "TR"), GrupoElenco("DM", "Departamento médico", "DM"),
    GrupoElenco(nil, "Sem grupo", "—"),
]

/// O grupo de um valor de `group` (desconhecido = "Sem grupo").
public func grupoDoAtleta(_ group: String?) -> GrupoElenco {
    GRUPOS_ELENCO.first { $0.valor != nil && $0.valor == group } ?? GRUPOS_ELENCO[GRUPOS_ELENCO.count - 1]
}

public struct SecaoElenco: Equatable, Sendable, Identifiable {
    public let grupo: GrupoElenco
    public let atletas: [Atleta]
    /// No DM: "Kauã: lesão muscular · volta 30/10" (a 1ª lesão ativa).
    public let resumo: String?
    public var id: String { grupo.id }
}

/// Filtro de categoria: "todas", "sem" (sem categoria) ou o id.
public let CATEGORIA_TODAS = "todas"
public let CATEGORIA_SEM = "sem"

/// O atleta passa na busca? Nome sem acento/caixa contém o texto, ou camisa exata.
public func atletaCasaBusca(_ a: Atleta, _ busca: String) -> Bool {
    let q = busca.trimmingCharacters(in: .whitespacesAndNewlines)
    if q.isEmpty { return true }
    if let n = Int(q), a.camisa == n { return true }
    return dobrar(a.nome).contains(dobrar(q))
}

/// As seções do Elenco (ordem de GRUPOS_ELENCO, só as não vazias) com busca e filtros.
public func agruparElenco(_ atletas: [Atleta], busca: String = "", categoria: String = CATEGORIA_TODAS,
                          posicao: String? = nil, porPosicao: Bool = true, lesoesAtivas: [Lesao] = []) -> [SecaoElenco] {
    let filtrados = atletas.filter { a in
        guard atletaCasaBusca(a, busca) else { return false }
        if categoria == CATEGORIA_SEM, a.categoriaId != nil { return false }
        if categoria != CATEGORIA_TODAS, categoria != CATEGORIA_SEM, a.categoriaId != categoria { return false }
        if let posicao, a.posicao != posicao { return false }
        return true
    }
    return GRUPOS_ELENCO.compactMap { g in
        let doGrupo = filtrados.filter { grupoDoAtleta($0.grupo) == g }
        guard !doGrupo.isEmpty else { return nil }
        let ordenados = ordenarAtletas(doGrupo, porPosicao: porPosicao)
        var resumo: String?
        if g.valor == "DM" {
            let ids = Set(ordenados.map(\.id))
            if let l = lesoesAtivas.first(where: { ids.contains($0.atletaId ?? "") }),
               let a = ordenados.first(where: { $0.id == l.atletaId }) {
                resumo = resumoLesao(l, nome: primeiroNome(a.nome) ?? a.nome)
            }
        }
        return SecaoElenco(grupo: g, atletas: ordenados, resumo: resumo)
    }
}

/// "Kauã: lesão muscular · volta 30/10".
public func resumoLesao(_ l: Lesao, nome: String) -> String {
    var t = "\(nome): \(l.tipo.lowercased(with: PT_BR))"
    if let r = l.retornoPrevisto, let dm = diaMes(r) { t += " · volta \(dm)" }
    return t
}

/// "2026-10-30" → "30/10".
func diaMes(_ data: String) -> String? {
    let p = data.prefix(10).split(separator: "-")
    guard p.count == 3 else { return nil }
    return "\(p[2])/\(p[1])"
}

/// "2026-10-30" → "30/10/2026".
public func dataCurtaBR(_ data: String?) -> String? {
    guard let data else { return nil }
    let p = data.prefix(10).split(separator: "-")
    guard p.count == 3 else { return nil }
    return "\(p[2])/\(p[1])/\(p[0])"
}

/// Idade em anos completos na data `hoje` (nil sem nascimento válido).
public func idadeEm(_ nascimento: String?, hoje: String) -> Int? {
    guard let n = nascimento, n.count >= 10 else { return nil }
    let a = n.prefix(10).split(separator: "-").compactMap { Int($0) }
    let h = hoje.prefix(10).split(separator: "-").compactMap { Int($0) }
    guard a.count == 3, h.count == 3 else { return nil }
    var idade = h[0] - a[0]
    if h[1] < a[1] || (h[1] == a[1] && h[2] < a[2]) { idade -= 1 }
    return idade >= 0 ? idade : nil
}

/// "MEI · 17 anos" (a linha do atleta).
public func detalheAtleta(_ a: Atleta, hoje: String) -> String {
    var partes: [String] = []
    if let p = a.posicao { partes.append(p) }
    if let i = idadeEm(a.nascimento, hoje: hoje) { partes.append("\(i) anos") }
    if let s = a.status, s != "active", let r = ROTULO_STATUS[s] { partes.append(r) }
    return partes.isEmpty ? "Sem posição" : partes.joined(separator: " · ")
}

// MARK: status, pé, validação e corpo

public let STATUS_ATLETA: [(String, String)] = [("active", "Ativo"), ("injured", "Lesionado"), ("suspended", "Suspenso"), ("inactive", "Inativo")]
public let ROTULO_STATUS: [String: String] = Dictionary(uniqueKeysWithValues: STATUS_ATLETA)
public let PES: [(String, String)] = [("right", "Direito"), ("left", "Esquerdo"), ("both", "Ambidestro")]
public let ROTULO_PE: [String: String] = Dictionary(uniqueKeysWithValues: PES)

public let MSG_NOME_OBRIGATORIO = "Nome é obrigatório"
public let MSG_POSICAO_OBRIGATORIA = "Posição é obrigatória"
public let MSG_CAMISA_INVALIDA = "Camisa entre 1 e 99"
public let MSG_ALTURA_INVALIDA = "Altura entre 100 e 240 cm"

/// Confere o formulário do atleta (o servidor confere de novo). nil = ok.
public func erroAtleta(nome: String, posicao: String?, camisa: Int?, altura: Int?) -> String? {
    if nome.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return MSG_NOME_OBRIGATORIO }
    if (posicao ?? "").isEmpty { return MSG_POSICAO_OBRIGATORIA }
    if let c = camisa, !(1...99).contains(c) { return MSG_CAMISA_INVALIDA }
    if let h = altura, !(100...240).contains(h) { return MSG_ALTURA_INVALIDA }
    return nil
}

private func textoOuNulo(_ s: String?) -> Json {
    guard let t = s?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return .nulo }
    return .texto(t)
}

/// Corpo COMPLETO do POST/PUT /api/athletes (o PUT do servidor sobrescreve todas as colunas: o que
/// não vier vira nulo — por isso a foto atual vai junto). Nome passa por formatarNome.
public func corpoAtleta(_ a: Atleta, clubeId: String) -> Json {
    .objeto([
        "name": .texto(formatarNome(a.nome)),
        "position": textoOuNulo(a.posicao),
        "jersey_number": a.camisa.map { .numero(Double($0)) } ?? .nulo,
        "status": .texto(a.status ?? "active"),
        "observation": textoOuNulo(a.observacao),
        "group": a.grupo.map { .texto($0) } ?? .nulo,
        "photo_url": textoOuNulo(a.fotoUrl),
        "club_id": .texto(a.clubeId ?? clubeId),
        "category_id": textoOuNulo(a.categoriaId),
        "birthdate": textoOuNulo(a.nascimento),
        "height_cm": a.alturaCm.map { .numero(Double($0)) } ?? .nulo,
        "preferred_foot": textoOuNulo(a.pe),
        "previous_club": textoOuNulo(a.clubeAnterior),
    ])
}

/// Corpo do PUT /api/athletes/batch-groups (mover de grupo).
public func corpoMoverGrupo(_ ids: [String], para grupo: String?) -> Json {
    .objeto(["athletes": .lista(ids.map { .objeto(["id": .texto($0), "group": grupo.map { .texto($0) } ?? .nulo]) })])
}

// MARK: lesões (departamento médico)

public struct Severidade: Equatable, Sendable, Hashable {
    public let id: String
    public let rotulo: String
    public let cor: String
}

public let SEVERIDADES = [
    Severidade(id: "light", rotulo: "Leve", cor: "#f59e0b"),
    Severidade(id: "medium", rotulo: "Moderada", cor: "#ef4444"),
    Severidade(id: "severe", rotulo: "Grave", cor: "#b91c1c"),
]
public let SEVERIDADE_PADRAO = "medium"
public func severidade(_ id: String?) -> Severidade { SEVERIDADES.first { $0.id == id } ?? SEVERIDADES[1] }

public struct Lesao: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var atletaId: String?
    public var tipo: String
    public var local: String?
    public var gravidade: String?
    public var inicio: String?
    public var retornoPrevisto: String?
    public var resolvidaEm: String?
    public var notas: String?
    public var atletaNome: String?

    public init(id: String, atletaId: String? = nil, tipo: String, local: String? = nil, gravidade: String? = SEVERIDADE_PADRAO,
                inicio: String? = nil, retornoPrevisto: String? = nil, resolvidaEm: String? = nil, notas: String? = nil,
                atletaNome: String? = nil) {
        self.id = id; self.atletaId = atletaId; self.tipo = tipo; self.local = local; self.gravidade = gravidade
        self.inicio = inicio; self.retornoPrevisto = retornoPrevisto; self.resolvidaEm = resolvidaEm; self.notas = notas
        self.atletaNome = atletaNome
    }

    enum CodingKeys: String, CodingKey {
        case id, atletaId = "athlete_id", tipo = "injury_type", local = "body_part", gravidade = "severity",
             inicio = "started_at", retornoPrevisto = "expected_return", resolvidaEm = "resolved_at", notas = "notes",
             atletaNome = "athlete_name"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        atletaId = try? c.decodeIfPresent(String.self, forKey: .atletaId)
        tipo = (try? c.decodeIfPresent(String.self, forKey: .tipo)) ?? ""
        local = try? c.decodeIfPresent(String.self, forKey: .local)
        gravidade = try? c.decodeIfPresent(String.self, forKey: .gravidade)
        func data(_ k: CodingKeys) -> String? { (try? c.decodeIfPresent(String.self, forKey: k)).flatMap { $0.map { String($0.prefix(10)) } } }
        inicio = data(.inicio); retornoPrevisto = data(.retornoPrevisto); resolvidaEm = data(.resolvidaEm)
        notas = try? c.decodeIfPresent(String.self, forKey: .notas)
        atletaNome = try? c.decodeIfPresent(String.self, forKey: .atletaNome)
    }

    public var ativa: Bool { (resolvidaEm ?? "").isEmpty }
}

public let MSG_TIPO_LESAO = "Informe o tipo da lesão."
public let TEXTO_REMOVER_LESAO = "Remover registro de lesão? Esta ação não pode ser desfeita."

public func erroLesao(tipo: String) -> String? {
    tipo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? MSG_TIPO_LESAO : nil
}

/// Corpo do POST /api/athletes/:id/injuries. Início padrão = hoje.
public func corpoLesao(tipo: String, local: String?, gravidade: String?, inicio: String?, retornoPrevisto: String?,
                       notas: String?, hoje: String) -> Json {
    .objeto([
        "injury_type": .texto(tipo.trimmingCharacters(in: .whitespacesAndNewlines)),
        "body_part": textoOuNulo(local),
        "severity": .texto(severidade(gravidade).id),
        "started_at": .texto((inicio?.isEmpty == false ? inicio! : hoje)),
        "expected_return": textoOuNulo(retornoPrevisto),
        "notes": textoOuNulo(notas),
    ])
}

/// "Lesão muscular · Coxa direita".
public func tituloLesao(_ l: Lesao) -> String {
    [l.tipo, l.local].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " · ")
}

/// "26/09/2026 · retorno previsto 07/10/2026" ou "26/09/2026 → resolvida em 05/10/2026".
public func detalheLesao(_ l: Lesao) -> String {
    var t = dataCurtaBR(l.inicio) ?? "—"
    if let r = dataCurtaBR(l.resolvidaEm) { t += " → resolvida em \(r)" }
    else if let p = dataCurtaBR(l.retornoPrevisto) { t += " · retorno previsto \(p)" }
    return t
}

// MARK: mensagens

public let MSG_SEM_PERMISSAO_ATLETAS = "Você não tem permissão para editar atletas neste clube. Peça ao responsável pelo clube para liberar em Staff."
public let MSG_SEM_PERMISSAO_LESOES = "Você não tem permissão para registrar lesões neste clube. Peça ao responsável pelo clube para liberar em Staff."
public let TEXTO_REMOVER_ATLETA = "Tem certeza que deseja excluir este atleta?"
public let TITULO_ELENCO_VAZIO = "Nenhum atleta cadastrado"
public let TEXTO_ELENCO_VAZIO_EDITA = "Toque em + para cadastrar o primeiro atleta."
public let TEXTO_ELENCO_VAZIO_LE = "Quando a comissão cadastrar os atletas, eles aparecem aqui."
public let TEXTO_FOTO_ATLETA = "Aparece nos PDFs de plantel e convocação. JPG/PNG, até 8 MB."
public let MSG_FOTO_GRANDE = "A imagem deve ter no máximo 8 MB."
public let TAMANHO_MAX_FOTO = 8 * 1024 * 1024
/// Campo do arquivo no POST /api/athletes/:id/photo (multer `.single('photo')`).
public let CAMPO_FOTO_ATLETA = "photo"

/// Texto de erro de uma escrita do elenco (403 → aviso amigável; 402/409 → frases neutras).
public func mensagemErroElenco(_ e: Error, permissao: String = MSG_SEM_PERMISSAO_ATLETAS) -> String {
    if let erro = e as? ErroApi, erro.status == 403, !ehSomenteLeitura(e) { return permissao }
    if let erro = e as? ErroApi, erro.status == 402 { return TEXTO_NAO_EDITA }
    return mensagemDeErro(e)
}

/// "22 atletas · 2 no DM".
public func resumoElenco(_ atletas: [Atleta]) -> String {
    let dm = atletas.filter { $0.grupo == "DM" }.count
    var t = contagem(atletas.count, "atleta", "atletas")
    if dm > 0 { t += " · \(dm) no DM" }
    return t
}

/// Nome do PDF do plantel no aparelho (o servidor manda Plantel_<clube>_<data>.pdf).
public func nomePdfPlantel(_ clube: String, hoje: String) -> String {
    "Plantel_\(nomeDeArquivo(clube))_\(hoje).pdf"
}

/// `safeFileName` do web: sem acento, espaço vira _, só [A-Za-z0-9_-].
public func nomeDeArquivo(_ s: String) -> String {
    let semAcento = s.folding(options: .diacriticInsensitive, locale: PT_BR).replacingOccurrences(of: " ", with: "_")
    return String(semAcento.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "_" || $0 == "-" }.map(Character.init))
}

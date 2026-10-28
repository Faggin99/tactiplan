import Foundation

// Análise do adversário do jogo (GET/PUT /api/games/:id/analise, migration 062), no app.
// O formulário é gerado por um ESQUEMA (seções → campos), o mesmo do web
// (OpponentAnalysisModal.jsx). Os dados ficam como `Json` cru; o servidor normaliza ao salvar
// (analiseAdversario.js) e o PDF mostra só o que foi preenchido.
// Paridade das chaves: native/paridade/analise.json (AnaliseTests). Android: dados/jogo/Analise.kt.

/// Campo do formulário. `caminho` é absoluto; itens de `repetir` usam caminhos RELATIVOS ao item.
public indirect enum CampoAnalise: Sendable {
    case texto(rotulo: String, caminho: [String], dica: String = "", max: Int = 200)
    case textoLongo(rotulo: String, caminho: [String], dica: String = "")
    case numero(rotulo: String, caminho: [String], max: Int = 999)
    /// Lista de tópicos: uma linha por item.
    case lista(rotulo: String, caminho: [String], dica: String = "Um item por linha")
    case escolha(rotulo: String, caminho: [String], opcoes: [OpcaoAnalise])
    case repetir(rotulo: String, caminho: [String], item: String, max: Int, campos: [CampoAnalise])
    /// Formação do rival + nº/nome por vaga (vagasLivres).
    case escalacao
    case aviso(String)
}

public struct OpcaoAnalise: Sendable, Equatable, Hashable {
    public let valor: String
    public let rotulo: String
    public init(_ valor: String, _ rotulo: String) { self.valor = valor; self.rotulo = rotulo }
}

public struct SecaoAnalise: Sendable, Identifiable {
    public let chave: String
    public let titulo: String
    public let campos: [CampoAnalise]
    public var id: String { chave }
}

private let FREQ = [OpcaoAnalise("", "—"), OpcaoAnalise("predominante", "Predominante"), OpcaoAnalise("frequente", "Frequente"),
                    OpcaoAnalise("pontual", "Pontual"), OpcaoAnalise("raro", "Raro")]
private let PERDER = [OpcaoAnalise("", "—"), OpcaoAnalise("pressionam", "Pressionam (contrapressão)"), OpcaoAnalise("temporizam", "Temporizam"),
                      OpcaoAnalise("recuam", "Recuam e recompõem o bloco")]
private let RECUPERAR = [OpcaoAnalise("", "—"), OpcaoAnalise("verticais", "Passes verticais (contra-ataque)"),
                         OpcaoAnalise("laterais", "Passes laterais"), OpcaoAnalise("tras", "Passes para trás (retêm a posse)")]

private func fonte(_ k: String) -> CampoAnalise { .texto(rotulo: "Fontes (opcional)", caminho: ["fontes", k], dica: "Ex.: CONMEBOL, vídeo do último jogo") }
private func t(_ r: String, _ c: String..., dica: String = "", max: Int = 200) -> CampoAnalise { .texto(rotulo: r, caminho: c, dica: dica, max: max) }
private func n(_ r: String, _ c: String..., max: Int = 999) -> CampoAnalise { .numero(rotulo: r, caminho: c, max: max) }
private func l(_ r: String, _ c: String..., dica: String = "Um item por linha") -> CampoAnalise { .lista(rotulo: r, caminho: c, dica: dica) }

/// As 13 seções, na ordem do web e do PDF.
public let SECOES_ANALISE: [SecaoAnalise] = [
    SecaoAnalise(chave: "capa", titulo: "Capa", campos: [
        .aviso("Adversário, campeonato, data, horário e local vêm dos dados do jogo."),
        t("Fase", "capa", "fase", dica: "Ex.: Semifinal (volta)"), t("Jogo de ida", "capa", "ida", dica: "Ex.: Estudiantes 0 × 0 Fla"),
        t("Técnico do adversário", "capa", "tecnico"), t("Observação", "capa", "observacao", dica: "Ex.: Dados públicos até 22/10"),
    ]),
    SecaoAnalise(chave: "campanha", titulo: "Campanha", campos: [
        t("Situação na competição", "campanha", "situacao", dica: "Ex.: 1º do Grupo A · invicto"),
        n("Vitórias", "campanha", "vitorias"), n("Empates", "campanha", "empates"), n("Derrotas", "campanha", "derrotas"),
        n("Gols pró", "campanha", "gols_pro"), n("Gols contra", "campanha", "gols_contra"), n("Posse %", "campanha", "posse", max: 100),
        .repetir(rotulo: "Últimos jogos (mais antigo → mais recente)", caminho: ["campanha", "ultimos"], item: "Jogo", max: 10, campos: [
            .escolha(rotulo: "Resultado", caminho: ["resultado"], opcoes: [OpcaoAnalise("", "—"), OpcaoAnalise("V", "Vitória"), OpcaoAnalise("E", "Empate"), OpcaoAnalise("D", "Derrota")]),
            .texto(rotulo: "Contra", caminho: ["adversario"]),
            .escolha(rotulo: "Mando", caminho: ["mando"], opcoes: [OpcaoAnalise("", "—"), OpcaoAnalise("C", "Casa"), OpcaoAnalise("F", "Fora"), OpcaoAnalise("N", "Neutro")]),
            .texto(rotulo: "Placar", caminho: ["placar"], dica: "2 × 1", max: 12),
        ]),
        n("Em casa · J", "campanha", "casa", "j"), n("Em casa · V", "campanha", "casa", "v"), n("Em casa · E", "campanha", "casa", "e"),
        n("Em casa · D", "campanha", "casa", "d"), n("Em casa · GP", "campanha", "casa", "gp"), n("Em casa · GC", "campanha", "casa", "gc"),
        n("Fora · J", "campanha", "fora", "j"), n("Fora · V", "campanha", "fora", "v"), n("Fora · E", "campanha", "fora", "e"),
        n("Fora · D", "campanha", "fora", "d"), n("Fora · GP", "campanha", "fora", "gp"), n("Fora · GC", "campanha", "fora", "gc"),
        .textoLongo(rotulo: "Observação", caminho: ["campanha", "observacao"]), fonte("campanha"),
    ]),
    SecaoAnalise(chave: "sistema", titulo: "Sistema inicial", campos: [
        t("Ofensivo · formação", "sistema", "ofensivo", "formacao", dica: "Ex.: 4-3-3", max: 12),
        t("Ofensivo · descrição", "sistema", "ofensivo", "descricao"), l("Ofensivo · observações", "sistema", "ofensivo", "itens"),
        t("Defensivo · formação", "sistema", "defensivo", "formacao", dica: "Ex.: 4-1-4-1", max: 12),
        t("Defensivo · descrição", "sistema", "defensivo", "descricao"), l("Defensivo · observações", "sistema", "defensivo", "itens"),
        fonte("sistema"),
    ]),
    SecaoAnalise(chave: "variacoes", titulo: "Variações do sistema", campos: [
        .repetir(rotulo: "Variações", caminho: ["variacoes"], item: "Variação", max: 6, campos: [
            .texto(rotulo: "Situação", caminho: ["fase"], dica: "Com bola / Sem bola…"), .texto(rotulo: "Formação", caminho: ["formacao"], dica: "2-3-5", max: 12),
            .texto(rotulo: "Quando", caminho: ["quando"]), .lista(rotulo: "Observações", caminho: ["itens"]),
        ]),
        fonte("variacoes"),
    ]),
    SecaoAnalise(chave: "escalacao", titulo: "Provável escalação", campos: [
        .escalacao,
        l("Opções no banco", "escalacao", "banco", dica: "Ex.: 27 Bruno Henrique – atacante"),
        l("Desfalques", "escalacao", "desfalques"), l("Dúvidas", "escalacao", "duvidas"),
        t("Observação", "escalacao", "observacao"), fonte("escalacao"),
    ]),
    SecaoAnalise(chave: "individuais", titulo: "Análise individual", campos: [
        .repetir(rotulo: "Jogadores", caminho: ["individuais"], item: "Jogador", max: 8, campos: [
            .texto(rotulo: "Nome", caminho: ["nome"]), .numero(rotulo: "Nº", caminho: ["numero"], max: 99),
            .texto(rotulo: "Posição", caminho: ["posicao"], max: 40), .texto(rotulo: "Destaque", caminho: ["destaque"], dica: "Ex.: artilheiro com 5 gols"),
            .lista(rotulo: "Pontos fortes", caminho: ["fortes"]), .lista(rotulo: "Pontos fracos", caminho: ["fracos"]),
            .lista(rotulo: "Como neutralizar", caminho: ["neutralizar"]),
        ]),
        fonte("individuais"),
    ]),
    SecaoAnalise(chave: "ataque", titulo: "Organização ofensiva", campos: [
        l("1 · Construção", "ataque", "construcao"), l("2 · 2ª fase de construção", "ataque", "segunda_fase"),
        l("3 · Criação", "ataque", "criacao"), l("4 · Finalização", "ataque", "finalizacao"), fonte("ataque"),
    ]),
    SecaoAnalise(chave: "defesa", titulo: "Organização defensiva", campos: [("alto", "Bloco alto"), ("medio", "Bloco médio"), ("baixo", "Bloco baixo")].flatMap { b, r in
        [CampoAnalise.escolha(rotulo: "\(r) · frequência", caminho: ["defesa", b, "frequencia"], opcoes: FREQ),
         CampoAnalise.lista(rotulo: "\(r) · observações", caminho: ["defesa", b, "itens"])]
    } + [fonte("defesa")]),
    SecaoAnalise(chave: "transicoes", titulo: "Transições", campos: [
        .escolha(rotulo: "Quando perdem a bola", caminho: ["transicoes", "perder", "comportamento"], opcoes: PERDER),
        l("Quando perdem · observações", "transicoes", "perder", "itens"),
        .escolha(rotulo: "Quando roubam a bola", caminho: ["transicoes", "recuperar", "comportamento"], opcoes: RECUPERAR),
        l("Quando roubam · observações", "transicoes", "recuperar", "itens"), fonte("transicoes"),
    ]),
    SecaoAnalise(chave: "bp_ofensiva", titulo: "Bolas paradas ofensivas", campos: [
        .textoLongo(rotulo: "Resumo", caminho: ["bp_ofensiva", "resumo"], dica: "Ex.: 20% dos gols de bola parada…"),
        l("Escanteios", "bp_ofensiva", "escanteios"), l("Faltas", "bp_ofensiva", "faltas"),
        l("Laterais", "bp_ofensiva", "laterais"), l("Pênaltis", "bp_ofensiva", "penaltis"), fonte("bp_ofensiva"),
    ]),
    SecaoAnalise(chave: "bp_defensiva", titulo: "Bolas paradas defensivas", campos: [
        t("Marcação", "bp_defensiva", "marcacao", dica: "zona / individual / mista"), n("Homens na área", "bp_defensiva", "homens_area", max: 11),
        t("Jogador na trave", "bp_defensiva", "trave", dica: "sim / não"), t("Barreira", "bp_defensiva", "barreira", dica: "nº de jogadores"),
        t("Quem fica na frente (contra-ataque)", "bp_defensiva", "contra_ataque"),
        l("Goleiro", "bp_defensiva", "goleiro"), l("Observações", "bp_defensiva", "itens"), fonte("bp_defensiva"),
    ]),
    SecaoAnalise(chave: "pontos", titulo: "Pontos positivos e a explorar", campos: [
        l("Pontos positivos (o que fazem bem)", "pontos", "positivos"), l("Pontos a explorar (fragilidades)", "pontos", "explorar"), fonte("pontos"),
    ]),
    SecaoAnalise(chave: "final", titulo: "Observações finais", campos: [
        l("Observações finais", "final", "observacoes"),
        .textoLongo(rotulo: "Mensagem principal para o jogo", caminho: ["final", "mensagem"], dica: "A ideia principal para o grupo"), fonte("final"),
    ]),
]

// MARK: Json por caminho

public func lerEm(_ e: Json?, _ caminho: [String]) -> Json? {
    caminho.reduce(e) { atual, k in
        switch atual {
        case .objeto(let o)?: return o[k]
        case .lista(let l)?: return Int(k).flatMap { $0 >= 0 && $0 < l.count ? l[$0] : nil }
        default: return nil
        }
    }
}

public func gravarEm(_ e: Json?, _ caminho: [String], _ valor: Json) -> Json {
    guard let k = caminho.first else { return valor }
    let resto = Array(caminho.dropFirst())
    if case .lista(var l)? = e, let i = Int(k) {
        while l.count <= i { l.append(.nulo) }
        l[i] = gravarEm(l[i], resto, valor)
        return .lista(l)
    }
    var o = e?.objeto ?? [:]
    o[k] = gravarEm(o[k], resto, valor)
    return .objeto(o)
}

public func textoEm(_ e: Json?, _ caminho: [String]) -> String { lerEm(e, caminho)?.texto ?? "" }

public func numeroEm(_ e: Json?, _ caminho: [String]) -> Int? { lerEm(e, caminho)?.numero.map { Int($0) } }

/// Lista de tópicos → texto (uma linha por item) e de volta (as linhas vazias o servidor tira).
public func listaComoTexto(_ e: Json?, _ caminho: [String]) -> String {
    switch lerEm(e, caminho) {
    case .lista(let l)?: return l.map { $0.texto ?? "" }.joined(separator: "\n")
    case .texto(let s)?: return s
    default: return ""
    }
}
public func textoComoLista(_ s: String) -> Json { .lista(s.components(separatedBy: "\n").map { .texto($0) }) }

/// Tem algo preenchido? (marca a seção na lista).
public func temAlgo(_ e: Json?) -> Bool {
    switch e {
    case nil, .nulo?: return false
    case .texto(let s)?: return !s.trimmingCharacters(in: .whitespaces).isEmpty
    case .numero?, .booleano?: return true
    case .lista(let l)?: return l.contains { temAlgo($0) }
    case .objeto(let o)?: return o.values.contains { temAlgo($0) }
    }
}

public func secaoPreenchida(_ dados: Json?, _ chave: String) -> Bool {
    temAlgo(lerEm(dados, [chave])) || temAlgo(lerEm(dados, ["fontes", chave]))
}

// MARK: formação livre (= backend-node/src/reports/formacaoLivre.js)

public struct VagaLivre: Equatable, Sendable, Identifiable {
    public let vaga: Int
    public let papel: String
    public let x: Double
    public let y: Double
    public var id: Int { vaga }
}

public func linhasDa(_ formacao: String?) -> [Int]? {
    let ns = (formacao ?? "").split(whereSeparator: { !$0.isNumber }).compactMap { Int($0) }.filter { (1...6).contains($0) }
    return (2...5).contains(ns.count) && ns.reduce(0, +) <= 10 ? ns : nil
}

private func arred(_ v: Double) -> Double { (v * 10).rounded() / 10 }

public func vagasLivres(_ formacao: String?) -> [VagaLivre] {
    let linhas = linhasDa(formacao) ?? []
    var out = [VagaLivre(vaga: 0, papel: "GOL", x: 50, y: 91)]
    let n = linhas.count
    var vaga = 1
    for (i, qtd) in linhas.enumerated() {
        let y = n == 1 ? 50 : 74 - (Double(i) * (74 - 18)) / Double(n - 1)
        let papel = i == 0 ? "DEF" : (i == n - 1 ? "ATA" : "MEI")
        for k in 0..<qtd {
            let x = qtd == 1 ? 50 : 12 + (Double(k) * 76) / Double(qtd - 1)
            out.append(VagaLivre(vaga: vaga, papel: papel, x: arred(x), y: arred(y)))
            vaga += 1
        }
    }
    return out
}

public let PAPEL_VAGA: [String: String] = ["GOL": "Goleiro", "DEF": "Defesa", "MEI": "Meio", "ATA": "Ataque"]

/// Jogador da vaga na escalação (nº e nome).
public func jogadorDaVaga(_ dados: Json?, _ vaga: Int) -> [String: Json]? {
    guard case .lista(let l)? = lerEm(dados, ["escalacao", "jogadores"]) else { return nil }
    return l.compactMap { $0.objeto }.first { $0["vaga"]?.numero.map { Int($0) } == vaga }
}

/// Muda nº ou nome de uma vaga (cria o jogador se não existir), ordenado por vaga.
public func mudarJogadorDaVaga(_ dados: Json?, _ vaga: Int, _ campo: String, _ valor: Json) -> Json {
    var lista: [[String: Json]] = []
    if case .lista(let l)? = lerEm(dados, ["escalacao", "jogadores"]) { lista = l.compactMap { $0.objeto } }
    let vagaDe = { (o: [String: Json]) in o["vaga"]?.numero.map { Int($0) } }
    var atual = lista.first { vagaDe($0) == vaga } ?? ["vaga": .numero(Double(vaga)), "numero": .nulo, "nome": .texto("")]
    atual[campo] = valor
    let nova = (lista.filter { vagaDe($0) != vaga } + [atual]).sorted { (vagaDe($0) ?? 0) < (vagaDe($1) ?? 0) }
    return gravarEm(dados, ["escalacao", "jogadores"], .lista(nova.map { .objeto($0) }))
}

/// Folhas do esquema (para a paridade com o servidor): caminhos absolutos; itens de repetir com "0".
public func caminhosDoEsquema() -> [[String]] {
    SECOES_ANALISE.flatMap { s in
        s.campos.flatMap { c -> [[String]] in
            switch c {
            case .aviso: return []
            case .escalacao: return [["escalacao", "formacao"], ["escalacao", "jogadores"]]
            case .repetir(_, let caminho, _, _, let campos): return campos.compactMap { sub in caminhoDe(sub).map { caminho + ["0"] + $0 } }
            default: return caminhoDe(c).map { [$0] } ?? []
            }
        }
    }
}

/// Caminho de um campo simples (nil para aviso/escalação/repetir).
public func caminhoDe(_ c: CampoAnalise) -> [String]? {
    switch c {
    case .texto(_, let p, _, _), .textoLongo(_, let p, _), .numero(_, let p, _), .lista(_, let p, _), .escolha(_, let p, _): return p
    default: return nil
    }
}

// MARK: escudo do adversário e vídeos por seção (migration 063)

/// GET /api/games/:id/analise → `midias`. tipo "escudo" | "video"; url relativa ao servidor.
public struct MidiaAnalise: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let tipo: String
    public let secao: String?
    public let titulo: String?
    public let url: String
    public init(id: String, tipo: String, secao: String? = nil, titulo: String? = nil, url: String = "") {
        self.id = id; self.tipo = tipo; self.secao = secao; self.titulo = titulo; self.url = url
    }
    enum CodingKeys: String, CodingKey { case id, tipo, secao, titulo, url }
    public init(from d: Decoder) throws {
        let c = try d.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        tipo = try c.decode(String.self, forKey: .tipo)
        secao = try c.decodeIfPresent(String.self, forKey: .secao)
        titulo = try c.decodeIfPresent(String.self, forKey: .titulo)
        url = try c.decodeIfPresent(String.self, forKey: .url) ?? ""
    }
}

public let MAX_VIDEOS_ANALISE = 12
public let MAX_BYTES_VIDEO_ANALISE = 50 * 1024 * 1024
public let MAX_BYTES_ESCUDO = 3 * 1024 * 1024

/// Antes de subir: o que o servidor recusaria. nil = ok.
public func problemaMidiaAnalise(tipo: String, mime: String, tamanho: Int, videosNaAnalise: Int = 0) -> String? {
    let m = mime.lowercased()
    if tipo == "escudo" {
        if !["image/png", "image/jpeg", "image/webp"].contains(m) { return "O escudo precisa ser uma imagem (JPG, PNG ou WEBP)." }
        if tamanho > MAX_BYTES_ESCUDO { return "O escudo deve ter até 3 MB." }
        return nil
    }
    if !["video/mp4", "video/quicktime", "video/webm"].contains(m) { return "Envie um vídeo (MP4, MOV ou WEBM)." }
    if tamanho > MAX_BYTES_VIDEO_ANALISE { return "O vídeo deve ter até 50 MB." }
    if videosNaAnalise >= MAX_VIDEOS_ANALISE { return "Limite de \(MAX_VIDEOS_ANALISE) vídeos por análise." }
    return nil
}

/// Título do vídeo a partir do nome do arquivo ("saida-curta.mp4" → "saida-curta").
public func tituloDoVideo(_ nomeArquivo: String) -> String {
    let semExt = nomeArquivo.replacingOccurrences(of: #"\.[A-Za-z0-9]+$"#, with: "", options: .regularExpression)
    let t = String(semExt.prefix(120))
    return t.trimmingCharacters(in: .whitespaces).isEmpty ? "Vídeo" : t
}

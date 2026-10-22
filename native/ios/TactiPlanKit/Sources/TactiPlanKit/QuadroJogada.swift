import Foundation

// QUADRO TÁTICO (T5): a jogada no MESMO formato do web (tactical_plays.keyframes), lida e gravada
// sem perder nada: cada peça/desenho/quadro guarda o objeto JSON inteiro (`dados`) e o app só mexe
// nas chaves que o web mexe. Assim uma jogada do app abre igual no web e vice-versa.
// Paridade: native/paridade/quadro.json e dados/quadro/Jogada.kt.

// MARK: semântica do JavaScript

/// `Number(v)` do JS: número, texto numérico (vazio = 0), booleano 1/0, null = 0, ausente = NaN.
public func numeroDoJs(_ v: Json?) -> Double {
    guard let v else { return .nan }
    switch v {
    case .numero(let n): return n
    case .nulo: return 0
    case .booleano(let b): return b ? 1 : 0
    case .texto(let s):
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return 0 }
        if t.lowercased().hasPrefix("0x"), let i = Int(t.dropFirst(2), radix: 16) { return Double(i) }
        if t == "Infinity" || t == "+Infinity" { return .infinity }
        if t == "-Infinity" { return -.infinity }
        guard t.range(of: "^[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?$", options: .regularExpression) != nil else { return .nan }
        return Double(t) ?? .nan
    case .lista(let l): return l.isEmpty ? 0 : (l.count == 1 ? numeroDoJs(l[0]) : .nan)
    case .objeto: return .nan
    }
}

/// `!!v` do JS.
public func verdadeiroJs(_ v: Json?) -> Bool {
    guard let v else { return false }
    switch v {
    case .nulo: return false
    case .booleano(let b): return b
    case .numero(let n): return n != 0 && !n.isNaN
    case .texto(let s): return !s.isEmpty
    case .lista, .objeto: return true
    }
}

/// `a || b` do JS para números (0/NaN/ausente caem no padrão).
func ouNumero(_ v: Json?, _ padrao: Double) -> Double {
    guard let v, verdadeiroJs(v) else { return padrao }
    return numeroDoJs(v)
}

/// `a || padrao` do JS para textos.
func ouTexto(_ v: Json?, _ padrao: String) -> String {
    if let v, verdadeiroJs(v), let s = v.texto { return s }
    return padrao
}

/// `parseInt(v, 10)` do JS; nil = NaN.
public func parseIntJs(_ s: String, base: Int = 10) -> Int? {
    var t = Substring(s.drop { $0.isWhitespace })
    var sinal = 1
    if let c = t.first, c == "+" || c == "-" { if c == "-" { sinal = -1 }; t = t.dropFirst() }
    if base == 16, t.lowercased().hasPrefix("0x") { t = t.dropFirst(2) }
    let digitos = t.prefix { Int(String($0), radix: base) != nil }
    guard !digitos.isEmpty, let n = Int(digitos.prefix(15), radix: base) else { return nil }
    return sinal * n
}

/// `s.slice(0, n)` do JS (unidades UTF-16).
func fatiaJs(_ s: String, _ n: Int) -> String {
    let u = Array(s.utf16)
    guard u.count > n else { return s }
    return String(utf16CodeUnits: Array(u[0..<n]), count: n)
}

func tamanhoJs(_ s: String) -> Int { s.utf16.count }

// MARK: peças, desenhos e quadros

/// Peça do campo: jogador (`player`), bola (`ball`) ou objeto (`marker`).
public struct Peca: Equatable, Sendable, Identifiable {
    public var dados: [String: Json]
    public init(_ dados: [String: Json]) { self.dados = dados }

    public var id: String { dados["id"]?.texto ?? "" }
    public var tipo: String { dados["type"]?.texto ?? "" }
    public var time: String? { dados["team"]?.texto }
    public var x: Double { get { numeroDoJs(dados["x"]) } set { dados["x"] = .numero(newValue) } }
    public var y: Double { get { numeroDoJs(dados["y"]) } set { dados["y"] = .numero(newValue) } }
    public var camisa: Json? { dados["jerseyNumber"] }
    /// O nº como o web escreve (`String(jerseyNumber)`; ausente = "").
    public var camisaTexto: String {
        switch dados["jerseyNumber"] {
        case .numero(let n)?: return numeroJs(n)
        case .texto(let s)?: return s
        case .booleano(let b)?: return b ? "true" : "false"
        case .nulo?: return "null"
        default: return ""
        }
    }
    public var nome: String { dados["name"]?.texto ?? "" }
    public var goleiro: Bool { verdadeiroJs(dados["isGoalkeeper"]) }
    public var atletaId: String? { dados["athleteId"]?.texto }
    public var marcador: String { dados["markerType"]?.texto ?? "cone" }
    public var rotacao: Double { ouNumero(dados["rotation"], 0) }
}

/// Desenho: seta reta/curva, desenho livre, zona retangular/circular ou texto (`drawType`).
public struct Desenho: Equatable, Sendable, Identifiable {
    public var dados: [String: Json]
    public init(_ dados: [String: Json]) { self.dados = dados }
    public var id: String { dados["id"]?.texto ?? "" }
    public var tipo: String { dados["drawType"]?.texto ?? "" }
    public func n(_ k: String) -> Double { numeroDoJs(dados[k]) }
    /// `element.k || padrao` (0 cai no padrão, como no web).
    public func n(_ k: String, ou padrao: Double) -> Double { ouNumero(dados[k], padrao) }
    public func t(_ k: String) -> String? { dados[k]?.texto }
    public var tracejado: [Double] {
        if case .lista(let l)? = dados["dash"] { return l.map { numeroDoJs($0) } }
        return []
    }
    public var pontos: [Double] {
        if case .lista(let l)? = dados["points"] { return l.map { numeroDoJs($0) } }
        return []
    }
    public var texto: String { dados["text"]?.texto ?? "" }
}

/// Um quadro (keyframe): `index`, `elements`, `drawings` e qualquer outra chave que vier.
public struct QuadroJogada: Equatable, Sendable {
    public var extras: [String: Json]
    public var elementos: [Peca]
    public var desenhos: [Desenho]

    public init(indice: Int, elementos: [Peca] = [], desenhos: [Desenho] = []) {
        extras = ["index": .numero(Double(indice))]
        self.elementos = elementos
        self.desenhos = desenhos
    }

    public init(json: Json) {
        var o = json.objeto ?? [:]
        func objetos(_ k: String) -> [[String: Json]] {
            if case .lista(let l)? = o[k] { return l.compactMap(\.objeto) }
            return []
        }
        elementos = objetos("elements").map(Peca.init)
        desenhos = objetos("drawings").map(Desenho.init)
        o["elements"] = nil
        o["drawings"] = nil
        extras = o
    }

    public var indice: Int { Int(numeroDoJs(extras["index"])) }

    public var json: Json {
        var o = extras
        o["elements"] = .lista(elementos.map { .objeto($0.dados) })
        o["drawings"] = .lista(desenhos.map { .objeto($0.dados) })
        return .objeto(o)
    }
}

// MARK: interpolação (utils/interpolation.js)

public func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }

/// Peças do quadro A andando para as posições do quadro B (peça que não existe em B fica parada).
public func interpolarPecas(_ a: QuadroJogada?, _ b: QuadroJogada?, _ t: Double) -> [Peca] {
    guard let a else { return [] }
    guard let b else { return a.elementos }
    var porId: [String: Peca] = [:]
    for e in b.elementos where porId[e.id] == nil { porId[e.id] = e }
    return a.elementos.map { ea in
        guard let eb = porId[ea.id] else { return ea }
        var p = ea
        p.x = lerp(ea.x, eb.x, t)
        p.y = lerp(ea.y, eb.y, t)
        return p
    }
}

// MARK: formações (utils/defaultFormations.js)

public struct PosicaoFormacao: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let camisa: Int
    public let nome: String
    public let goleiro: Bool
    public init(_ x: Double, _ y: Double, _ camisa: Int, _ nome: String, goleiro: Bool = false) {
        self.x = x; self.y = y; self.camisa = camisa; self.nome = nome; self.goleiro = goleiro
    }
}

public struct Formacao: Equatable, Sendable {
    public let chave: String
    public let rotulo: String
    public let posicoes: [PosicaoFormacao]
}

private func P(_ x: Double, _ y: Double, _ n: Int, _ nome: String, gk: Bool = false) -> PosicaoFormacao {
    PosicaoFormacao(x, y, n, nome, goleiro: gk)
}

public let FORMACOES_F11: [Formacao] = [
    Formacao(chave: "4-4-2", rotulo: "4-4-2", posicoes: [
        P(5, 50, 1, "GOL", gk: true), P(20, 15, 2, "LD"), P(20, 38, 4, "ZAG"), P(20, 62, 3, "ZAG"), P(20, 85, 6, "LE"),
        P(45, 15, 7, "MEI"), P(45, 38, 8, "VOL"), P(45, 62, 5, "VOL"), P(45, 85, 11, "MEI"), P(70, 35, 9, "CA"), P(70, 65, 10, "CA"),
    ]),
    Formacao(chave: "4-3-3", rotulo: "4-3-3", posicoes: [
        P(5, 50, 1, "GOL", gk: true), P(20, 15, 2, "LD"), P(20, 38, 4, "ZAG"), P(20, 62, 3, "ZAG"), P(20, 85, 6, "LE"),
        P(45, 25, 8, "VOL"), P(45, 50, 5, "MEI"), P(45, 75, 10, "MEI"), P(72, 15, 7, "ED"), P(75, 50, 9, "CA"), P(72, 85, 11, "EE"),
    ]),
    Formacao(chave: "3-5-2", rotulo: "3-5-2", posicoes: [
        P(5, 50, 1, "GOL", gk: true), P(20, 25, 4, "ZAG"), P(20, 50, 3, "ZAG"), P(20, 75, 5, "ZAG"), P(40, 8, 2, "LD"),
        P(42, 35, 8, "VOL"), P(42, 50, 10, "MEI"), P(42, 65, 6, "VOL"), P(40, 92, 11, "LE"), P(70, 35, 9, "CA"), P(70, 65, 7, "CA"),
    ]),
]

public let FORMACOES_F7: [Formacao] = [
    Formacao(chave: "1-3-2-1", rotulo: "3-2-1 (clássica)", posicoes: [
        P(5, 50, 1, "GOL", gk: true), P(25, 20, 2, "ZAG"), P(25, 50, 3, "ZAG"), P(25, 80, 4, "ZAG"),
        P(50, 30, 5, "MEI"), P(50, 70, 6, "MEI"), P(75, 50, 7, "CA"),
    ]),
    Formacao(chave: "1-2-3-1", rotulo: "2-3-1", posicoes: [
        P(5, 50, 1, "GOL", gk: true), P(25, 30, 2, "ZAG"), P(25, 70, 3, "ZAG"), P(50, 20, 4, "LD"),
        P(50, 50, 5, "MEI"), P(50, 80, 6, "LE"), P(75, 50, 7, "CA"),
    ]),
    Formacao(chave: "1-3-1-2", rotulo: "3-1-2", posicoes: [
        P(5, 50, 1, "GOL", gk: true), P(25, 20, 2, "ZAG"), P(25, 50, 3, "ZAG"), P(25, 80, 4, "ZAG"),
        P(50, 50, 5, "MEI"), P(75, 30, 6, "CA"), P(75, 70, 7, "CA"),
    ]),
]

public let FORMACOES_FUTSAL: [Formacao] = [
    Formacao(chave: "1-2-2", rotulo: "1-2-2", posicoes: [
        P(5, 50, 1, "GOL", gk: true), P(30, 30, 2, "FIX"), P(30, 70, 3, "FIX"), P(60, 30, 4, "ALA"), P(60, 70, 5, "ALA"),
    ]),
    Formacao(chave: "2-2", rotulo: "2-2 (Quadrado)", posicoes: [
        P(5, 50, 1, "GOL", gk: true), P(30, 25, 2, "FIX"), P(30, 75, 3, "FIX"), P(60, 25, 4, "PIV"), P(60, 75, 5, "ALA"),
    ]),
    Formacao(chave: "1-2-1", rotulo: "1-2-1 (Losango)", posicoes: [
        P(5, 50, 1, "GOL", gk: true), P(25, 50, 2, "FIX"), P(45, 25, 3, "ALA"), P(45, 75, 4, "ALA"), P(65, 50, 5, "PIV"),
    ]),
]

/// getFormationsForFieldType.
public func formacoesDoCampo(_ tipo: String?) -> [Formacao] {
    if tipo == TipoCampo.futsal { return FORMACOES_FUTSAL }
    if tipo == TipoCampo.futebol7 { return FORMACOES_F7 }
    return FORMACOES_F11
}

/// mirrorFormation: rotação de 180° (x e y) para o Time B, que defende o gol direito.
public func espelharFormacao(_ p: [PosicaoFormacao]) -> [PosicaoFormacao] {
    p.map { PosicaoFormacao(100 - $0.x, 100 - $0.y, $0.camisa, $0.nome, goleiro: $0.goleiro) }
}

/// Alvo da formação na tela: Time A, Time B ou ambos.
public enum AlvoFormacao: String, Sendable, CaseIterable { case a = "A", b = "B", ambos = "both" }

public struct AplicacaoFormacao: Equatable, Sendable {
    public let time: String
    public let posicoes: [PosicaoFormacao]
    public init(time: String, posicoes: [PosicaoFormacao]) { self.time = time; self.posicoes = posicoes }
}

/// handleApplyFormation: o Time B entra espelhado.
public func aplicacoesDaFormacao(_ f: Formacao, alvo: AlvoFormacao) -> [AplicacaoFormacao] {
    var r: [AplicacaoFormacao] = []
    if alvo == .a || alvo == .ambos { r.append(AplicacaoFormacao(time: "A", posicoes: f.posicoes)) }
    if alvo == .b || alvo == .ambos { r.append(AplicacaoFormacao(time: "B", posicoes: espelharFormacao(f.posicoes))) }
    return r
}

public struct ResultadoFormacao: Equatable, Sendable {
    public let reposicionados: Int
    public let adicionados: Int
    public let mantidos: Int
}

/// Aviso do web: "4-3-3 aplicada ao Time A · 2 jogadores mantidos fora da formação".
public func avisoFormacao(_ f: Formacao, alvo: AlvoFormacao, _ r: ResultadoFormacao) -> String {
    let alvoTexto = alvo == .ambos ? "aos dois times" : (alvo == .b ? "ao Time B" : "ao Time A")
    let k = r.mantidos
    let sufixo = k > 0 ? " · \(k) jogador\(k > 1 ? "es" : "") mantido\(k > 1 ? "s" : "") fora da formação" : ""
    return "\(f.rotulo) aplicada \(alvoTexto)\(sufixo)"
}

// MARK: jogada salva (linha de tactical_plays devolvida por /api/plays)

public struct Jogada: Equatable, Sendable, Identifiable {
    public let bruto: Json
    public init(_ bruto: Json) { self.bruto = bruto }

    public var id: String { bruto["id"]?.texto ?? "" }
    public var nome: String { bruto["name"]?.texto ?? "" }
    public var descricao: String { bruto["description"]?.texto ?? "" }
    public var tipoCampo: String { ouTexto(bruto["field_type"], TipoCampo.futebol11) }
    public var vista: String { ouTexto(bruto["field_view"], VistaCampo.inteiro) }
    public var clubeId: String? { bruto["club_id"]?.texto }
    public var clubeNome: String? { bruto["club_name"]?.texto }
    public var atualizadaEm: String? { bruto["updated_at"]?.texto ?? bruto["created_at"]?.texto }
    public var quadros: [QuadroJogada] {
        if case .lista(let l)? = bruto["keyframes"] { return l.map(QuadroJogada.init(json:)) }
        return []
    }
    public var totalQuadros: Int {
        if case .lista(let l)? = bruto["keyframes"] { return l.count }
        return 0
    }
}

/// `GET /api/plays` → lista (aceita também `{data: [...]}`).
public func jogadasDaResposta(_ j: Json) -> [Jogada] {
    if case .lista(let l) = j { return l.map(Jogada.init) }
    if case .lista(let l)? = j["data"] { return l.map(Jogada.init) }
    return []
}

/// Busca da lista: nome ou descrição, sem acento e sem caixa.
public func filtrarJogadas(_ lista: [Jogada], busca: String) -> [Jogada] {
    let q = dobrar(busca.trimmingCharacters(in: .whitespacesAndNewlines))
    guard !q.isEmpty else { return lista }
    return lista.filter { dobrar($0.nome).contains(q) || dobrar($0.descricao).contains(q) }
}

/// "3 quadros · 22/10/2026 · criada em Demo FC".
public func resumoJogada(_ j: Jogada, fuso: TimeZone = .current) -> String {
    var partes = ["\(j.totalQuadros) \(j.totalQuadros == 1 ? "quadro" : "quadros")"]
    if let d = dataCurtaJogada(j.atualizadaEm, fuso: fuso) { partes.append(d) }
    if let c = j.clubeNome, !c.isEmpty { partes.append("criada em \(c)") }
    return partes.joined(separator: " · ")
}

/// `toLocaleDateString('pt-BR')` do updated_at (ISO, UTC) no fuso do aparelho: "22/10/2026".
public func dataCurtaJogada(_ iso: String?, fuso: TimeZone = .current) -> String? {
    guard let iso, !iso.isEmpty else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let f2 = ISO8601DateFormatter()
    guard let data = f.date(from: iso) ?? f2.date(from: iso) else {
        let p = iso.prefix(10).split(separator: "-")
        return p.count == 3 ? "\(p[2])/\(p[1])/\(p[0])" : nil
    }
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = fuso
    let c = cal.dateComponents([.day, .month, .year], from: data)
    return String(format: "%02d/%02d/%04d", c.day ?? 0, c.month ?? 0, c.year ?? 0)
}

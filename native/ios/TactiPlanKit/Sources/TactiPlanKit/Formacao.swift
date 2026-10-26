import Foundation

// Formação tática do jogo, vagas (slots) no campo e posição EM CAMPO derivada da vaga.
// Porte fiel de frontend/src/lib/formation.js + lib/posicaoEmCampo.js (e do
// backend-node/src/utils/formacao.js). A POSIÇÃO CADASTRADA DO ATLETA NÃO DECIDE ONDE ELE
// APARECE: quem decide é a vaga escolhida pelo usuário.
// Vaga 0 = goleiro; depois cada linha da formação, da defesa para o ataque, da esquerda para a
// direita da tela. Coordenadas em %: y = 0 é a meta adversária (topo), y = 100 é a nossa (base).
// Paridade: native/paridade/jogo.json (gerado do web) + dados/jogo/Formacao.kt (Android).

public let MODALIDADE_PADRAO = "football_11"

/// shared/formacoes.json (o teste confere que é o mesmo arquivo do web).
public let FORMACOES: [String: (padrao: String, opcoes: [String])] = [
    "football_11": ("4-4-2", ["4-4-2", "4-3-3", "4-2-3-1", "3-5-2", "3-4-3", "5-3-2", "4-1-4-1", "4-5-1"]),
    "football_7": ("2-3-1", ["2-3-1", "3-2-1", "3-1-2", "2-2-2"]),
    "futsal": ("2-2", ["2-2", "3-1", "1-2-1", "4-0"]),
]

private func cfgFormacao(_ modalidade: String?) -> (padrao: String, opcoes: [String]) {
    FORMACOES[modalidade ?? ""] ?? FORMACOES[MODALIDADE_PADRAO]!
}

public func formacoesDa(_ modalidade: String?) -> [String] { cfgFormacao(modalidade).opcoes }
public func formacaoPadrao(_ modalidade: String?) -> String { cfgFormacao(modalidade).padrao }

/// A salva, se for válida para a modalidade; senão a padrão.
public func resolverFormacao(_ modalidade: String?, _ formacao: String?) -> String {
    let ops = formacoesDa(modalidade)
    if let f = formacao, ops.contains(f) { return f }
    return formacaoPadrao(modalidade)
}

/// "4-2-3-1" → [4, 2, 3, 1] (o `parseInt(n) || 0` + filtro > 0 do web).
func linhasDaFormacao(_ formacao: String?) -> [Int] {
    String(formacao ?? "").split(separator: "-", omittingEmptySubsequences: false)
        .map { parseIntJS(String($0)) }.filter { $0 > 0 }
}

/// `parseInt` do JS: dígitos iniciais (depois de espaços e sinal); nada → 0.
func parseIntJS(_ s: String) -> Int {
    var t = Substring(s.trimmingCharacters(in: .whitespaces))
    var sinal = 1
    if t.first == "-" { sinal = -1; t = t.dropFirst() } else if t.first == "+" { t = t.dropFirst() }
    let digitos = t.prefix { $0.isASCII && $0.isNumber }
    return (Int(digitos) ?? 0) * sinal
}

private func rotulosDasLinhas(_ qtd: Int) -> [String] {
    if qtd <= 1 { return ["LIN"] }
    if qtd == 2 { return ["DEF", "ATA"] }
    return ["DEF"] + Array(repeating: "MEI", count: qtd - 2) + ["ATA"]
}

public let ORDEM_PAPEIS = ["GOL", "DEF", "MEI", "ATA", "LIN"]

/// Uma vaga da formação. `espaco` = largura (%) disponível para a vaga na linha (limita o nome).
/// Vaga mais perto do ponto (em % do campo), até `raio` %; nil = longe de todas. Arrastar e soltar
/// no campo da escalação. Paridade: `vagaMaisPerto` em ui/jogos/Escalacao.kt.
public func vagaMaisPerto(_ vagas: [Vaga], xPct: Double, yPct: Double, raio: Double = 14) -> Int? {
    vagas.map { ($0.indice, ((($0.x - xPct) * ($0.x - xPct)) + (($0.y - yPct) * 0.75) * (($0.y - yPct) * 0.75)).squareRoot()) }
        .filter { $0.1 <= raio }
        .min { $0.1 < $1.1 }?.0
}

public struct Vaga: Equatable, Sendable, Identifiable {
    public let indice: Int
    public let papel: String
    public let linha: Int
    public let x: Double
    public let y: Double
    public let espaco: Double
    public var id: Int { indice }
    public init(indice: Int, papel: String, linha: Int, x: Double, y: Double, espaco: Double) {
        self.indice = indice; self.papel = papel; self.linha = linha; self.x = x; self.y = y; self.espaco = espaco
    }
}

/// Vagas da formação (buildSlots do web).
public func vagasDa(_ formacao: String) -> [Vaga] {
    let ls = linhasDaFormacao(formacao)
    let papeis = rotulosDasLinhas(ls.count)
    var vagas = [Vaga(indice: 0, papel: "GOL", linha: 0, x: 50, y: 90, espaco: 40)]
    // Linhas distribuídas por igual entre a defesa (y = 72) e o ataque (y = 18).
    let yDef = 72.0, yAta = 18.0
    var idx = 1
    for (li, n) in ls.enumerated() {
        let y = ls.count == 1 ? 50 : yDef - (Double(li) * (yDef - yAta)) / Double(ls.count - 1)
        // Margem lateral de 8% e espaçamento uniforme dentro da linha.
        let espaco = 84.0 / Double(max(n, 1))
        for i in 0..<n {
            vagas.append(Vaga(indice: idx, papel: papeis[li], linha: li + 1,
                              x: n == 1 ? 50 : 8 + espaco * (Double(i) + 0.5), y: y, espaco: min(espaco, 40)))
            idx += 1
        }
    }
    return vagas
}

public func totalVagas(_ formacao: String) -> Int { 1 + linhasDaFormacao(formacao).reduce(0, +) }

/// Papel da vaga (GOL/DEF/MEI/ATA/LIN) ou nil (sem vaga / fora da formação).
public func papelDaVaga(_ formacao: String, _ vaga: Int?) -> String? {
    guard let v = vaga else { return nil }
    let vs = vagasDa(formacao)
    return v >= 0 && v < vs.count ? vs[v].papel : nil
}

private func pontas(_ i: Int, _ n: Int, _ esq: String, _ dir: String, _ centro: String) -> String {
    if i == 0 { return esq }
    if i == n - 1 { return dir }
    return centro
}

/// Posição EM CAMPO da vaga (GOL, LE/ZAG/LD, VOL/MEI, EE/CA/ED; futsal FIX/ALA-E/ALA-D/PIV).
/// nil = sem vaga, vaga fora da formação ou formação de uma linha só (futsal 4-0: rodízio).
public func posicaoEmCampo(_ formacao: String?, _ vaga: Int?, _ modalidade: String?) -> String? {
    guard let s = vaga, s >= 0 else { return nil }
    if s == 0 { return "GOL" }
    let ls = linhasDaFormacao(formacao)
    var li = -1
    var i = s - 1
    for (k, n) in ls.enumerated() {
        if i < n { li = k; break }
        i -= n
    }
    if li < 0 { return nil }
    let n = ls[li]
    let ultima = ls.count - 1

    if modalidade == "futsal" {
        if ls.count == 1 { return nil }
        if li == 0 { return n >= 3 ? pontas(i, n, "ALA-E", "ALA-D", "FIX") : "FIX" }
        if li == ultima { return "PIV" }
        return n >= 2 ? pontas(i, n, "ALA-E", "ALA-D", "FIX") : "FIX"
    }
    if ls.count == 1 { return nil }
    if li == 0 { return n >= 4 ? pontas(i, n, "LE", "LD", "ZAG") : "ZAG" }
    if li == ultima { return n >= 3 ? pontas(i, n, "EE", "ED", "CA") : "CA" }
    let linhasDeMeio = ls.count - 2
    return linhasDeMeio >= 2 && li == 1 ? "VOL" : "MEI"
}

/// Etiqueta da vaga na lista de titulares: a posição em campo; futsal 4-0 → o papel (LIN).
public func etiquetaDaVaga(_ formacao: String, _ vaga: Int?, _ modalidade: String?) -> String? {
    guard let papel = papelDaVaga(formacao, vaga) else { return nil }
    return posicaoEmCampo(formacao, vaga, modalidade) ?? papel
}

/// Papel sugerido pela posição CADASTRADA: só para o botão "Encaixar sugestão".
public let PAPEL_POR_POSICAO: [String: String] = [
    "GOL": "GOL",
    "ZAG": "DEF", "LD": "DEF", "LE": "DEF",
    "VOL": "MEI", "MEI": "MEI",
    "ED": "ATA", "EE": "ATA", "CA": "ATA",
    "FIX": "DEF", "ALA-D": "MEI", "ALA-E": "MEI", "PIV": "ATA",
    // Códigos antigos (antes da migration 051)
    "GR": "GOL", "DD": "DEF", "DC": "DEF", "DE": "DEF", "Z": "DEF",
    "MD": "MEI", "MC": "MEI", "ME": "MEI", "MOF": "MEI", "M": "MEI",
    "PL": "ATA", "SA": "ATA", "A": "ATA",
]

/// Iniciais para quem não tem número de camisa ("Lucas Martins" → "LM", "Pelé" → "PE").
public func iniciaisDoAtleta(_ nome: String?) -> String {
    let partes = (nome ?? "").split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard let p = partes.first else { return "?" }
    if partes.count == 1 { return String(p.prefix(2)).uppercased() }
    return (String(p.prefix(1)) + String(partes[partes.count - 1].prefix(1))).uppercased()
}

/// Nome curto embaixo do círculo: o último nome (como no campo do web e no PDF).
public func nomeCurto(_ nome: String?) -> String {
    let partes = (nome ?? "").split(whereSeparator: { $0.isWhitespace }).map(String.init)
    return partes.last ?? (nome ?? "")
}

// MARK: desenho do campo (medidas oficiais, igual ao LineupField do web e ao PDF da convocação)

/// Uma peça do desenho do campo, em unidades do viewBox (campo 68 × 105 m; quadra 100 × 150).
public enum PecaCampo: Equatable, Sendable {
    case retangulo(x: Double, y: Double, l: Double, a: Double, cheio: Bool)
    case linha(x1: Double, y1: Double, x2: Double, y2: Double)
    case circulo(cx: Double, cy: Double, r: Double, cheio: Bool)
    /// Arco do SVG (`M x1 y1 A r r 0 0 varredura x2 y2`); `varredura` 1 = horário (tela).
    case arco(x1: Double, y1: Double, x2: Double, y2: Double, r: Double, varredura: Int)
}

public struct DesenhoCampo: Equatable, Sendable {
    public let largura: Double
    public let altura: Double
    public let pecas: [PecaCampo]
    /// Faixas do gramado (cores alternadas); 0 = quadra lisa.
    public let faixas: Int
    public let corFundo: String
    public let corFaixa: String
    public let espessura: Double
}

/// Campo de futebol 68 × 105 m: grande área 40,32 × 16,5 · pequena 18,32 × 5,5 · pênalti a 11 m ·
/// círculo e meias-luas r 9,15 (meia-largura da corda √(9,15² − 5,5²) ≈ 7,31) · metas 7,32 m.
public let CAMPO_FUTEBOL: DesenhoCampo = {
    let W = 68.0, H = 105.0, cx = 34.0
    let paW = 40.32, paD = 16.5, gaW = 18.32, gaD = 5.5, pen = 11.0, r = 9.15
    let arco = (r * r - (paD - pen) * (paD - pen)).squareRoot()
    return DesenhoCampo(largura: W, altura: H, pecas: [
        .retangulo(x: 0.4, y: 0.4, l: W - 0.8, a: H - 0.8, cheio: false),
        .linha(x1: 0.4, y1: H / 2, x2: W - 0.4, y2: H / 2),
        .circulo(cx: cx, cy: H / 2, r: r, cheio: false),
        .retangulo(x: cx - paW / 2, y: 0.4, l: paW, a: paD - 0.4, cheio: false),
        .retangulo(x: cx - gaW / 2, y: 0.4, l: gaW, a: gaD - 0.4, cheio: false),
        .retangulo(x: cx - paW / 2, y: H - paD, l: paW, a: paD - 0.4, cheio: false),
        .retangulo(x: cx - gaW / 2, y: H - gaD, l: gaW, a: gaD - 0.4, cheio: false),
        .arco(x1: cx - arco, y1: paD, x2: cx + arco, y2: paD, r: r, varredura: 0),
        .arco(x1: cx - arco, y1: H - paD, x2: cx + arco, y2: H - paD, r: r, varredura: 1),
        .arco(x1: 0.4, y1: 1.4, x2: 1.4, y2: 0.4, r: 1, varredura: 0),
        .arco(x1: W - 1.4, y1: 0.4, x2: W - 0.4, y2: 1.4, r: 1, varredura: 0),
        .arco(x1: 0.4, y1: H - 1.4, x2: 1.4, y2: H - 0.4, r: 1, varredura: 1),
        .arco(x1: W - 1.4, y1: H - 0.4, x2: W - 0.4, y2: H - 1.4, r: 1, varredura: 1),
        .circulo(cx: cx, cy: H / 2, r: 0.45, cheio: true),
        .circulo(cx: cx, cy: pen, r: 0.4, cheio: true),
        .circulo(cx: cx, cy: H - pen, r: 0.4, cheio: true),
        .retangulo(x: cx - 3.66, y: 0, l: 7.32, a: 0.6, cheio: true),
        .retangulo(x: cx - 3.66, y: H - 0.6, l: 7.32, a: 0.6, cheio: true),
    ], faixas: 10, corFundo: "#2c6f33", corFaixa: "#34803f", espessura: 0.35)
}()

/// Quadra de futsal (viewBox 100 × 150 do web): borda, meio, círculo, áreas em D, marcas de 6 e 10 m.
public let QUADRA_FUTSAL = DesenhoCampo(largura: 100, altura: 150, pecas: [
    .retangulo(x: 3, y: 3, l: 94, a: 144, cheio: false),
    .linha(x1: 3, y1: 75, x2: 97, y2: 75),
    .circulo(cx: 50, cy: 75, r: 9, cheio: false),
    .circulo(cx: 50, cy: 75, r: 0.9, cheio: true),
    .arco(x1: 22, y1: 147, x2: 78, y2: 147, r: 28, varredura: 1),
    .arco(x1: 22, y1: 3, x2: 78, y2: 3, r: 28, varredura: 0),
    .circulo(cx: 50, cy: 135, r: 0.9, cheio: true),
    .circulo(cx: 50, cy: 15, r: 0.9, cheio: true),
    .circulo(cx: 50, cy: 119, r: 0.9, cheio: true),
    .circulo(cx: 50, cy: 31, r: 0.9, cheio: true),
    .retangulo(x: 44, y: 1, l: 12, a: 2, cheio: true),
    .retangulo(x: 44, y: 147, l: 12, a: 2, cheio: true),
], faixas: 0, corFundo: "#1d4ed8", corFaixa: "#1e40af", espessura: 0.6)

public func desenhoDoCampo(_ modalidade: String?) -> DesenhoCampo {
    modalidade == "futsal" ? QUADRA_FUTSAL : CAMPO_FUTEBOL
}

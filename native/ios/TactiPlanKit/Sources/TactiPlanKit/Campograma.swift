import Foundation

// CAMPOGRAMA do Elenco: porte EXATO de backend-node/src/reports/campograma.js (buildCampograma, o mesmo do PDF do
// plantel; a aba do web usa as mesmas posições). O elenco desenhado no campo EM PÉ (ataque para cima), cada atleta
// (foto/iniciais, número, nome curto) empilhado no lugar da posição; zagueiros divididos pelo lado preferido
// (migration 067; "ambos"/sem lado fica no meio). DM em vermelho, Transição em amarelo.
// Paridade: native/paridade/campograma.json (gerar-campograma.js). Android: dados/elenco/Campograma.kt.

/// Lugar no campo DEITADO, em % (x = profundidade rumo ao ataque; y = 0 lado esquerdo do time, 100 o direito).
public struct LugarCampo: Equatable, Sendable {
    public let x: Double
    public let y: Double
}

public let LUGARES_F11: [(chave: String, lugar: LugarCampo)] = [
    ("GOL", LugarCampo(x: 4, y: 50)),
    ("ZAG-E", LugarCampo(x: 22, y: 30)), ("ZAG-A", LugarCampo(x: 22, y: 50)), ("ZAG-D", LugarCampo(x: 22, y: 70)),
    ("LE", LugarCampo(x: 31, y: 8)), ("LD", LugarCampo(x: 31, y: 92)),
    ("VOL", LugarCampo(x: 44, y: 50)), ("VOL2", LugarCampo(x: 55, y: 36)), ("MEI", LugarCampo(x: 66, y: 58)),
    ("EE", LugarCampo(x: 78, y: 10)), ("ED", LugarCampo(x: 78, y: 90)),
    ("CA", LugarCampo(x: 91, y: 50)),
]
public let LUGARES_FUTSAL: [(chave: String, lugar: LugarCampo)] = [
    ("GOL", LugarCampo(x: 6, y: 50)), ("FIX", LugarCampo(x: 30, y: 50)), ("ALA-E", LugarCampo(x: 56, y: 15)),
    ("ALA-D", LugarCampo(x: 56, y: 85)), ("PIV", LugarCampo(x: 86, y: 50)),
]
/// Códigos antigos (dado legado) caem no lugar do novo.
private let SINONIMO_POSICAO: [String: String] = [
    "GR": "GOL", "DC": "ZAG", "Z": "ZAG", "DD": "LD", "DE": "LE", "MC": "VOL", "MD": "MEI", "ME": "MEI", "MOF": "MEI",
    "M": "MEI", "PL": "CA", "SA": "CA", "A": "CA",
]
private let NOMES_LUGAR: [String: String] = [
    "GOL": "Goleiros", "ZAG-E": "Zagueiros · esquerda", "ZAG-A": "Zagueiros", "ZAG-D": "Zagueiros · direita",
    "LE": "Lateral esquerdo", "LD": "Lateral direito", "VOL": "1º volante", "VOL2": "2º volante", "MEI": "Meia",
    "EE": "Extremo esquerdo", "ED": "Extremo direito", "CA": "Centroavante",
    "FIX": "Fixo", "ALA-E": "Ala esquerdo", "ALA-D": "Ala direito", "PIV": "Pivô",
]

/// A chave do lugar do atleta (nil = sem lugar no campo: cadastre a posição).
public func chaveNoCampo(_ a: Atleta, futsal: Bool) -> String? {
    let bruto = (a.posicao ?? "").trimmingCharacters(in: .whitespaces).uppercased()
    let code = SINONIMO_POSICAO[bruto] ?? bruto
    if futsal { return LUGARES_FUTSAL.contains { $0.chave == code } ? code : nil }
    if code == "ZAG" { return a.ladoPreferido == "direita" ? "ZAG-D" : a.ladoPreferido == "esquerda" ? "ZAG-E" : "ZAG-A" }
    return LUGARES_F11.contains { $0.chave == code } ? code : nil
}

/// No DM: status "Lesionado" ou grupo DM (a regra do campograma do web/PDF); `lesoesAtivas` soma a lesão aberta.
public func atletaNoDM(_ a: Atleta, lesoesAtivas: [Lesao] = []) -> Bool {
    a.status == "injured" || a.grupo == "DM" || lesoesAtivas.contains { $0.atletaId == a.id && $0.ativa }
}

/// Em transição (voltando do DM): grupo Transição e fora do DM.
public func atletaEmTransicao(_ a: Atleta, lesoesAtivas: [Lesao] = []) -> Bool {
    !atletaNoDM(a, lesoesAtivas: lesoesAtivas) && a.grupo == "Transição"
}

/// "Carlos Alberto Souza" → "Carlos S." (um nome só fica como está).
public func nomeCurtoCampo(_ nome: String) -> String {
    let p = nome.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    guard p.count > 1, let ini = p.last?.first else { return p.first ?? "" }
    return "\(p[0]) \(ini)."
}

/// Âncora do grupo: centro ("-50%"), início ("0%", encostado na borda) ou fim ("-100%").
public enum AncoraCampo: String, Equatable, Sendable {
    case inicio = "0%", centro = "-50%", fim = "-100%"
}

public struct AtletaNoCampo: Equatable, Sendable, Identifiable {
    public let id: String
    public let nome: String
    public let numero: Int?
    public let dm: Bool
    public let trans: Bool
    public let atleta: Atleta
}

public struct ZonaCampo: Equatable, Sendable, Identifiable {
    public let chave: String
    public let nome: String
    /// % da largura/altura do campo EM PÉ.
    public let left: Double
    public let top: Double
    public let tx: AncoraCampo
    public let ty: AncoraCampo
    public let atletas: [AtletaNoCampo]
    public var id: String { chave }
}

public struct Campograma: Equatable, Sendable {
    public let zonas: [ZonaCampo]
    /// Atletas sem posição reconhecida (aparecem abaixo do campo).
    public let semLugar: [Atleta]
}

// Perto da linha, o grupo encosta na borda (não corta).
private func eixo(_ v: Double) -> (pos: Double, tr: AncoraCampo) {
    if v < 12 { return (1.5, .inicio) }
    if v > 88 { return (98.5, .fim) }
    return (v, .centro)
}

/// `localeCompare(…, 'pt-BR')`: sem acento/caixa primeiro; empate, minúscula antes e o texto cru.
private func antesPtBR(_ a: String, _ b: String) -> Bool {
    let r = a.compare(b, options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "pt_BR"))
    if r != .orderedSame { return r == .orderedAscending }
    return compararNome(a, b)
}

/// Monta o campograma (buildCampograma do servidor). `mostrarDM: false` esconde quem está no DM.
public func montarCampograma(_ atletas: [Atleta], modalidade: String?, mostrarDM: Bool = true,
                             lesoesAtivas: [Lesao] = []) -> Campograma {
    let futsal = modalidade == "futsal"
    var g: [String: [Atleta]] = [:]
    var fora: [Atleta] = []
    for a in atletas {
        if !mostrarDM && atletaNoDM(a, lesoesAtivas: lesoesAtivas) { continue }
        guard let k = chaveNoCampo(a, futsal: futsal) else { fora.append(a); continue }
        g[k, default: []].append(a)
    }
    let zonas = (futsal ? LUGARES_FUTSAL : LUGARES_F11).compactMap { l -> ZonaCampo? in
        guard let lista = g[l.chave], !lista.isEmpty else { return nil }
        let ord = lista.sorted { x, y in
            let dx = atletaNoDM(x, lesoesAtivas: lesoesAtivas), dy = atletaNoDM(y, lesoesAtivas: lesoesAtivas)
            if dx != dy { return !dx }
            let cx = x.camisa ?? 999, cy = y.camisa ?? 999
            if cx != cy { return cx < cy }
            return antesPtBR(x.nome, y.nome)
        }
        let h = eixo(l.lugar.y), v = eixo(100 - l.lugar.x)
        return ZonaCampo(chave: l.chave, nome: NOMES_LUGAR[l.chave] ?? l.chave, left: h.pos, top: v.pos, tx: h.tr, ty: v.tr,
                         atletas: ord.map { a in
                             AtletaNoCampo(id: a.id, nome: nomeCurtoCampo(a.nome), numero: a.camisa,
                                           dm: atletaNoDM(a, lesoesAtivas: lesoesAtivas),
                                           trans: atletaEmTransicao(a, lesoesAtivas: lesoesAtivas), atleta: a)
                         })
    }
    return Campograma(zonas: zonas, semLugar: fora)
}

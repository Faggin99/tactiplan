import Foundation

// Identidade TactiPlan + cor do clube com TRAVA DE CONTRASTE (WCAG AA 4,5:1). Sem SwiftUI/UIKit
// para compilar no Linux: a tela converte `Cor` em `Color`. Tela nenhuma usa hex solto.
// Paridade: design/Cores.kt (Android). Contraste igual ao web (frontend/src/lib/color.js) e ao
// Gestsport (escurece/clareia em passos de 8%).

// MARK: contraste

/// "#RRGGBB" (com ou sem #, qualquer caixa, com espaços) → [r, g, b]; qualquer outra coisa → nil.
func parseHex(_ hex: String?) -> [Double]? {
    var s = Substring((hex ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    if s.hasPrefix("#") { s = s.dropFirst() }
    guard s.utf8.count == 6, s.utf8.allSatisfy({ $0.ehHex }), let n = Int(s, radix: 16) else { return nil }
    return [Double((n >> 16) & 255), Double((n >> 8) & 255), Double(n & 255)]
}

private extension UInt8 {
    var ehHex: Bool { (48...57).contains(self) || (65...70).contains(self) || (97...102).contains(self) }
}

private func arredondar(_ v: Double) -> Int { Int((v + 0.5).rounded(.down)) }

func toHex(_ rgb: [Double]) -> String {
    "#" + rgb.map { v in
        let n = max(0, min(255, arredondar(v)))
        let h = String(n, radix: 16, uppercase: true)
        return h.count == 1 ? "0" + h : h
    }.joined()
}

/// "#rrggbb" válido normalizado em maiúsculas, ou nil.
public func normalizarHex(_ hex: String?) -> String? { parseHex(hex).map(toHex) }

private func luminancia(_ rgb: [Double]) -> Double {
    let c = rgb.map { v -> Double in
        let x = v / 255
        return x <= 0.03928 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

/// Razão de contraste WCAG entre duas cores hex (1 a 21); cor inválida dá 1.
public func contraste(_ a: String?, _ b: String?) -> Double {
    guard let ra = parseHex(a), let rb = parseHex(b) else { return 1 }
    let la = luminancia(ra), lb = luminancia(rb)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
}

public let AA: Double = 4.5
public let BRANCO = "#FFFFFF"

/// Texto legível SOBRE a cor `fundo` (botão primário, selo): branco se passar AA; senão o navy;
/// senão o que tiver mais contraste. Ex.: amarelo → navy; azul padrão → branco. (= bestTextOn do web)
public func textoSobre(_ fundo: String?) -> String {
    guard normalizarHex(fundo) != nil else { return BRANCO }
    let branco = contraste(fundo, BRANCO)
    let navy = contraste(fundo, NAVY)
    if branco >= AA { return BRANCO }
    if navy >= AA { return NAVY }
    return branco >= navy ? BRANCO : NAVY
}

/// A cor escurecida (passos de 8%) até passar AA contra `fundo` claro — texto/ícone na cor do
/// clube sobre a superfície branca. 24 passos chegam ao preto, então sempre termina.
public func tintaLegivelNoClaro(_ hex: String?, fundo: String = BRANCO) -> String {
    guard var rgb = parseHex(hex) else { return ACAO_PADRAO }
    for _ in 0..<24 {
        if contraste(toHex(rgb), fundo) >= AA { return toHex(rgb) }
        rgb = rgb.map { $0 * 0.92 }
    }
    return NAVY
}

/// A cor clareada (mistura com branco, passos de 8%) até passar AA contra a superfície escura.
public func tintaLegivelNoEscuro(_ hex: String?, fundo: String = SUPERFICIE_ESCURA) -> String {
    guard var rgb = parseHex(hex) else { return ACAO_PADRAO_ESCURO }
    for _ in 0..<24 {
        if contraste(toHex(rgb), fundo) >= AA { return toHex(rgb) }
        rgb = rgb.map { $0 + (255 - $0) * 0.08 }
    }
    return BRANCO
}

// MARK: tokens

/// Cor opaca ou com alfa, guardada como hex + canais RGB (0...255).
public struct Cor: Equatable, Hashable, Sendable {
    public let hex: String
    public let r: UInt8
    public let g: UInt8
    public let b: UInt8
    /// 0...1
    public let alfa: Double

    /// "#RRGGBB" → Cor. Hex inválido cai na cor de ação padrão.
    public init(hex: String?, alfa: Double = 1) {
        let rgb = parseHex(hex) ?? parseHex(ACAO_PADRAO)!
        self.hex = toHex(rgb)
        self.r = UInt8(rgb[0]); self.g = UInt8(rgb[1]); self.b = UInt8(rgb[2])
        self.alfa = alfa
    }

    public func comAlfa(_ a: Double) -> Cor { Cor(hex: hex, alfa: a) }

    /// Canais em 0...1, prontos pra `Color(red:green:blue:opacity:)`.
    public var rgb01: (r: Double, g: Double, b: Double, a: Double) {
        (Double(r) / 255, Double(g) / 255, Double(b) / 255, alfa)
    }
}

/// Navy da marca TactiPlan/Faggin (herói, texto escuro sobre cor clara).
public let NAVY = "#0F172A"
/// Faísca lime da marca.
public let LIME = "#C8FF00"
/// Azul de ação do TactiPlan (o "primary" do web) — trocado pela cor do clube.
public let ACAO_PADRAO = "#2563EB"
/// O mesmo no escuro (o "primary" do tema escuro do web).
public let ACAO_PADRAO_ESCURO = "#3B82F6"
public let SUPERFICIE_ESCURA = "#1E293B"

/// Os tokens das telas. Paleta clara: fundo #F2F4F7 do desenho; escura: a do tema escuro do web.
public struct Cores: Equatable, Sendable {
    public var tinta: Cor
    public var tinta2: Cor
    public var tinta3: Cor
    public var fundo: Cor
    public var superficie: Cor
    public var borda: Cor
    public var lime: Cor
    public var heroi: Cor
    public var sobreHeroi: Cor
    public var sobreHeroi2: Cor
    public var heroiDivisoria: Cor
    public var heroiBorda: Cor
    /// Cor de AÇÃO crua (a do clube, ou o azul do TactiPlan): preenchimento de botão, aba ativa.
    public var acao: Cor
    /// Texto/ícone SOBRE `acao` (branco ou navy, o que passar AA).
    public var sobreAcao: Cor
    /// A cor de ação legível como TEXTO/ícone sobre a superfície (links, ícones, aba ativa).
    public var acaoTinta: Cor
    /// Fundo suave da cor de ação (12%): círculo de ícone, destaque leve.
    public var acaoSuave: Cor
    // estados (fundo + tinta), iguais em todo clube
    public var okFundo: Cor, okTinta: Cor
    public var avisoFundo: Cor, avisoTinta: Cor
    public var erroFundo: Cor, erroTinta: Cor
    public var infoFundo: Cor, infoTinta: Cor
    public var neutroFundo: Cor, neutroTinta: Cor
    public var erro: Cor
    public var skeleton: Cor
    public var sombra1: Cor
    public var sombra2: Cor
    public let escuro: Bool
}

public enum Tokens {
    public static let raioCard: Double = 20
    public static let raioCampo: Double = 14
    public static let alvoToque: Double = 44
    public static let escalaTipo: [Double] = [32, 24, 20, 17, 15, 13, 11]
    /// Cores fixas dos pilares (iguais ao web e ao PDF).
    public static let pilares: [String: String] = [
        "tatico": "#3B82F6", "fisico": "#F59E0B", "tecnico": "#A855F7", "mental": "#10B981",
    ]
}

/// Paleta clara SEM cor de clube.
func coresClaras(acao: String) -> Cores {
    let suave = Cor(hex: acao, alfa: 0.12)
    return Cores(
        tinta: Cor(hex: NAVY), tinta2: Cor(hex: "#526077"), tinta3: Cor(hex: "#94A3B8"),
        fundo: Cor(hex: "#F2F4F7"), superficie: Cor(hex: "#FFFFFF"), borda: Cor(hex: "#E3E7ED"),
        lime: Cor(hex: LIME),
        heroi: Cor(hex: NAVY), sobreHeroi: Cor(hex: "#FFFFFF"), sobreHeroi2: Cor(hex: "#FFFFFF", alfa: 0.72),
        heroiDivisoria: Cor(hex: "#FFFFFF", alfa: 0.14), heroiBorda: Cor(hex: "#FFFFFF", alfa: 0),
        acao: Cor(hex: acao), sobreAcao: Cor(hex: textoSobre(acao)),
        acaoTinta: Cor(hex: tintaLegivelNoClaro(acao)), acaoSuave: suave,
        okFundo: Cor(hex: "#DCFCE7"), okTinta: Cor(hex: "#166534"),
        avisoFundo: Cor(hex: "#FEF3C7"), avisoTinta: Cor(hex: "#92400E"),
        erroFundo: Cor(hex: "#FEE2E2"), erroTinta: Cor(hex: "#991B1B"),
        infoFundo: Cor(hex: "#DBEAFE"), infoTinta: Cor(hex: "#1E40AF"),
        neutroFundo: Cor(hex: "#E9EDF2"), neutroTinta: Cor(hex: "#475569"),
        erro: Cor(hex: "#DC2626"), skeleton: Cor(hex: "#E9EDF2"),
        sombra1: Cor(hex: NAVY, alfa: 0.04), sombra2: Cor(hex: NAVY, alfa: 0.06),
        escuro: false)
}

/// Paleta escura (segue o aparelho) SEM cor de clube.
func coresEscuras(acao: String) -> Cores {
    let tinta = tintaLegivelNoEscuro(acao)
    return Cores(
        tinta: Cor(hex: "#F8FAFC"), tinta2: Cor(hex: "#CBD5E1"), tinta3: Cor(hex: "#8A99AE"),
        fundo: Cor(hex: "#0B1120"), superficie: Cor(hex: SUPERFICIE_ESCURA), borda: Cor(hex: "#334155"),
        lime: Cor(hex: LIME),
        heroi: Cor(hex: "#1C2A45"), sobreHeroi: Cor(hex: "#FFFFFF"), sobreHeroi2: Cor(hex: "#FFFFFF", alfa: 0.72),
        heroiDivisoria: Cor(hex: "#FFFFFF", alfa: 0.14), heroiBorda: Cor(hex: "#FFFFFF", alfa: 0.10),
        // No escuro, uma cor de clube escura sumiria: o preenchimento usa a versão clareada.
        acao: Cor(hex: tinta), sobreAcao: Cor(hex: textoSobre(tinta)),
        acaoTinta: Cor(hex: tinta), acaoSuave: Cor(hex: tinta, alfa: 0.16),
        okFundo: Cor(hex: "#14361F"), okTinta: Cor(hex: "#86EFAC"),
        avisoFundo: Cor(hex: "#3A2A0B"), avisoTinta: Cor(hex: "#FCD34D"),
        erroFundo: Cor(hex: "#3B1518"), erroTinta: Cor(hex: "#FCA5A5"),
        infoFundo: Cor(hex: "#172554"), infoTinta: Cor(hex: "#93C5FD"),
        neutroFundo: Cor(hex: "#273449"), neutroTinta: Cor(hex: "#CBD5E1"),
        erro: Cor(hex: "#F87171"), skeleton: Cor(hex: "#273449"),
        sombra1: Cor(hex: "#000000", alfa: 0.30), sombra2: Cor(hex: "#000000", alfa: 0.40),
        escuro: true)
}

/// A cor do clube para um modo (nil = padrão do TactiPlan). No escuro, sem cor própria do
/// escuro, vale a do claro (o web faz igual: primary_color nos dois temas).
public func corDoClube(_ p: Personalizacao?, escuro: Bool) -> String? {
    let c = p?.corPrimaria
    if escuro { return normalizarHex(c?.escuro) ?? normalizarHex(c?.claro) }
    return normalizarHex(c?.claro)
}

/// A paleta das telas com a cor do clube (ou o azul do TactiPlan) e a trava de contraste.
public func coresDoClube(_ p: Personalizacao?, escuro: Bool) -> Cores {
    if escuro { return coresEscuras(acao: corDoClube(p, escuro: true) ?? ACAO_PADRAO_ESCURO) }
    let acao = corDoClube(p, escuro: false) ?? ACAO_PADRAO
    var c = coresClaras(acao: acao)
    // Cor quase igual ao fundo (ex.: branco): o botão sumiria — preenche com a versão legível.
    if contraste(acao, c.superficie.hex) < 1.5 {
        c.acao = c.acaoTinta
        c.sobreAcao = Cor(hex: textoSobre(c.acaoTinta.hex))
    }
    return c
}

/// Logo do clube para o modo (a escura só no escuro; sem ela, a normal).
public func logoDoClube(_ p: Personalizacao?, escuro: Bool) -> String? {
    if escuro, let e = p?.logoEscuraUrl, !e.isEmpty { return e }
    if let l = p?.logoUrl, !l.isEmpty { return l }
    return nil
}

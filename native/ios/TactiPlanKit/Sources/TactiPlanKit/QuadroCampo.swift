import Foundation

// QUADRO TÁTICO (T5): medidas oficiais, vistas, dimensões do canvas e limites de arrasto.
// Cópia fiel de frontend/src/modules/tactical-board/utils/fieldDimensions.js e do pitchGeometry
// do FieldBackground.jsx. Paridade: native/paridade/quadro.json (campo) e dados/quadro/Campo.kt.
//
// Coordenadas das peças/desenhos: x, y em % (0–100) do RETÂNGULO DE LINHAS visível — x = 0 linha
// de fundo esquerda, 100 a direita; y = 0 lateral de cima, 100 a de baixo. Pode passar de 0–100
// (peça fora das linhas, dentro do respiro). Raio da zona circular = % da ALTURA desse retângulo.

public enum TipoCampo {
    public static let futebol11 = "football_11"
    public static let futebol7 = "football_7"
    public static let futsal = "futsal"
    public static let todos = [futebol11, futebol7, futsal]
}

public enum VistaCampo {
    public static let inteiro = "full"
    public static let metadeEsquerda = "left_half"
    public static let metadeDireita = "right_half"
    public static let tercoEsquerdo = "third_left"
    public static let tercoDireito = "third_right"
    public static let todas = [inteiro, metadeEsquerda, metadeDireita, tercoEsquerdo, tercoDireito]
}

public struct Area: Equatable, Sendable {
    public let profundidade: Double
    public let largura: Double
}

/// Medidas reais (metros) de uma modalidade (PITCH_SPECS do web).
public struct MedidasCampo: Equatable, Sendable {
    public let comprimento: Double
    public let largura: Double
    public let grandeArea: Area?
    public let pequenaArea: Area?
    public let marcaPenalti: Double
    public let raioMeiaLua: Double?
    public let circuloCentral: Double
    public let raioEscanteio: Double
    public let gol: Area   // largura = boca do gol, profundidade = fundo da rede
    /// Futsal: área de 6 m em arco e 2º pênalti a 10 m.
    public let raioAreaFutsal: Double?
    public let segundoPenalti: Double?
}

public let MEDIDAS_CAMPO: [String: MedidasCampo] = [
    TipoCampo.futebol11: MedidasCampo(
        comprimento: 105, largura: 68,
        grandeArea: Area(profundidade: 16.5, largura: 40.32), pequenaArea: Area(profundidade: 5.5, largura: 18.32),
        marcaPenalti: 11, raioMeiaLua: 9.15, circuloCentral: 9.15, raioEscanteio: 1,
        gol: Area(profundidade: 2, largura: 7.32), raioAreaFutsal: nil, segundoPenalti: nil),
    TipoCampo.futebol7: MedidasCampo(
        comprimento: 55, largura: 35,
        grandeArea: Area(profundidade: 9.35, largura: 19.6), pequenaArea: Area(profundidade: 3.3, largura: 8.4),
        marcaPenalti: 6.6, raioMeiaLua: nil, circuloCentral: 4.2, raioEscanteio: 0.5,
        gol: Area(profundidade: 1.4, largura: 5), raioAreaFutsal: nil, segundoPenalti: nil),
    TipoCampo.futsal: MedidasCampo(
        comprimento: 40, largura: 20, grandeArea: nil, pequenaArea: nil,
        marcaPenalti: 6, raioMeiaLua: nil, circuloCentral: 3, raioEscanteio: 0.25,
        gol: Area(profundidade: 1, largura: 3), raioAreaFutsal: 6, segundoPenalti: 10),
]

/// getPitchSpec: tipo desconhecido = futebol 11.
public func medidasCampo(_ tipo: String?) -> MedidasCampo {
    MEDIDAS_CAMPO[tipo ?? ""] ?? MEDIDAS_CAMPO[TipoCampo.futebol11]!
}

/// Meia-lua (RectangularField): metade do ângulo (graus) do círculo do pênalti fora da grande área.
public func meiaLuaGraus(_ tipo: String?) -> Double {
    let f = medidasCampo(tipo)
    guard let r = f.raioMeiaLua, let ga = f.grandeArea, r > ga.profundidade - f.marcaPenalti else { return 0 }
    return acos((ga.profundidade - f.marcaPenalti) / r) * 180 / .pi
}

/// Janela visível ao longo do comprimento, em metros [x0, x1] (getViewWindow).
public struct JanelaVista: Equatable, Sendable {
    public let x0: Double
    public let x1: Double
    public let cortaEsquerda: Bool
    public let cortaDireita: Bool
}

public func janelaVista(_ tipo: String?, _ vista: String?) -> JanelaVista {
    let L = medidasCampo(tipo).comprimento
    switch vista {
    case VistaCampo.metadeEsquerda: return JanelaVista(x0: 0, x1: L / 2, cortaEsquerda: false, cortaDireita: true)
    case VistaCampo.metadeDireita: return JanelaVista(x0: L / 2, x1: L, cortaEsquerda: true, cortaDireita: false)
    case VistaCampo.tercoEsquerdo: return JanelaVista(x0: 0, x1: L / 3, cortaEsquerda: false, cortaDireita: true)
    case VistaCampo.tercoDireito: return JanelaVista(x0: (2 * L) / 3, x1: L, cortaEsquerda: true, cortaDireita: false)
    default: return JanelaVista(x0: 0, x1: L, cortaEsquerda: false, cortaDireita: false)
    }
}

/// Largura:altura do retângulo de linhas visível.
public func proporcaoCampo(_ tipo: String?, _ vista: String?) -> Double {
    let j = janelaVista(tipo, vista)
    return (j.x1 - j.x0) / medidasCampo(tipo).largura
}

/// Math.round do JS (meio sobe para +∞).
public func arredondarJs(_ v: Double) -> Double { (v + 0.5).rounded(.down) }

/// Canvas inteiro (gramado) + onde fica o retângulo de linhas dentro dele (px).
public struct DimensoesCanvas: Equatable, Sendable {
    public let larguraTela: Double
    public let alturaTela: Double
    public let campoX: Double
    public let campoY: Double
    /// Largura/altura do retângulo de linhas.
    public let largura: Double
    public let altura: Double
    public init(larguraTela: Double, alturaTela: Double, campoX: Double, campoY: Double, largura: Double, altura: Double) {
        self.larguraTela = larguraTela; self.alturaTela = alturaTela; self.campoX = campoX; self.campoY = campoY
        self.largura = largura; self.altura = altura
    }
}

/// calculateCanvasDimensions: o campo cabe ("contain") centralizado com respiro (≥ 6%, mín. 28/24 px);
/// `reservaBaixo` = faixa embaixo para a barra de quadros (no máx. 25% da altura).
public func dimensoesCanvas(_ larguraContainer: Double, _ alturaContainer: Double, tipo: String?, vista: String?,
                            reservaBaixo: Double = 0) -> DimensoesCanvas {
    let w = max(1, arredondarJs(larguraContainer))
    let h = max(1, arredondarJs(alturaContainer))
    let prop = proporcaoCampo(tipo, vista)
    let padX = max(w * 0.06, 28)
    let padY = max(h * 0.06, 24)
    let dispW = max(40, w - padX * 2)
    let reserva = max(0, min(reservaBaixo, h * 0.25))
    let dispH = max(40, h - padY * 2 - reserva)
    var cw: Double, ch: Double
    if dispW / dispH > prop {
        ch = dispH; cw = ch * prop
    } else {
        cw = dispW; ch = cw / prop
    }
    let fx = (w - cw) / 2
    let fy = padY + (dispH - ch) / 2
    return DimensoesCanvas(larguraTela: w, alturaTela: h, campoX: arredondarJs(fx), campoY: arredondarJs(fy),
                           largura: arredondarJs(cw), altura: arredondarJs(ch))
}

public func paraPixel(_ pct: Double, _ total: Double) -> Double { (pct / 100) * total }
public func paraPercentual(_ px: Double, _ total: Double) -> Double { (px / total) * 100 }

/// Limites de arrasto em % do campo: a peça pode sair da linha, mas não da tela (getDragBounds).
public struct LimitesArrasto: Equatable, Sendable {
    public let minX: Double
    public let maxX: Double
    public let minY: Double
    public let maxY: Double
}

public func limitesArrasto(_ d: DimensoesCanvas, margem: Double = 20) -> LimitesArrasto {
    LimitesArrasto(
        minX: paraPercentual(-d.campoX + margem, d.largura),
        maxX: paraPercentual(d.larguraTela - d.campoX - margem, d.largura),
        minY: paraPercentual(-d.campoY + margem, d.altura),
        maxY: paraPercentual(d.alturaTela - d.campoY - margem, d.altura))
}

/// clampToBounds.
public func prender(_ x: Double, _ y: Double, _ b: LimitesArrasto) -> (x: Double, y: Double) {
    (max(b.minX, min(b.maxX, x)), max(b.minY, min(b.maxY, y)))
}

/// pitchGeometry do FieldBackground: escala uniforme (px por metro) e o recorte das vistas parciais.
public struct GeometriaCampo: Equatable, Sendable {
    public let medidas: MedidasCampo
    /// px por metro.
    public let s: Double
    /// x (px) da linha de fundo esquerda e y da lateral de cima.
    public let ox: Double
    public let oy: Double
    /// Recorte (x, largura) da vista parcial: corta só o lado "cortado"; nil = campo inteiro.
    public let recorte: (x: Double, largura: Double)?

    public func X(_ m: Double) -> Double { ox + m * s }
    public func Y(_ m: Double) -> Double { oy + m * s }

    public static func == (a: GeometriaCampo, b: GeometriaCampo) -> Bool {
        a.medidas == b.medidas && a.s == b.s && a.ox == b.ox && a.oy == b.oy
            && a.recorte?.x == b.recorte?.x && a.recorte?.largura == b.recorte?.largura
    }
}

public func geometriaCampo(_ tipo: String?, _ vista: String?, _ d: DimensoesCanvas) -> GeometriaCampo {
    let f = medidasCampo(tipo)
    let j = janelaVista(tipo, vista)
    let s = d.largura / (j.x1 - j.x0)
    let ox = d.campoX - j.x0 * s
    var recorte: (Double, Double)?
    if j.cortaEsquerda || j.cortaDireita {
        let clipX = j.cortaEsquerda ? d.campoX : 0
        let clipDir = j.cortaDireita ? d.campoX + d.largura : d.larguraTela
        recorte = (clipX, clipDir - clipX)
    }
    return GeometriaCampo(medidas: f, s: s, ox: ox, oy: d.campoY, recorte: recorte)
}

/// "105 × 68 m" (rótulo do campo).
public func rotuloMedidas(_ tipo: String?) -> String {
    let f = medidasCampo(tipo)
    return "\(numeroJs(f.comprimento)) × \(numeroJs(f.largura)) m"
}

/// Número como o JavaScript escreve (inteiro sem ".0").
public func numeroJs(_ n: Double) -> String {
    if n.isNaN { return "NaN" }
    if n.rounded() == n, abs(n) < 1e15 { return String(Int64(n)) }
    return "\(n)"
}

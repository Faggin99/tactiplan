import Foundation

// QUADRO TÁTICO (T5): ferramentas de desenho, catálogos, regras do painel de seleção, toque nas
// peças, curva do desenho livre (Konva) e ritmo do play/vídeo. Tudo do web
// (TacticalCanvas.jsx, TacticalBoardPage.jsx, PlaybackControls.jsx, useVideoExport.js).
// Paridade: quadro.json (desenho, catalogos, ritmo) e dados/quadro/Desenho.kt.

// MARK: catálogos

public struct FerramentaSeta: Equatable, Sendable {
    public let id: String
    public let modo: String
    public let tracejado: [Double]
    public let rotulo: String
    public let descricao: String
    public let cor: String
}

public let FERRAMENTAS_SETA: [FerramentaSeta] = [
    FerramentaSeta(id: "arrow_run", modo: "arrow_straight", tracejado: [], rotulo: "Corrida", descricao: "Seta contínua", cor: "#ffffff"),
    FerramentaSeta(id: "arrow_pass", modo: "arrow_straight", tracejado: [8, 5], rotulo: "Passe", descricao: "Seta tracejada", cor: "#fbbf24"),
    FerramentaSeta(id: "arrow_dribble", modo: "arrow_straight", tracejado: [3, 3], rotulo: "Drible", descricao: "Seta pontilhada", cor: "#22c55e"),
    FerramentaSeta(id: "arrow_curved", modo: "arrow_curved", tracejado: [], rotulo: "Curva", descricao: "Seta curva", cor: "#ffffff"),
]

/// Ferramentas do "Desenho" do web (id = modo).
public let FERRAMENTAS_DESENHO: [(id: String, rotulo: String)] = [
    ("free_draw", "Desenho livre"), ("zone_rect", "Zona retangular"), ("zone_circle", "Zona circular"), ("text", "Texto"),
]

public struct TipoObjeto: Equatable, Sendable {
    public let tipo: String
    public let rotulo: String
    public let icone: String
}

public let TIPOS_OBJETO: [TipoObjeto] = [
    TipoObjeto(tipo: "cone", rotulo: "Cone baixo", icone: "▲"),
    TipoObjeto(tipo: "cone_tall", rotulo: "Cone alto", icone: "⧋"),
    TipoObjeto(tipo: "disc", rotulo: "Disco", icone: "●"),
    TipoObjeto(tipo: "barrier", rotulo: "Barreira", icone: "▬"),
    TipoObjeto(tipo: "pole", rotulo: "Estaca", icone: "│"),
    TipoObjeto(tipo: "flag", rotulo: "Bandeira", icone: "⚑"),
    TipoObjeto(tipo: "ladder", rotulo: "Escada", icone: "☰"),
    TipoObjeto(tipo: "mannequin", rotulo: "Manequim", icone: "♟"),
    TipoObjeto(tipo: "hoop", rotulo: "Arco", icone: "○"),
    TipoObjeto(tipo: "mini_goal", rotulo: "Mini gol", icone: "⊓"),
]

/// Objetos sem simetria radial: só esses giram.
public let OBJETOS_QUE_GIRAM: Set<String> = ["barrier", "pole", "flag", "ladder", "mannequin", "mini_goal"]

public let VISTAS_CAMPO: [(vista: String, rotulo: String)] = [
    (VistaCampo.inteiro, "Campo inteiro"), (VistaCampo.metadeEsquerda, "Metade esquerda"),
    (VistaCampo.metadeDireita, "Metade direita"), (VistaCampo.tercoEsquerdo, "Terço esquerdo"),
    (VistaCampo.tercoDireito, "Terço direito"),
]

public let TIPOS_CAMPO: [(tipo: String, rotulo: String)] = [
    (TipoCampo.futebol11, "Futebol 11"), (TipoCampo.futebol7, "Futebol 7"), (TipoCampo.futsal, "Futsal"),
]

public func rotuloTipoCampo(_ t: String) -> String { TIPOS_CAMPO.first { $0.tipo == t }?.rotulo ?? t }
public func rotuloVista(_ v: String) -> String { VISTAS_CAMPO.first { $0.vista == v }?.rotulo ?? v }

public let CORES_DESENHO = ["#ffffff", "#fbbf24", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ec4899"]

public let VELOCIDADES_QUADRO: [Double] = [0.5, 1, 1.5, 2]

/// describeMode.
public func rotuloModo(_ m: String) -> String {
    switch m {
    case "arrow_straight": return "Seta reta"
    case "arrow_curved": return "Seta curva"
    case "free_draw": return "Desenho livre"
    case "zone_rect": return "Zona retangular"
    case "zone_circle": return "Zona circular"
    case "text": return "Texto"
    default: return m
    }
}

// MARK: cores

/// hexToRgba do TacticalCanvas (cor que não é #rrggbb vira branco).
public func hexParaRgba(_ hex: String?, _ alfa: Double) -> String {
    guard let hex, hex.hasPrefix("#"), tamanhoJs(hex) >= 7 else { return "rgba(255,255,255,\(numeroJs(alfa)))" }
    let u = Array(hex.utf16)
    func canal(_ i: Int) -> String {
        let s = String(utf16CodeUnits: Array(u[i..<i + 2]), count: 2)
        return parseIntJs(s, base: 16).map(String.init) ?? "NaN"
    }
    return "rgba(\(canal(1)),\(canal(3)),\(canal(5)),\(numeroJs(alfa)))"
}

/// Cor CSS → RGBA 0…1 (o que o desenho nativo pinta). nil = não entendi (o web também não pintaria).
public struct CorRGBA: Equatable, Sendable {
    public let r: Double, g: Double, b: Double, a: Double
    public init(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) { self.r = r; self.g = g; self.b = b; self.a = a }
    public func comAlfa(_ fator: Double) -> CorRGBA { CorRGBA(r, g, b, a * fator) }
}

private let CORES_NOMEADAS: [String: CorRGBA] = [
    "white": CorRGBA(1, 1, 1), "black": CorRGBA(0, 0, 0), "red": CorRGBA(1, 0, 0), "yellow": CorRGBA(1, 1, 0),
    "blue": CorRGBA(0, 0, 1), "green": CorRGBA(0, 128.0 / 255, 0), "orange": CorRGBA(1, 165.0 / 255, 0),
    "transparent": CorRGBA(0, 0, 0, 0),
]

public func corCss(_ s: String?) -> CorRGBA? {
    guard let raw = s?.trimmingCharacters(in: .whitespaces).lowercased(), !raw.isEmpty else { return nil }
    if let c = CORES_NOMEADAS[raw] { return c }
    if raw.hasPrefix("#") {
        let h = Array(raw.dropFirst())
        func v(_ a: Int, _ n: Int) -> Double? { Int(String(h[a..<a + n]), radix: 16).map { Double($0) / (n == 1 ? 15 : 255) } }
        switch h.count {
        case 3, 4:
            guard let r = v(0, 1), let g = v(1, 1), let b = v(2, 1) else { return nil }
            return CorRGBA(r, g, b, h.count == 4 ? (v(3, 1) ?? 1) : 1)
        case 6, 8:
            guard let r = v(0, 2), let g = v(2, 2), let b = v(4, 2) else { return nil }
            return CorRGBA(r, g, b, h.count == 8 ? (v(6, 2) ?? 1) : 1)
        default: return nil
        }
    }
    if raw.hasPrefix("rgb") {
        guard let a = raw.firstIndex(of: "("), let b = raw.lastIndex(of: ")") else { return nil }
        let partes = raw[raw.index(after: a)..<b].split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard partes.count >= 3, let r = Double(partes[0]), let g = Double(partes[1]), let bl = Double(partes[2]) else { return nil }
        let alfa = partes.count >= 4 ? (Double(partes[3]) ?? 1) : 1
        return CorRGBA(r / 255, g / 255, bl / 255, max(0, min(1, alfa)))
    }
    return nil
}

// MARK: desenhar com o dedo (TacticalCanvas: buildDraft / finishDrawing)

/// O traço em andamento: começa no toque, acompanha o dedo e vira desenho ao soltar.
public struct RascunhoDesenho: Equatable, Sendable {
    public let modo: String
    public let cor: String
    public let tracejado: [Double]
    public let espessura: Double
    public let inicio: (x: Double, y: Double)
    public private(set) var fim: (x: Double, y: Double)
    /// Desenho livre: [x1, y1, x2, y2, …] em %.
    public private(set) var pontos: [Double]

    public init(modo: String, cor: String, tracejado: [Double], espessura: Double = 2.5, x: Double, y: Double) {
        self.modo = modo; self.cor = cor; self.tracejado = tracejado; self.espessura = espessura
        inicio = (x, y); fim = (x, y)
        pontos = modo == "free_draw" ? [x, y] : []
    }

    public mutating func mover(_ x: Double, _ y: Double) {
        fim = (x, y)
        if modo == "free_draw" { pontos.append(contentsOf: [x, y]) }
    }

    /// Prévia ao vivo (opacidade 0,6 na tela).
    public var previa: Desenho? {
        montar(fim.x, fim.y, dims: nil).map(Desenho.init)
    }

    /// Soltar: o fim é preso à tela (margem 4 px); seta/zona menor que 8 px não vale; livre precisa
    /// de 2 pontos. nil = nada a gravar.
    public func terminar(_ x: Double, _ y: Double, dims: DimensoesCanvas) -> [String: Json]? {
        let p = prender(x, y, limitesArrasto(dims, margem: 4))
        if modo != "free_draw", distanciaPx(inicio.x, inicio.y, p.x, p.y, dims) < 8 { return nil }
        if modo == "free_draw" { return pontos.count >= 4 ? montar(p.x, p.y, dims: dims, final: true) : nil }
        return montar(p.x, p.y, dims: dims, final: true)
    }

    private func montar(_ x2: Double, _ y2: Double, dims: DimensoesCanvas?, final: Bool = false) -> [String: Json]? {
        let (x1, y1) = inicio
        let tr: Json = .lista(tracejado.map(Json.numero))
        switch modo {
        case "arrow_straight":
            return ["drawType": "arrow_straight", "x1": .numero(x1), "y1": .numero(y1), "x2": .numero(x2), "y2": .numero(y2),
                    "color": .texto(cor), "strokeWidth": .numero(espessura), "dash": tr]
        case "arrow_curved":
            let c = controleCurva(x1, y1, x2, y2)
            return ["drawType": "arrow_curved", "x1": .numero(x1), "y1": .numero(y1), "x2": .numero(x2), "y2": .numero(y2),
                    "cx": .numero(c.cx), "cy": .numero(c.cy), "color": .texto(cor), "strokeWidth": .numero(espessura), "dash": tr]
        case "free_draw":
            var d: [String: Json] = ["drawType": "free_draw", "points": .lista(pontos.map(Json.numero)), "color": .texto(cor),
                                     "strokeWidth": .numero(espessura)]
            if !final { d["dash"] = tr }
            return d
        case "zone_rect":
            return ["drawType": "zone_rect", "x": .numero(min(x1, x2)), "y": .numero(min(y1, y2)),
                    "w": .numero(abs(x2 - x1)), "h": .numero(abs(y2 - y1)),
                    "color": .texto(hexParaRgba(cor, 0.15)), "strokeColor": .texto(hexParaRgba(cor, 0.5))]
        case "zone_circle":
            guard let dims else {
                return ["drawType": "zone_circle", "cx": .numero(x1), "cy": .numero(y1), "radius": .numero(0),
                        "color": .texto(hexParaRgba(cor, 0.15)), "strokeColor": .texto(hexParaRgba(cor, 0.5))]
            }
            return ["drawType": "zone_circle", "cx": .numero(x1), "cy": .numero(y1), "radius": .numero(raioZonaPct(x1, y1, x2, y2, dims)),
                    "color": .texto(hexParaRgba(cor, 0.15)), "strokeColor": .texto(hexParaRgba(cor, 0.5))]
        default:
            return nil
        }
    }

    public static func == (a: RascunhoDesenho, b: RascunhoDesenho) -> Bool {
        a.modo == b.modo && a.cor == b.cor && a.tracejado == b.tracejado && a.espessura == b.espessura
            && a.inicio == b.inicio && a.fim == b.fim && a.pontos == b.pontos
    }
}

/// Prévia da zona circular precisa das dimensões (o raio é medido em px).
public func previaComDims(_ r: RascunhoDesenho, dims: DimensoesCanvas) -> Desenho? {
    guard r.modo == "zone_circle" else { return r.previa }
    var d = r.previa?.dados ?? [:]
    d["radius"] = .numero(raioZonaPct(r.inicio.x, r.inicio.y, r.fim.x, r.fim.y, dims))
    return Desenho(d)
}

/// Ponto de controle da seta curva: meio do segmento deslocado 30% na perpendicular.
public func controleCurva(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) -> (cx: Double, cy: Double) {
    ((x1 + x2) / 2 - (y2 - y1) * 0.3, (y1 + y2) / 2 + (x2 - x1) * 0.3)
}

/// Raio da zona circular em % da ALTURA, medido em pixels (% é anisotrópico).
public func raioZonaPct(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ d: DimensoesCanvas) -> Double {
    paraPercentual(distanciaPx(x1, y1, x2, y2, d), d.altura)
}

public func distanciaPx(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ d: DimensoesCanvas) -> Double {
    let dx = paraPixel(x2 - x1, d.largura), dy = paraPixel(y2 - y1, d.altura)
    return (dx * dx + dy * dy).squareRoot()
}

/// Texto novo (editor de texto do campo): até 60 letras; vazio não grava.
public func dadosTexto(_ valor: String, x: Double, y: Double, cor: String) -> [String: Json]? {
    let v = valor.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !v.isEmpty else { return nil }
    return ["drawType": "text", "x": .numero(x), "y": .numero(y), "text": .texto(fatiaJs(v, 60)), "color": .texto(cor), "fontSize": 14]
}

/// Troca de cor no painel: zona leva rgba 0,15/0,5; o resto, a cor pura.
public func patchCorDesenho(_ d: Desenho, cor: String) -> [String: Json] {
    if d.tipo.hasPrefix("zone") { return ["color": .texto(hexParaRgba(cor, 0.15)), "strokeColor": .texto(hexParaRgba(cor, 0.5))] }
    return ["color": .texto(cor)]
}

/// A bolinha da paleta aparece marcada? (`color === c || strokeColor.includes("r,g,b")`).
public func corMarcada(_ d: Desenho, _ cor: String) -> Bool {
    if d.t("color") == cor { return true }
    let r = hexParaRgba(cor, 1)
    let rgb = r.dropFirst(5).split(separator: ",").prefix(3).joined(separator: ",")
    return d.t("strokeColor")?.contains(rgb) ?? false
}

public func desenhoTemEspessura(_ d: Desenho) -> Bool { ["arrow_straight", "arrow_curved", "free_draw"].contains(d.tipo) }

// MARK: regras do painel de seleção (SelectionPanel)

/// commitJersey: parseInt, 1…99 e diferente da atual (`!==`). nil = não muda.
public func camisaConfirmada(_ valor: String, atual: Json?) -> Int? {
    guard let n = parseIntJs(valor), n >= 1, n <= 99 else { return nil }
    if case .numero(let a)? = atual, a == Double(n) { return nil }
    return n
}

/// commitName: trim + 12 letras.
public func nomeConfirmado(_ valor: String) -> String {
    fatiaJs(valor.trimmingCharacters(in: .whitespacesAndNewlines), 12)
}

/// Girar objeto: passos de 45° (botões) e o resultado sempre em 0…359.
public func girar(_ rotacao: Double, _ delta: Double) -> Double {
    let r = (rotacao + delta).truncatingRemainder(dividingBy: 360)
    return (r + 360).truncatingRemainder(dividingBy: 360)
}

/// Nome no token: até 10 letras; mais que isso, 9 + "…".
public func nomeNoToken(_ nome: String) -> String {
    tamanhoJs(nome) > 10 ? fatiaJs(nome, 9) + "…" : nome
}

// MARK: medidas dos tokens (PlayerToken / BallToken / MarkerToken)

public let RAIO_JOGADOR = 16.0
public let RAIO_BOLA = 10.0

/// Raio de toque (px) por tipo: o dedo é maior que o mouse.
public func raioDeToque(_ p: Peca) -> Double {
    switch p.tipo {
    case "player": return RAIO_JOGADOR + 8
    case "ball": return RAIO_BOLA + 10
    default: return 22
    }
}

/// Peça sob o dedo (a de cima primeiro). `px`, `py` no sistema do retângulo de linhas (px).
public func pecaNoPonto(_ pecas: [Peca], _ px: Double, _ py: Double, _ d: DimensoesCanvas) -> Peca? {
    var melhor: (Peca, Double)?
    for p in pecas.reversed() {
        let dx = paraPixel(p.x, d.largura) - px, dy = paraPixel(p.y, d.altura) - py
        let dist = (dx * dx + dy * dy).squareRoot()
        if dist <= raioDeToque(p), melhor == nil || dist < melhor!.1 - 6 { melhor = (p, dist) }
    }
    return melhor?.0
}

private func distSegmento(_ px: Double, _ py: Double, _ ax: Double, _ ay: Double, _ bx: Double, _ by: Double) -> Double {
    let vx = bx - ax, vy = by - ay
    let l2 = vx * vx + vy * vy
    var t = l2 == 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / l2
    t = max(0, min(1, t))
    let cx = ax + t * vx - px, cy = ay + t * vy - py
    return (cx * cx + cy * cy).squareRoot()
}

/// Pontos da curva quadrática (para tocar e para o vídeo).
public func pontosQuadratica(_ x0: Double, _ y0: Double, _ cx: Double, _ cy: Double, _ x1: Double, _ y1: Double, passos: Int = 16) -> [(Double, Double)] {
    (0...passos).map { i in
        let t = Double(i) / Double(passos), u = 1 - t
        return (u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1)
    }
}

/// Desenho sob o dedo (o de cima primeiro), com folga de 12 px nas linhas.
public func desenhoNoPonto(_ desenhos: [Desenho], _ px: Double, _ py: Double, _ d: DimensoesCanvas, folga: Double = 12) -> Desenho? {
    let X = { (v: Double) in paraPixel(v, d.largura) }
    let Y = { (v: Double) in paraPixel(v, d.altura) }
    for z in desenhos.reversed() {
        switch z.tipo {
        case "arrow_straight":
            if distSegmento(px, py, X(z.n("x1")), Y(z.n("y1")), X(z.n("x2")), Y(z.n("y2"))) <= folga { return z }
        case "arrow_curved":
            let c = curvaDaSeta(z)
            let pts = pontosQuadratica(X(z.n("x1")), Y(z.n("y1")), X(c.cx), Y(c.cy), X(z.n("x2")), Y(z.n("y2")))
            for i in 1..<pts.count where distSegmento(px, py, pts[i - 1].0, pts[i - 1].1, pts[i].0, pts[i].1) <= folga { return z }
        case "free_draw":
            let p = z.pontos
            guard p.count >= 4 else { continue }
            var i = 2
            while i + 1 < p.count {
                if distSegmento(px, py, X(p[i - 2]), Y(p[i - 1]), X(p[i]), Y(p[i + 1])) <= folga { return z }
                i += 2
            }
        case "zone_rect":
            let x = X(z.n("x")), y = Y(z.n("y")), w = X(z.n("w")), h = Y(z.n("h"))
            if px >= x - folga / 2, px <= x + w + folga / 2, py >= y - folga / 2, py <= y + h + folga / 2 { return z }
        case "zone_circle":
            let dx = px - X(z.n("cx")), dy = py - Y(z.n("cy"))
            if (dx * dx + dy * dy).squareRoot() <= Y(z.n("radius")) + folga / 2 { return z }
        case "text":
            let x = X(z.n("x")), y = Y(z.n("y"))
            let fs = z.n("fontSize", ou: 14)
            let w = Double(tamanhoJs(z.texto)) * fs * 0.6
            if px >= x - 6, px <= x + w + 6, py >= y - 6, py <= y + fs + 8 { return z }
        default: continue
        }
    }
    return nil
}

/// `cx || meio`, `cy || meio - 15` (como o DrawingLayer desenha).
public func curvaDaSeta(_ z: Desenho) -> (cx: Double, cy: Double) {
    let x1 = z.n("x1"), y1 = z.n("y1"), x2 = z.n("x2"), y2 = z.n("y2")
    return (z.n("cx", ou: (x1 + x2) / 2), z.n("cy", ou: (y1 + y2) / 2 - 15))
}

/// Só zona retangular e texto se arrastam (como no web).
public func desenhoArrastavel(_ z: Desenho) -> Bool { z.tipo == "zone_rect" || z.tipo == "text" }

// MARK: desenho livre (Konva Line, tension 0.3)

/// expandPoints do Konva: pontos de controle da curva que passa por todos os pontos.
public func pontosDeTensao(_ p: [Double], tensao: Double) -> [Double] {
    var r: [Double] = []
    var n = 2
    while n < p.count - 2 {
        let x0 = p[n - 2], y0 = p[n - 1], x1 = p[n], y1 = p[n + 1], x2 = p[n + 2], y2 = p[n + 3]
        let d01 = ((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)).squareRoot()
        let d12 = ((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)).squareRoot()
        let fa = (tensao * d01) / (d01 + d12), fb = (tensao * d12) / (d01 + d12)
        let p1x = x1 - fa * (x2 - x0), p1y = y1 - fa * (y2 - y0), p2x = x1 + fb * (x2 - x0), p2y = y1 + fb * (y2 - y0)
        n += 2
        if p1x.isNaN { continue }
        r.append(contentsOf: [p1x, p1y, x1, y1, p2x, p2y])
    }
    return r
}

/// Comandos do caminho do desenho livre (Line._sceneFunc com tension): mover, quadráticas e cúbicas.
public enum PassoCaminho: Equatable, Sendable {
    case mover(Double, Double)
    case linha(Double, Double)
    case quadratica(Double, Double, Double, Double)
    case cubica(Double, Double, Double, Double, Double, Double)
}

public func caminhoLivre(_ p: [Double], tensao: Double = 0.3) -> [PassoCaminho] {
    guard p.count >= 2 else { return [] }
    var r: [PassoCaminho] = [.mover(p[0], p[1])]
    let tp = pontosDeTensao(p, tensao: tensao)
    if tensao != 0, p.count > 4, tp.count >= 4 {
        let len = tp.count
        r.append(.quadratica(tp[0], tp[1], tp[2], tp[3]))
        var n = 4
        while n < len - 2 {
            r.append(.cubica(tp[n], tp[n + 1], tp[n + 2], tp[n + 3], tp[n + 4], tp[n + 5]))
            n += 6
        }
        r.append(.quadratica(tp[len - 2], tp[len - 1], p[p.count - 2], p[p.count - 1]))
    } else {
        var n = 2
        while n + 1 < p.count { r.append(.linha(p[n], p[n + 1])); n += 2 }
    }
    return r
}

// MARK: ritmo (usePlayback / useVideoExport)

/// Uma transição entre quadros leva 1,5 s em 1×.
public let QUADRO_MS = 1500.0
public let VIDEO_FPS = 30
public let VIDEO_QUADRO_MS = 1500.0

/// Linha do tempo do vídeo do web: cada transição tem os passos 0…ceil(1,5 × 30) (inclusive, 46
/// imagens) e o fim segura 1 s (30 imagens) no último. (quadro de origem, t).
public func linhaDoVideo(_ totalQuadros: Int) -> [(quadro: Int, t: Double)] {
    guard totalQuadros > 1 else { return [] }
    let passos = Int((VIDEO_QUADRO_MS / 1000 * Double(VIDEO_FPS)).rounded(.up))
    var r: [(Int, Double)] = []
    for f in 0..<(totalQuadros - 1) { for s in 0...passos { r.append((f, Double(s) / Double(passos))) } }
    for _ in 0..<VIDEO_FPS { r.append((totalQuadros - 2, 1)) }
    return r
}

/// O que aparece em cada imagem do vídeo: peças interpoladas (como o web) e os desenhos do quadro
/// de origem (na espera final, os do último quadro).
public func imagemDoVideo(_ quadros: [QuadroJogada], _ passo: (quadro: Int, t: Double), final: Bool) -> (pecas: [Peca], desenhos: [Desenho]) {
    let a = quadros[passo.quadro]
    let b = quadros.indices.contains(passo.quadro + 1) ? quadros[passo.quadro + 1] : nil
    let pecas = interpolarPecas(a, b, passo.t)
    return (pecas, final ? (b ?? a).desenhos : a.desenhos)
}

/// Play: transição atual + t, avançando pelo relógio. Igual ao usePlayback: começa no quadro atual
/// (no último, volta ao 1º); termina ao chegar no último quadro.
public struct Reproducao: Equatable, Sendable {
    public private(set) var quadro: Int
    public private(set) var t: Double = 0
    public private(set) var terminou = false
    public let total: Int

    /// nil = não dá para tocar (1 quadro só).
    public init?(atual: Int, total: Int) {
        guard total > 1 else { return nil }
        self.total = total
        quadro = atual >= total - 1 ? 0 : atual
    }

    /// Avança `ms` no relógio na velocidade dada. Devolve true quando trocou de quadro.
    @discardableResult
    public mutating func avancar(_ ms: Double, velocidade: Double) -> Bool {
        guard !terminou else { return false }
        let dur = QUADRO_MS / max(0.1, velocidade)
        t += ms / dur
        var trocou = false
        while t >= 1 && !terminou {
            quadro += 1
            trocou = true
            if quadro >= total - 1 { terminou = true; t = 0 } else { t -= 1 }
        }
        return trocou
    }

    public func pecas(_ quadros: [QuadroJogada]) -> [Peca] {
        guard quadros.indices.contains(quadro) else { return [] }
        if terminou { return quadros[quadro].elementos }
        return interpolarPecas(quadros[quadro], quadros.indices.contains(quadro + 1) ? quadros[quadro + 1] : nil, t)
    }
}

/// "Futebol 11 · campo inteiro · quadro 2 de 3".
public func subtituloEditor(tipo: String, vista: String, atual: Int, total: Int) -> String {
    "\(rotuloTipoCampo(tipo)) · \(rotuloVista(vista).lowercased()) · quadro \(atual + 1) de \(total)"
}

/// Nome do arquivo do vídeo (generateVideoFilename): "Saida_de_bola_2026-10-22.mp4".
public func nomeArquivoVideo(_ nomeJogada: String, hojeISO: String) -> String {
    var s = ""
    for ch in (nomeJogada.isEmpty ? "jogada" : nomeJogada).unicodeScalars {
        let v = ch.value
        let ok = (v >= 0x30 && v <= 0x39) || (v >= 0x41 && v <= 0x5A) || (v >= 0x61 && v <= 0x7A) || (v >= 0xC0 && v <= 0x24F)
        s.unicodeScalars.append(ok ? ch : "_")
    }
    while s.contains("__") { s = s.replacingOccurrences(of: "__", with: "_") }
    return "\(fatiaJs(s, 50))_\(hojeISO).mp4"
}

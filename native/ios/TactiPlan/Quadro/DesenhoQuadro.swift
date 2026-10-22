import SwiftUI
import UIKit
import CoreGraphics
import TactiPlanKit

// Desenho NATIVO do quadro tático (CoreGraphics): o mesmo código pinta a tela (Canvas do SwiftUI,
// via withCGContext) e cada imagem do vídeo MP4 (AVAssetWriter). Cópia visual do web:
// FieldBackground (gramado listrado / quadra azul, linhas, gols com rede), PlayerToken (círculo e
// losango do goleiro), BallToken (bola de gomos), MarkerToken (10 objetos), DrawingLayer (setas,
// livre com tensão 0,3 do Konva, zonas, texto) e TrajectoryLayer (seta tracejada até o próximo
// quadro). O contexto precisa estar com y para baixo (origem no canto de cima).

/// Tudo o que uma imagem do quadro mostra.
struct CenaQuadro {
    var dims: DimensoesCanvas
    var tipo: String
    var vista: String
    var pecas: [Peca]
    var desenhos: [Desenho]
    var previa: Desenho? = nil
    /// Peças do próximo quadro (trajetórias). nil = sem setas (tocando/vídeo).
    var proximas: [Peca]? = nil
    var corA: String
    var corB: String
    var pecaSelecionada: String? = nil
    var desenhoSelecionado: String? = nil
    /// Peça sendo arrastada (desenhada na posição do dedo).
    var arrasto: (id: String, x: Double, y: Double)? = nil
    /// Desenho sendo arrastado: deslocamento em %.
    var arrastoDesenho: (id: String, dx: Double, dy: Double)? = nil
}

private extension CGContext {
    func cor(_ c: UIColor) { setFillColor(c.cgColor); setStrokeColor(c.cgColor) }
}

func uiCor(_ css: String?, _ padrao: UIColor = .white) -> UIColor {
    guard let c = corCss(css) else { return padrao }
    return UIColor(red: c.r, green: c.g, blue: c.b, alpha: c.a)
}

private func rgba(_ r: Double, _ g: Double, _ b: Double, _ a: Double) -> UIColor { UIColor(red: r / 255, green: g / 255, blue: b / 255, alpha: a) }
private func hex(_ s: String) -> UIColor { uiCor(s) }

private let AMBAR = hex("#fbbf24")

private func fonteArial(_ tamanho: CGFloat, negrito: Bool) -> UIFont {
    UIFont(name: negrito ? "Arial-BoldMT" : "ArialMT", size: tamanho)
        ?? (negrito ? .boldSystemFont(ofSize: tamanho) : .systemFont(ofSize: tamanho))
}

/// Texto UIKit no contexto (precisa estar empurrado com UIGraphicsPushContext).
private func texto(_ cg: CGContext, _ s: String, fonte: UIFont, cor: UIColor, centro: CGPoint? = nil, topo: CGPoint? = nil,
                   sombra: (UIColor, CGFloat)? = nil) {
    let attrs: [NSAttributedString.Key: Any] = [.font: fonte, .foregroundColor: cor]
    let ns = s as NSString
    let tam = ns.size(withAttributes: attrs)
    var p = CGPoint.zero
    if let centro { p = CGPoint(x: centro.x - tam.width / 2, y: centro.y - tam.height / 2) }
    if let topo { p = CGPoint(x: topo.x - tam.width / 2, y: topo.y) }
    cg.saveGState()
    if let sombra { cg.setShadow(offset: .zero, blur: sombra.1, color: sombra.0.cgColor) }
    UIGraphicsPushContext(cg)
    ns.draw(at: p, withAttributes: attrs)
    UIGraphicsPopContext()
    cg.restoreGState()
}

/// Arco como no Konva: a partir de `rotacao`, varrendo `angulo` graus no sentido horário da tela.
private func arco(_ cg: CGContext, _ x: CGFloat, _ y: CGFloat, _ r: CGFloat, angulo: CGFloat, rotacao: CGFloat) {
    let ini = rotacao * .pi / 180, fim = (rotacao + angulo) * .pi / 180
    let p = UIBezierPath(arcCenter: CGPoint(x: x, y: y), radius: r, startAngle: ini, endAngle: fim, clockwise: true)
    cg.addPath(p.cgPath)
    cg.strokePath()
}

// MARK: cena

func desenharCena(_ cg: CGContext, _ c: CenaQuadro) {
    let d = c.dims
    guard d.largura > 0, d.altura > 0 else { return }
    cg.saveGState()
    desenharCampo(cg, c.tipo, c.vista, d)
    cg.saveGState()
    cg.translateBy(x: CGFloat(d.campoX), y: CGFloat(d.campoY))
    for z in c.desenhos {
        var zz = z
        if let a = c.arrastoDesenho, a.id == z.id { zz = deslocarDesenho(z, a.dx, a.dy) }
        desenharDesenho(cg, zz, d, selecionado: c.desenhoSelecionado == z.id)
    }
    if let p = c.previa {
        cg.setAlpha(0.6)
        desenharDesenho(cg, p, d, selecionado: false)
        cg.setAlpha(1)
    }
    if let prox = c.proximas { desenharTrajetorias(cg, c.pecas, prox, d, corA: c.corA, corB: c.corB) }
    for p in c.pecas {
        var x = paraPixel(p.x, d.largura), y = paraPixel(p.y, d.altura)
        if let a = c.arrasto, a.id == p.id { x = paraPixel(a.x, d.largura); y = paraPixel(a.y, d.altura) }
        let sel = c.pecaSelecionada == p.id
        cg.saveGState()
        cg.translateBy(x: CGFloat(x), y: CGFloat(y))
        switch p.tipo {
        case "player":
            let cor = p.time == "A" ? c.corA : (p.time == "B" ? c.corB : nil)
            desenharJogador(cg, p, cor: cor.map { uiCor($0) } ?? .clear, selecionado: sel)
        case "ball": desenharBola(cg, selecionado: sel)
        case "marker":
            cg.rotate(by: CGFloat(p.rotacao) * .pi / 180)
            desenharObjeto(cg, p.marcador, selecionado: sel)
        default: break
        }
        cg.restoreGState()
    }
    cg.restoreGState()
    cg.restoreGState()
}

/// Zona retangular e texto andam pelo deslocamento do arrasto.
func deslocarDesenho(_ z: Desenho, _ dx: Double, _ dy: Double) -> Desenho {
    var d = z.dados
    d["x"] = .numero(z.n("x") + dx)
    d["y"] = .numero(z.n("y") + dy)
    return Desenho(d)
}

// MARK: campo (FieldBackground)

private func desenharCampo(_ cg: CGContext, _ tipo: String, _ vista: String, _ d: DimensoesCanvas) {
    let g = geometriaCampo(tipo, vista, d)
    let f = g.medidas
    let W = CGFloat(d.larguraTela), H = CGFloat(d.alturaTela)
    let X = { (m: Double) in CGFloat(g.X(m)) }
    let Y = { (m: Double) in CGFloat(g.Y(m)) }
    let s = CGFloat(g.s)
    let L = f.comprimento, Wm = f.largura, cy = Wm / 2
    let branco = UIColor.white
    let linha: CGFloat = 1.7
    let futsal = tipo == TipoCampo.futsal

    // Piso
    if futsal {
        cg.setFillColor(hex("#1E5AA8").cgColor); cg.fill(CGRect(x: 0, y: 0, width: W, height: H))
        if let tile = TEXTURA_QUADRA { cg.draw(tile, in: CGRect(x: 0, y: 0, width: 8, height: 8), byTiling: true) }
        let cores = [rgba(255, 255, 255, 0.05).cgColor, rgba(0, 0, 0, 0.15).cgColor] as CFArray
        if let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: cores, locations: [0, 1]) {
            let centro = CGPoint(x: W / 2, y: H / 2)
            cg.drawRadialGradient(grad, startCenter: centro, startRadius: min(W, H) * 0.15, endCenter: centro,
                                  endRadius: max(W, H) * 0.7, options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        }
    } else {
        cg.setFillColor(hex("#2f7d3a").cgColor); cg.fill(CGRect(x: 0, y: 0, width: W, height: H))
        let sw = max(8, (CGFloat(L) * s) / 14)
        let origem = X(0)
        let primeiro = Int(floor(-origem / sw)) - 1, ultimo = Int(ceil((W - origem) / sw)) + 1
        cg.setFillColor(hex("#369342").cgColor)
        if primeiro <= ultimo {
            for i in primeiro...ultimo where ((i % 2) + 2) % 2 == 1 { cg.fill(CGRect(x: origem + sw * CGFloat(i), y: 0, width: sw, height: H)) }
        }
        cg.setFillColor(rgba(255, 255, 255, 0.04).cgColor); cg.fill(CGRect(x: 0, y: 0, width: W, height: H * 0.35))
        cg.setFillColor(rgba(0, 0, 0, 0.08).cgColor); cg.fill(CGRect(x: 0, y: H * 0.7, width: W, height: H * 0.3))
    }

    cg.saveGState()
    if let r = g.recorte { cg.clip(to: CGRect(x: CGFloat(r.x), y: 0, width: CGFloat(r.largura), height: H)) }
    cg.setLineCap(.butt)
    let ret = CGRect(x: X(0), y: Y(0), width: CGFloat(L) * s, height: CGFloat(Wm) * s)
    cg.setStrokeColor((futsal ? rgba(0, 0, 0, 0.25) : rgba(0, 0, 0, 0.35)).cgColor); cg.setLineWidth(3); cg.stroke(ret)
    cg.setStrokeColor(branco.cgColor); cg.setLineWidth(linha + 0.5); cg.stroke(ret)
    cg.setLineWidth(linha)
    // Meio-campo e círculo central
    cg.move(to: CGPoint(x: X(L / 2), y: Y(0))); cg.addLine(to: CGPoint(x: X(L / 2), y: Y(Wm))); cg.strokePath()
    let rc = CGFloat(f.circuloCentral) * s
    cg.strokeEllipse(in: CGRect(x: X(L / 2) - rc, y: Y(cy) - rc, width: rc * 2, height: rc * 2))
    let marca = futsal ? max(2.2, min(3.2, s * 0.12)) : max(2.2, min(3.2, s * 0.25))
    func ponto(_ xm: Double) {
        cg.setFillColor(branco.cgColor)
        cg.fillEllipse(in: CGRect(x: X(xm) - marca, y: Y(cy) - marca, width: marca * 2, height: marca * 2))
    }
    ponto(L / 2)
    if futsal, let ra = f.raioAreaFutsal {
        arco(cg, X(0), Y(cy), CGFloat(ra) * s, angulo: 180, rotacao: -90)
        arco(cg, X(L), Y(cy), CGFloat(ra) * s, angulo: 180, rotacao: 90)
        ponto(f.marcaPenalti); ponto(L - f.marcaPenalti)
        if let sp = f.segundoPenalti { ponto(sp); ponto(L - sp) }
    } else if let pa = f.grandeArea, let ga = f.pequenaArea {
        cg.stroke(CGRect(x: X(0), y: Y(cy - pa.largura / 2), width: CGFloat(pa.profundidade) * s, height: CGFloat(pa.largura) * s))
        cg.stroke(CGRect(x: X(L - pa.profundidade), y: Y(cy - pa.largura / 2), width: CGFloat(pa.profundidade) * s, height: CGFloat(pa.largura) * s))
        cg.stroke(CGRect(x: X(0), y: Y(cy - ga.largura / 2), width: CGFloat(ga.profundidade) * s, height: CGFloat(ga.largura) * s))
        cg.stroke(CGRect(x: X(L - ga.profundidade), y: Y(cy - ga.largura / 2), width: CGFloat(ga.profundidade) * s, height: CGFloat(ga.largura) * s))
        ponto(f.marcaPenalti); ponto(L - f.marcaPenalti)
        let meia = CGFloat(meiaLuaGraus(tipo))
        if meia > 0, let r = f.raioMeiaLua {
            cg.setStrokeColor(branco.cgColor)
            arco(cg, X(f.marcaPenalti), Y(cy), CGFloat(r) * s, angulo: meia * 2, rotacao: -meia)
            arco(cg, X(L - f.marcaPenalti), Y(cy), CGFloat(r) * s, angulo: meia * 2, rotacao: 180 - meia)
        }
    }
    // Escanteios
    cg.setStrokeColor(branco.cgColor)
    let re = max(3, CGFloat(f.raioEscanteio) * s)
    arco(cg, X(0), Y(0), re, angulo: 90, rotacao: 0)
    arco(cg, X(L), Y(0), re, angulo: 90, rotacao: 90)
    arco(cg, X(L), Y(Wm), re, angulo: 90, rotacao: 180)
    arco(cg, X(0), Y(Wm), re, angulo: 90, rotacao: 270)
    // Gols (um pouco para fora da linha de fundo)
    let gw = CGFloat(f.gol.largura) * s, gd = CGFloat(f.gol.profundidade) * s
    desenharGol(cg, x: X(-f.gol.profundidade), y: Y(cy - f.gol.largura / 2), w: gd, h: gw, esquerdo: true)
    desenharGol(cg, x: X(L), y: Y(cy - f.gol.largura / 2), w: gd, h: gw, esquerdo: false)
    cg.restoreGState()
}

/// Textura 8×8 da quadra (poros claro/escuro), feita uma vez.
private let TEXTURA_QUADRA: CGImage? = {
    let r = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8))
    let img = r.image { ctx in
        let c = ctx.cgContext
        c.setFillColor(rgba(255, 255, 255, 0.05).cgColor); c.fillEllipse(in: CGRect(x: 1.4, y: 1.4, width: 1.2, height: 1.2))
        c.setFillColor(rgba(0, 0, 0, 0.08).cgColor); c.fillEllipse(in: CGRect(x: 5.4, y: 5.4, width: 1.2, height: 1.2))
    }
    return img.cgImage
}()

private func desenharGol(_ cg: CGContext, x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, esquerdo: Bool) {
    let r = CGRect(x: x, y: y, width: w, height: h)
    cg.setFillColor(rgba(220, 225, 235, 0.55).cgColor); cg.fill(r)
    cg.setStrokeColor(rgba(255, 255, 255, 0.35).cgColor); cg.setLineWidth(0.5)
    var i: CGFloat = 0
    while i <= abs(w) { let lx = esquerdo ? x + i : x + w - i; cg.move(to: CGPoint(x: lx, y: y)); cg.addLine(to: CGPoint(x: lx, y: y + h)); i += 3.5 }
    i = 0
    while i <= h { cg.move(to: CGPoint(x: x, y: y + i)); cg.addLine(to: CGPoint(x: x + w, y: y + i)); i += 3.5 }
    cg.strokePath()
    cg.saveGState()
    cg.setShadow(offset: CGSize(width: esquerdo ? -1 : 1, height: -1), blur: 4, color: rgba(0, 0, 0, 0.27).cgColor)
    cg.setStrokeColor(UIColor.white.cgColor); cg.setLineWidth(2.6); cg.stroke(r)
    cg.restoreGState()
    cg.setStrokeColor(UIColor.white.cgColor); cg.setLineWidth(3.2)
    let lx = esquerdo ? x + w : x
    cg.move(to: CGPoint(x: lx, y: y)); cg.addLine(to: CGPoint(x: lx, y: y + h)); cg.strokePath()
}

// MARK: peças

private func anelSelecao(_ cg: CGContext, _ r: CGFloat) {
    cg.saveGState()
    cg.setStrokeColor(AMBAR.cgColor); cg.setLineWidth(2); cg.setLineDash(phase: 0, lengths: [4, 4])
    cg.strokeEllipse(in: CGRect(x: -r, y: -r, width: r * 2, height: r * 2))
    cg.restoreGState()
}

private func desenharJogador(_ cg: CGContext, _ p: Peca, cor: UIColor, selecionado: Bool) {
    let r = CGFloat(RAIO_JOGADOR)
    if selecionado { anelSelecao(cg, r + 5) }
    if p.goleiro {
        cg.saveGState()
        cg.setShadow(offset: CGSize(width: 1, height: -1), blur: 4, color: rgba(0, 0, 0, 0.4).cgColor)
        cg.move(to: CGPoint(x: 0, y: -r)); cg.addLine(to: CGPoint(x: r, y: 0)); cg.addLine(to: CGPoint(x: 0, y: r)); cg.addLine(to: CGPoint(x: -r, y: 0)); cg.closePath()
        cg.setFillColor(cor.cgColor); cg.fillPath()
        cg.restoreGState()
        cg.move(to: CGPoint(x: 0, y: -r)); cg.addLine(to: CGPoint(x: r, y: 0)); cg.addLine(to: CGPoint(x: 0, y: r)); cg.addLine(to: CGPoint(x: -r, y: 0)); cg.closePath()
        cg.setStrokeColor(rgba(255, 255, 255, 0.9).cgColor); cg.setLineWidth(2); cg.strokePath()
        cg.setStrokeColor(rgba(255, 255, 255, 0.5).cgColor); cg.setLineWidth(1); cg.setLineCap(.round)
        cg.move(to: CGPoint(x: -5, y: -3)); cg.addLine(to: CGPoint(x: -3, y: -5))
        cg.move(to: CGPoint(x: 5, y: -3)); cg.addLine(to: CGPoint(x: 3, y: -5)); cg.strokePath()
        texto(cg, p.camisaTexto, fonte: fonteArial(12, negrito: true), cor: .white, centro: .zero)
    } else {
        cg.saveGState()
        cg.setShadow(offset: CGSize(width: 1, height: -2), blur: 5, color: rgba(0, 0, 0, 0.35).cgColor)
        cg.setFillColor(cor.cgColor); cg.fillEllipse(in: CGRect(x: -r, y: -r, width: r * 2, height: r * 2))
        cg.restoreGState()
        cg.setStrokeColor(rgba(255, 255, 255, 0.85).cgColor); cg.setLineWidth(2)
        cg.strokeEllipse(in: CGRect(x: -r, y: -r, width: r * 2, height: r * 2))
        cg.setStrokeColor(rgba(255, 255, 255, 0.15).cgColor); cg.setLineWidth(1)
        cg.strokeEllipse(in: CGRect(x: -(r - 3), y: -(r - 3), width: (r - 3) * 2, height: (r - 3) * 2))
        texto(cg, p.camisaTexto, fonte: fonteArial(13, negrito: true), cor: .white, centro: .zero)
    }
    if !p.nome.isEmpty {
        texto(cg, nomeNoToken(p.nome), fonte: fonteArial(9, negrito: false), cor: .white, topo: CGPoint(x: 0, y: r + 3),
              sombra: (rgba(0, 0, 0, 0.8), 3))
    }
}

private func desenharBola(_ cg: CGContext, selecionado: Bool) {
    let r = CGFloat(RAIO_BOLA)
    if selecionado { anelSelecao(cg, r + 5) }
    cg.setFillColor(rgba(0, 0, 0, 0.28).cgColor); cg.fillEllipse(in: CGRect(x: 1.5 - r, y: 2.5 - r, width: r * 2, height: r * 2))
    cg.saveGState()
    cg.addEllipse(in: CGRect(x: -r, y: -r, width: r * 2, height: r * 2)); cg.clip()
    cg.setFillColor(UIColor.white.cgColor); cg.fill(CGRect(x: -r, y: -r, width: r * 2, height: r * 2))
    let pent = r * 0.36, fora = r * 0.86
    let angulos = [0.0, 72, 144, 216, 288].map { CGFloat(($0 - 90) * .pi / 180) }
    cg.setStrokeColor(hex("#1f2937").cgColor); cg.setLineWidth(0.9)
    for a in angulos { cg.move(to: CGPoint(x: cos(a) * pent, y: sin(a) * pent)); cg.addLine(to: CGPoint(x: cos(a) * fora, y: sin(a) * fora)) }
    cg.strokePath()
    cg.setFillColor(hex("#111827").cgColor)
    poligono(cg, centro: .zero, lados: 5, raio: pent, rotacaoGraus: 0); cg.fillPath()
    for (i, a) in angulos.enumerated() {
        poligono(cg, centro: CGPoint(x: cos(a) * r * 1.02, y: sin(a) * r * 1.02), lados: 5, raio: r * 0.34, rotacaoGraus: CGFloat(i * 72 + 36))
        cg.fillPath()
    }
    cg.setFillColor(rgba(255, 255, 255, 0.55).cgColor)
    cg.fillEllipse(in: CGRect(x: -r * 0.35 - r * 0.32, y: -r * 0.4 - r * 0.32, width: r * 0.64, height: r * 0.64))
    cg.restoreGState()
    cg.setStrokeColor(hex("#374151").cgColor); cg.setLineWidth(1)
    cg.strokeEllipse(in: CGRect(x: -r, y: -r, width: r * 2, height: r * 2))
}

/// RegularPolygon do Konva: 1º vértice para cima, girado `rotacaoGraus`.
private func poligono(_ cg: CGContext, centro: CGPoint, lados: Int, raio: CGFloat, rotacaoGraus: CGFloat) {
    let rot = rotacaoGraus * .pi / 180
    for n in 0..<lados {
        let a = CGFloat(n) * 2 * .pi / CGFloat(lados)
        let px = raio * sin(a), py = -raio * cos(a)
        let x = centro.x + px * cos(rot) - py * sin(rot), y = centro.y + px * sin(rot) + py * cos(rot)
        if n == 0 { cg.move(to: CGPoint(x: x, y: y)) } else { cg.addLine(to: CGPoint(x: x, y: y)) }
    }
    cg.closePath()
}

private func elipse(_ cg: CGContext, _ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat) -> CGRect {
    CGRect(x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2)
}

private func retArred(_ cg: CGContext, _ r: CGRect, _ raio: CGFloat, preencher: UIColor?, contorno: (UIColor, CGFloat)? = nil) {
    let p = UIBezierPath(roundedRect: r, cornerRadius: raio).cgPath
    if let preencher { cg.addPath(p); cg.setFillColor(preencher.cgColor); cg.fillPath() }
    if let contorno { cg.addPath(p); cg.setStrokeColor(contorno.0.cgColor); cg.setLineWidth(contorno.1); cg.strokePath() }
}

private func traco(_ cg: CGContext, _ pts: [CGFloat], cor: UIColor, largura: CGFloat, redondo: Bool = true) {
    cg.saveGState()
    cg.setStrokeColor(cor.cgColor); cg.setLineWidth(largura); if redondo { cg.setLineCap(.round); cg.setLineJoin(.round) }
    cg.move(to: CGPoint(x: pts[0], y: pts[1]))
    var i = 2
    while i + 1 < pts.count { cg.addLine(to: CGPoint(x: pts[i], y: pts[i + 1])); i += 2 }
    cg.strokePath()
    cg.restoreGState()
}

private func desenharObjeto(_ cg: CGContext, _ tipo: String, selecionado: Bool) {
    if selecionado { anelSelecao(cg, 18) }
    let laranja = hex("#f97316"), laranjaEsc = hex("#e85d04")
    switch tipo {
    case "cone":
        cg.setFillColor(rgba(0, 0, 0, 0.2).cgColor); cg.fillEllipse(in: elipse(cg, 0, 4, 11, 3))
        cg.move(to: CGPoint(x: 0, y: -8)); cg.addLine(to: CGPoint(x: -10, y: 4)); cg.addQuadCurve(to: CGPoint(x: 10, y: 4), control: CGPoint(x: 0, y: 8)); cg.closePath()
        cg.setFillColor(laranja.cgColor); cg.setStrokeColor(laranjaEsc.cgColor); cg.setLineWidth(1); cg.drawPath(using: .fillStroke)
        traco(cg, [0, -7, -4, 1], cor: rgba(255, 255, 255, 0.4), largura: 1.5)
    case "cone_tall":
        cg.setFillColor(rgba(0, 0, 0, 0.2).cgColor); cg.fillEllipse(in: elipse(cg, 0, 6, 8, 3))
        cg.move(to: CGPoint(x: 0, y: -14)); cg.addLine(to: CGPoint(x: -8, y: 5)); cg.addQuadCurve(to: CGPoint(x: 8, y: 5), control: CGPoint(x: 0, y: 9)); cg.closePath()
        cg.setFillColor(laranja.cgColor); cg.setStrokeColor(laranjaEsc.cgColor); cg.setLineWidth(1); cg.drawPath(using: .fillStroke)
        traco(cg, [-5, -2, 5, -2], cor: .white, largura: 1.5, redondo: false)
        traco(cg, [0, -13, -2, -4], cor: rgba(255, 255, 255, 0.35), largura: 1)
    case "barrier":
        retArred(cg, CGRect(x: -16, y: 5, width: 32, height: 3), 1, preencher: rgba(0, 0, 0, 0.15))
        retArred(cg, CGRect(x: -14, y: -6, width: 2.5, height: 14), 0.5, preencher: hex("#7c3aed"))
        retArred(cg, CGRect(x: 11.5, y: -6, width: 2.5, height: 14), 0.5, preencher: hex("#7c3aed"))
        retArred(cg, CGRect(x: -14, y: -8, width: 28, height: 4), 1, preencher: hex("#a855f7"), contorno: (hex("#7c3aed"), 0.5))
        traco(cg, [-12, -7, 10, -7], cor: rgba(255, 255, 255, 0.3), largura: 1)
    case "pole":
        cg.setFillColor(rgba(0, 0, 0, 0.15).cgColor); cg.fillEllipse(in: elipse(cg, 0, 8, 3, 3))
        retArred(cg, CGRect(x: -1.5, y: -16, width: 3, height: 24), 1.5, preencher: hex("#f59e0b"))
        cg.setFillColor(hex("#f59e0b").cgColor); cg.setStrokeColor(hex("#d97706").cgColor); cg.setLineWidth(0.5)
        cg.addEllipse(in: elipse(cg, 0, -16, 3, 3)); cg.drawPath(using: .fillStroke)
        traco(cg, [0, -16, -0.5, -2], cor: rgba(255, 255, 255, 0.3), largura: 1)
    case "flag":
        cg.setFillColor(rgba(0, 0, 0, 0.15).cgColor); cg.fillEllipse(in: elipse(cg, 0, 12, 2.5, 2.5))
        retArred(cg, CGRect(x: -1, y: -14, width: 2, height: 26), 1, preencher: hex("#666666"))
        cg.move(to: CGPoint(x: 1, y: -14)); cg.addQuadCurve(to: CGPoint(x: 14, y: -12), control: CGPoint(x: 8, y: -11))
        cg.addLine(to: CGPoint(x: 14, y: -4)); cg.addQuadCurve(to: CGPoint(x: 1, y: -4), control: CGPoint(x: 8, y: -5)); cg.closePath()
        cg.setFillColor(hex("#ef4444").cgColor); cg.setStrokeColor(hex("#dc2626").cgColor); cg.setLineWidth(0.5); cg.drawPath(using: .fillStroke)
    case "ladder":
        let w: CGFloat = 16, h: CGFloat = 28, passo = h / 6
        retArred(cg, CGRect(x: -w / 2 - 1, y: -h / 2, width: w + 2, height: h), 1, preencher: rgba(0, 0, 0, 0.1))
        retArred(cg, CGRect(x: -w / 2, y: -h / 2, width: 2, height: h), 0.5, preencher: hex("#facc15"))
        retArred(cg, CGRect(x: w / 2 - 2, y: -h / 2, width: 2, height: h), 0.5, preencher: hex("#facc15"))
        for i in 0..<5 { retArred(cg, CGRect(x: -w / 2 + 2, y: -h / 2 + passo * CGFloat(i + 1) - 1, width: w - 4, height: 2), 0.5, preencher: hex("#fde047")) }
    case "mannequin":
        cg.setFillColor(rgba(0, 0, 0, 0.15).cgColor); cg.fillEllipse(in: elipse(cg, 0, 14, 8, 3))
        cg.setFillColor(hex("#1e40af").cgColor); cg.setStrokeColor(hex("#1e3a8a").cgColor); cg.setLineWidth(0.5)
        cg.addEllipse(in: elipse(cg, 0, 12, 7, 3)); cg.drawPath(using: .fillStroke)
        retArred(cg, CGRect(x: -1.5, y: -4, width: 3, height: 16), 1, preencher: hex("#333333"))
        traco(cg, [-10, 0, 10, 0], cor: hex("#333333"), largura: 2.5)
        cg.setFillColor(hex("#1e40af").cgColor); cg.setStrokeColor(hex("#1e3a8a").cgColor); cg.setLineWidth(0.5)
        cg.addEllipse(in: elipse(cg, 0, -8, 5, 5)); cg.drawPath(using: .fillStroke)
        cg.setFillColor(rgba(255, 255, 255, 0.2).cgColor); cg.fillEllipse(in: elipse(cg, 0, -8, 2, 2))
    case "disc":
        cg.setFillColor(hex("#22c55e").cgColor); cg.setStrokeColor(hex("#16a34a").cgColor); cg.setLineWidth(1)
        cg.addEllipse(in: elipse(cg, 0, 1, 9, 4)); cg.drawPath(using: .fillStroke)
        cg.setFillColor(hex("#4ade80").cgColor); cg.setStrokeColor(hex("#22c55e").cgColor); cg.setLineWidth(0.5)
        cg.addEllipse(in: elipse(cg, 0, -1, 9, 4)); cg.drawPath(using: .fillStroke)
    case "hoop":
        cg.setFillColor(rgba(249, 115, 22, 0.1).cgColor); cg.setStrokeColor(laranja.cgColor); cg.setLineWidth(2.5)
        cg.addEllipse(in: elipse(cg, 0, 0, 12, 12)); cg.drawPath(using: .fillStroke)
        cg.setStrokeColor(rgba(249, 115, 22, 0.3).cgColor); cg.setLineWidth(0.5); cg.strokeEllipse(in: elipse(cg, 0, 0, 10, 10))
    case "mini_goal":
        cg.setFillColor(rgba(255, 255, 255, 0.08).cgColor); cg.fill(CGRect(x: -14, y: -10, width: 28, height: 20))
        cg.setStrokeColor(rgba(255, 255, 255, 0.2).cgColor); cg.setLineWidth(0.5)
        for i in 0..<5 { let x = -14 + CGFloat(i) * 7; cg.move(to: CGPoint(x: x, y: -10)); cg.addLine(to: CGPoint(x: x, y: 10)) }
        for i in 0..<4 { let y = -10 + CGFloat(i) * 6.66; cg.move(to: CGPoint(x: -14, y: y)); cg.addLine(to: CGPoint(x: 14, y: y)) }
        cg.strokePath()
        traco(cg, [-14, 10, -14, -10, 14, -10, 14, 10], cor: .white, largura: 2.5)
        traco(cg, [-16, 10, 16, 10], cor: rgba(255, 255, 255, 0.4), largura: 1, redondo: false)
    default: break
    }
}

// MARK: desenhos (DrawingLayer)

private func ponta(_ cg: CGContext, x: CGFloat, y: CGFloat, angulo: CGFloat, comprimento: CGFloat, largura: CGFloat, cor: UIColor) {
    cg.saveGState()
    cg.translateBy(x: x, y: y); cg.rotate(by: angulo)
    cg.setLineDash(phase: 0, lengths: [])
    cg.move(to: .zero); cg.addLine(to: CGPoint(x: -comprimento, y: largura / 2)); cg.addLine(to: CGPoint(x: -comprimento, y: -largura / 2)); cg.closePath()
    cg.setFillColor(cor.cgColor); cg.setStrokeColor(cor.cgColor)
    cg.drawPath(using: .fillStroke)
    cg.restoreGState()
}

private func brilhoSelecao(_ cg: CGContext, _ sel: Bool) {
    if sel { cg.setShadow(offset: .zero, blur: 8, color: AMBAR.withAlphaComponent(0.8).cgColor) }
}

func desenharDesenho(_ cg: CGContext, _ z: Desenho, _ d: DimensoesCanvas, selecionado sel: Bool) {
    let X = { (v: Double) in CGFloat(paraPixel(v, d.largura)) }
    let Y = { (v: Double) in CGFloat(paraPixel(v, d.altura)) }
    let tracejado = z.tracejado.map { CGFloat($0) }
    cg.saveGState()
    defer { cg.restoreGState() }
    switch z.tipo {
    case "arrow_straight":
        let cor = uiCor(z.t("color"))
        let (x1, y1, x2, y2) = (X(z.n("x1")), Y(z.n("y1")), X(z.n("x2")), Y(z.n("y2")))
        if sel {
            cg.setFillColor(AMBAR.withAlphaComponent(0.7).cgColor)
            cg.fillEllipse(in: CGRect(x: x1 - 5, y: y1 - 5, width: 10, height: 10)); cg.fillEllipse(in: CGRect(x: x2 - 5, y: y2 - 5, width: 10, height: 10))
        }
        brilhoSelecao(cg, sel)
        cg.setStrokeColor(cor.cgColor); cg.setLineWidth(CGFloat(z.n("strokeWidth", ou: 2.5))); cg.setLineCap(.round)
        if !tracejado.isEmpty { cg.setLineDash(phase: 0, lengths: tracejado) }
        cg.move(to: CGPoint(x: x1, y: y1)); cg.addLine(to: CGPoint(x: x2, y: y2)); cg.strokePath()
        ponta(cg, x: x2, y: y2, angulo: atan2(y2 - y1, x2 - x1), comprimento: 8, largura: 7, cor: cor)
    case "arrow_curved":
        let cor = uiCor(z.t("color"))
        let c = curvaDaSeta(z)
        let p0 = CGPoint(x: X(z.n("x1")), y: Y(z.n("y1"))), pc = CGPoint(x: X(c.cx), y: Y(c.cy)), p1 = CGPoint(x: X(z.n("x2")), y: Y(z.n("y2")))
        if sel {
            cg.setFillColor(AMBAR.withAlphaComponent(0.7).cgColor)
            cg.fillEllipse(in: CGRect(x: p0.x - 5, y: p0.y - 5, width: 10, height: 10)); cg.fillEllipse(in: CGRect(x: p1.x - 5, y: p1.y - 5, width: 10, height: 10))
            cg.setFillColor(AMBAR.withAlphaComponent(0.5).cgColor); cg.fillEllipse(in: CGRect(x: pc.x - 4, y: pc.y - 4, width: 8, height: 8))
        }
        brilhoSelecao(cg, sel)
        cg.setStrokeColor(cor.cgColor); cg.setLineWidth(CGFloat(z.n("strokeWidth", ou: 2.5))); cg.setLineCap(.round)
        if !tracejado.isEmpty { cg.setLineDash(phase: 0, lengths: tracejado) }
        cg.move(to: p0); cg.addQuadCurve(to: p1, control: pc); cg.strokePath()
        let ang = atan2(p1.y - pc.y, p1.x - pc.x), cab: CGFloat = 10
        cg.move(to: p1); cg.addLine(to: CGPoint(x: p1.x - cab * cos(ang - 0.4), y: p1.y - cab * sin(ang - 0.4)))
        cg.move(to: p1); cg.addLine(to: CGPoint(x: p1.x - cab * cos(ang + 0.4), y: p1.y - cab * sin(ang + 0.4)))
        cg.strokePath()
    case "free_draw":
        let p = z.pontos
        guard p.count >= 4 else { return }
        let px = p.enumerated().map { $0.offset % 2 == 0 ? Double(X($0.element)) : Double(Y($0.element)) }
        brilhoSelecao(cg, sel)
        cg.setStrokeColor(uiCor(z.t("color"), AMBAR).cgColor); cg.setLineWidth(CGFloat(z.n("strokeWidth", ou: 2)))
        cg.setLineCap(.round); cg.setLineJoin(.round)
        for passo in caminhoLivre(px) {
            switch passo {
            case .mover(let x, let y): cg.move(to: CGPoint(x: x, y: y))
            case .linha(let x, let y): cg.addLine(to: CGPoint(x: x, y: y))
            case .quadratica(let cx, let cy, let x, let y): cg.addQuadCurve(to: CGPoint(x: x, y: y), control: CGPoint(x: cx, y: cy))
            case .cubica(let a, let b, let c2, let d2, let x, let y):
                cg.addCurve(to: CGPoint(x: x, y: y), control1: CGPoint(x: a, y: b), control2: CGPoint(x: c2, y: d2))
            }
        }
        cg.strokePath()
    case "zone_rect":
        let r = CGRect(x: X(z.n("x")), y: Y(z.n("y")), width: X(z.n("w")), height: Y(z.n("h")))
        let path = UIBezierPath(roundedRect: r, cornerRadius: 2).cgPath
        brilhoSelecao(cg, sel)
        cg.addPath(path); cg.setFillColor(uiCor(z.t("color"), rgba(59, 130, 246, 0.2)).cgColor); cg.fillPath()
        cg.setShadow(offset: .zero, blur: 0, color: nil)
        if !tracejado.isEmpty { cg.setLineDash(phase: 0, lengths: tracejado) }
        cg.addPath(path); cg.setStrokeColor(uiCor(z.t("strokeColor"), rgba(59, 130, 246, 0.6)).cgColor); cg.setLineWidth(1.5); cg.strokePath()
    case "zone_circle":
        let r = Y(z.n("radius"))
        let ret = CGRect(x: X(z.n("cx")) - r, y: Y(z.n("cy")) - r, width: r * 2, height: r * 2)
        brilhoSelecao(cg, sel)
        cg.setFillColor(uiCor(z.t("color"), rgba(59, 130, 246, 0.2)).cgColor); cg.fillEllipse(in: ret)
        cg.setShadow(offset: .zero, blur: 0, color: nil)
        if !tracejado.isEmpty { cg.setLineDash(phase: 0, lengths: tracejado) }
        cg.setStrokeColor(uiCor(z.t("strokeColor"), rgba(59, 130, 246, 0.6)).cgColor); cg.setLineWidth(1.5); cg.strokeEllipse(in: ret)
    case "text":
        let x = X(z.n("x")), y = Y(z.n("y"))
        if sel {
            cg.saveGState()
            cg.setStrokeColor(AMBAR.cgColor); cg.setLineWidth(1); cg.setLineDash(phase: 0, lengths: [3, 3])
            cg.stroke(CGRect(x: x - 3, y: y - 3, width: CGFloat(z.texto.count * 8 + 6), height: 20))
            cg.restoreGState()
        }
        let fonte = fonteArial(CGFloat(z.n("fontSize", ou: 14)), negrito: (z.t("fontStyle") ?? "bold").contains("bold"))
        let attrs: [NSAttributedString.Key: Any] = [.font: fonte, .foregroundColor: uiCor(z.t("color"))]
        cg.setShadow(offset: .zero, blur: 3, color: rgba(0, 0, 0, 0.7).cgColor)
        UIGraphicsPushContext(cg)
        (z.texto as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: attrs)
        UIGraphicsPopContext()
    default: break
    }
}

// MARK: trajetórias (TrajectoryLayer + MovementArrow)

private func desenharTrajetorias(_ cg: CGContext, _ atuais: [Peca], _ proximas: [Peca], _ d: DimensoesCanvas, corA: String, corB: String) {
    guard !proximas.isEmpty else { return }
    var porId: [String: Peca] = [:]
    for p in proximas where porId[p.id] == nil { porId[p.id] = p }
    for a in atuais {
        guard let b = porId[a.id] else { continue }
        let x1 = CGFloat(paraPixel(a.x, d.largura)), y1 = CGFloat(paraPixel(a.y, d.altura))
        let x2 = CGFloat(paraPixel(b.x, d.largura)), y2 = CGFloat(paraPixel(b.y, d.altura))
        if abs(x2 - x1) < 1 && abs(y2 - y1) < 1 { continue }
        var cor = rgba(255, 255, 255, 0.5)
        if a.time == "A" { cor = uiCor(corA + "99", cor) } else if a.time == "B" { cor = uiCor(corB + "99", cor) } else if a.tipo == "ball" { cor = rgba(255, 255, 255, 0.7) }
        cg.saveGState()
        cg.setAlpha(0.7)
        cg.setStrokeColor(cor.cgColor); cg.setLineWidth(2); cg.setLineDash(phase: 0, lengths: [6, 4])
        cg.move(to: CGPoint(x: x1, y: y1)); cg.addLine(to: CGPoint(x: x2, y: y2)); cg.strokePath()
        ponta(cg, x: x2, y: y2, angulo: atan2(y2 - y1, x2 - x1), comprimento: 8, largura: 6, cor: cor)
        cg.restoreGState()
    }
}

// MARK: SwiftUI

/// O campo desenhado (Canvas do SwiftUI → CoreGraphics). `cena` recebe o tamanho e devolve o que pintar.
struct CampoQuadro: View {
    let cena: (CGSize) -> CenaQuadro

    var body: some View {
        Canvas(rendersAsynchronously: false) { ctx, tamanho in
            let c = cena(tamanho)
            ctx.withCGContext { cg in desenharCena(cg, c) }
        }
    }
}

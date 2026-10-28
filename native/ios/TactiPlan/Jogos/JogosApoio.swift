import SwiftUI
import UIKit
import Network
import TactiPlanKit

// Peças da T2 que só existem no iPhone: montagem da API de jogo, a fila offline num arquivo do
// aparelho (um por pessoa), o monitor de rede e o desenho do campo (medidas oficiais do Kit).

extension AppEstado {
    /// Rotas de jogo do web com o token do app e a conta escolhida (X-Workspace-Id).
    func servicoJogo(_ sessao: Sessao, _ ctx: ContextoClube) -> ServicoJogo {
        ServicoJogo(api: ApiJogoHttp(api: Api(base: base), token: sessao.token, workspaceId: ctx.escolha.workspaceId),
                    clubeId: ctx.clube?.id ?? "", modalidade: ctx.clube?.modalidade)
    }

    /// A fila offline do jogo é da PESSOA (um arquivo por usuário): uma pendência nunca sobe com o
    /// token de outra conta que entrar no mesmo aparelho.
    func filaJogos(_ usuarioId: String) -> FilaJogos { FilasJogos.da(usuarioId) }
}

@MainActor
enum FilasJogos {
    private static var filas: [String: FilaJogos] = [:]

    static func da(_ usuarioId: String) -> FilaJogos {
        if let f = filas[usuarioId] { return f }
        let pasta = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                  appropriateFor: nil, create: true))
            ?? FileManager.default.temporaryDirectory
        let nome = "fila-jogos-" + nomeArquivoSeguro(usuarioId) + ".json"
        let f = FilaJogos(armazem: ArmazemArquivo(arquivo: pasta.appendingPathComponent("TactiPlan", isDirectory: true)
            .appendingPathComponent(nome)))
        filas[usuarioId] = f
        return f
    }
}

/// Há rede? (NWPathMonitor). Só a tela do Jogo e a aba Jogos olham: ao voltar, enviam a fila.
@MainActor
final class MonitorRede: ObservableObject {
    @Published private(set) var online = true
    private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] caminho in
            let ok = caminho.status == .satisfied
            Task { @MainActor in
                guard let self, self.online != ok else { return }
                self.online = ok
            }
        }
        monitor.start(queue: DispatchQueue(label: "tactiplan.rede"))
    }

    deinit { monitor.cancel() }
}

/// Toque leve: `vibrarLeve()` está em Quadro/QuadroApoio.swift.
func vibrarSucesso() { UINotificationFeedbackGenerator().notificationOccurred(.success) }

// MARK: cores fixas do jogo (as do web: gol verde, sofrido vermelho, amarelo, substituição azul)

let VERDE_JOGO = Color(red: 0x22 / 255, green: 0xc5 / 255, blue: 0x5e / 255)
let VERMELHO_JOGO = Color(red: 0xef / 255, green: 0x44 / 255, blue: 0x44 / 255)
let AMBAR_JOGO = Color(red: 0xf5 / 255, green: 0x9e / 255, blue: 0x0b / 255)
let NAVY_JOGO = Color(red: 0x0f / 255, green: 0x17 / 255, blue: 0x2a / 255)

func corHex(_ hex: String) -> Color { Cor(hex: hex).color }

/// Selo V/E/D (verde, neutro, vermelho).
struct SeloResultado: View {
    let resultado: Resultado
    var tamanho: CGFloat = 40
    @Environment(\.tema) private var tema

    private func cores(_ c: CoresTema) -> (fundo: CorTema, tinta: CorTema) {
        switch resultado {
        case .vitoria: return (c.okFundo, c.okTinta)
        case .empate: return (c.neutroFundo, c.neutroTinta)
        case .derrota: return (c.erroFundo, c.erroTinta)
        }
    }

    var body: some View {
        let k = cores(tema.cores)
        return Text(resultado.rawValue)
            .font(Tipo.titulo(Double(tamanho) * 0.42))
            .foregroundColor(k.tinta.color)
            .frame(width: tamanho, height: tamanho)
            .background(Circle().fill(k.fundo.color))
            .accessibilityLabel(rotuloResultado(resultado))
    }
}

func rotuloResultado(_ r: Resultado) -> String {
    switch r {
    case .vitoria: return "Vitória"
    case .empate: return "Empate"
    case .derrota: return "Derrota"
    }
}

/// Círculo do atleta: a camisa (ou as iniciais), branco com borda navy, como no campo do web.
struct AvatarCamisa: View {
    let camisa: Int?
    let nome: String?
    var tamanho: CGFloat = 32
    var destaque: Color?

    var body: some View {
        Text(camisa.map(String.init) ?? iniciaisDoAtleta(nome))
            .font(Tipo.titulo(Double(tamanho) * (camisa == nil ? 0.34 : 0.42), peso: .heavy))
            .foregroundColor(NAVY_JOGO)
            .minimumScaleFactor(0.6)
            .frame(width: tamanho, height: tamanho)
            .background(Circle().fill(Color.white))
            .overlay(Circle().stroke(destaque ?? NAVY_JOGO, lineWidth: 2))
            .shadow(color: .black.opacity(0.35), radius: 2, x: 0, y: 1)
            .accessibilityHidden(true)
    }
}

// MARK: campo

/// O caminho de um arco do SVG (`A r r 0 0 varredura x2 y2`, arco menor), em pontos.
private func pontosDoArco(x1: Double, y1: Double, x2: Double, y2: Double, r: Double, varredura: Int) -> [CGPoint] {
    let xl = (x1 - x2) / 2, yl = (y1 - y2) / 2
    let d2 = xl * xl + yl * yl
    guard d2 > 0 else { return [CGPoint(x: x1, y: y1)] }
    let sinal: Double = varredura == 0 ? -1 : 1 // grande-arco 0: sinal = (fA != fS) ? + : −
    let coef = sinal * max(0, (r * r - d2) / d2).squareRoot()
    let cx = coef * yl + (x1 + x2) / 2
    let cy = coef * -xl + (y1 + y2) / 2
    let raio = max(r, d2.squareRoot())
    let a1 = atan2(y1 - cy, x1 - cx), a2 = atan2(y2 - cy, x2 - cx)
    var delta = a2 - a1
    if varredura == 1 { while delta <= 0 { delta += 2 * .pi } } else { while delta >= 0 { delta -= 2 * .pi } }
    let passos = 28
    return (0...passos).map { i in
        let a = a1 + delta * Double(i) / Double(passos)
        return CGPoint(x: cx + raio * cos(a), y: cy + raio * sin(a))
    }
}

/// Desenho do campo/quadra (Kit `desenhoDoCampo`), escalado para o tamanho da tela.
struct DesenhoDoCampo: View {
    let desenho: DesenhoCampo

    var body: some View {
        Canvas { ctx, tamanho in
            let k = tamanho.width / desenho.largura
            func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * k, y: y * k) }
            ctx.fill(Path(CGRect(origin: .zero, size: tamanho)), with: .color(corHex(desenho.corFundo)))
            if desenho.faixas > 0 {
                let h = tamanho.height / CGFloat(desenho.faixas)
                for i in stride(from: 0, to: desenho.faixas, by: 2) {
                    ctx.fill(Path(CGRect(x: 0, y: CGFloat(i) * h, width: tamanho.width, height: h)),
                             with: .color(corHex(desenho.corFaixa)))
                }
            } else {
                ctx.fill(Path(CGRect(origin: .zero, size: tamanho)),
                         with: .linearGradient(Gradient(colors: [corHex(desenho.corFundo), corHex(desenho.corFaixa)]),
                                               startPoint: .zero, endPoint: CGPoint(x: 0, y: tamanho.height)))
            }
            let branco = GraphicsContext.Shading.color(.white.opacity(0.9))
            let linha = StrokeStyle(lineWidth: max(1, desenho.espessura * k))
            for peca in desenho.pecas {
                switch peca {
                case let .retangulo(x, y, l, a, cheio):
                    let r = Path(CGRect(x: x * k, y: y * k, width: l * k, height: a * k))
                    if cheio { ctx.fill(r, with: branco) } else { ctx.stroke(r, with: branco, style: linha) }
                case let .linha(x1, y1, x2, y2):
                    var c = Path(); c.move(to: p(x1, y1)); c.addLine(to: p(x2, y2))
                    ctx.stroke(c, with: branco, style: linha)
                case let .circulo(cx, cy, r, cheio):
                    let e = Path(ellipseIn: CGRect(x: (cx - r) * k, y: (cy - r) * k, width: 2 * r * k, height: 2 * r * k))
                    if cheio { ctx.fill(e, with: branco) } else { ctx.stroke(e, with: branco, style: linha) }
                case let .arco(x1, y1, x2, y2, r, varredura):
                    let pts = pontosDoArco(x1: x1, y1: y1, x2: x2, y2: y2, r: r, varredura: varredura)
                    var c = Path()
                    c.addLines(pts.map { CGPoint(x: $0.x * k, y: $0.y * k) })
                    ctx.stroke(c, with: branco, style: linha)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

/// O campo com as vagas da formação. `aoTocar` nil = só leitura.
struct CampoDoJogo: View {
    let editor: EditorJogo
    var movendo: String?
    var aoTocar: ((Int) -> Void)?
    /// Liga o ARRASTAR: o atleta do campo vai para outra vaga (troca). (atletaId, vaga)
    var aoSoltar: ((String, Int) -> Void)?

    @State private var arrastando: String?
    @State private var ponto: CGPoint = .zero

    var body: some View {
        let d = desenhoDoCampo(editor.modalidade)
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            let alvoArrasto = arrastando != nil && w > 0
                ? vagaMaisPerto(editor.vagas, xPct: Double(ponto.x / w) * 100, yPct: Double(ponto.y / h) * 100) : nil
            ZStack(alignment: .topLeading) {
                DesenhoDoCampo(desenho: d)
                ForEach(editor.vagas) { v in
                    vaga(v, realce: alvoArrasto == v.indice)
                        .frame(width: max(52, w * v.espaco / 100))
                        .position(x: w * v.x / 100, y: h * v.y / 100)
                        .highPriorityGesture(arrasto(v, w: w, h: h))
                }
                // o atleta arrastado acompanha o dedo
                if let id = arrastando, let p = editor.jogador(id) {
                    AvatarCamisa(camisa: p.camisa, nome: p.nomeExibido, tamanho: 42, destaque: Color.yellow)
                        .position(x: ponto.x, y: ponto.y - 36)
                        .allowsHitTesting(false)
                }
            }
            .coordinateSpace(name: "campo")
        }
        .aspectRatio(d.largura / d.altura, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .shadow(color: .black.opacity(0.22), radius: 10, x: 0, y: 6)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Campo, formação \(editor.formacao)")
    }

    /// Arrastar o atleta da vaga (só vaga ocupada, só com `aoSoltar`): solta na vaga mais perto.
    private func arrasto(_ v: Vaga, w: CGFloat, h: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 8, coordinateSpace: .named("campo"))
            .onChanged { g in
                guard aoSoltar != nil, let p = editor.ocupante(v.indice) else { return }
                if arrastando == nil { arrastando = p.atletaId; vibrarLeve() }
                ponto = g.location
            }
            .onEnded { g in
                defer { arrastando = nil }
                guard let soltar = aoSoltar, let id = arrastando, w > 0, h > 0,
                      let destino = vagaMaisPerto(editor.vagas, xPct: Double(g.location.x / w) * 100, yPct: Double(g.location.y / h) * 100)
                else { return }
                soltar(id, destino)
            }
    }

    private func vaga(_ v: Vaga, realce: Bool = false) -> some View {
        let p = editor.ocupante(v.indice)
        let pos = posicaoEmCampo(editor.formacao, v.indice, editor.modalidade) ?? v.papel
        let quemMove = movendo ?? arrastando
        let movendoEste = p != nil && p?.atletaId == quemMove
        let alvo = (quemMove != nil && !movendoEste) || realce
        let rotulo: String = {
            guard let p else { return "Vaga \(pos) vazia" }
            return "\(pos): \(p.nomeExibido ?? "Atleta")\(p.camisa.map { ", camisa \($0)" } ?? "")"
        }()
        return Button { aoTocar?(v.indice) } label: {
            VStack(spacing: 3) {
                if let p {
                    AvatarCamisa(camisa: p.camisa, nome: p.nomeExibido, tamanho: 36,
                                 destaque: movendoEste ? Color.yellow : nil)
                        .overlay(Circle().stroke(alvo ? Color.white.opacity(0.9) : .clear,
                                                 style: StrokeStyle(lineWidth: 2, dash: [3, 3])).padding(-4))
                } else {
                    Text("+")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(alvo ? Color.yellow.opacity(0.25) : Color.white.opacity(0.12)))
                        .overlay(Circle().stroke(alvo ? Color.yellow : Color.white.opacity(0.85),
                                                 style: StrokeStyle(lineWidth: 2, dash: [4, 3])))
                }
                Text(p.map { nomeCurto($0.nomeExibido) } ?? pos)
                    .font(Tipo.corpo(10, peso: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .padding(.horizontal, 5).padding(.vertical, 1)
                    .background(RoundedRectangle(cornerRadius: 4).fill(NAVY_JOGO.opacity(p == nil ? 0.45 : 0.85)))
            }
            .frame(minWidth: ALVO_TOQUE, minHeight: ALVO_TOQUE)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(aoTocar == nil)
        .accessibilityLabel(rotulo)
        .accessibilityHint(aoTocar == nil ? "" : (movendo != nil ? "Toque para levar o atleta para esta vaga"
                                                    : (p == nil ? "Toque para escolher o atleta" : "Toque para trocar, mover ou tirar")))
    }
}

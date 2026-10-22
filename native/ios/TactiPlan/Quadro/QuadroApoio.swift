import SwiftUI
import UIKit
import TactiPlanKit

// Peças do quadro tático (T5) que só existem no iPhone: orientação forçada (editor deitado), cliente
// de /api/plays, o relógio do play (60 Hz) e a barra de play/velocidade/quadros.

// MARK: orientação

enum OrientacaoApp {
    /// O AppDelegate devolve isto em `supportedInterfaceOrientationsFor`.
    @MainActor static var mascara: UIInterfaceOrientationMask = .portrait
}

/// Gira a tela: `.landscape` ao abrir o editor, `.portrait` ao sair.
@MainActor
func forcarOrientacao(_ m: UIInterfaceOrientationMask) {
    OrientacaoApp.mascara = m
    guard let cena = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
    cena.windows.first(where: \.isKeyWindow)?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    cena.windows.first?.rootViewController?.presentedViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
    cena.requestGeometryUpdate(.iOS(interfaceOrientations: m)) { _ in }
}

extension AppEstado {
    func apiQuadro(_ sessao: Sessao, _ ctx: ContextoClube) -> ApiQuadro { ApiQuadroHttp(clienteWeb(sessao, ctx)) }
}

/// Vibração leve ao soltar uma peça.
@MainActor
func vibrarLeve() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }

let FUNDO_QUADRO = Color(red: 11 / 255, green: 18 / 255, blue: 32 / 255)
let LIMA_QUADRO = Color(red: 200 / 255, green: 1, blue: 0)
let NAVY_QUADRO = Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)

// MARK: play

/// Relógio do play: avança a `Reproducao` do Kit em ~60 Hz e avisa quando troca de quadro.
@MainActor
final class ReprodutorQuadro: ObservableObject {
    @Published private(set) var reproducao: Reproducao?
    @Published var velocidade: Double = 1
    private var tarefa: Task<Void, Never>?

    var tocando: Bool { reproducao != nil }

    func pecas(_ quadros: [QuadroJogada]) -> [Peca]? { reproducao?.pecas(quadros) }

    /// Play/pause. `aoTrocar` recebe o quadro atual a cada transição (o web faz goToFrame).
    func alternar(atual: Int, total: Int, aoTrocar: @escaping (Int) -> Void) {
        if tocando { parar(); return }
        guard let r = Reproducao(atual: atual, total: total) else { return }
        reproducao = r
        aoTrocar(r.quadro)
        tarefa = Task { [weak self] in
            var antes = ContinuousClock.now
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 16_000_000)
                guard let self, var r = self.reproducao else { return }
                let agora = ContinuousClock.now
                let ms = Double((agora - antes).components.attoseconds) / 1e15 + Double((agora - antes).components.seconds) * 1000
                antes = agora
                let trocou = r.avancar(ms, velocidade: self.velocidade)
                if trocou { aoTrocar(r.quadro) }
                if r.terminou { self.reproducao = nil; return }
                self.reproducao = r
            }
        }
    }

    func parar() {
        tarefa?.cancel()
        tarefa = nil
        reproducao = nil
    }
}

// MARK: barra de play + quadros (uma linha, como a barra inferior do web)

struct BarraQuadros: View {
    let atual: Int
    let total: Int
    let tocando: Bool
    @Binding var velocidade: Double
    var editar = false
    let aoVoltarInicio: () -> Void
    let aoTocar: () -> Void
    let aoIr: (Int) -> Void
    var aoAdicionar: (() -> Void)?
    var aoExcluir: (() -> Void)?

    var body: some View {
        HStack(spacing: 8) {
            botaoRedondo("backward.end.fill", "Voltar ao início", acao: aoVoltarInicio)
            Button(action: aoTocar) {
                Image(systemName: tocando ? "pause.fill" : "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(NAVY_QUADRO)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(LIMA_QUADRO))
                    .opacity(total > 1 ? 1 : 0.5)
            }
            .disabled(total <= 1)
            .accessibilityLabel(tocando ? "Pausar" : (total > 1 ? "Reproduzir" : "Crie um 2º quadro para animar"))
            HStack(spacing: 4) {
                ForEach(VELOCIDADES_QUADRO, id: \.self) { v in
                    Button { velocidade = v } label: {
                        Text("\(numeroJs(v))x")
                            .font(.system(size: 12, weight: v == velocidade ? .bold : .medium))
                            .foregroundColor(v == velocidade ? LIMA_QUADRO : .white.opacity(0.7))
                            .padding(.horizontal, 7).frame(height: 28)
                            .background(RoundedRectangle(cornerRadius: 6).fill(v == velocidade ? LIMA_QUADRO.opacity(0.15) : .white.opacity(0.08)))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(v == velocidade ? LIMA_QUADRO : .white.opacity(0.2), lineWidth: 1))
                    }
                    .accessibilityLabel("Velocidade \(numeroJs(v))x")
                }
            }
            Rectangle().fill(.white.opacity(0.1)).frame(width: 1, height: 28)
            botaoRedondo("chevron.left", "Quadro anterior") { aoIr(max(0, atual - 1)) }
            ScrollViewReader { rolar in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(0..<max(1, total), id: \.self) { i in
                            Button { aoIr(i) } label: {
                                Text("\(i + 1)").font(.system(size: 12, weight: .semibold)).foregroundColor(.white)
                                    .frame(width: 34, height: 30)
                                    .background(RoundedRectangle(cornerRadius: 7).fill(Color(red: 43 / 255, green: 133 / 255, blue: 71 / 255)))
                                    .overlay(RoundedRectangle(cornerRadius: 7).stroke(i == atual ? LIMA_QUADRO : .white.opacity(0.25), lineWidth: i == atual ? 2.5 : 1))
                            }
                            .id(i)
                            .accessibilityLabel("Quadro \(i + 1)\(i == atual ? ", atual" : "")")
                        }
                    }
                }
                .frame(maxWidth: 260)
                .onChange(of: atual) { i in withAnimation { rolar.scrollTo(i, anchor: .center) } }
            }
            botaoRedondo("chevron.right", "Próximo quadro") { aoIr(min(total - 1, atual + 1)) }
            if editar, let aoAdicionar {
                Button(action: aoAdicionar) {
                    Image(systemName: "plus").font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                        .frame(width: 34, height: 30)
                        .overlay(RoundedRectangle(cornerRadius: 7).stroke(style: StrokeStyle(lineWidth: 1.5, dash: [4, 3])).foregroundColor(.white.opacity(0.4)))
                }
                .accessibilityLabel("Novo quadro (copia o atual)")
            }
            if editar, let aoExcluir {
                botaoRedondo("trash", "Excluir o quadro atual", desabilitado: total <= 1, acao: aoExcluir)
            }
        }
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(red: 11 / 255, green: 18 / 255, blue: 32 / 255).opacity(0.82)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.1), lineWidth: 1))
    }

    private func botaoRedondo(_ icone: String, _ rotulo: String, desabilitado: Bool = false, acao: @escaping () -> Void) -> some View {
        Button(action: acao) {
            Image(systemName: icone).font(.system(size: 13, weight: .semibold)).foregroundColor(.white.opacity(desabilitado ? 0.3 : 1))
                .frame(width: 34, height: 34)
                .background(Circle().fill(.white.opacity(0.1)))
                .overlay(Circle().stroke(.white.opacity(0.2), lineWidth: 1))
        }
        .disabled(desabilitado)
        .accessibilityLabel(rotulo)
    }
}

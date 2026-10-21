import SwiftUI
import LocalAuthentication
import TactiPlanKit

// "Exigir Face ID ao abrir" (copiado do Gestsport): o estado (regra pura no Kit, TravaApp), a
// tela de bloqueio por cima da casca e o pedido de Face ID/Touch ID/código do iPhone.

@MainActor
final class TravaDoApp: ObservableObject {
    @Published private(set) var ligada: Bool
    @Published private var estado: TravaApp
    private let armazem: Armazem?

    var bloqueada: Bool { estado.bloqueada }

    init(armazem: Armazem?, logado: Bool) {
        self.armazem = armazem
        let l = biometriaLigada(armazem)
        ligada = l
        estado = TravaApp(ligada: l && logado)
    }

    func foiProFundo() { estado.foiProFundo(agora: agoraMs()) }
    func voltou() { estado.voltou(agora: agoraMs(), ligada: ligada) }
    func desbloqueou() { estado.desbloqueou() }

    func mudar(_ ligar: Bool) {
        gravarBiometria(armazem, ligar)
        ligada = ligar
        estado.mudouOpcao(ligada: ligar)
    }

    static var disponivel: Bool { LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) }

    static var rotuloOpcao: String {
        let c = LAContext()
        _ = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        if c.biometryType == .faceID { return "Exigir Face ID ao abrir" }
        if c.biometryType == .touchID { return "Exigir Touch ID ao abrir" }
        return "Exigir o código do iPhone ao abrir"
    }

    static func autenticar() async -> Bool {
        do {
            return try await LAContext().evaluatePolicy(.deviceOwnerAuthentication, localizedReason: TEXTO_BLOQUEIO)
        } catch {
            return false
        }
    }
}

/// Camada por cima da casca (que fica montada): pede a biometria sozinha ao aparecer.
struct CamadaBloqueio: View {
    @ObservedObject var trava: TravaDoApp
    @Environment(\.tema) private var tema

    var body: some View {
        if trava.bloqueada {
            let c = tema.cores
            VStack(spacing: 16) {
                Spacer(minLength: 0)
                SimboloTactiPlan(tamanho: 72)
                Text(TITULO_DESBLOQUEIO)
                    .font(Tipo.titulo(20))
                    .foregroundColor(c.tinta.color)
                    .multilineTextAlignment(.center)
                Text(TEXTO_BLOQUEIO)
                    .tipo(Tipos.corpo15)
                    .foregroundColor(c.tinta2.color)
                    .multilineTextAlignment(.center)
                Botao(texto: "Desbloquear", acao: desbloquear)
                Spacer(minLength: 0)
            }
            .padding(32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(c.fundo.color.ignoresSafeArea())
            .contentShape(Rectangle())
            .accessibilityAddTraits(.isModal)
            .onAppear(perform: desbloquear)
            .transition(.opacity)
        }
    }

    private func desbloquear() {
        let trava = self.trava
        Task { @MainActor in
            if await TravaDoApp.autenticar() { trava.desbloqueou() }
        }
    }
}

/// Seção "Segurança" do Mais. Ligar pede a biometria antes (confirma que funciona).
struct SecaoSeguranca: View {
    @EnvironmentObject private var trava: TravaDoApp
    @State private var confirmando = false

    init() {}

    var body: some View {
        let disponivel = TravaDoApp.disponivel
        ListaAgrupada("Segurança") {
            LinhaInterruptor(
                icone: "faceid",
                titulo: TravaDoApp.rotuloOpcao,
                detalhe: disponivel || trava.ligada ? "Pede o Face ID ou o código do iPhone ao abrir o app." : TEXTO_SEM_BLOQUEIO_APARELHO,
                ligado: Binding(get: { trava.ligada }, set: { mudar($0) }),
                habilitado: (disponivel || trava.ligada) && !confirmando
            )
        }
    }

    private func mudar(_ novo: Bool) {
        guard novo else { trava.mudar(false); return }
        guard !confirmando else { return }
        confirmando = true
        let trava = self.trava
        Task { @MainActor in
            if await TravaDoApp.autenticar() { trava.mudar(true) }
            confirmando = false
        }
    }
}

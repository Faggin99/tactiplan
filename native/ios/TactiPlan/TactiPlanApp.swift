import SwiftUI
import UIKit
import TactiPlanKit

// Entrada do app: lê a sessão do cofre (Keychain) e escolhe Entrar, Onde entrar ou as abas do
// clube. Toda regra mora no `ControleSessao` do Kit (testado no Linux); aqui só republica.

/// Base da API pelo Info.plist (API_BASE do project.yml): Debug configurável, Release = produção.
func baseDaApi(_ valor: Any?) -> String {
    let s = (valor as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return s.isEmpty || s.hasPrefix("$(") ? "https://app.tactiplan.faggin.com.br/api" : s
}

@MainActor
final class AppEstado: ObservableObject {
    @Published private(set) var estado: EstadoApp
    @Published private(set) var semConexao = false
    @Published private(set) var config = ConfigApp.padrao
    /// Aparência (aba Mais): Automático / Claro / Escuro, guardada no aparelho.
    @Published private(set) var modoTema = ModoTema.de(UserDefaults.standard.string(forKey: "tactiplan." + ModoTema.chavePreferencia))

    let api: ApiApp
    /// Base da API (as rotas de treino do web usam o mesmo servidor).
    let base: String
    let controle: ControleSessao
    let trava: TravaDoApp
    let aparelho: Aparelho
    private var ultimaAtualizacao: Date?

    init() {
        let base = baseDaApi(Bundle.main.object(forInfoDictionaryKey: "API_BASE"))
        self.base = base
        let api = ApiAppHttp(api: Api(base: base))
        self.api = api
        let controle = ControleSessao(api: api, cofre: Cofre.sessao)
        self.controle = controle
        aparelho = Aparelho(plataforma: PLATAFORMA_IOS, nome: UIDevice.current.model, versaoApp: versaoInstalada)
        trava = TravaDoApp(armazem: Cofre.preferencias, logado: controle.sessao != nil)
        estado = controle.estado
        controle.aoMudar = { [weak self] novo in
            guard let self else { return }
            let tinhaSessao = self.estado.sessao != nil
            self.estado = novo
            if novo.sessao == nil {
                self.trava.desbloqueou()
            } else if !tinhaSessao {
                PushIOS.shared.ativarSePossivel()
            }
        }
        controle.aoMudarConexao = { [weak self] in self?.semConexao = $0 }
        PushIOS.shared.aoReceberToken = { [weak controle] token in
            Task { @MainActor in await controle?.registrarPush(token, plataforma: PLATAFORMA_IOS) }
        }
        if controle.sessao != nil { PushIOS.shared.ativarSePossivel() }
    }

    func mudarModoTema(_ novo: ModoTema) {
        modoTema = novo
        UserDefaults.standard.set(novo.rawValue, forKey: "tactiplan." + ModoTema.chavePreferencia)
        aplicarModoTema()
    }

    /// Fixa claro/escuro na JANELA (vale também para folhas e o compartilhar); Automático = segue o aparelho.
    func aplicarModoTema() {
        let estilo: UIUserInterfaceStyle = modoTema.escuroFixo.map { $0 ? .dark : .light } ?? .unspecified
        for cena in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            for janela in cena.windows { janela.overrideUserInterfaceStyle = estilo }
        }
    }

    /// Ao abrir e ao voltar do fundo: config (flags, versão mínima) e /me — no máximo 1x/30 s.
    func atualizar(forcar: Bool = false) async {
        if !forcar, let u = ultimaAtualizacao, Date().timeIntervalSince(u) < 30 { return }
        ultimaAtualizacao = Date()
        if let c = try? await api.config() { config = c }
        await controle.atualizarMe()
    }
}

@main
struct TactiPlanApp: App {
    @StateObject private var app = AppEstado()
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    init() {
        #if !DEBUG
        RegistroDeFalhas.instalar() // diagnóstico: a falha vai para o nosso servidor na próxima abertura
        #endif
        UITabBar.appearance().unselectedItemTintColor = CORES_PADRAO.tinta2.uiColor
        avisarFontesQueFalharam()
        configurarBarraDeNavegacao()
        UITabBarItem.appearance().setTitleTextAttributes(
            [.font: Tipos.legenda11.comTamanho(10).comPeso(.seminegrito).uiFont(.caption2)], for: .normal
        )
    }

    var body: some Scene {
        WindowGroup {
            Raiz().environmentObject(app).environmentObject(app.trava)
        }
    }
}

struct Raiz: View {
    @EnvironmentObject private var app: AppEstado
    @Environment(\.scenePhase) private var fase

    var body: some View {
        // O tema do CLUBE em uso (cor + logo) pinta o app; fora do clube, o do TactiPlan.
        let tema: Tema = {
            if case .noClube(_, let ctx) = app.estado { return Tema(ctx.clube?.personalizacao) }
            return Tema()
        }()
        Group {
            switch app.estado {
            case .entrar:
                EntrarTela(api: app.api, aparelho: app.aparelho) { app.controle.entrou($0) }
            case .ondeEntrar(let s, let atual):
                OndeEntrarTela(sessao: s, atual: atual)
            case .noClube(let s, let ctx):
                Casca(sessao: s, contexto: ctx)
                    // Clube novo = casca do zero (abas e pilhas novas).
                    .id("\(s.token.suffix(8))|\(ctx.escolha.workspaceId)|\(ctx.escolha.clubeId ?? "")")
                    .environment(\.contexto, ctx)
            }
        }
        .overlay { if app.estado.sessao != nil { CamadaBloqueio(trava: app.trava) } }
        .environment(\.tema, tema)
        .tint(tema.cores.acaoTinta.color)
        .task {
            app.aplicarModoTema()
            await RegistroDeFalhas.enviarPendente(base: app.base, token: app.controle.sessao?.token)
            await app.atualizar(forcar: true)
        }
        .onChange(of: fase) { f in
            if f == .background { app.trava.foiProFundo() }
            if f == .active {
                app.aplicarModoTema()
                app.trava.voltou()
                Task { await app.atualizar() }
            }
        }
    }
}

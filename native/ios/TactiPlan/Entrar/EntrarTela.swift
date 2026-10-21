import SwiftUI
import AuthenticationServices
import TactiPlanKit

/// Liga o `EntrarModelo` (Kit, testado no Linux) ao SwiftUI.
@MainActor
final class EntrarObservavel: ObservableObject {
    @Published private(set) var estado: EstadoEntrar
    let modelo: EntrarModelo

    init(modelo: EntrarModelo) {
        self.modelo = modelo
        estado = modelo.estado
        modelo.aoMudar = { [weak self] novo in self?.estado = novo }
    }
}

/// Entrar: e-mail e senha da conta Faggin (a mesma do web) + Apple/Google atrás das flags.
/// Diferente do web: não tem "Criar conta", "Planos" nem "Assinar" — o app é só por convite.
struct EntrarTela: View {
    @StateObject private var vm: EntrarObservavel
    @Environment(\.tema) private var tema
    @Environment(\.colorScheme) private var esquema
    @State private var google = LoginGoogleIOS()

    init(api: ApiApp, aparelho: Aparelho, aoEntrar: @escaping (RespostaLogin) -> Void) {
        _vm = StateObject(wrappedValue: EntrarObservavel(modelo: EntrarModelo(api: api, aparelho: aparelho, aoEntrar: aoEntrar)))
    }

    var body: some View {
        let e = vm.estado
        let m = vm.modelo
        let c = tema.cores
        GeometryReader { geo in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    SimboloTactiPlan(tamanho: 64)
                    Text(NOME_APP)
                        .tipo(Tipos.titulo32)
                        .foregroundColor(c.tinta.color)
                        .padding(.top, 28)
                    Text(SUBTITULO_ENTRAR)
                        .tipo(Tipos.corpo15)
                        .foregroundColor(c.tinta2.color)
                        .padding(.top, 6)

                    VStack(spacing: 12) {
                        Campo(dica: "e-mail", valor: Binding(get: { vm.estado.email }, set: { m.mudarEmail($0) }),
                              teclado: .emailAddress, conteudo: .username, habilitado: e.camposHabilitados, envio: .next)
                        Campo(dica: "senha", valor: Binding(get: { vm.estado.senha }, set: { m.mudarSenha($0) }),
                              conteudo: .password, secreto: true, habilitado: e.camposHabilitados,
                              aoConfirmar: { Task { await m.entrar() } })
                        HStack {
                            Spacer()
                            BotaoTexto(texto: ROTULO_ESQUECI_SENHA, habilitado: e.camposHabilitados, enfatizado: true,
                                       cor: c.acaoTinta.color) { AbrirLink.abrir(e.esqueciSenhaUrl) }
                        }
                        Botao(texto: e.carregando ? "Entrando…" : "Entrar", habilitado: e.camposHabilitados) {
                            Task { await m.entrar() }
                        }
                        if let erro = e.erro {
                            Text(erro)
                                .font(Tipo.corpo(13))
                                .foregroundColor(c.erroTinta.color)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityAddTraits(.updatesFrequently)
                        }
                        botoesSociais(e, m)
                    }
                    .padding(.top, 32)

                    Spacer(minLength: 24)
                    Text(DICA_CONVITE_ENTRAR)
                        .tipo(Tipos.corpo13)
                        .foregroundColor(c.tinta2.color)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 24)
                .padding(.top, 40)
                .padding(.bottom, 24)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity, minHeight: geo.size.height, alignment: .top)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(c.fundo.color.ignoresSafeArea())
        .task { await m.carregarConfig() }
    }

    /// Apple (botão oficial) e Google (só com a Apple junto — regra 4.8).
    @ViewBuilder
    private func botoesSociais(_ e: EstadoEntrar, _ m: EntrarModelo) -> some View {
        let apple = mostrarApple(e.config, appleNoBuild: AppleNoBuild.ativo)
        let googleId = googleIOSClientId(e.config, appleNoBuild: AppleNoBuild.ativo)
        if apple || googleId != nil {
            HStack(spacing: 12) {
                Divisoria()
                Text("ou").font(Tipo.corpo(13)).foregroundColor(tema.cores.tinta2.color)
                Divisoria()
            }
            .padding(.vertical, 4)
        }
        if apple {
            SignInWithAppleButton(.continue) { pedido in
                pedido.requestedScopes = [.fullName, .email]
            } onCompletion: { resultado in
                switch lerResultadoApple(resultado) {
                case .ok(let token, let nome): Task { await m.entrarComApple(token, nome: nome) }
                case .cancelado: m.falhaSocial(nil)
                case .falhou: m.falhaSocial(MSG_SOCIAL_FALHOU)
                }
            }
            .signInWithAppleButtonStyle(esquema == .dark ? .white : .black)
            .frame(height: ALTURA_BOTAO)
            .clipShape(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous))
            .disabled(!e.camposHabilitados)
        }
        if let googleId {
            BotaoGoogle(habilitado: e.camposHabilitados) {
                Task {
                    do {
                        let token = try await google.entrar(clientId: googleId)
                        await m.entrarComGoogle(token)
                    } catch LoginGoogleIOS.Erro.cancelado {
                        m.falhaSocial(nil)
                    } catch {
                        m.falhaSocial(MSG_SOCIAL_FALHOU)
                    }
                }
            }
        }
    }
}

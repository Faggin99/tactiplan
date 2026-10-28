import SwiftUI
import TactiPlanKit

// Topo das telas (portado do CabecalhoGrande do Gestsport): na RAIZ de aba a barra do sistema
// fica escondida e o título grande (28) é o 1º item do conteúdo; rolando, ele sai e aparece um
// título 17 centralizado numa barra translúcida. Tela EMPILHADA: barra inline do sistema, com o
// voltar e o gesto de arrastar. `acessorio` vai ao lado do título (ex.: logo do clube).

private struct PeDoTituloChave: PreferenceKey {
    static let defaultValue: CGFloat = .greatestFiniteMagnitude
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = min(value, nextValue()) }
}

private let ESPACO_ROLAGEM = "rolagem-raiz"
private let TOPO = "topo-da-tela"

private struct ToqueNaAbaChave: EnvironmentKey { static let defaultValue = 0 }

extension EnvironmentValues {
    /// Quantas vezes a aba ATIVA foi tocada já na raiz (rola pro topo).
    var toqueNaAba: Int {
        get { self[ToqueNaAbaChave.self] }
        set { self[ToqueNaAbaChave.self] = newValue }
    }
}

struct TelaGrande<Acessorio: View, Conteudo: View>: View {
    let titulo: String
    var subtitulo: String?
    var empilhada = false
    var aoAtualizar: (@MainActor @Sendable () async -> Void)?
    // AnyView de propósito (28/10/2026): o conteúdo inteiro como tipo genérico estourava a pilha da thread
    // principal no build de produção (aba Mais e ficha do atleta: "Thread stack size exceeded"). Embrulhado,
    // fica no heap e a pilha guarda só um ponteiro.
    private let acessorio: AnyView
    private let conteudo: AnyView

    @Environment(\.tema) private var tema
    @Environment(\.toqueNaAba) private var toque
    @State private var recolhido = false

    init(_ titulo: String, subtitulo: String? = nil, empilhada: Bool = false,
         aoAtualizar: (@MainActor @Sendable () async -> Void)? = nil,
         @ViewBuilder acessorio: () -> Acessorio, @ViewBuilder conteudo: () -> Conteudo) {
        self.titulo = titulo
        self.subtitulo = subtitulo
        self.empilhada = empilhada
        self.aoAtualizar = aoAtualizar
        self.acessorio = AnyView(acessorio())
        self.conteudo = AnyView(conteudo())
    }

    var body: some View {
        let _ = RegistroDeFalhas.marcar("TelaGrande")
        if empilhada {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) { conteudo }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 32)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(tema.cores.fundo.color.ignoresSafeArea())
            .modifier(PuxarAtualizar(aoAtualizar: aoAtualizar))
            .navigationTitle(titulo)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.visible, for: .navigationBar)
        } else {
            raiz
        }
    }

    private var raiz: some View {
        let c = tema.cores
        return ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .center, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(titulo)
                                .font(Tipos.titulo32.comTamanho(28).font)
                                .foregroundColor(c.tinta.color)
                                .linhasAcessiveis()
                                .minimumScaleFactor(0.8)
                                .accessibilityAddTraits(.isHeader)
                            if let subtitulo, !subtitulo.isEmpty {
                                Text(subtitulo).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).linhasAcessiveis()
                            }
                        }
                        .background(GeometryReader { g in
                            Color.clear.preference(key: PeDoTituloChave.self, value: g.frame(in: .named(ESPACO_ROLAGEM)).maxY)
                        })
                        Spacer(minLength: 0)
                        acessorio
                    }
                    .id(TOPO)
                    conteudo
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 32)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .coordinateSpace(name: ESPACO_ROLAGEM)
            .onPreferenceChange(PeDoTituloChave.self) { pe in
                let r = pe < 0
                if r != recolhido { withAnimation(.easeInOut(duration: 0.15)) { recolhido = r } }
            }
            .onChange(of: toque) { _ in
                withAnimation(.easeInOut(duration: 0.25)) { proxy.scrollTo(TOPO, anchor: .top) }
            }
        }
        .background(c.fundo.color.ignoresSafeArea())
        .overlay(alignment: .top) {
            if recolhido {
                Text(titulo)
                    .font(Tipos.cabecalho17.font)
                    .foregroundColor(c.tinta.color)
                    .lineLimit(1)
                    .padding(.horizontal, 56)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Rectangle().fill(.regularMaterial).ignoresSafeArea(edges: .top))
                    .overlay(alignment: .bottom) { Rectangle().fill(c.borda.color).frame(height: 1) }
                    .accessibilityHidden(true)
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
        }
        .modifier(PuxarAtualizar(aoAtualizar: aoAtualizar))
        .toolbar(.hidden, for: .navigationBar)
    }
}

extension TelaGrande where Acessorio == EmptyView {
    init(_ titulo: String, subtitulo: String? = nil, empilhada: Bool = false,
         aoAtualizar: (@MainActor @Sendable () async -> Void)? = nil, @ViewBuilder conteudo: () -> Conteudo) {
        self.init(titulo, subtitulo: subtitulo, empilhada: empilhada, aoAtualizar: aoAtualizar,
                  acessorio: { EmptyView() }, conteudo: conteudo)
    }
}

/// Puxar para atualizar: o `.refreshable` do sistema, só quando a tela tem carregador.
struct PuxarAtualizar: ViewModifier {
    let aoAtualizar: (@MainActor @Sendable () async -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let aoAtualizar {
            content.refreshable { await aoAtualizar() }
        } else {
            content
        }
    }
}

// MARK: cartão-herói

/// Cartão-herói (navy da marca, igual em todo clube): rótulo + selo, valor grande e frase.
struct CartaoHeroi: View {
    let rotulo: String
    var selo: String?
    let valor: String
    var frase: String?
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        let forma = RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCard), style: .continuous)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Text(rotulo)
                    .font(Tipos.corpo13.comPeso(.seminegrito).font)
                    .foregroundColor(c.sobreHeroi2.color)
                    .linhasAcessiveis()
                Spacer(minLength: 0)
                if let selo {
                    Text(selo)
                        .font(Tipos.legenda11.comPeso(.seminegrito).font)
                        .foregroundColor(Cor(hex: NAVY).color)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Capsule().fill(c.lime.color))
                }
            }
            Text(valor)
                .tipo(Tipos.titulo24)
                .foregroundColor(c.sobreHeroi.color)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .padding(.top, 6)
            if let frase, !frase.isEmpty {
                Text(frase)
                    .tipo(Tipos.corpo13)
                    .foregroundColor(c.sobreHeroi2.color)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(forma.fill(c.heroi.color))
        .overlay(forma.stroke(c.heroiBorda.color, lineWidth: 1))
        .shadow(color: c.sombra2.color, radius: 9, x: 0, y: 6)
        .accessibilityElement(children: .combine)
    }
}

extension Cor {
    var color: Color {
        let c = rgb01
        return Color(.sRGB, red: c.r, green: c.g, blue: c.b, opacity: c.a)
    }
}

// MARK: marca

/// Símbolo TactiPlan desenhado (o mesmo do ícone: T branco com a faísca lime no navy).
struct SimboloTactiPlan: View {
    var tamanho: CGFloat = 56

    var body: some View {
        // Coordenadas do icon.svg (viewBox 1024).
        Canvas { ctx, size in
            let k = size.width / 1024
            func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ raio: CGFloat) -> Path {
                Path(roundedRect: CGRect(x: x * k, y: y * k, width: w * k, height: h * k), cornerRadius: raio * k)
            }
            ctx.fill(Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: size.width * 0.22),
                     with: .color(Cor(hex: NAVY).color))
            ctx.fill(r(256, 280, 512, 140, 16), with: .color(.white))
            ctx.fill(r(438, 280, 148, 500, 18), with: .color(.white))
            var faisca = Path()
            faisca.move(to: CGPoint(x: 712 * k, y: 236 * k))
            faisca.addLine(to: CGPoint(x: 712 * k, y: 356 * k))
            faisca.addLine(to: CGPoint(x: 820 * k, y: 296 * k))
            faisca.closeSubpath()
            ctx.fill(faisca, with: .color(Cor(hex: LIME).color))
        }
        .frame(width: tamanho, height: tamanho)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(NOME_APP)
    }
}

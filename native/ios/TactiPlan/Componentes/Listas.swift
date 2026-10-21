import SwiftUI
import TactiPlanKit

// Lista agrupada "inset" (Mais/Perfil), avatar, logo do clube e rodapé da versão — portados do
// Gestsport com a identidade TactiPlan.

/// Avatar de iniciais (círculo na cor suave do clube). Fora do VoiceOver: o nome vem ao lado.
struct AvatarIniciais: View {
    let nome: String?
    var tamanho: CGFloat = 36
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        Text(iniciais(nome))
            .font(Tipo.corpo(Double(tamanho) * 0.38, peso: .semibold))
            .foregroundColor(c.acaoTinta.color)
            .frame(width: tamanho, height: tamanho)
            .background(Circle().fill(c.acaoSuave.color))
            .accessibilityHidden(true)
    }
}

/// Logo do clube (a escura no modo escuro). Sem logo ou sem rede: escudo na cor do clube.
struct LogoClube: View {
    let personalizacao: Personalizacao?
    var tamanho: CGFloat = 40
    @Environment(\.colorScheme) private var esquema

    var body: some View {
        let url = logoDoClube(personalizacao, escuro: esquema == .dark).flatMap(URL.init(string:))
        Group {
            if let url {
                AsyncImage(url: url) { fase in
                    if let imagem = fase.image {
                        imagem.resizable().scaledToFit()
                    } else {
                        escudo
                    }
                }
            } else {
                escudo
            }
        }
        .frame(width: tamanho, height: tamanho)
        .accessibilityHidden(true)
    }

    private var escudo: some View {
        let cores = Tema(personalizacao).cores
        return RoundedRectangle(cornerRadius: tamanho * 0.28, style: .continuous)
            .fill(cores.acao.color)
            .overlay(
                Image(systemName: "shield.fill")
                    .font(.system(size: tamanho * 0.45, weight: .semibold))
                    .foregroundColor(cores.sobreAcao.color)
            )
    }
}

/// Uma seção da lista agrupada: rótulo em caixa alta + UM cartão com as linhas
/// (quem chama põe `Divisoria()` entre elas).
struct ListaAgrupada<Linhas: View>: View {
    let titulo: String?
    private let linhas: Linhas

    init(_ titulo: String? = nil, @ViewBuilder linhas: () -> Linhas) {
        self.titulo = titulo
        self.linhas = linhas()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let titulo { RotuloSecao(titulo).padding(.horizontal, 4) }
            Cartao(preenchimento: PREENCHIMENTO_LISTA) { linhas }
        }
    }
}

/// Ícone da linha: SF Symbol num quadradinho tonal.
struct IconeLinha: View {
    let icone: String
    var tom: Tom?
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        Image(systemName: icone)
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(tom.map { c.tinta($0).color } ?? c.acaoTinta.color)
            .frame(width: 30, height: 30)
            .background(RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(tom.map { c.fundo($0).color } ?? c.acaoSuave.color))
            .accessibilityHidden(true)
    }
}

/// Linha da lista agrupada: ícone, título, detalhe, selo e "›" quando navega.
struct LinhaAgrupada<Inicio: View>: View {
    let titulo: String
    var detalhe: String?
    var selo: String?
    var tom: Tom?
    var seta = true
    var habilitado = true
    var aoTocar: (() -> Void)?
    private let inicio: Inicio
    @Environment(\.tema) private var tema

    init(titulo: String, detalhe: String? = nil, selo: String? = nil, tom: Tom? = nil, seta: Bool = true,
         habilitado: Bool = true, aoTocar: (() -> Void)? = nil, @ViewBuilder inicio: () -> Inicio) {
        self.titulo = titulo; self.detalhe = detalhe; self.selo = selo; self.tom = tom
        self.seta = seta; self.habilitado = habilitado; self.aoTocar = aoTocar
        self.inicio = inicio()
    }

    var body: some View {
        if let aoTocar {
            Button(action: aoTocar) { miolo }
                .buttonStyle(.plain)
                .disabled(!habilitado)
                .opacity(habilitado ? 1 : 0.5)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
        } else {
            miolo.accessibilityElement(children: .combine)
        }
    }

    private var miolo: some View {
        let c = tema.cores
        return HStack(spacing: 12) {
            inicio
            VStack(alignment: .leading, spacing: 1) {
                Text(titulo)
                    .font(Tipos.corpo15.comPeso(.seminegrito).font)
                    .foregroundColor(tom.map { c.tinta($0).color } ?? c.tinta.color)
                    .linhasAcessiveis(2)
                if let detalhe, !detalhe.isEmpty {
                    Text(detalhe).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).linhasAcessiveis(2)
                }
            }
            Spacer(minLength: 0)
            if let selo { Pastilha(texto: selo, tom: .info) }
            if aoTocar != nil && seta { Seta() }
        }
        .padding(.vertical, 8)
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }
}

extension LinhaAgrupada where Inicio == IconeLinha {
    init(icone: String, titulo: String, detalhe: String? = nil, selo: String? = nil, tom: Tom? = nil,
         seta: Bool = true, habilitado: Bool = true, aoTocar: (() -> Void)? = nil) {
        self.init(titulo: titulo, detalhe: detalhe, selo: selo, tom: tom, seta: seta, habilitado: habilitado,
                  aoTocar: aoTocar) { IconeLinha(icone: icone, tom: tom) }
    }
}

/// Linha com interruptor ("Exigir Face ID ao abrir").
struct LinhaInterruptor: View {
    let icone: String
    let titulo: String
    var detalhe: String?
    @Binding var ligado: Bool
    var habilitado = true
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        HStack(spacing: 12) {
            IconeLinha(icone: icone)
            Toggle(isOn: $ligado) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(titulo).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                    if let detalhe, !detalhe.isEmpty {
                        Text(detalhe).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .tint(c.acao.color)
            .disabled(!habilitado)
        }
        .padding(.vertical, 8)
        .frame(minHeight: 52)
    }
}

/// Cabeçalho do Mais: avatar, nome, e-mail e papel.
struct CabecalhoPerfil: View {
    let nome: String
    var contato: String?
    var papel: String?
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        Cartao {
            HStack(spacing: 14) {
                AvatarIniciais(nome: nome, tamanho: 52)
                VStack(alignment: .leading, spacing: 2) {
                    Text(nome.isEmpty ? "—" : nome)
                        .font(Tipos.corpo17.comPeso(.seminegrito).font)
                        .foregroundColor(c.tinta.color)
                        .lineLimit(2)
                    if let contato, !contato.isEmpty {
                        Text(contato).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).linhasAcessiveis()
                    }
                    if let papel, !papel.isEmpty { Pastilha(texto: papel, tom: .info).padding(.top, 2) }
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Rodapé "TactiPlan · versão 1.0.0 (7)" + "Faggin".
struct RodapeVersao: View {
    @Environment(\.tema) private var tema

    var body: some View {
        let info = Bundle.main.infoDictionary
        VStack(spacing: 4) {
            Text(rotuloVersao(info?["CFBundleShortVersionString"] as? String, info?["CFBundleVersion"] as? String))
            Text("Desenvolvido por Faggin")
        }
        .tipo(Tipos.corpo13)
        .foregroundColor(tema.cores.tinta2.color)
        .frame(maxWidth: .infinity)
        .multilineTextAlignment(.center)
        .padding(.top, 8)
    }
}

/// Versão instalada (CFBundleShortVersionString).
var versaoInstalada: String? { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String }

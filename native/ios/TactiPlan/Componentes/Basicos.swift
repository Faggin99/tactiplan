import SwiftUI
import UIKit
import TactiPlanKit

// Peças básicas (portadas do Gestsport, com a identidade TactiPlan). Só cores do tema.

/// Preenchimento de um cartão que é uma LISTA de linhas: 16 dos lados, 2 em cima/embaixo.
let PREENCHIMENTO_LISTA = EdgeInsets(top: 2, leading: 16, bottom: 2, trailing: 16)
let ALTURA_BOTAO: CGFloat = 52
let ALVO_TOQUE: CGFloat = 44

/// Cartão: superfície, raio 20, sem borda, duas sombras suaves. Toque opcional.
struct Cartao<Conteudo: View>: View {
    var aoTocar: (() -> Void)?
    var preenchimento: EdgeInsets
    private let conteudo: Conteudo
    @Environment(\.tema) private var tema

    init(aoTocar: (() -> Void)? = nil,
         preenchimento: EdgeInsets = EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16),
         @ViewBuilder conteudo: () -> Conteudo) {
        self.aoTocar = aoTocar
        self.preenchimento = preenchimento
        self.conteudo = conteudo()
    }

    var body: some View {
        let _ = RegistroDeFalhas.marcar("Cartao")
        let c = tema.cores
        let forma = RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCard), style: .continuous)
        let corpo = VStack(alignment: .leading, spacing: 0) { conteudo }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(preenchimento)
            .foregroundColor(c.tinta.color)
            .background(forma.fill(c.superficie.color))
            .contentShape(forma)
            .shadow(color: c.sombra2.color, radius: 9, x: 0, y: 6)
            .shadow(color: c.sombra1.color, radius: 1.5, x: 0, y: 1)
        if let aoTocar {
            Button(action: aoTocar) { corpo }.buttonStyle(.plain)
        } else {
            corpo
        }
    }
}

enum VarianteBotao { case primario, secundario, neutro, perigo }

/// Botão de 52 pt. Primário: fundo na cor de AÇÃO (a do clube) e texto `sobreAcao`
/// (branco ou navy — trava de contraste AA: amarelo pede texto escuro).
struct Botao: View {
    let texto: String
    var variante: VarianteBotao = .primario
    var habilitado = true
    var larguraCheia = true
    let acao: () -> Void
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        let forma = RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous)
        Button(action: acao) {
            Text(texto)
                .font(Tipo.corpo(15, peso: .semibold))
                .frame(maxWidth: larguraCheia ? .infinity : nil, minHeight: ALTURA_BOTAO)
                .padding(.horizontal, larguraCheia ? 16 : 24)
                .foregroundColor(tinta(c))
                .background(forma.fill(fundo(c)))
                .overlay(forma.stroke(contorno(c), lineWidth: 1.5))
                .contentShape(forma)
        }
        .buttonStyle(.plain)
        .disabled(!habilitado)
    }

    private func tinta(_ c: CoresTema) -> Color {
        switch variante {
        case .primario: return c.sobreAcao.color
        case .secundario: return habilitado ? c.acaoTinta.color : c.tinta3.color
        case .neutro: return habilitado ? c.tinta.color : c.tinta3.color
        case .perigo: return habilitado ? c.erroTinta.color : c.tinta3.color
        }
    }

    private func fundo(_ c: CoresTema) -> Color {
        variante == .primario ? c.acao.color.opacity(habilitado ? 1 : 0.5) : c.superficie.color
    }

    private func contorno(_ c: CoresTema) -> Color {
        switch variante {
        case .primario: return .clear
        case .secundario: return habilitado ? c.acaoTinta.color : c.borda.color
        case .neutro: return c.borda.color
        case .perigo: return habilitado ? c.erroTinta.color : c.borda.color
        }
    }
}

/// Ação discreta (link de texto): "Esqueci a senha".
struct BotaoTexto: View {
    let texto: String
    var habilitado = true
    var enfatizado = false
    var cor: Color?
    let acao: () -> Void
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        Button(action: acao) {
            Text(texto)
                .font(Tipo.corpo(13, peso: enfatizado ? .semibold : .regular))
                .foregroundColor(habilitado ? (cor ?? c.tinta2.color) : c.tinta3.color)
                .frame(minHeight: 48)
                .padding(.horizontal, 12)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!habilitado)
    }
}

/// Campo de uma linha, 52 pt, contorno borda (cor de ação com foco), fundo superfície.
struct Campo: View {
    let dica: String
    @Binding var valor: String
    var teclado: UIKeyboardType = .default
    var conteudo: UITextContentType?
    var secreto = false
    var habilitado = true
    var envio: SubmitLabel = .done
    var aoConfirmar: (() -> Void)?

    @Environment(\.tema) private var tema
    @FocusState private var focado: Bool
    @State private var mostrar = false

    // init explícito: o @State privado deixaria o memberwise init privado.
    init(dica: String, valor: Binding<String>, teclado: UIKeyboardType = .default, conteudo: UITextContentType? = nil,
         secreto: Bool = false, habilitado: Bool = true, envio: SubmitLabel = .done, aoConfirmar: (() -> Void)? = nil) {
        self.dica = dica
        _valor = valor
        self.teclado = teclado
        self.conteudo = conteudo
        self.secreto = secreto
        self.habilitado = habilitado
        self.envio = envio
        self.aoConfirmar = aoConfirmar
    }

    var body: some View {
        let c = tema.cores
        let forma = RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous)
        HStack(spacing: 8) {
            Group {
                if secreto && !mostrar {
                    SecureField("", text: $valor, prompt: Text(dica).foregroundColor(c.tinta3.color))
                } else {
                    TextField("", text: $valor, prompt: Text(dica).foregroundColor(c.tinta3.color))
                }
            }
            .font(Tipo.corpo(17))
            .foregroundColor(habilitado ? c.tinta.color : c.tinta2.color)
            .keyboardType(teclado)
            .textContentType(conteudo)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(envio)
            .onSubmit { aoConfirmar?() }
            .focused($focado)
            if secreto {
                Button { mostrar.toggle() } label: {
                    Image(systemName: mostrar ? "eye.slash" : "eye")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(c.tinta3.color)
                        .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(mostrar ? "Esconder a senha" : "Mostrar a senha")
            }
        }
        .disabled(!habilitado)
        .padding(.leading, 16)
        .padding(.trailing, secreto ? 4 : 16)
        .frame(minHeight: 52)
        .background(forma.fill(c.superficie.color))
        .overlay(forma.stroke(focado ? c.acaoTinta.color : c.borda.color, lineWidth: focado ? 2 : 1))
    }
}

/// Divisória de lista (1 pt, borda).
struct Divisoria: View {
    @Environment(\.tema) private var tema
    var body: some View { Rectangle().fill(tema.cores.borda.color).frame(height: 1) }
}

/// Seta da linha (chevron).
struct Seta: View {
    @Environment(\.tema) private var tema
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(tema.cores.tinta3.color)
            .accessibilityHidden(true)
    }
}

/// Rótulo de seção em caixa alta ("CLUBE", "CONTA").
struct RotuloSecao: View {
    let texto: String
    @Environment(\.tema) private var tema
    init(_ texto: String) { self.texto = texto }

    var body: some View {
        Text(texto.uppercased())
            .font(Tipos.legenda11.comPeso(.seminegrito).font)
            .tracking(CGFloat(Tipos.legenda11.tamanho * 0.06))
            .foregroundColor(tema.cores.tinta2.color)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Pastilha de estado ("Dono", "só leitura", "1 convite").
struct Pastilha: View {
    let texto: String
    var tom: Tom = .neutro
    @Environment(\.tema) private var tema

    var body: some View {
        let _ = RegistroDeFalhas.marcar("Pastilha")
        let c = tema.cores
        Text(texto)
            .font(Tipos.legenda11.comPeso(.seminegrito).font)
            .foregroundColor(c.tinta(tom).color)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Capsule().fill(c.fundo(tom).color))
    }
}

/// Estado vazio ilustrado (nunca "nenhum registro encontrado"): ícone, título, texto, ação.
struct EstadoVazio: View {
    let icone: String
    let titulo: String
    let texto: String
    var acao: (rotulo: String, aoTocar: () -> Void)?
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        VStack(spacing: 0) {
            ZStack {
                Circle().fill(c.acaoSuave.color)
                Image(systemName: icone)
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundColor(c.acaoTinta.color)
            }
            .frame(width: 88, height: 88)
            .accessibilityHidden(true)
            Text(titulo)
                .tipo(Tipos.titulo20)
                .foregroundColor(c.tinta.color)
                .multilineTextAlignment(.center)
                .padding(.top, 20)
                .accessibilityAddTraits(.isHeader)
            Text(texto)
                .tipo(Tipos.corpo15)
                .foregroundColor(c.tinta2.color)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
                .padding(.top, 8)
                .fixedSize(horizontal: false, vertical: true)
            if let acao {
                Botao(texto: acao.rotulo, variante: .secundario, larguraCheia: false, acao: acao.aoTocar)
                    .padding(.top, 24)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 32)
    }
}

/// Faixa de aviso por tom (só leitura, sem conexão, atualizar). Anunciada ao VoiceOver.
struct FaixaTom: View {
    let icone: String
    let texto: String
    let tom: Tom
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icone)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(c.tinta(tom).color)
                .accessibilityHidden(true)
            Text(texto)
                .tipo(Tipos.corpo13.comPeso(.medio))
                .foregroundColor(c.tinta(tom).color)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(c.fundo(tom).color))
        .accessibilityElement(children: .combine)
        .onAppear {
            guard UIAccessibility.isVoiceOverRunning else { return }
            let t = texto
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                UIAccessibility.post(notification: .announcement, argument: t)
            }
        }
    }
}

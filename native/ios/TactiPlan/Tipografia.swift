import SwiftUI
import UIKit
import os
import TactiPlanKit

// Tipografia do spec §5 no SwiftUI (copiada do Gestsport; paridade: design/Tipografia.kt). Os tokens,
// os pesos e os nomes PostScript moram no Kit (`Tipos`, `Fonte` — testados no
// Linux contra os TTF); aqui só viram `Font`/`UIFont`. As fontes vêm de
// TactiPlan/Fontes, registradas pelo UIAppFonts do Info.plist.
//
// Uso nas telas: `.tipo(Tipos.corpo15)` (fonte + entrelinha + tracking +
// tabular) ou, onde só cabe um `Font`, `Tipo.fonte(Tipos.titulo20)`.

extension EstiloTipo {
    /// Estilo de texto do sistema que este token acompanha no Dynamic Type.
    var estiloRelativo: Font.TextStyle {
        switch tamanho {
        case 28...: return .largeTitle
        case 22..<28: return .title
        case 19..<22: return .title3
        case 16..<19: return .body
        case 14..<16: return .subheadline
        case 12..<14: return .footnote
        default: return .caption2
        }
    }

    /// `Font` do token (escala com o Dynamic Type; algarismos tabulares se pedido).
    var font: Font {
        let f = Font.custom(nomeFonte, size: CGFloat(tamanho), relativeTo: estiloRelativo)
        return tabular ? f.monospacedDigit() : f
    }

    /// `UIFont` do token (barra de navegação), já escalada pelo Dynamic Type.
    func uiFont(_ estilo: UIFont.TextStyle = .body) -> UIFont {
        let base = UIFont(name: nomeFonte, size: CGFloat(tamanho)) ?? .systemFont(ofSize: CGFloat(tamanho))
        return UIFontMetrics(forTextStyle: estilo).scaledFont(for: base)
    }

    /// Espaço entre linhas pra chegar na entrelinha do spec (1.2 / 1.5), a
    /// partir da altura de linha natural da fonte.
    var espacoEntreLinhas: CGFloat {
        let natural = UIFont(name: nomeFonte, size: CGFloat(tamanho))?.lineHeight ?? CGFloat(tamanho) * 1.2
        return max(0, CGFloat(tamanho * entrelinha) - natural)
    }
}

/// Atalhos de `Font`. `titulo`/`corpo` aceitam qualquer peso do SwiftUI e
/// caem no arquivo embutido mais próximo (nunca na fonte do sistema).
enum Tipo {
    static func fonte(_ estilo: EstiloTipo) -> Font { estilo.font }

    static func titulo(_ tamanho: Double, peso: Font.Weight = .bold) -> Font {
        EstiloTipo(.titulo, tamanho, pesoTipo(peso)).font
    }

    static func corpo(_ tamanho: Double, peso: Font.Weight = .regular) -> Font {
        EstiloTipo(.corpo, tamanho, pesoTipo(peso)).font
    }

    static func pesoTipo(_ p: Font.Weight) -> PesoTipo {
        switch p {
        case .black, .heavy: return .extranegrito
        case .bold: return .negrito
        case .semibold: return .seminegrito
        case .medium: return .medio
        default: return .regular
        }
    }
}

/// H5 (acessibilidade): texto de lista que quebra (até 3 linhas) nos tamanhos de acessibilidade
/// do Dynamic Type em vez de cortar com "…". Regra no Kit (`linhasParaFonte`). Paridade: Kotlin.
private struct LinhasAcessiveis: ViewModifier {
    let base: Int
    @Environment(\.dynamicTypeSize) private var tamanho
    func body(content: Content) -> some View {
        content.lineLimit(linhasParaFonte(base, grande: tamanho.isAccessibilitySize))
    }
}

extension View {
    func linhasAcessiveis(_ base: Int = 1) -> some View { modifier(LinhasAcessiveis(base: base)) }

    /// Valor em dinheiro: SEMPRE uma linha, encolhendo (até 50%) com fonte grande do
    /// Dynamic Type em vez de cortar ("R$ 1.2…") ou quebrar no meio do número.
    /// Paridade: `valorQueCabe` em design/Tipografia.kt.
    func valorQueCabe() -> some View {
        lineLimit(1).minimumScaleFactor(0.5).allowsTightening(true)
    }

    /// Aplica um token de tipo inteiro: fonte, entrelinha, tracking e tabular.
    func tipo(_ estilo: EstiloTipo) -> some View {
        font(estilo.font)
            .lineSpacing(estilo.espacoEntreLinhas)
            .tracking(CGFloat(estilo.espacamento))
    }
}

/// Barra de navegação das telas EMPILHADAS (N2.1): só a barra INLINE — título 17
/// (Poppins Bold) centralizado sobre a superfície com o fio de borda. As raízes de
/// aba escondem a barra e desenham o próprio cabeçalho (`CabecalhoRecolhivel`); o título
/// grande do sistema (`prefersLargeTitles`/`largeTitleTextAttributes`) saiu: no iOS
/// 26 ele reservava ~200 pt no topo sem mostrar o título. Chamado uma vez no boot.
@MainActor
func configurarBarraDeNavegacao() {
    let pequeno: [NSAttributedString.Key: Any] = [
        .font: Tipos.cabecalho17.uiFont(.headline),
        .foregroundColor: CORES_PADRAO.tinta.uiColor,
    ]
    let barra = UINavigationBarAppearance()
    barra.configureWithOpaqueBackground()
    barra.backgroundColor = CORES_PADRAO.superficie.uiColor
    barra.shadowColor = CORES_PADRAO.borda.uiColor
    barra.titleTextAttributes = pequeno

    let aparencia = UINavigationBar.appearance()
    aparencia.standardAppearance = barra
    aparencia.compactAppearance = barra
    aparencia.scrollEdgeAppearance = barra
    aparencia.prefersLargeTitles = false
}

// MARK: conferência das fontes em tempo de execução

/// Nomes PostScript da tabela do Kit (`Fonte.arquivos`) que o iOS NÃO carregou
/// (arquivo fora do bundle ou fora do UIAppFonts). Vazio = tudo certo. O teste
/// `FontesTests` (simulador, Codemagic) exige vazio.
func fontesQueFalharam() -> [String] {
    Fonte.arquivos.values.sorted().filter { UIFont(name: $0, size: 17) == nil }
}

/// Quantas fontes a tabela do Kit declara (o teste confere que não está vazia).
var totalDeFontesDoKit: Int { Fonte.arquivos.count }

/// Em DEBUG, UM aviso no log se alguma fonte embutida não carregou (sem dado
/// de ninguém: só os nomes das fontes). Em Release não faz nada.
func avisarFontesQueFalharam() {
    #if DEBUG
    let faltando = fontesQueFalharam()
    if !faltando.isEmpty {
        Logger(subsystem: "com.faggin.tactiplan.app", category: "fontes")
            .warning("Fontes embutidas não carregaram (caindo na do sistema): \(faltando.joined(separator: ", "), privacy: .public)")
    }
    #endif
}

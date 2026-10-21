// Tipografia sem SwiftUI (copiada do Gestsport; paridade: design/Tipografia.kt). A camada
// de tela (TactiPlan/Tipografia.swift) só converte `EstiloTipo` em `Font`/`UIFont`.
// - Poppins em tudo, a mesma do web do TactiPlan: títulos e números em SemiBold/Bold;
//   corpo, rótulos e listas em Regular/Medium/SemiBold.
// Embutida no app (TactiPlan/Fontes, OFL) e registrada por UIAppFonts — os mesmos
// pesos que o web carrega (400/500/600/700).
// Escala 32/24/20/17/15/13/11 · entrelinha 1.2 em título e 1.5 em corpo.

/// Papel do texto: título/valor ou corpo (mesma família; muda o peso mínimo e a entrelinha).
public enum FamiliaTipo: Sendable, Equatable {
    case titulo
    case corpo
}

/// Pesos que o app pede (a Poppins embutida vai de 400 a 700; 800 cai na Bold).
public enum PesoTipo: Int, Sendable, Comparable {
    case regular = 400
    case medio = 500
    case seminegrito = 600
    case negrito = 700
    case extranegrito = 800

    public static func < (a: PesoTipo, b: PesoTipo) -> Bool { a.rawValue < b.rawValue }
}

/// Nomes PostScript dos arquivos embutidos — lidos da tabela `name` dos TTF
/// (o teste `TipografiaTests` confere contra os arquivos). Único lugar com eles.
public enum Fonte {
    public static let poppinsRegular = "Poppins-Regular"
    public static let poppinsMedium = "Poppins-Medium"
    public static let poppinsSemiBold = "Poppins-SemiBold"
    public static let poppinsBold = "Poppins-Bold"

    /// Arquivo → nome PostScript (o UIAppFonts do Info.plist lista estes arquivos).
    public static let arquivos: [String: String] = [
        "Poppins-Regular.ttf": poppinsRegular,
        "Poppins-Medium.ttf": poppinsMedium,
        "Poppins-SemiBold.ttf": poppinsSemiBold,
        "Poppins-Bold.ttf": poppinsBold,
    ]

    /// Peso pedido → arquivo embutido mais próximo (sem cair na fonte do sistema).
    /// Título nunca fica abaixo de 600 (SemiBold); 800 vira 700 (Bold) nos dois.
    public static func nome(_ familia: FamiliaTipo, _ peso: PesoTipo) -> String {
        switch peso {
        case .regular: return familia == .titulo ? poppinsSemiBold : poppinsRegular
        case .medio: return familia == .titulo ? poppinsSemiBold : poppinsMedium
        case .seminegrito: return poppinsSemiBold
        case .negrito, .extranegrito: return poppinsBold
        }
    }
}

public let ENTRELINHA_TITULO = 1.2
public let ENTRELINHA_CORPO = 1.5

/// Um token de tipo: família, tamanho (pt), peso, entrelinha e algarismos tabulares.
public struct EstiloTipo: Equatable, Sendable {
    public let familia: FamiliaTipo
    public let tamanho: Double
    public let peso: PesoTipo
    public let tabular: Bool

    public init(_ familia: FamiliaTipo, _ tamanho: Double, _ peso: PesoTipo, tabular: Bool = false) {
        self.familia = familia
        self.tamanho = tamanho
        self.peso = peso
        self.tabular = tabular
    }

    /// Nome PostScript do arquivo que desenha este estilo.
    public var nomeFonte: String { Fonte.nome(familia, peso) }

    /// 1.2 em título, 1.5 em corpo (multiplicador do tamanho).
    public var entrelinha: Double { familia == .titulo ? ENTRELINHA_TITULO : ENTRELINHA_CORPO }

    /// "tracking-tight" dos títulos grandes (em pontos; -0.01 em).
    public var espacamento: Double { familia == .titulo && tamanho >= 24 ? -0.01 * tamanho : 0 }

    public func comPeso(_ p: PesoTipo) -> EstiloTipo { EstiloTipo(familia, tamanho, p, tabular: tabular) }
    public func comTamanho(_ t: Double) -> EstiloTipo { EstiloTipo(familia, t, peso, tabular: tabular) }
    /// Mesmo estilo com algarismos tabulares (datas, horas, contagens).
    public func tabulares() -> EstiloTipo { EstiloTipo(familia, tamanho, peso, tabular: true) }
}

/// Os tokens de tipo (mesmos nomes e valores do `Tipos` do Android).
public enum Tipos {
    /// Título grande da tela (cabeçalho expandido, Entrar).
    public static let titulo32 = EstiloTipo(.titulo, 32, .negrito)
    public static let titulo24 = EstiloTipo(.titulo, 24, .negrito)
    public static let titulo20 = EstiloTipo(.titulo, 20, .negrito)
    /// Título do cabeçalho encolhido (17, centralizado).
    public static let cabecalho17 = EstiloTipo(.titulo, 17, .negrito)
    public static let corpo17 = EstiloTipo(.corpo, 17, .regular)
    public static let corpo15 = EstiloTipo(.corpo, 15, .regular)
    public static let corpo13 = EstiloTipo(.corpo, 13, .regular)
    /// Rótulo pequeno / metadado.
    public static let legenda11 = EstiloTipo(.corpo, 11, .medio)
    /// Dinheiro e saldo em destaque: Poppins Bold, tabular.
    public static let valor = EstiloTipo(.titulo, 28, .negrito, tabular: true)
}

/// H5 (acessibilidade): quantas linhas um texto de LISTA pode ocupar. Nos tamanhos de
/// acessibilidade do Dynamic Type (e fontScale ≥ 1,5 no Android) o texto quebra em até 3
/// linhas em vez de ser cortado com "…"; no tamanho normal fica como o desenho (`base`).
public func linhasParaFonte(_ base: Int, grande: Bool) -> Int { grande ? max(base, 3) : max(1, base) }

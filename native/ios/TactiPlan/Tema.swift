import SwiftUI
import UIKit
import TactiPlanKit

// As cores vêm do Kit (identidade TactiPlan + cor do clube com trava de contraste); aqui só
// viram `Color` e descem pela árvore via Environment. Tela nenhuma usa hex solto. Cada token
// tem a versão clara e a escura e segue o modo do aparelho sozinho.

extension Cor {
    var uiColor: UIColor {
        let c = rgb01
        return UIColor(red: CGFloat(c.r), green: CGFloat(c.g), blue: CGFloat(c.b), alpha: CGFloat(c.a))
    }
}

/// Uma cor do tema com as DUAS versões: `.color`/`.uiColor` seguem o claro/escuro do aparelho.
struct CorTema: Equatable {
    let claro: Cor
    let escuro: Cor

    var uiColor: UIColor {
        let a = claro.uiColor, b = escuro.uiColor
        return UIColor { $0.userInterfaceStyle == .dark ? b : a }
    }

    var color: Color { Color(uiColor) }
}

/// A paleta das telas (Kit: `coresDoClube`), clara e escura.
struct CoresTema: Equatable {
    let tinta, tinta2, tinta3, fundo, superficie, borda, lime: CorTema
    let heroi, sobreHeroi, sobreHeroi2, heroiDivisoria, heroiBorda: CorTema
    let acao, sobreAcao, acaoTinta, acaoSuave: CorTema
    let okFundo, okTinta, avisoFundo, avisoTinta, erroFundo, erroTinta: CorTema
    let infoFundo, infoTinta, neutroFundo, neutroTinta, erro, skeleton, sombra1, sombra2: CorTema

    init(_ a: Cores, _ b: Cores) {
        func t(_ k: KeyPath<Cores, Cor>) -> CorTema { CorTema(claro: a[keyPath: k], escuro: b[keyPath: k]) }
        tinta = t(\.tinta); tinta2 = t(\.tinta2); tinta3 = t(\.tinta3)
        fundo = t(\.fundo); superficie = t(\.superficie); borda = t(\.borda); lime = t(\.lime)
        heroi = t(\.heroi); sobreHeroi = t(\.sobreHeroi); sobreHeroi2 = t(\.sobreHeroi2)
        heroiDivisoria = t(\.heroiDivisoria); heroiBorda = t(\.heroiBorda)
        acao = t(\.acao); sobreAcao = t(\.sobreAcao); acaoTinta = t(\.acaoTinta); acaoSuave = t(\.acaoSuave)
        okFundo = t(\.okFundo); okTinta = t(\.okTinta); avisoFundo = t(\.avisoFundo); avisoTinta = t(\.avisoTinta)
        erroFundo = t(\.erroFundo); erroTinta = t(\.erroTinta); infoFundo = t(\.infoFundo); infoTinta = t(\.infoTinta)
        neutroFundo = t(\.neutroFundo); neutroTinta = t(\.neutroTinta); erro = t(\.erro)
        skeleton = t(\.skeleton); sombra1 = t(\.sombra1); sombra2 = t(\.sombra2)
    }
}

/// Tema do app: a paleta do clube em uso (ou a do TactiPlan, sem clube).
struct Tema: Equatable {
    let cores: CoresTema
    let personalizacao: Personalizacao?

    init(_ p: Personalizacao? = nil) {
        personalizacao = p
        cores = CoresTema(coresDoClube(p, escuro: false), coresDoClube(p, escuro: true))
    }
}

/// Paleta sem clube, para o que fica fora do `\.tema` (aparência do UIKit).
let CORES_PADRAO = Tema().cores

/// Tom de faixa/selo.
enum Tom { case ok, aviso, erro, info, neutro }

extension CoresTema {
    func fundo(_ t: Tom) -> CorTema {
        switch t {
        case .ok: return okFundo
        case .aviso: return avisoFundo
        case .erro: return erroFundo
        case .info: return infoFundo
        case .neutro: return neutroFundo
        }
    }

    func tinta(_ t: Tom) -> CorTema {
        switch t {
        case .ok: return okTinta
        case .aviso: return avisoTinta
        case .erro: return erroTinta
        case .info: return infoTinta
        case .neutro: return neutroTinta
        }
    }
}

private struct TemaChave: EnvironmentKey {
    static let defaultValue = Tema()
}

private struct ContextoChave: EnvironmentKey {
    static let defaultValue: ContextoClube? = nil
}

extension EnvironmentValues {
    var tema: Tema {
        get { self[TemaChave.self] }
        set { self[TemaChave.self] = newValue }
    }

    /// O clube em uso (papel, permissões, só leitura). nil fora da casca.
    var contexto: ContextoClube? {
        get { self[ContextoChave.self] }
        set { self[ContextoChave.self] = newValue }
    }
}

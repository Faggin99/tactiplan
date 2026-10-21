import Foundation

// "Exigir Face ID/biometria ao abrir" (Mais › Segurança), copiado do Gestsport. Desligado
// por padrão; a escolha fica no cofre do aparelho (Keychain / prefs do cofre).
// Regra pura (paridade: dados/TravaApp.kt): abrir o app frio com a opção ligada
// bloqueia; voltar do segundo plano bloqueia só depois da carência (1 min) — o
// próprio pedido de biometria/senha do sistema não conta como "saiu do app".

/// Chave da preferência no cofre ("1" = ligada; ausente = desligada).
public let CHAVE_BIOMETRIA = "pref:biometria"

/// Voltar do segundo plano antes disso não pede de novo.
public let CARENCIA_BIOMETRIA_MS: Int64 = 60_000

public func biometriaLigada(_ a: Armazem?) -> Bool { a?.ler(CHAVE_BIOMETRIA) == "1" }

public func gravarBiometria(_ a: Armazem?, _ ligada: Bool) {
    if ligada { a?.gravar(CHAVE_BIOMETRIA, "1") } else { a?.remover(CHAVE_BIOMETRIA) }
}

public struct TravaApp: Equatable, Sendable {
    public private(set) var bloqueada: Bool
    public private(set) var noFundoDesde: Int64?

    /// App aberto do zero: bloqueado se a opção está ligada.
    public init(ligada: Bool) { bloqueada = ligada }

    /// Foi pro segundo plano (conta a 1ª vez; idas repetidas não empurram o relógio).
    public mutating func foiProFundo(agora: Int64) {
        if noFundoDesde == nil { noFundoDesde = agora }
    }

    /// Voltou: com a opção ligada e fora há ≥ carência, bloqueia.
    public mutating func voltou(agora: Int64, ligada: Bool) {
        defer { noFundoDesde = nil }
        guard ligada, let desde = noFundoDesde else { return }
        if agora - desde >= CARENCIA_BIOMETRIA_MS { bloqueada = true }
    }

    public mutating func desbloqueou() { bloqueada = false }

    /// Desligar a opção nunca deixa o app travado.
    public mutating func mudouOpcao(ligada: Bool) {
        if !ligada { bloqueada = false }
    }
}

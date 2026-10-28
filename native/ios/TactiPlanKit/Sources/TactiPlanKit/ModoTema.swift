// Aparência escolhida na aba Mais (28/10/2026): Automático segue o aparelho; Claro/Escuro fixam,
// para não depender só do modo do sistema (que no iPhone pode mudar com a hora do dia).
// Paridade: dados/ModoTema.kt (Android).

public enum ModoTema: String, CaseIterable, Sendable, Identifiable {
    case automatico, claro, escuro

    public var id: String { rawValue }
    public var rotulo: String {
        switch self {
        case .automatico: return "Automático"
        case .claro: return "Claro"
        case .escuro: return "Escuro"
        }
    }
    /// nil = segue o aparelho.
    public var escuroFixo: Bool? {
        switch self {
        case .automatico: return nil
        case .claro: return false
        case .escuro: return true
        }
    }
    public static let chavePreferencia = "modo_tema"
    public static func de(_ chave: String?) -> ModoTema { chave.flatMap(ModoTema.init(rawValue:)) ?? .automatico }
}

public let TEXTO_MODO_TEMA = "Automático segue o modo claro ou escuro do aparelho."

import Foundation

// Os dois ESCUDOS do jogo na Semana e no Dia (web: components/training/LogosDoJogo.jsx): MANDANTE primeiro ×
// visitante. Mando 'away' = o adversário em casa (ele vem primeiro); casa, neutro ou sem mando = o nosso clube
// primeiro. Sem imagem: a sigla do nome numa placa (o nosso na cor do clube). Embaixo vai o HORÁRIO ("19h30"),
// não "casa/fora" — a ordem dos escudos já diz o mando. Paridade: dados/treino/EscudosJogo.kt (Android).

public struct Escudo: Equatable, Sendable {
    /// URL (relativa do servidor ou absoluta); nil = sigla.
    public let url: String?
    public let nome: String
    /// O nosso clube?
    public let nosso: Bool
    public var sigla: String { siglaDoEscudo(nome) }
}

/// A sigla do web: iniciais das palavras com mais de 2 letras (ou que começam com maiúscula), até 3. Vazio = "?".
/// "Esporte Clube Vila Nova" → "ECV" · "Rival FC" → "RF" · "uberlândia" → "U".
public func siglaDoEscudo(_ nome: String?) -> String {
    let partes = (nome ?? "").split(whereSeparator: { $0.isWhitespace }).map(String.init)
    let ok = partes.filter { p in
        p.count > 2 || (p.first.map { $0.isUppercase } ?? false)
    }
    let s = String(ok.compactMap(\.first).prefix(3)).uppercased()
    return s.isEmpty ? "?" : s
}

/// Mandante primeiro: (casa, fora).
public func escudosDoJogo(nossoNome: String, nossoLogo: String?, adversario: String?, adversarioLogo: String?,
                          mando: String?) -> (casa: Escudo, fora: Escudo) {
    let a = (adversario ?? "").trimmingCharacters(in: .whitespaces)
    let nosso = Escudo(url: nossoLogo?.isEmpty == false ? nossoLogo : nil, nome: nossoNome, nosso: true)
    let deles = Escudo(url: adversarioLogo?.isEmpty == false ? adversarioLogo : nil, nome: a.isEmpty ? "Adversário" : a, nosso: false)
    return mando == "away" ? (deles, nosso) : (nosso, deles)
}

/// "19:30" / "19:30:00" → "19h30" (nil sem horário).
public func horarioDoJogo(_ kickoff: String?) -> String? {
    guard let k = kickoff?.trimmingCharacters(in: .whitespaces), !k.isEmpty else { return nil }
    return String(k.prefix(5)).replacingOccurrences(of: ":", with: "h")
}

/// O período de jogo do dia (nil = não tem jogo).
public func periodoDeJogo(_ d: Dia) -> Dia? { d.listaPeriodos.first { $0.tipo == .jogo } }

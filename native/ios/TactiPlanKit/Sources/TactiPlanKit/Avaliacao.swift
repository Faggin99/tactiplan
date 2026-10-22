import Foundation

// Período de AVALIAÇÃO (session_type "assessment", migration 059 do servidor).
// Sem blocos de atividade: a ÚNICA informação é o tipo de avaliação (lista fixa, seleção múltipla)
// + "Outra" com texto curto (até 60). Pode ficar ao lado de treino ou jogo, ou sozinho no dia.
// NÃO entra nas estatísticas (minutos, pilares, sessões). Regras iguais a frontend/src/lib/periodos.js
// (paridade: native/paridade/avaliacao.json). Paridade Android: dados/treino/Avaliacao.kt.

public enum TipoAvaliacao: String, CaseIterable, Codable, Equatable, Sendable {
    case fisica, tecnica, tatica, fisiologica, antropometrica, psicologica, outra

    public var rotulo: String {
        switch self {
        case .fisica: return "Física"
        case .tecnica: return "Técnica"
        case .tatica: return "Tática"
        case .fisiologica: return "Fisiológica/Médica"
        case .antropometrica: return "Antropométrica"
        case .psicologica: return "Psicológica"
        case .outra: return "Outra"
        }
    }
}

public let MAX_OUTRA_AVALIACAO = 60

/// Resultado da conferência da escolha (mesma regra do servidor).
public struct EscolhaAvaliacao: Equatable, Sendable {
    public let ok: Bool
    public let tipos: [String]
    public let outra: String?
    public let erro: String?
}

/// Só tipos da lista, sem repetir, na ordem da lista; "Outra" só com texto (aparado, até 60).
public func normalizarAvaliacao(tipos: [String]?, outra: String?) -> EscolhaAvaliacao {
    let lista = (tipos ?? []).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
    if let x = lista.first(where: { !$0.isEmpty && TipoAvaliacao(rawValue: $0) == nil }) {
        return EscolhaAvaliacao(ok: false, tipos: [], outra: nil, erro: "Tipo de avaliação inválido: \(x)")
    }
    let texto = (outra ?? "").split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    if texto.count > MAX_OUTRA_AVALIACAO {
        return EscolhaAvaliacao(ok: false, tipos: [], outra: nil, erro: "\"Outra\" aceita até \(MAX_OUTRA_AVALIACAO) caracteres")
    }
    var set = Set(lista.filter { !$0.isEmpty })
    if !texto.isEmpty { set.insert("outra") }
    if set.contains("outra") && texto.isEmpty {
        return EscolhaAvaliacao(ok: false, tipos: [], outra: nil, erro: "Diga qual é a outra avaliação")
    }
    return EscolhaAvaliacao(ok: true, tipos: TipoAvaliacao.allCases.map(\.rawValue).filter { set.contains($0) },
                            outra: texto.isEmpty ? nil : texto, erro: nil)
}

/// "Física", "Técnica", "Yo-Yo" — "Outra" vira o texto digitado.
public func rotulosAvaliacao(_ d: Dia) -> [String] {
    (d.tiposAvaliacao ?? []).compactMap { t -> String? in
        if t == "outra" {
            let o = (d.outraAvaliacao ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            return o.isEmpty ? "Outra" : o
        }
        return TipoAvaliacao(rawValue: t)?.rotulo
    }
}

/// "Física, Técnica" ("" sem tipo).
public func textoAvaliacao(_ d: Dia) -> String { rotulosAvaliacao(d).joined(separator: ", ") }

/// 1ª linha da coluna / carrossel do web: "Manhã · Avaliação", "Tarde · Jogo", "Manhã · Tático | Físico".
/// `pilares` = rótulos dos pilares (só no treino).
public func rotuloLinhaPeriodo(_ d: Dia, pilares: [String] = []) -> String {
    let per = periodoEfetivo(d)?.rotulo
    let resto: [String]
    switch d.tipo {
    case .avaliacao: resto = ["Avaliação"]
    case .jogo: resto = ["Jogo"]
    default: resto = pilares
    }
    let r = resto.joined(separator: " | ")
    guard let per else { return r }
    return r.isEmpty ? per : "\(per) · \(r)"
}

/// Minutos do período (avaliação = 0; atividades antigas de quando era treino não contam).
public func minutosDoPeriodo(_ d: Dia) -> Int { resumoDoDia(d).minutos }

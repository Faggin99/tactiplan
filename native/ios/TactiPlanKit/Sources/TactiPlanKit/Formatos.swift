import Foundation

// Formatadores pt-BR puros (sem relógio nem fuso escondidos — testáveis no Linux).
// Paridade: util/Formatos.kt (Android).

public func agoraMs() -> Int64 { Int64((Date().timeIntervalSince1970 * 1000).rounded(.down)) }

/// "football_11" → "Futebol 11". Desconhecido/vazio → "".
public func rotuloModalidade(_ m: String?) -> String {
    switch m {
    case "football_11": return "Futebol 11"
    case "football_7": return "Futebol 7"
    case "futsal": return "Futsal"
    default: return ""
    }
}

/// "Marcos Andrade" → "MA"; "ana" → "A"; vazio → "?".
public func iniciais(_ nome: String?) -> String {
    let partes = (nome ?? "").split(whereSeparator: { $0 == " " || $0 == "\t" }).filter { !$0.isEmpty }
    guard let primeira = partes.first?.first else { return "?" }
    var s = String(primeira)
    if partes.count > 1, let ultima = partes.last?.first { s.append(ultima) }
    return s.uppercased()
}

/// Primeiro nome para a saudação ("Olá, Marcos."). Vazio → nil.
public func primeiroNome(_ nome: String?) -> String? {
    guard let p = (nome ?? "").split(separator: " ").first, !p.isEmpty else { return nil }
    return String(p)
}

/// Lista curta: até `maximo` itens separados por vírgula; o resto vira "+N".
/// ["Sub-15","Sub-17","Sub-20","Sub-11"] (3) → "Sub-15, Sub-17, Sub-20 +1".
public func listaCurta(_ itens: [String], maximo: Int = 3) -> String {
    let limpos = itens.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    guard limpos.count > maximo, maximo > 0 else { return limpos.joined(separator: ", ") }
    return limpos.prefix(maximo).joined(separator: ", ") + " +\(limpos.count - maximo)"
}

/// "1 convite" / "2 convites" (contagem com a palavra no singular ou plural).
public func contagem(_ n: Int, _ singular: String, _ plural: String) -> String {
    "\(n) \(n == 1 ? singular : plural)"
}

/// Rodapé do Mais: "TactiPlan · versão 1.0.0 (7)". Sem build → só a versão.
public func rotuloVersao(_ versao: String?, _ build: String?) -> String {
    let v = (versao ?? "").trimmingCharacters(in: .whitespaces)
    let b = (build ?? "").trimmingCharacters(in: .whitespaces)
    guard !v.isEmpty else { return "TactiPlan" }
    return b.isEmpty || b == v ? "TactiPlan · versão \(v)" : "TactiPlan · versão \(v) (\(b))"
}

/// Compara versões "1.2.10" × "1.10" numericamente: -1, 0 ou 1. Parte não numérica conta 0.
public func compararVersoes(_ a: String, _ b: String) -> Int {
    let pa = a.split(separator: ".").map { Int($0.prefix { $0.isNumber }) ?? 0 }
    let pb = b.split(separator: ".").map { Int($0.prefix { $0.isNumber }) ?? 0 }
    for i in 0..<max(pa.count, pb.count) {
        let x = i < pa.count ? pa[i] : 0
        let y = i < pb.count ? pb[i] : 0
        if x != y { return x < y ? -1 : 1 }
    }
    return 0
}

/// O app instalado é mais velho que a versão mínima do servidor? (mostra "Atualize o app")
public func precisaAtualizar(instalada: String?, minima: String?) -> Bool {
    guard let i = instalada, !i.isEmpty, let m = minima, !m.isEmpty else { return false }
    return compararVersoes(i, m) < 0
}

/// Carimbo relativo ("atualizado há X"). `em` e `agora` em ms desde 1970.
public func tempoDesde(_ em: Int64, agora: Int64 = agoraMs()) -> String {
    let dif = agora - em
    let min = dif >= 0 ? dif / 60_000 : -((-dif + 59_999) / 60_000)
    if min < 1 { return "agora há pouco" }
    if min < 60 { return "há \(min) min" }
    let horas = min / 60
    if horas < 24 { return "há \(horas) h" }
    let dias = horas / 24
    return "há \(dias) dia\(dias > 1 ? "s" : "")"
}

/// Faixa âmbar de quando o app mostra o último dado por falta de rede.
public func textoSemConexao(_ em: Int64?, agora: Int64 = agoraMs()) -> String {
    guard let em else { return "Sem conexão — mostrando o que foi visto por último." }
    return "Sem conexão — mostrando o que foi visto por último · atualizado \(tempoDesde(em, agora: agora))"
}

private let FUSO_BR = TimeZone(identifier: "America/Sao_Paulo") ?? TimeZone(secondsFromGMT: -3 * 3600)!
private let MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
                     "setembro", "outubro", "novembro", "dezembro"]
private let DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]

/// "quarta, 21 de outubro" no fuso de Brasília (o "Hoje" das abas).
public func dataPorExtenso(_ ms: Int64 = agoraMs()) -> String {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = FUSO_BR
    let d = Date(timeIntervalSince1970: Double(ms) / 1000)
    let c = cal.dateComponents([.weekday, .day, .month], from: d)
    let dia = DIAS[((c.weekday ?? 1) - 1 + 7) % 7]
    let mes = MESES[((c.month ?? 1) - 1 + 12) % 12]
    return "\(dia), \(c.day ?? 1) de \(mes)"
}

/// "e-mail com cara de e-mail" (só para não mandar ao servidor o que é obviamente errado).
public func emailPlausivel(_ s: String) -> Bool {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let arroba = t.firstIndex(of: "@"), t.filter({ $0 == "@" }).count == 1 else { return false }
    let local = t[..<arroba], dominio = t[t.index(after: arroba)...]
    return !local.isEmpty && dominio.contains(".") && !dominio.hasPrefix(".") && !dominio.hasSuffix(".")
        && !t.contains(" ")
}

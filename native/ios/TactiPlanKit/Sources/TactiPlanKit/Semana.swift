import Foundation

// A SEMANA de treinos no celular: lista de 7 dias (no web é a grade 7 × 6). Regras puras,
// sem relógio escondido — as mesmas do web (frontend/src/pages/TrainingPage.jsx):
// - semana ISO "YYYY-WW" (o ano é o da quinta-feira), calculada no fuso de Brasília;
// - pilar predominante do dia POR TEMPO (soma os minutos de cada pilar; sem tempo
//   preenchido, conta atividades; empate mostra os dois);
// - dia que ainda não existe no banco vira um dia "vazio" com os 6 blocos de nome padrão.
// Paridade: dados/treino/Semana.kt (Android).

/// Nomes dos 6 blocos (backend-node/src/routes/microcycles.js).
public let NOMES_BLOCOS = ["Aquecimento", "Preparatório", "Atividade 1", "Atividade 2", "Atividade 3", "Complementos"]
/// Nomes dos dias, de segunda (1) a domingo (7).
public let NOMES_DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
public let SIGLAS_DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"]
private let MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

/// Os 4 pilares, na ordem do web, com a cor de cada um (UnifiedTrainingModal DIM_LIST).
public struct Pilar: Equatable, Sendable, Identifiable {
    public let id: String
    public let rotulo: String
    public let corHex: String
}

public let PILARES: [Pilar] = [
    Pilar(id: "tatico", rotulo: "Tático", corHex: "#3b82f6"),
    Pilar(id: "fisico", rotulo: "Físico", corHex: "#f59e0b"),
    Pilar(id: "tecnico", rotulo: "Técnico", corHex: "#a855f7"),
    Pilar(id: "mental", rotulo: "Mental", corHex: "#10b981"),
]

public func pilarDe(_ id: String?) -> Pilar? { PILARES.first { $0.id == id } }
public func rotuloPilar(_ id: String?) -> String { pilarDe(id)?.rotulo ?? (id ?? "") }

// MARK: datas (calendário gregoriano em UTC: as datas "YYYY-MM-DD" são dias, sem hora)

private let FUSO_BRASILIA = TimeZone(identifier: "America/Sao_Paulo") ?? TimeZone(secondsFromGMT: -3 * 3600)!

private var calendarioUTC: Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(secondsFromGMT: 0)!
    return c
}

/// "YYYY-MM-DD" → componentes (nil se inválida).
public func lerData(_ s: String) -> (ano: Int, mes: Int, dia: Int)? {
    let p = s.prefix(10).split(separator: "-").compactMap { Int($0) }
    guard p.count == 3, (1...12).contains(p[1]), (1...31).contains(p[2]) else { return nil }
    guard let d = calendarioUTC.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) else { return nil }
    let c = calendarioUTC.dateComponents([.year, .month, .day], from: d)
    guard c.year == p[0], c.month == p[1], c.day == p[2] else { return nil }
    return (p[0], p[1], p[2])
}

private func dataDe(_ s: String) -> Date? {
    guard let d = lerData(s) else { return nil }
    return calendarioUTC.date(from: DateComponents(year: d.ano, month: d.mes, day: d.dia))
}

private func textoDe(_ d: Date) -> String {
    let c = calendarioUTC.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

/// Soma dias a uma data "YYYY-MM-DD".
public func somarDias(_ s: String, _ n: Int) -> String {
    guard let d = dataDe(s), let r = calendarioUTC.date(byAdding: .day, value: n, to: d) else { return s }
    return textoDe(r)
}

/// Hoje no fuso de Brasília ("YYYY-MM-DD").
public func hojeBrasilia(_ ms: Int64 = agoraMs()) -> String {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = FUSO_BRASILIA
    let d = Date(timeIntervalSince1970: Double(ms) / 1000)
    let k = c.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", k.year ?? 0, k.month ?? 0, k.day ?? 0)
}

/// 1 = segunda … 7 = domingo.
public func diaDaSemanaISO(_ s: String) -> Int {
    guard let d = dataDe(s) else { return 1 }
    let w = calendarioUTC.component(.weekday, from: d) // 1 = domingo
    return w == 1 ? 7 : w - 1
}

/// Segunda-feira da semana da data.
public func segundaDaSemana(_ s: String) -> String { somarDias(s, -(diaDaSemanaISO(s) - 1)) }

/// Semana ISO: ano da quinta-feira + número da semana. "2026-10-21" → (2026, 43, "2026-43").
public struct SemanaISO: Equatable, Hashable, Sendable {
    public let ano: Int
    public let numero: Int
    /// Segunda-feira ("YYYY-MM-DD").
    public let segunda: String
    /// "YYYY-WW" (o week_identifier do banco).
    public var identificador: String { String(format: "%04d-%02d", ano, numero) }
    public var domingo: String { somarDias(segunda, 6) }
    /// As 7 datas, de segunda a domingo.
    public var datas: [String] { (0..<7).map { somarDias(segunda, $0) } }

    public init(ano: Int, numero: Int, segunda: String) { self.ano = ano; self.numero = numero; self.segunda = segunda }

    /// A semana de uma data.
    public init(data: String) {
        let seg = segundaDaSemana(data)
        let quinta = somarDias(seg, 3)
        let ano = lerData(quinta)?.ano ?? 1970
        let inicioAno = String(format: "%04d-01-01", ano)
        let diasDesde = calendarioUTC.dateComponents([.day], from: dataDe(inicioAno) ?? Date(), to: dataDe(quinta) ?? Date()).day ?? 0
        self.init(ano: ano, numero: diasDesde / 7 + 1, segunda: seg)
    }

    public func somando(semanas n: Int) -> SemanaISO { SemanaISO(data: somarDias(segunda, 7 * n)) }
    public func contem(_ data: String) -> Bool { datas.contains(String(data.prefix(10))) }
}

/// "19–25 out" · "28 set – 4 out" · "29 dez – 4 jan".
public func rotuloPeriodo(_ s: SemanaISO) -> String {
    guard let a = lerData(s.segunda), let b = lerData(s.domingo) else { return s.identificador }
    if a.mes == b.mes { return "\(a.dia)–\(b.dia) \(MESES_CURTOS[b.mes - 1])" }
    return "\(a.dia) \(MESES_CURTOS[a.mes - 1]) – \(b.dia) \(MESES_CURTOS[b.mes - 1])"
}

/// "Quarta, 21/10".
public func rotuloDiaCurto(_ data: String) -> String {
    guard let d = lerData(data) else { return data }
    return String(format: "%@, %02d/%02d", NOMES_DIAS[diaDaSemanaISO(data) - 1], d.dia, d.mes)
}

/// "quarta, 21/10" (dentro de frase: "Hoje · quarta, 21/10").
public func rotuloDiaMinusculo(_ data: String) -> String { rotuloDiaCurto(data).lowercased() }

/// ("QUA", "21") para a coluna da linha do dia.
public func siglaEDia(_ data: String) -> (sigla: String, dia: String) {
    (SIGLAS_DIAS[diaDaSemanaISO(data) - 1], lerData(data).map { String($0.dia) } ?? "")
}

/// "21/10/2026" (nome do PDF, datas por extenso curtas).
public func dataBR(_ data: String) -> String {
    guard let d = lerData(data) else { return data }
    return String(format: "%02d/%02d/%04d", d.dia, d.mes, d.ano)
}

/// A data já passou (em relação a hoje)? — o web confirma antes de mudar treino de data passada.
public func dataPassada(_ data: String, hoje: String) -> Bool { String(data.prefix(10)) < hoje }

// MARK: os 7 dias

/// Dia que ainda não existe no banco: os 6 blocos com o nome padrão, sem ids.
public func diaVazio(_ data: String) -> Dia {
    let dow = diaDaSemanaISO(data)
    return Dia(id: nil, data: data, nomeDia: NOMES_DIAS[dow - 1], diaDaSemana: dow, tipoBruto: nil,
               blocos: NOMES_BLOCOS.enumerated().map { Bloco(id: nil, nome: $0.element, ordem: $0.offset + 1) })
}

/// Os 7 dias da semana: os do microciclo (por data) e, onde faltar, o dia vazio.
public func diasDaSemana(_ m: Microciclo?, _ s: SemanaISO) -> [Dia] {
    s.datas.map { data in
        if var d = m?.dias.first(where: { $0.data == data }) {
            if d.blocos.isEmpty { d.blocos = diaVazio(data).blocos }
            return d
        }
        return diaVazio(data)
    }
}

// MARK: resumo do dia (a linha da Semana e o topo do Dia)

public struct ResumoDia: Equatable, Sendable {
    public let tipo: TipoDia
    /// Pilar(es) predominante(s) por TEMPO (empate = mais de um). Vazio = dia sem atividade.
    public let pilares: [String]
    /// Minutos por pilar (para a barra), na ordem dos PILARES; só os que têm atividade.
    public let minutosPorPilar: [(pilar: String, minutos: Int)]
    public let minutos: Int
    public let blocosComAtividade: Int
    public let atividades: Int
    public let anexos: Int
    public let distanciaKm: Double?
    public let adversario: String?
    /// Tipos de avaliação do dia ("Física, Técnica"); nil sem período de avaliação.
    public var avaliacao: String? = nil

    public static func == (a: ResumoDia, b: ResumoDia) -> Bool {
        a.tipo == b.tipo && a.pilares == b.pilares && a.minutos == b.minutos && a.atividades == b.atividades
            && a.blocosComAtividade == b.blocosComAtividade && a.anexos == b.anexos && a.distanciaKm == b.distanciaKm
            && a.adversario == b.adversario && a.avaliacao == b.avaliacao
            && a.minutosPorPilar.map { "\($0.pilar):\($0.minutos)" } == b.minutosPorPilar.map { "\($0.pilar):\($0.minutos)" }
    }

    /// "Tático" · "Tático e Físico".
    public var rotuloPilares: String {
        let r = pilares.map(rotuloPilar)
        if r.count <= 1 { return r.first ?? "" }
        return r.dropLast().joined(separator: ", ") + " e " + r.last!
    }
}

public func resumoDoDia(_ d: Dia) -> ResumoDia {
    // avaliação: sem blocos, sem minutos (não entra em nada das estatísticas)
    if d.tipo == .avaliacao {
        return ResumoDia(tipo: .avaliacao, pilares: [], minutosPorPilar: [], minutos: 0, blocosComAtividade: 0,
                         atividades: 0, anexos: 0, distanciaKm: nil, adversario: nil, avaliacao: textoAvaliacao(d))
    }
    var minPorPilar: [String: Int] = [:]
    var cntPorPilar: [String: Int] = [:]
    var total = 0, blocos = 0, anexos = 0
    for b in d.blocos {
        guard let a = b.atividade else { continue }
        blocos += 1
        let m = max(0, a.minutos ?? 0)
        total += m
        anexos += max(0, a.anexos ?? 0)
        let dims = Array(Set((a.conteudos ?? []).compactMap(\.dimensao).filter { !$0.isEmpty }))
        for dim in dims {
            minPorPilar[dim, default: 0] += m
            cntPorPilar[dim, default: 0] += 1
        }
    }
    let dims = Array(cntPorPilar.keys)
    var predominantes: [String] = []
    if !dims.isEmpty {
        let temTempo = dims.contains { (minPorPilar[$0] ?? 0) > 0 }
        let peso = { (k: String) -> Int in temTempo ? (minPorPilar[k] ?? 0) : (cntPorPilar[k] ?? 0) }
        let maior = dims.map(peso).max() ?? 0
        predominantes = dims.filter { peso($0) == maior }
        let ordem = PILARES.map(\.id)
        predominantes.sort { (ordem.firstIndex(of: $0) ?? 99, $0) < (ordem.firstIndex(of: $1) ?? 99, $1) }
    }
    let ordem = PILARES.map(\.id) + dims.filter { pilarDe($0) == nil }.sorted()
    let barra = ordem.compactMap { k -> (pilar: String, minutos: Int)? in
        guard cntPorPilar[k] != nil else { return nil }
        return (k, minPorPilar[k] ?? 0)
    }
    return ResumoDia(tipo: d.tipo, pilares: predominantes, minutosPorPilar: barra, minutos: total,
                     blocosComAtividade: blocos, atividades: blocos, anexos: anexos,
                     distanciaKm: d.tipo == .treino ? d.distanciaKm : nil, adversario: d.adversario)
}

/// Texto da linha do dia na Semana: "Treino · Tático" · "Jogo vs Rival FC" · "Descanso" · "Treino".
public func tituloDaLinha(_ r: ResumoDia) -> String {
    switch r.tipo {
    case .jogo:
        let a = (r.adversario ?? "").trimmingCharacters(in: .whitespaces)
        return a.isEmpty ? "Jogo" : "Jogo vs \(a)"
    case .descanso: return "Descanso"
    case .avaliacao: return "Avaliação"
    case .treino: return r.pilares.isEmpty ? "Treino" : "Treino · \(r.rotuloPilares)"
    }
}

/// Detalhes da linha: "88 min · 5,8 km" (só o que existe). Jogo/descanso sem atividade: "".
public func detalheDaLinha(_ r: ResumoDia) -> String {
    var p: [String] = []
    if r.minutos > 0 { p.append("\(r.minutos) min") }
    if let km = r.distanciaKm { p.append("\(formatarKm(km)) km") }
    if r.tipo == .treino && r.atividades == 0 { p.append("Sem atividades") }
    if let av = r.avaliacao { p.append(av.isEmpty ? "Avaliação" : (r.tipo == .avaliacao ? av : "Avaliação: \(av)")) }
    return p.joined(separator: " · ")
}

/// "Pilar predominante Tático · 5 blocos · 7 atividades" (frase do herói de hoje).
public func fraseDoHeroi(_ r: ResumoDia) -> String {
    switch r.tipo {
    case .descanso: return "Dia de descanso"
    case .avaliacao: return "Dia de avaliação"
    case .jogo:
        let a = (r.adversario ?? "").trimmingCharacters(in: .whitespaces)
        return a.isEmpty ? "Dia de jogo" : "Jogo vs \(a)"
    case .treino:
        guard r.atividades > 0 else { return "Nenhuma atividade planejada" }
        var p: [String] = []
        if !r.pilares.isEmpty { p.append("Pilar predominante \(r.rotuloPilares)") }
        p.append(contagem(r.atividades, "atividade", "atividades"))
        if r.anexos > 0 { p.append(contagem(r.anexos, "anexo", "anexos")) }
        return p.joined(separator: " · ")
    }
}

// MARK: distância ideal (km) — utils/distancia.js do web

/// 5.2 → "5,2" · 5.25 → "5,25" · 5 → "5" (até 2 casas, vírgula).
public func formatarKm(_ km: Double?) -> String {
    guard let km, km.isFinite else { return "" }
    let centavos = Int((km * 100).rounded())
    let inteiro = centavos / 100
    let frac = abs(centavos % 100)
    if frac == 0 { return "\(inteiro)" }
    if frac % 10 == 0 { return "\(inteiro),\(frac / 10)" }
    return String(format: "%d,%02d", inteiro, frac)
}

public enum ResultadoKm: Equatable, Sendable {
    /// nil = limpar
    case ok(Double?)
    case erro(String)
}

public let MSG_KM_INVALIDO = "Distância inválida: use um número com até 2 casas decimais (ex.: 5,2)."
public let MSG_KM_GRANDE = "A distância ideal deve ser menor que 100 km."

/// Texto digitado ("5,2", "5.25", "") → km (nil = limpar) ou a mensagem do web.
public func lerKm(_ texto: String) -> ResultadoKm {
    let s = texto.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")
    if s.isEmpty { return .ok(nil) }
    guard s.range(of: #"^\d+(\.\d{1,2})?$"#, options: .regularExpression) != nil, let n = Double(s) else {
        return .erro(MSG_KM_INVALIDO)
    }
    if n >= 100 { return .erro(MSG_KM_GRANDE) }
    return .ok(n)
}

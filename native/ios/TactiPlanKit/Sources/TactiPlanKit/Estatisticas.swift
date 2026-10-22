import Foundation

// Estatísticas (T3), como o TrainingStatsPage do web: filtros de período, Treino (cards, pilares,
// conteúdos, distância ideal, top atividades) e Jogos (4 cards, rankings, minutagem completa).
// As MESMAS rotas /api/stats do web. Paridade: dados/estatisticas/Estatisticas.kt e
// native/paridade/t3.json (períodos, formatMinutes, cards e ordenação da minutagem).

// MARK: filtros de período

public enum FiltroPeriodo: String, CaseIterable, Sendable, Equatable {
    case umMicro = "1-micro", quatroMicros = "4-micros", semestre = "semester", ano = "1-year", personalizado = "custom"

    public var rotulo: String {
        switch self {
        case .umMicro: return "1 Microciclo"
        case .quatroMicros: return "4 Microciclos"
        case .semestre: return "Semestre"
        case .ano: return "1 Ano"
        case .personalizado: return "Personalizado"
        }
    }

    /// Os filtros de semana andam com as setas; os outros têm data inicial.
    public var porSemana: Bool { self == .umMicro || self == .quatroMicros }
}

public struct Intervalo: Equatable, Sendable {
    public var inicio: String
    public var fim: String
    public init(inicio: String, fim: String) { self.inicio = inicio; self.fim = fim }
}

/// Período do filtro. Semana: a segunda da semana de `referencia` (1 micro = 7 dias, 4 micros = 28).
/// Semestre/ano: o da data `referencia`. Personalizado: nil (a pessoa escolhe as duas datas).
public func periodoDoFiltro(_ f: FiltroPeriodo, referencia: String) -> Intervalo? {
    let y = String(referencia.prefix(4))
    let mes = Int(referencia.dropFirst(5).prefix(2)) ?? 1
    switch f {
    case .umMicro:
        let s = SemanaISO(data: referencia)
        return Intervalo(inicio: s.segunda, fim: somarDias(s.segunda, 6))
    case .quatroMicros:
        let s = SemanaISO(data: referencia)
        return Intervalo(inicio: s.segunda, fim: somarDias(s.segunda, 27))
    case .semestre:
        return mes <= 6 ? Intervalo(inicio: "\(y)-01-01", fim: "\(y)-06-30") : Intervalo(inicio: "\(y)-07-01", fim: "\(y)-12-31")
    case .ano:
        return Intervalo(inicio: "\(y)-01-01", fim: "\(y)-12-31")
    case .personalizado:
        return nil
    }
}

/// Semestre/ano: mudar a data inicial recalcula o fim (30/06 ou 31/12 daquele ano).
public func fimAoMudarInicio(_ f: FiltroPeriodo, inicio: String) -> String? {
    let y = String(inicio.prefix(4))
    let mes = Int(inicio.dropFirst(5).prefix(2)) ?? 1
    switch f {
    case .semestre: return mes <= 6 ? "\(y)-06-30" : "\(y)-12-31"
    case .ano: return "\(y)-12-31"
    default: return nil
    }
}

/// "19/10 – 25/10" (rótulo curto do intervalo).
public func rotuloIntervalo(_ i: Intervalo) -> String {
    "\(diaMes(i.inicio) ?? i.inicio) – \(diaMes(i.fim) ?? i.fim)"
}

/// O rótulo do período que vai no PDF ("1 Microciclo"…).
public func rotuloDoPeriodoPdf(_ f: FiltroPeriodo) -> String { f.rotulo }

// MARK: formatos

/// formatMinutes do web: 0 → "0min"; "45min"; "2h"; "1h 5min".
public func formatarMinutos(_ min: Int) -> String {
    if min <= 0 { return "0min" }
    let h = min / 60, m = min % 60
    if h == 0 { return "\(m)min" }
    if m == 0 { return "\(h)h" }
    return "\(h)h \(m)min"
}

/// `dec` do web: número com vírgula, sem casas fixas (1.5 → "1,5", 2 → "2").
public func decimalWeb(_ v: Double?) -> String {
    let x = v ?? 0
    if x.rounded() == x && abs(x) < 1e15 { return String(Int(x)) }
    return String(x).replacingOccurrences(of: ".", with: ",")
}

// MARK: pilares

public struct PilarInfo: Equatable, Sendable {
    public let id: String
    public let rotulo: String
    public let cor: String
}

public let PILARES_STATS: [PilarInfo] = [
    PilarInfo(id: "tatico", rotulo: "Tático", cor: "#3b82f6"),
    PilarInfo(id: "fisico", rotulo: "Físico", cor: "#f59e0b"),
    PilarInfo(id: "tecnico", rotulo: "Técnico", cor: "#a855f7"),
    PilarInfo(id: "mental", rotulo: "Mental", cor: "#10b981"),
]
public func pilarStats(_ id: String?) -> PilarInfo? { PILARES_STATS.first { $0.id == id } }

public enum ModoPilar: String, CaseIterable, Sendable {
    case sessoes = "sessions", atividades = "count", tempo = "minutes"
    public var rotulo: String {
        switch self { case .sessoes: return "Por sessão"; case .atividades: return "Nº atividades"; case .tempo: return "Tempo" }
    }
    public var descricao: String {
        switch self {
        case .sessoes: return "Frequência: em quantas sessões cada conteúdo apareceu (1× por sessão, mesmo que repita dentro do dia)."
        case .atividades: return "Volume: cada atividade conta individualmente. Uma sessão com 3 atividades de OO contabiliza 3 pra OO."
        case .tempo: return "Carga: soma o tempo de todas as atividades. Submomentos não usam tempo (uma atividade pode marcar vários)."
        }
    }
}

// MARK: modelos do treino

public struct ItemPilar: Codable, Equatable, Sendable {
    public var dimensao: String
    public var rotulo: String?
    public var quantidade: Int
    public var minutos: Int
    public var sessoes: Int
    enum CodingKeys: String, CodingKey { case dimensao = "dimension", rotulo = "label", quantidade = "count", minutos = "minutes", sessoes = "sessions" }
    public init(dimensao: String, rotulo: String? = nil, quantidade: Int = 0, minutos: Int = 0, sessoes: Int = 0) {
        self.dimensao = dimensao; self.rotulo = rotulo; self.quantidade = quantidade; self.minutos = minutos; self.sessoes = sessoes
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dimensao = (try? c.decodeIfPresent(String.self, forKey: .dimensao)) ?? ""
        rotulo = try? c.decodeIfPresent(String.self, forKey: .rotulo)
        quantidade = Int(c.numeroFlex(.quantidade) ?? 0)
        minutos = Int((c.numeroFlex(.minutos) ?? 0).rounded())
        sessoes = Int(c.numeroFlex(.sessoes) ?? 0)
    }
}

public struct ItemConteudo: Codable, Equatable, Sendable, Identifiable {
    public var conteudoId: String?
    public var subId: String?
    public var nome: String
    public var dimensao: String?
    public var quantidade: Int
    public var minutos: Int
    public var sessoes: Int
    public var id: String { subId ?? conteudoId ?? nome }
    enum CodingKeys: String, CodingKey {
        case conteudoId = "content_id", subId = "subcontent_id", nome = "name", dimensao = "dimension", quantidade = "count",
             minutos = "minutes", sessoes = "sessions"
    }
    public init(conteudoId: String? = nil, subId: String? = nil, nome: String, dimensao: String? = nil, quantidade: Int = 0,
                minutos: Int = 0, sessoes: Int = 0) {
        self.conteudoId = conteudoId; self.subId = subId; self.nome = nome; self.dimensao = dimensao
        self.quantidade = quantidade; self.minutos = minutos; self.sessoes = sessoes
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        conteudoId = try? c.decodeIfPresent(String.self, forKey: .conteudoId)
        subId = try? c.decodeIfPresent(String.self, forKey: .subId)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        dimensao = try? c.decodeIfPresent(String.self, forKey: .dimensao)
        quantidade = Int(c.numeroFlex(.quantidade) ?? 0)
        minutos = Int((c.numeroFlex(.minutos) ?? 0).rounded())
        sessoes = Int(c.numeroFlex(.sessoes) ?? 0)
    }
}

public struct ItemTitulo: Codable, Equatable, Sendable, Identifiable {
    public var tituloId: String?
    public var titulo: String
    public var dimensao: String?
    public var conteudo: String?
    public var quantidade: Int
    public var minutos: Int
    public var id: String { tituloId ?? titulo }
    enum CodingKeys: String, CodingKey { case tituloId = "title_id", titulo = "title", dimensao = "dimension", conteudo = "content_name", quantidade = "count", minutos = "minutes" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        tituloId = try? c.decodeIfPresent(String.self, forKey: .tituloId)
        titulo = (try? c.decodeIfPresent(String.self, forKey: .titulo)) ?? ""
        dimensao = try? c.decodeIfPresent(String.self, forKey: .dimensao)
        conteudo = try? c.decodeIfPresent(String.self, forKey: .conteudo)
        quantidade = Int(c.numeroFlex(.quantidade) ?? 0)
        minutos = Int((c.numeroFlex(.minutos) ?? 0).rounded())
    }
}

public struct PontoDistancia: Codable, Equatable, Sendable {
    public var rotulo: String
    public var km: Double?
    public var dias: Int
    enum CodingKeys: String, CodingKey { case rotulo = "label", km = "avgKm", dias = "days" }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        rotulo = (try? c.decodeIfPresent(String.self, forKey: .rotulo)) ?? ""
        km = c.numeroFlex(.km)
        dias = Int(c.numeroFlex(.dias) ?? 1)
    }
}

public struct DistanciaStats: Codable, Equatable, Sendable {
    public var diasComDado: Int
    public var mediaKm: Double?
    public var totalKm: Double?
    public var maiorKm: Double?
    public var granularidade: String?
    public var serie: [PontoDistancia]
    enum CodingKeys: String, CodingKey { case diasComDado = "daysWithData", mediaKm = "avgKm", totalKm, maiorKm = "maxKm", granularidade = "granularity", serie = "series" }
    public init() { diasComDado = 0; serie = [] }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        diasComDado = Int(c.numeroFlex(.diasComDado) ?? 0)
        mediaKm = c.numeroFlex(.mediaKm); totalKm = c.numeroFlex(.totalKm); maiorKm = c.numeroFlex(.maiorKm)
        granularidade = try? c.decodeIfPresent(String.self, forKey: .granularidade)
        serie = (try? c.decodeIfPresent([PontoDistancia].self, forKey: .serie)) ?? []
    }
}

public struct StatsTreino: Decodable, Equatable, Sendable {
    public var atividades: Int
    public var minutos: Int
    public var sessoes: Int
    public var porPilar: [ItemPilar]
    public var porPilarSessoes: [ItemPilar]
    public var porConteudo: [ItemConteudo]
    public var porConteudoSessoes: [ItemConteudo]
    public var porSubmomento: [ItemConteudo]
    public var topAtividades: [ItemTitulo]
    public var distancia: DistanciaStats

    struct Totais: Decodable {
        var activities: Double?; var minutes: Double?; var sessions: Double?
    }
    enum CodingKeys: String, CodingKey {
        case totals, byDimension, byDimensionPredominance, byContent, byContentPredominance, bySubcontent, topTitles, distance
    }
    public init(atividades: Int = 0, minutos: Int = 0, sessoes: Int = 0, porPilar: [ItemPilar] = [], porPilarSessoes: [ItemPilar] = [],
                porConteudo: [ItemConteudo] = [], porConteudoSessoes: [ItemConteudo] = [], porSubmomento: [ItemConteudo] = [],
                topAtividades: [ItemTitulo] = [], distancia: DistanciaStats = DistanciaStats()) {
        self.atividades = atividades; self.minutos = minutos; self.sessoes = sessoes; self.porPilar = porPilar
        self.porPilarSessoes = porPilarSessoes; self.porConteudo = porConteudo; self.porConteudoSessoes = porConteudoSessoes
        self.porSubmomento = porSubmomento; self.topAtividades = topAtividades; self.distancia = distancia
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let t = (try? c.decodeIfPresent(Totais.self, forKey: .totals)) ?? nil
        atividades = Int(t?.activities ?? 0); minutos = Int(t?.minutes ?? 0); sessoes = Int(t?.sessions ?? 0)
        porPilar = (try? c.decodeIfPresent([ItemPilar].self, forKey: .byDimension)) ?? []
        porPilarSessoes = (try? c.decodeIfPresent([ItemPilar].self, forKey: .byDimensionPredominance)) ?? []
        porConteudo = (try? c.decodeIfPresent([ItemConteudo].self, forKey: .byContent)) ?? []
        porConteudoSessoes = (try? c.decodeIfPresent([ItemConteudo].self, forKey: .byContentPredominance)) ?? []
        porSubmomento = (try? c.decodeIfPresent([ItemConteudo].self, forKey: .bySubcontent)) ?? []
        topAtividades = (try? c.decodeIfPresent([ItemTitulo].self, forKey: .topTitles)) ?? []
        distancia = (try? c.decodeIfPresent(DistanciaStats.self, forKey: .distance)) ?? DistanciaStats()
    }
    public var vazio: Bool { atividades == 0 }
    public var temDados: Bool { atividades > 0 || distancia.diasComDado > 0 }
}

/// "Conteúdo mais usado · <Pilar>": por pilar, o conteúdo de maior contagem (empate = o 1º).
public func maisUsadoPorPilar(_ s: StatsTreino) -> [(pilar: PilarInfo, conteudo: ItemConteudo)] {
    PILARES_STATS.compactMap { p in
        var melhor: ItemConteudo?
        for c in s.porConteudo where c.dimensao == p.id {
            if melhor == nil || c.quantidade > melhor!.quantidade { melhor = c }
        }
        return melhor.map { (p, $0) }
    }
}

public struct FatiaPilar: Equatable, Sendable, Identifiable {
    public let pilar: PilarInfo
    public let valor: Int
    public let pct: Int
    public var id: String { pilar.id }
}

/// Distribuição por pilar no modo escolhido (pilar zerado some; % = round(v/total*100)).
public func distribuicaoPilares(_ s: StatsTreino, modo: ModoPilar) -> [FatiaPilar] {
    let valores: [(PilarInfo, Int)] = PILARES_STATS.map { p in
        switch modo {
        case .sessoes: return (p, s.porPilarSessoes.first { $0.dimensao == p.id }?.sessoes ?? 0)
        case .atividades: return (p, s.porPilar.first { $0.dimensao == p.id }?.quantidade ?? 0)
        case .tempo: return (p, s.porPilar.first { $0.dimensao == p.id }?.minutos ?? 0)
        }
    }.filter { $0.1 > 0 }
    let total = valores.reduce(0) { $0 + $1.1 }
    return valores.map { FatiaPilar(pilar: $0.0, valor: $0.1, pct: total > 0 ? Int((Double($0.1) / Double(total) * 100).rounded()) : 0) }
}

/// Valor da distribuição no texto da legenda (sessões/atividades: número; tempo: "1h 5min").
public func textoValorPilar(_ v: Int, modo: ModoPilar) -> String { modo == .tempo ? formatarMinutos(v) : String(v) }

/// Conteúdos do pilar no modo (sessões → byContentPredominance; senão byContent), maior primeiro.
public func conteudosDoPilar(_ s: StatsTreino, pilar: String, modo: ModoPilar) -> [(item: ItemConteudo, valor: Int)] {
    let fonte = modo == .sessoes ? s.porConteudoSessoes : s.porConteudo
    return fonte.filter { $0.dimensao == pilar }
        .map { c in (c, modo == .sessoes ? c.sessoes : (modo == .tempo ? c.minutos : c.quantidade)) }
        .filter { $0.1 > 0 }
        .sorted { $0.1 > $1.1 }
}

/// Submomentos táticos (por contagem), opcionalmente de um conteúdo.
public func submomentosTaticos(_ s: StatsTreino, conteudoId: String? = nil) -> [ItemConteudo] {
    s.porSubmomento.filter { $0.dimensao == "tatico" && (conteudoId == nil || $0.conteudoId == conteudoId) }
        .sorted { $0.quantidade > $1.quantidade }
}

/// Número de km como o web (vírgula, 1 casa): 6.25 → "6,3".
public func kmTexto(_ km: Double?, casas: Int = 1) -> String {
    guard let km else { return "—" }
    // arredonda "para longe do zero" como o toLocaleString do web (6,25 → 6,3)
    let f = pow(10.0, Double(casas))
    let r = (km * f + (km >= 0 ? 1e-9 : -1e-9)).rounded(.toNearestOrAwayFromZero) / f
    return String(format: "%.\(casas)f", r).replacingOccurrences(of: ".", with: ",")
}

// MARK: modelos dos jogos

public struct ResultadoForma: Codable, Equatable, Sendable {
    public var resultado: String
    public var data: String?
    public var adversario: String?
    public var golsFeitos: Int
    public var golsSofridos: Int
    enum CodingKeys: String, CodingKey { case resultado = "result", data = "date", adversario = "opponent", golsFeitos = "goals_scored", golsSofridos = "goals_conceded" }
    public init(resultado: String = "draw", data: String? = nil, adversario: String? = nil, golsFeitos: Int = 0, golsSofridos: Int = 0) {
        self.resultado = resultado; self.data = data; self.adversario = adversario; self.golsFeitos = golsFeitos; self.golsSofridos = golsSofridos
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        resultado = (try? c.decodeIfPresent(String.self, forKey: .resultado)) ?? "draw"
        data = try? c.decodeIfPresent(String.self, forKey: .data)
        adversario = try? c.decodeIfPresent(String.self, forKey: .adversario)
        golsFeitos = Int(c.numeroFlex(.golsFeitos) ?? 0)
        golsSofridos = Int(c.numeroFlex(.golsSofridos) ?? 0)
    }
    /// "V" / "E" / "D".
    public var letra: String { resultado == "win" ? "V" : resultado == "loss" ? "D" : "E" }
}

public struct JogadorStats: Codable, Equatable, Sendable, Identifiable {
    public var atletaId: String
    public var nome: String
    public var camisa: Int?
    public var gols: Int
    public var assistencias: Int
    public var minutos: Int
    public var jogos: Int
    public var titular: Int
    public var entradas: Int
    public var relacionado: Int
    public var id: String { atletaId }
    enum CodingKeys: String, CodingKey {
        case atletaId = "athlete_id", nome = "name", camisa = "jersey_number", gols = "goals", assistencias = "assists", minutos = "minutes",
             jogos = "appearances", titular = "starts", entradas = "sub_entries", relacionado = "called_up"
    }
    public init(atletaId: String, nome: String, camisa: Int? = nil, gols: Int = 0, assistencias: Int = 0, minutos: Int = 0,
                jogos: Int = 0, titular: Int = 0, entradas: Int = 0, relacionado: Int = 0) {
        self.atletaId = atletaId; self.nome = nome; self.camisa = camisa; self.gols = gols; self.assistencias = assistencias
        self.minutos = minutos; self.jogos = jogos; self.titular = titular; self.entradas = entradas; self.relacionado = relacionado
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        atletaId = (try? c.decodeIfPresent(String.self, forKey: .atletaId)) ?? UUID().uuidString
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        camisa = c.numeroFlex(.camisa).map { Int($0) }
        func n(_ k: CodingKeys) -> Int { Int((c.numeroFlex(k) ?? 0).rounded()) }
        gols = n(.gols); assistencias = n(.assistencias); minutos = n(.minutos); jogos = n(.jogos); titular = n(.titular)
        entradas = n(.entradas); relacionado = n(.relacionado)
    }
}

public struct JogoMarcante: Codable, Equatable, Sendable {
    public var adversario: String?
    public var golsFeitos: Int
    public var golsSofridos: Int
    enum CodingKeys: String, CodingKey { case adversario = "opponent", golsFeitos = "goals_scored", golsSofridos = "goals_conceded" }
    public init(adversario: String?, golsFeitos: Int, golsSofridos: Int) { self.adversario = adversario; self.golsFeitos = golsFeitos; self.golsSofridos = golsSofridos }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        adversario = try? c.decodeIfPresent(String.self, forKey: .adversario)
        golsFeitos = Int(c.numeroFlex(.golsFeitos) ?? 0)
        golsSofridos = Int(c.numeroFlex(.golsSofridos) ?? 0)
    }
    /// "3×1 vs Rival".
    public var texto: String { "\(golsFeitos)×\(golsSofridos) vs \(adversario ?? "")" }
}

public struct StatsJogos: Decodable, Equatable, Sendable {
    public var jogos: Int = 0
    public var vitorias: Int = 0
    public var empates: Int = 0
    public var derrotas: Int = 0
    public var golsFeitos: Int = 0
    public var golsSofridos: Int = 0
    public var pontosGanhos: Int = 0
    public var pontosDisputados: Int = 0
    public var sequenciaVitorias: Int = 0
    public var sequenciaInvicta: Int = 0
    public var saldo: Int = 0
    public var mediaFeitos: Double = 0
    public var mediaSofridos: Double = 0
    public var semSofrer: Int = 0
    public var substituicoes: Int = 0
    public var substituicoesPorJogo: Double = 0
    public var minutoMedioTroca: Int?
    public var amarelos: Int = 0
    public var vermelhos: Int = 0
    public var assistencias: Int = 0
    public var faltasAcumuladas: Int = 0
    public var sextaFalta: Int = 0
    public var modalidade: String?
    public var maiorVitoria: JogoMarcante?
    public var maiorDerrota: JogoMarcante?
    public var forma: [ResultadoForma] = []
    public var artilheiros: [JogadorStats] = []
    public var assistentes: [JogadorStats] = []
    public var minutagem: [JogadorStats] = []
    public var banco: [JogadorStats] = []
    public var jogadores: [JogadorStats] = []
    public var minutosPossiveis: Int = 0

    enum CodingKeys: String, CodingKey {
        case jogos = "totalMatches", vitorias = "wins", empates = "draws", derrotas = "losses", golsFeitos = "totalGoalsScored",
             golsSofridos = "totalGoalsConceded", pontosGanhos = "pointsWon", pontosDisputados = "pointsPlayed",
             sequenciaVitorias = "winStreak", sequenciaInvicta = "unbeatenStreak", saldo = "goalDifference",
             mediaFeitos = "avgGoalsScored", mediaSofridos = "avgGoalsConceded", semSofrer = "cleanSheets",
             substituicoes = "substitutionsTotal",
             substituicoesPorJogo = "avgSubstitutionsPerGame", minutoMedioTroca = "avgSubstitutionMinute", amarelos = "yellowCards",
             vermelhos = "redCards", assistencias = "assists", faltasAcumuladas = "accumulatedFouls", sextaFalta = "sixthFouls",
             modalidade = "modality", maiorVitoria = "biggestWin", maiorDerrota = "biggestLoss", forma = "form",
             artilheiros = "topScorers", assistentes = "topAssisters", minutagem = "topMinutes", banco = "topSubEntries",
             jogadores = "playerStats", minutosPossiveis = "minutesPossible"
    }

    public init() {}

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func n(_ k: CodingKeys) -> Int { Int((c.numeroFlex(k) ?? 0).rounded()) }
        func o(_ k: CodingKeys) -> Int? { c.numeroFlex(k).map { Int($0.rounded()) } }
        func l(_ k: CodingKeys) -> [JogadorStats] { (try? c.decodeIfPresent([JogadorStats].self, forKey: k)) ?? [] }
        jogos = n(.jogos); vitorias = n(.vitorias); empates = n(.empates); derrotas = n(.derrotas)
        golsFeitos = n(.golsFeitos); golsSofridos = n(.golsSofridos); pontosGanhos = n(.pontosGanhos); pontosDisputados = n(.pontosDisputados)
        sequenciaVitorias = n(.sequenciaVitorias); sequenciaInvicta = n(.sequenciaInvicta); saldo = n(.saldo)
        mediaFeitos = c.numeroFlex(.mediaFeitos) ?? 0; mediaSofridos = c.numeroFlex(.mediaSofridos) ?? 0
        semSofrer = n(.semSofrer)
        substituicoes = n(.substituicoes); substituicoesPorJogo = c.numeroFlex(.substituicoesPorJogo) ?? 0
        minutoMedioTroca = o(.minutoMedioTroca); amarelos = n(.amarelos); vermelhos = n(.vermelhos); assistencias = n(.assistencias)
        faltasAcumuladas = n(.faltasAcumuladas); sextaFalta = n(.sextaFalta)
        modalidade = try? c.decodeIfPresent(String.self, forKey: .modalidade)
        maiorVitoria = try? c.decodeIfPresent(JogoMarcante.self, forKey: .maiorVitoria)
        maiorDerrota = try? c.decodeIfPresent(JogoMarcante.self, forKey: .maiorDerrota)
        forma = (try? c.decodeIfPresent([ResultadoForma].self, forKey: .forma)) ?? []
        artilheiros = l(.artilheiros); assistentes = l(.assistentes); minutagem = l(.minutagem); banco = l(.banco); jogadores = l(.jogadores)
        minutosPossiveis = n(.minutosPossiveis)
    }
    public var futsal: Bool { modalidade == "futsal" }
}

/// Os textos dos 4 cards do web (GameSummaryCards).
public struct CardsJogos: Equatable, Sendable {
    public let pct: Int
    public let pts: Int
    public let ptsMax: Int
    public let sequencia: String
    public let vedText: String
    public let saldo: String
    public let media: String
    public let maiorVitoria: String
    public let maiorDerrota: String
    public let pontosTexto: String
}

public func cardsJogos(_ s: StatsJogos) -> CardsJogos {
    let ptsMax = s.pontosDisputados > 0 ? s.pontosDisputados : s.jogos * 3
    let pct = ptsMax > 0 ? Int((Double(s.pontosGanhos) / Double(ptsMax) * 100).rounded()) : 0
    let sequencia = s.sequenciaVitorias > 1 ? "\(s.sequenciaVitorias) vitórias seguidas"
        : s.sequenciaInvicta > 0 ? "Invicto há \(contagem(s.sequenciaInvicta, "jogo", "jogos"))" : "Sem vencer no último jogo"
    let saldo = s.saldo > 0 ? "+\(s.saldo)" : s.saldo < 0 ? "−\(abs(s.saldo))" : "0"
    return CardsJogos(
        pct: pct, pts: s.pontosGanhos, ptsMax: ptsMax, sequencia: sequencia,
        vedText: "\(contagem(s.vitorias, "vitória", "vitórias")) · \(contagem(s.empates, "empate", "empates")) · \(contagem(s.derrotas, "derrota", "derrotas"))",
        saldo: saldo, media: "\(decimalWeb(s.mediaFeitos)) × \(decimalWeb(s.mediaSofridos))",
        maiorVitoria: s.maiorVitoria?.texto ?? "Sem vitórias", maiorDerrota: s.maiorDerrota?.texto ?? "Sem derrotas",
        pontosTexto: "pontos · \(contagem(s.jogos, "jogo", "jogos"))")
}

// MARK: minutagem completa

public enum ChaveMinutagem: String, CaseIterable, Sendable {
    case nome = "name", minutos = "minutes", jogos = "appearances", pct = "pct", titular = "starts", entradas = "sub_entries"
    public var rotulo: String {
        switch self {
        case .nome: return "Jogador"; case .minutos: return "Min"; case .jogos: return "Jogos"
        case .pct: return "% poss."; case .titular: return "Tit."; case .entradas: return "Entrou"
        }
    }
}

public struct OrdemMinutagem: Equatable, Sendable {
    public var chave: ChaveMinutagem
    public var crescente: Bool
    public init(chave: ChaveMinutagem = .minutos, crescente: Bool = false) { self.chave = chave; self.crescente = crescente }
}

/// Tocar no cabeçalho: mesma coluna inverte; coluna nova = crescente para nome, decrescente para as outras.
public func alternarOrdem(_ atual: OrdemMinutagem, _ chave: ChaveMinutagem) -> OrdemMinutagem {
    if atual.chave == chave { return OrdemMinutagem(chave: chave, crescente: !atual.crescente) }
    return OrdemMinutagem(chave: chave, crescente: chave == .nome)
}

public struct LinhaMinutagem: Equatable, Sendable, Identifiable {
    public let jogador: JogadorStats
    public let pct: Int
    public var id: String { jogador.atletaId }
}

/// A "Minutagem completa": quem foi relacionado ou jogou, % dos minutos possíveis do período.
public func ordenarMinutagem(_ jogadores: [JogadorStats], minutosPossiveis: Int, ordem: OrdemMinutagem) -> [LinhaMinutagem] {
    let linhas = jogadores.filter { $0.relacionado > 0 || $0.minutos > 0 }.map { j in
        LinhaMinutagem(jogador: j, pct: minutosPossiveis > 0 ? Int((Double(j.minutos) / Double(minutosPossiveis) * 100).rounded()) : 0)
    }
    func valor(_ l: LinhaMinutagem) -> Int {
        switch ordem.chave {
        case .nome: return 0
        case .minutos: return l.jogador.minutos
        case .jogos: return l.jogador.jogos
        case .pct: return l.pct
        case .titular: return l.jogador.titular
        case .entradas: return l.jogador.entradas
        }
    }
    return linhas.sorted { a, b in
        if ordem.chave == .nome {
            if dobrar(a.jogador.nome) == dobrar(b.jogador.nome) && a.jogador.nome == b.jogador.nome { return false }
            return ordem.crescente ? compararNome(a.jogador.nome, b.jogador.nome) : compararNome(b.jogador.nome, a.jogador.nome)
        }
        let va = valor(a), vb = valor(b)
        if va != vb { return ordem.crescente ? va < vb : va > vb }
        return compararNome(a.jogador.nome, b.jogador.nome)
    }
}

/// "Minutagem": "450 min · 5 jogos" (jogos só se jogou).
public func textoMinutagem(_ j: JogadorStats) -> String {
    j.jogos > 0 ? "\(j.minutos) min · \(contagem(j.jogos, "jogo", "jogos"))" : "\(j.minutos) min"
}

// MARK: API + PDFs

public enum CaminhosStats {
    public static func treino(clube: String, _ i: Intervalo) -> String {
        "/stats/training?start_date=\(codificarComponente(i.inicio))&end_date=\(codificarComponente(i.fim))&clubId=\(codificarComponente(clube))"
    }
    public static func jogos(clube: String, _ i: Intervalo) -> String {
        "/stats/games?start_date=\(codificarComponente(i.inicio))&end_date=\(codificarComponente(i.fim))&clubId=\(codificarComponente(clube))"
    }
}

public protocol ApiEstatisticas: Sendable {
    func treino(clubeId: String, _ i: Intervalo) async throws -> StatsTreino
    func jogos(clubeId: String, _ i: Intervalo) async throws -> StatsJogos
}

public struct ApiEstatisticasHttp: ApiEstatisticas {
    let web: ClienteWeb
    public init(_ web: ClienteWeb) { self.web = web }
    public func treino(clubeId: String, _ i: Intervalo) async throws -> StatsTreino {
        try await web.json(CaminhosStats.treino(clube: clubeId, i)).decodificar(StatsTreino.self)
    }
    public func jogos(clubeId: String, _ i: Intervalo) async throws -> StatsJogos {
        try await web.json(CaminhosStats.jogos(clube: clubeId, i)).decodificar(StatsJogos.self)
    }
}

/// Corpo do PDF de treino/jogos (o mesmo do Exportar do web).
public func corpoPdfEstatisticas(clubeId: String, _ i: Intervalo, filtro: FiltroPeriodo) -> [String: Json] {
    ["club_id": .texto(clubeId), "start_date": .texto(i.inicio), "end_date": .texto(i.fim),
     "filter_type": .texto(filtro.rawValue), "period_label": .texto(filtro.rotulo)]
}

/// Estatisticas_Treino_<clube>_<rótulo>.pdf / Desempenho_<clube>_<rótulo>.pdf.
public func nomePdfEstatisticas(jogos: Bool, clube: String, filtro: FiltroPeriodo) -> String {
    "\(jogos ? "Desempenho" : "Estatisticas_Treino")_\(nomeDeArquivo(clube))_\(nomeDeArquivo(filtro.rotulo)).pdf"
}

public let TITULO_SEM_TREINO_STATS = "Nenhum dado encontrado"
public let TEXTO_SEM_TREINO_STATS = "Não há treinos registrados no período selecionado."
public let TITULO_SEM_JOGO_STATS = "Nenhum jogo encontrado"
public let TEXTO_SEM_JOGO_STATS = "Não há jogos registrados no período selecionado."
public let TEXTO_RODAPE_MINUTAGEM = "Jogos = jogou/relacionado. % = minutos ÷ minutos possíveis do período. Minutagem pelas substituições e expulsões (ou ajuste manual no jogo)."

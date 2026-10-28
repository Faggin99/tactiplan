import Foundation

// Contrato das rotas de JOGO do web, usadas pelo app com o próprio token (T2):
//   GET  /api/games/:sessionId  → { formation, players: [match_players + athlete], events: [match_events + player] }
//   POST /api/games/:sessionId  → regrava formação, dados do jogo, escalação e eventos (o mesmo corpo do web)
//   GET  /api/sessions/:id      → o dia (adversário, duração, campeonato, rodada, local, vídeo)
//   GET  /api/stats/games       → matchesHistory (a lista de jogos com placar)
//   GET  /api/athletes?status=active&club_id=  · GET /api/competitions?clubId=
// Tudo tolerante (campo novo nunca quebra; número pode vir como texto).
// Paridade: dados/jogo/Jogo.kt (Android).

public let STATUS_TITULAR = "starter"
public let STATUS_RESERVA = "substitute"

/// Atleta do plantel (GET /api/athletes) ou o `athlete` embutido no jogador do jogo.
public struct AtletaResumo: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var nome: String
    public var camisa: Int?
    public var posicao: String?
    public var fotoUrl: String?

    public init(id: String, nome: String, camisa: Int? = nil, posicao: String? = nil, fotoUrl: String? = nil) {
        self.id = id; self.nome = nome; self.camisa = camisa; self.posicao = posicao; self.fotoUrl = fotoUrl
    }

    enum CodingKeys: String, CodingKey { case id, nome = "name", camisa = "jersey_number", posicao = "position", fotoUrl = "photo_url" }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        camisa = c.numeroFlex(.camisa).map { Int($0) }
        posicao = try? c.decodeIfPresent(String.self, forKey: .posicao)
        fotoUrl = try? c.decodeIfPresent(String.self, forKey: .fotoUrl)
    }
}

/// Um atleta relacionado para o jogo (match_players), no formato em que o editor trabalha
/// (o `selectedPlayers` do GameModal).
public struct JogadorJogo: Codable, Equatable, Sendable, Identifiable {
    public var atletaId: String
    /// "starter" | "substitute"
    public var status: String
    /// Vaga no campo (só titular); nil = sem vaga.
    public var vaga: Int?
    public var minutosJogados: Int
    public var minutosManual: Bool
    /// Camisa NESTE jogo (override); nil = sem número.
    public var camisa: Int?
    public var atleta: AtletaResumo?
    public var nome: String?

    public var id: String { atletaId }
    public var titular: Bool { status == STATUS_TITULAR }
    public var reserva: Bool { status == STATUS_RESERVA }
    /// p.name || p.athlete?.name
    public var nomeExibido: String? {
        if let n = nome, !n.isEmpty { return n }
        if let n = atleta?.nome, !n.isEmpty { return n }
        return nil
    }

    public init(atletaId: String, status: String, vaga: Int? = nil, minutosJogados: Int = 0, minutosManual: Bool = false,
                camisa: Int? = nil, atleta: AtletaResumo? = nil, nome: String? = nil) {
        self.atletaId = atletaId; self.status = status; self.vaga = vaga; self.minutosJogados = minutosJogados
        self.minutosManual = minutosManual; self.camisa = camisa; self.atleta = atleta; self.nome = nome
    }

    enum CodingKeys: String, CodingKey {
        case atletaId = "athlete_id", status, vaga = "slot", minutosJogados = "minutes_played", minutosManual = "minutes_manual"
        case camisa = "jersey_number", atleta = "athlete", nome = "name"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        atletaId = try c.decode(String.self, forKey: .atletaId)
        status = (try? c.decodeIfPresent(String.self, forKey: .status)) ?? STATUS_TITULAR
        vaga = c.numeroFlex(.vaga).map { Int($0) }
        minutosJogados = c.numeroFlex(.minutosJogados).map { Int($0) } ?? 0
        minutosManual = (try? c.decodeIfPresent(Bool.self, forKey: .minutosManual)) ?? false
        camisa = c.numeroFlex(.camisa).map { Int($0) }
        atleta = try? c.decodeIfPresent(AtletaResumo.self, forKey: .atleta)
        nome = try? c.decodeIfPresent(String.self, forKey: .nome)
    }
}

/// Atleta citado num evento (o `player` / `secondary_player` do GET).
public struct AtletaDoEvento: Codable, Equatable, Sendable {
    public var id: String?
    public var nome: String?
    public init(id: String?, nome: String?) { self.id = id; self.nome = nome }
    enum CodingKeys: String, CodingKey { case id, nome = "name" }
}

/// Um evento do jogo (match_events). Convenção da substituição:
/// `jogadorId` = quem ENTRA, `jogador2Id` = quem SAI. No gol, `jogador2Id` = assistência.
public struct EventoJogo: Codable, Equatable, Sendable, Identifiable {
    /// id do servidor, ou "local-…" para evento criado no aparelho (não vai no corpo).
    public var id: String
    public var tipo: String
    public var time: String?
    public var tipoGol: String?
    public var minuto: Int?
    public var jogadorId: String?
    public var jogador2Id: String?
    public var jogador: AtletaDoEvento?
    public var jogador2: AtletaDoEvento?
    public var notas: String?

    public init(id: String, tipo: String, time: String? = nil, tipoGol: String? = nil, minuto: Int? = nil,
                jogadorId: String? = nil, jogador2Id: String? = nil, jogador: AtletaDoEvento? = nil,
                jogador2: AtletaDoEvento? = nil, notas: String? = nil) {
        self.id = id; self.tipo = tipo; self.time = time; self.tipoGol = tipoGol; self.minuto = minuto
        self.jogadorId = jogadorId; self.jogador2Id = jogador2Id; self.jogador = jogador; self.jogador2 = jogador2; self.notas = notas
    }

    enum CodingKeys: String, CodingKey {
        case id, tipo = "event_type", time = "team", tipoGol = "goal_type", minuto = "minute"
        case jogadorId = "player_id", jogador2Id = "secondary_player_id", jogador = "player", jogador2 = "secondary_player", notas = "notes"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? c.numeroFlex(.id).map { "local-\(Int($0))" } ?? "local-\(UUID().uuidString)"
        tipo = (try? c.decodeIfPresent(String.self, forKey: .tipo)) ?? ""
        time = try? c.decodeIfPresent(String.self, forKey: .time)
        tipoGol = try? c.decodeIfPresent(String.self, forKey: .tipoGol)
        minuto = c.numeroFlex(.minuto).map { Int($0.rounded()) }
        jogadorId = try? c.decodeIfPresent(String.self, forKey: .jogadorId)
        jogador2Id = try? c.decodeIfPresent(String.self, forKey: .jogador2Id)
        jogador = try? c.decodeIfPresent(AtletaDoEvento.self, forKey: .jogador)
        jogador2 = try? c.decodeIfPresent(AtletaDoEvento.self, forKey: .jogador2)
        notas = try? c.decodeIfPresent(String.self, forKey: .notas)
    }

    /// Do nosso time: team 'own' ou vazio.
    public var doNossoTime: Bool { time == nil || time == "" || time == "own" }
}

/// GET /api/games/:sessionId
public struct DadosDoJogo: Codable, Equatable, Sendable {
    public var formacao: String?
    public var jogadores: [JogadorJogo]
    public var eventos: [EventoJogo]

    public init(formacao: String? = nil, jogadores: [JogadorJogo] = [], eventos: [EventoJogo] = []) {
        self.formacao = formacao; self.jogadores = jogadores; self.eventos = eventos
    }

    enum CodingKeys: String, CodingKey { case formacao = "formation", jogadores = "players", eventos = "events" }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        formacao = try? c.decodeIfPresent(String.self, forKey: .formacao)
        jogadores = (try? c.decodeIfPresent([JogadorJogo].self, forKey: .jogadores)) ?? []
        eventos = (try? c.decodeIfPresent([EventoJogo].self, forKey: .eventos)) ?? []
    }
}

/// O dia do jogo (GET /api/sessions/:id): os dados do topo do GameModal.
public struct DiaDoJogo: Codable, Equatable, Sendable {
    public var id: String
    public var data: String
    public var nomeDia: String?
    public var tipoBruto: String?
    public var adversario: String?
    public var duracao: Int?
    public var campeonatoId: String?
    public var rodada: String?
    /// 'home' | 'away' | 'neutral' | nil
    public var local: String?
    public var video: String?
    public var formacao: String?
    public var horario: String?
    public var localDoJogo: String?
    public var apresentacao: String?

    public init(id: String, data: String, nomeDia: String? = nil, tipoBruto: String? = "match", adversario: String? = nil,
                duracao: Int? = nil, campeonatoId: String? = nil, rodada: String? = nil, local: String? = nil,
                video: String? = nil, formacao: String? = nil, horario: String? = nil, localDoJogo: String? = nil,
                apresentacao: String? = nil) {
        self.id = id; self.data = data; self.nomeDia = nomeDia; self.tipoBruto = tipoBruto; self.adversario = adversario
        self.duracao = duracao; self.campeonatoId = campeonatoId; self.rodada = rodada; self.local = local
        self.video = video; self.formacao = formacao
        self.horario = horario; self.localDoJogo = localDoJogo; self.apresentacao = apresentacao
    }

    enum CodingKeys: String, CodingKey {
        case id, data = "date", nomeDia = "day_name", tipoBruto = "session_type", adversario = "opponent_name"
        case duracao = "match_duration", campeonatoId = "competition_id", rodada = "match_round", local = "match_location"
        case video = "video_full_url", formacao = "formation"
        case horario = "match_kickoff", localDoJogo = "match_venue", apresentacao = "match_meet_time"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        data = String(((try? c.decodeIfPresent(String.self, forKey: .data)) ?? "").prefix(10))
        nomeDia = try? c.decodeIfPresent(String.self, forKey: .nomeDia)
        tipoBruto = try? c.decodeIfPresent(String.self, forKey: .tipoBruto)
        adversario = try? c.decodeIfPresent(String.self, forKey: .adversario)
        duracao = c.numeroFlex(.duracao).map { Int($0) }
        campeonatoId = try? c.decodeIfPresent(String.self, forKey: .campeonatoId)
        rodada = (try? c.decodeIfPresent(String.self, forKey: .rodada)) ?? c.numeroFlex(.rodada).map { String(Int($0)) }
        local = try? c.decodeIfPresent(String.self, forKey: .local)
        video = try? c.decodeIfPresent(String.self, forKey: .video)
        formacao = try? c.decodeIfPresent(String.self, forKey: .formacao)
        horario = try? c.decodeIfPresent(String.self, forKey: .horario)
        localDoJogo = try? c.decodeIfPresent(String.self, forKey: .localDoJogo)
        apresentacao = try? c.decodeIfPresent(String.self, forKey: .apresentacao)
    }
}

/// Campeonato (GET /api/competitions?clubId=).
public struct Campeonato: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var nome: String
    public var temporada: String?

    public init(id: String, nome: String, temporada: String? = nil) { self.id = id; self.nome = nome; self.temporada = temporada }

    enum CodingKeys: String, CodingKey { case id, nome = "name", temporada = "season" }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        temporada = (try? c.decodeIfPresent(String.self, forKey: .temporada)) ?? c.numeroFlex(.temporada).map { String(Int($0)) }
    }

    /// "Estadual Sub-17 · 2026" (o <option> do web).
    public var rotulo: String {
        guard let t = temporada, !t.isEmpty else { return nome }
        return "\(nome) · \(t)"
    }
}

// MARK: configuração por modalidade (lib/sportConfig.js)

public struct OpcaoRotulo: Equatable, Sendable, Identifiable {
    public let valor: String
    public let rotulo: String
    public var id: String { valor }
    public init(_ valor: String, _ rotulo: String) { self.valor = valor; self.rotulo = rotulo }
}

public struct ConfigEsporte: Equatable, Sendable {
    public let modalidade: String
    public let duracaoPadrao: Int
    /// Futebol 11/7: minutagem pelas substituições. Futsal: troca livre, não rastreia.
    public let rastreiaMinutos: Bool
    /// Subtipos de bola parada (valores já no formato do goal_type: corner, penalty…).
    public let subtiposBolaParada: [OpcaoRotulo]
}

private let BP_FUTEBOL_11 = [("falta_frontal", "Falta Frontal"), ("falta_lateral", "Falta Lateral"), ("escanteio", "Escanteio"),
                             ("lateral", "Lateral"), ("penalti", "Pênalti")]
private let BP_FUTEBOL_7 = [("falta_frontal", "Falta Frontal"), ("falta_lateral", "Falta Lateral"), ("escanteio", "Escanteio"),
                            ("lateral", "Lateral"), ("shootout", "Shootout")]
private let BP_FUTSAL = [("falta", "Falta"), ("escanteio", "Escanteio"), ("lateral", "Lateral"), ("penalti", "Pênalti"),
                         ("tiro_livre", "Tiro Livre (10m)"), ("falta_acumulada", "Falta Acumulada")]

/// SUBTYPE_KEY_MAP do EventModal: valor do sportConfig → valor do goal_type.
public let CHAVE_SUBTIPO: [String: String] = [
    "falta_frontal": "falta_frontal", "falta_lateral": "falta_lateral", "falta": "falta", "escanteio": "corner",
    "lateral": "lateral", "penalti": "penalty", "shootout": "shootout", "tiro_livre": "tiro_livre", "falta_acumulada": "falta_acumulada",
]

public func configEsporte(_ modalidade: String?) -> ConfigEsporte {
    let m = ["football_11", "football_7", "futsal"].contains(modalidade ?? "") ? modalidade! : MODALIDADE_PADRAO
    let bp: [(String, String)] = m == "futsal" ? BP_FUTSAL : (m == "football_7" ? BP_FUTEBOL_7 : BP_FUTEBOL_11)
    return ConfigEsporte(
        modalidade: m,
        duracaoPadrao: m == "futsal" ? 40 : (m == "football_7" ? 50 : 90),
        rastreiaMinutos: m != "futsal",
        subtiposBolaParada: bp.map { OpcaoRotulo(CHAVE_SUBTIPO[$0.0] ?? $0.0, $0.1) })
}

// MARK: tipos de evento

public struct TipoEvento: Equatable, Sendable, Identifiable {
    public let valor: String
    public let rotulo: String
    public let corHex: String
    public var id: String { valor }
}

public let EVENTO_GOL = "goal_scored"
public let EVENTO_GOL_SOFRIDO = "goal_conceded"
public let EVENTO_AMARELO = "yellow_card"
public let EVENTO_VERMELHO = "red_card"
public let EVENTO_SUBSTITUICAO = "substitution"
public let EVENTO_FALTA_ACUMULADA = "accumulated_foul"
public let EVENTO_SEXTA_FALTA = "sixth_foul"

/// Os botões de tipo do EventModal (futsal: sem substituição, com as faltas da equipe).
public func tiposDeEvento(_ modalidade: String?) -> [TipoEvento] {
    let base = [
        TipoEvento(valor: EVENTO_GOL, rotulo: "Gol Feito", corHex: "#22c55e"),
        TipoEvento(valor: EVENTO_GOL_SOFRIDO, rotulo: "Gol Tomado", corHex: "#ef4444"),
        TipoEvento(valor: EVENTO_AMARELO, rotulo: "Amarelo", corHex: "#eab308"),
        TipoEvento(valor: EVENTO_VERMELHO, rotulo: "Vermelho", corHex: "#dc2626"),
        TipoEvento(valor: EVENTO_SUBSTITUICAO, rotulo: "Substituição", corHex: "#3b82f6"),
    ]
    guard modalidade == "futsal" else { return base }
    return base.filter { $0.valor != EVENTO_SUBSTITUICAO } + [
        TipoEvento(valor: EVENTO_FALTA_ACUMULADA, rotulo: "Falta Acum.", corHex: "#f59e0b"),
        TipoEvento(valor: EVENTO_SEXTA_FALTA, rotulo: "6ª Falta", corHex: "#b91c1c"),
    ]
}

/// getEventLabel do GameModal.
public func rotuloDoEvento(_ e: EventoJogo) -> String {
    let nosso = e.doNossoTime
    switch e.tipo {
    case EVENTO_GOL: return "Gol"
    case EVENTO_GOL_SOFRIDO: return "Gol sofrido"
    case EVENTO_AMARELO: return nosso ? "Amarelo" : "Amarelo (adv.)"
    case EVENTO_VERMELHO: return nosso ? "Expulsão" : "Expulsão (adv.)"
    case EVENTO_SUBSTITUICAO: return "Substituição"
    case EVENTO_FALTA_ACUMULADA: return "Falta acumulada"
    case EVENTO_SEXTA_FALTA: return "6ª falta"
    default: return e.tipo.isEmpty ? "Evento" : e.tipo
    }
}

// MARK: tipo de gol (momento do jogo + bola parada)

public struct MomentoGol: Equatable, Sendable {
    /// 'org' | 'trans' | 'bp'
    public var momento: String
    public var subtipoBP: String
    public init(momento: String, subtipoBP: String) { self.momento = momento; self.subtipoBP = subtipoBP }
}

/// parseGoalType do EventModal (aceita os valores antigos).
public func lerTipoGol(_ gt: String?) -> MomentoGol {
    guard let gt, !gt.isEmpty else { return MomentoGol(momento: "org", subtipoBP: "falta") }
    let antigos: [String: MomentoGol] = [
        "offensive_org": MomentoGol(momento: "org", subtipoBP: "falta"),
        "offensive_transition": MomentoGol(momento: "trans", subtipoBP: "falta"),
        "free_kick": MomentoGol(momento: "bp", subtipoBP: "falta"),
        "corner": MomentoGol(momento: "bp", subtipoBP: "corner"),
        "penalty": MomentoGol(momento: "bp", subtipoBP: "penalty"),
    ]
    if let a = antigos[gt] { return a }
    if gt.hasPrefix("org_") { return MomentoGol(momento: "org", subtipoBP: "falta") }
    if gt.hasPrefix("trans_") { return MomentoGol(momento: "trans", subtipoBP: "falta") }
    if gt.hasPrefix("bp_") {
        let sub = gt.components(separatedBy: "_").dropFirst(2).joined(separator: "_")
        return MomentoGol(momento: "bp", subtipoBP: sub.isEmpty ? "falta" : sub)
    }
    return MomentoGol(momento: "org", subtipoBP: "falta")
}

/// serializeGoalType do EventModal: org_off | trans_def | bp_off_corner…
public func gravarTipoGol(momento: String, subtipoBP: String?, tipoEvento: String) -> String {
    let orient = tipoEvento == EVENTO_GOL_SOFRIDO ? "def" : "off"
    switch momento {
    case "trans": return "trans_\(orient)"
    case "bp": return "bp_\(orient)_\((subtipoBP ?? "").isEmpty ? "falta" : subtipoBP!)"
    default: return "org_\(orient)"
    }
}

/// Os 3 momentos (rótulo longo e curto), que dependem de gol feito (of.) ou tomado (def.).
public func momentosDoGol(_ tipoEvento: String) -> [(valor: String, rotulo: String, curto: String)] {
    if tipoEvento == EVENTO_GOL_SOFRIDO {
        return [("org", "Organização Defensiva", "Org. Def."), ("trans", "Transição Defensiva", "Trans. Def."),
                ("bp", "Bola Parada Defensiva", "BP Def.")]
    }
    return [("org", "Organização Ofensiva", "Org. Of."), ("trans", "Transição Ofensiva", "Trans. Of."),
            ("bp", "Bola Parada Ofensiva", "BP Of.")]
}

/// getGoalTypeLabel do GameModal: "Org. ofensiva", "Bola parada · Escanteio"… ("" sem tipo).
public func rotuloTipoGol(_ gt: String?) -> String {
    guard let gt, !gt.isEmpty else { return "" }
    let antigos = ["offensive_org": "Org. ofensiva", "offensive_transition": "Transição of.", "free_kick": "Falta",
                   "corner": "Escanteio", "penalty": "Pênalti"]
    if let a = antigos[gt] { return a }
    // ^(org|trans|bp)_(off|def)(?:_(.+))?$
    let partes = gt.components(separatedBy: "_")
    guard partes.count >= 2, ["org", "trans", "bp"].contains(partes[0]), ["off", "def"].contains(partes[1]) else { return "" }
    let resto = partes.dropFirst(2).joined(separator: "_")
    if partes.count > 2 && resto.isEmpty { return "" }
    let of = partes[1] == "off"
    if partes[0] == "org" { return of ? "Org. ofensiva" : "Org. defensiva" }
    if partes[0] == "trans" { return of ? "Transição of." : "Transição def." }
    let bp = ["falta": "Falta", "falta_frontal": "Falta frontal", "falta_lateral": "Falta lateral", "corner": "Escanteio",
              "lateral": "Lateral", "penalty": "Pênalti", "shootout": "Shootout", "tiro_livre": "Tiro livre",
              "falta_acumulada": "Falta acumulada"]
    if let r = bp[resto] { return "Bola parada · \(r)" }
    return "Bola parada"
}

// MARK: minuto do evento (1º/2º tempo + acréscimo, como o EventModal)

/// Minuto dentro do tempo, tempo e acréscimo.
public struct MinutoDoJogo: Equatable, Sendable {
    public var tempo: Int
    public var minutoNoTempo: Int
    public var acrescimo: Int
    public init(tempo: Int, minutoNoTempo: Int, acrescimo: Int) { self.tempo = tempo; self.minutoNoTempo = minutoNoTempo; self.acrescimo = acrescimo }
}

public func fimDo1oTempo(_ duracao: Int) -> Int { duracao / 2 }
public func duracaoDo2oTempo(_ duracao: Int) -> Int { duracao - duracao / 2 }

/// calculateTotalMinute
public func minutoTotal(_ m: MinutoDoJogo, duracao: Int) -> Int {
    let h1 = fimDo1oTempo(duracao)
    if m.tempo == 1 { return m.acrescimo > 0 ? h1 + m.acrescimo : m.minutoNoTempo }
    return m.acrescimo > 0 ? duracao + m.acrescimo : h1 + m.minutoNoTempo
}

/// parseMinute (até 7 min além do 1º tempo = acréscimo do 1º tempo).
public func lerMinuto(_ total: Int, duracao: Int) -> MinutoDoJogo {
    let h1 = fimDo1oTempo(duracao), h2 = duracaoDo2oTempo(duracao)
    if total <= h1 { return MinutoDoJogo(tempo: 1, minutoNoTempo: total, acrescimo: 0) }
    if total <= h1 + 7 { return MinutoDoJogo(tempo: 1, minutoNoTempo: h1, acrescimo: total - h1) }
    if total <= duracao { return MinutoDoJogo(tempo: 2, minutoNoTempo: total - h1, acrescimo: 0) }
    return MinutoDoJogo(tempo: 2, minutoNoTempo: h2, acrescimo: total - duracao)
}

/// formatMinuteDisplay: "23'", "45+2'", "90+4'".
public func textoMinuto(_ m: MinutoDoJogo, duracao: Int) -> String {
    let h1 = fimDo1oTempo(duracao)
    if m.tempo == 1 { return m.acrescimo > 0 ? "\(h1)+\(m.acrescimo)'" : "\(m.minutoNoTempo)'" }
    return m.acrescimo > 0 ? "\(duracao)+\(m.acrescimo)'" : "\(h1 + m.minutoNoTempo)'"
}

// MARK: lista de jogos (GET /api/stats/games → matchesHistory)

public struct JogoDaLista: Codable, Equatable, Sendable, Identifiable {
    public var sessaoId: String
    public var data: String
    public var adversario: String?
    public var golsFeitos: Int
    public var golsSofridos: Int
    public var resultadoBruto: String?
    public var rodada: String?
    public var local: String?
    public var campeonatoId: String?
    public var video: String?

    public var id: String { sessaoId }

    public init(sessaoId: String, data: String, adversario: String? = nil, golsFeitos: Int = 0, golsSofridos: Int = 0,
                resultadoBruto: String? = nil, rodada: String? = nil, local: String? = nil, campeonatoId: String? = nil, video: String? = nil) {
        self.sessaoId = sessaoId; self.data = data; self.adversario = adversario; self.golsFeitos = golsFeitos
        self.golsSofridos = golsSofridos; self.resultadoBruto = resultadoBruto; self.rodada = rodada; self.local = local
        self.campeonatoId = campeonatoId; self.video = video
    }

    enum CodingKeys: String, CodingKey {
        case sessaoId = "session_id", data = "date", adversario = "opponent", golsFeitos = "goals_scored", golsSofridos = "goals_conceded"
        case resultadoBruto = "result", rodada = "match_round", local = "match_location", campeonatoId = "competition_id", video = "video_full_url"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sessaoId = try c.decode(String.self, forKey: .sessaoId)
        data = String(((try? c.decodeIfPresent(String.self, forKey: .data)) ?? "").prefix(10))
        adversario = try? c.decodeIfPresent(String.self, forKey: .adversario)
        golsFeitos = c.numeroFlex(.golsFeitos).map { Int($0) } ?? 0
        golsSofridos = c.numeroFlex(.golsSofridos).map { Int($0) } ?? 0
        resultadoBruto = try? c.decodeIfPresent(String.self, forKey: .resultadoBruto)
        rodada = (try? c.decodeIfPresent(String.self, forKey: .rodada)) ?? c.numeroFlex(.rodada).map { String(Int($0)) }
        local = try? c.decodeIfPresent(String.self, forKey: .local)
        campeonatoId = try? c.decodeIfPresent(String.self, forKey: .campeonatoId)
        video = try? c.decodeIfPresent(String.self, forKey: .video)
    }
}

public enum Resultado: String, Equatable, Sendable { case vitoria = "V", empate = "E", derrota = "D" }

public func resultadoDo(feitos: Int, sofridos: Int) -> Resultado {
    feitos > sofridos ? .vitoria : (feitos < sofridos ? .derrota : .empate)
}

/// Jogo ainda por jogar: data futura, ou hoje sem nenhum gol lançado (o servidor conta 0 × 0
/// como empate; o app não chama de empate um jogo que não aconteceu).
public func jogoFuturo(_ j: JogoDaLista, hoje: String) -> Bool {
    if j.data > hoje { return true }
    return j.data == hoje && j.golsFeitos == 0 && j.golsSofridos == 0
}

public struct ListaDeJogos: Equatable, Sendable {
    public let proximo: JogoDaLista?
    /// Os outros jogos por jogar, do mais perto ao mais longe.
    public let proximos: [JogoDaLista]
    /// Os jogados, do mais recente ao mais antigo.
    public let passados: [JogoDaLista]
    public let vitorias: Int
    public let empates: Int
    public let derrotas: Int
}

/// Separa a lista (já filtrada) em próximo, próximos e passados, com V/E/D só dos jogados.
public func organizarJogos(_ jogos: [JogoDaLista], hoje: String, campeonatoId: String? = nil) -> ListaDeJogos {
    let filtrados = jogos.filter { campeonatoId == nil || $0.campeonatoId == campeonatoId }
    let futuros = filtrados.filter { jogoFuturo($0, hoje: hoje) }.sorted { $0.data < $1.data }
    let passados = filtrados.filter { !jogoFuturo($0, hoje: hoje) }.sorted { $0.data > $1.data }
    var v = 0, e = 0, d = 0
    for j in passados {
        switch resultadoDo(feitos: j.golsFeitos, sofridos: j.golsSofridos) {
        case .vitoria: v += 1
        case .empate: e += 1
        case .derrota: d += 1
        }
    }
    return ListaDeJogos(proximo: futuros.first, proximos: Array(futuros.dropFirst()), passados: passados,
                        vitorias: v, empates: e, derrotas: d)
}

public func rotuloLocal(_ l: String?) -> String? {
    switch l {
    case "home": return "Casa"
    case "away": return "Fora"
    case "neutral": return "Neutro"
    default: return nil
    }
}

/// "Demo FC 2 × 1 União EC" (em casa o clube vem primeiro; fora, o adversário).
public func placarDaLinha(_ j: JogoDaLista, clube: String) -> String {
    let adv = (j.adversario ?? "").isEmpty ? "Adversário" : j.adversario!
    if j.local == "away" { return "\(adv) \(j.golsSofridos) × \(j.golsFeitos) \(clube)" }
    return "\(clube) \(j.golsFeitos) × \(j.golsSofridos) \(adv)"
}

/// "Sáb 17/10 · Casa · Rodada 6 · Estadual" (só o que existe).
public func detalheDaLinha(_ j: JogoDaLista, campeonato: String? = nil) -> String {
    var partes = [rotuloDiaCurto(j.data)]
    if let l = rotuloLocal(j.local) { partes.append(l) }
    if let r = j.rodada, !r.isEmpty { partes.append("Rodada \(r)") }
    if let c = campeonato, !c.isEmpty { partes.append(c) }
    return partes.joined(separator: " · ")
}

/// "hoje", "amanhã", "em 3 dias".
public func emQuantosDias(_ data: String, hoje: String) -> String {
    guard let a = lerData(hoje), let b = lerData(data) else { return "" }
    var ca = DateComponents(); ca.year = a.ano; ca.month = a.mes; ca.day = a.dia
    var cb = DateComponents(); cb.year = b.ano; cb.month = b.mes; cb.day = b.dia
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    guard let da = cal.date(from: ca), let db = cal.date(from: cb) else { return "" }
    let n = cal.dateComponents([.day], from: da, to: db).day ?? 0
    if n == 0 { return "hoje" }
    if n == 1 { return "amanhã" }
    if n < 0 { return n == -1 ? "ontem" : "há \(-n) dias" }
    return "em \(n) dias"
}

/// Períodos da aba Jogos: quanto olhar para trás (os próximos sempre vêm, até 120 dias).
public enum PeriodoJogos: String, CaseIterable, Sendable, Identifiable {
    case mes, tresMeses, semestre, ano
    public var id: String { rawValue }
    public var rotulo: String {
        switch self {
        case .mes: return "Último mês"
        case .tresMeses: return "3 meses"
        case .semestre: return "Semestre"
        case .ano: return "1 ano"
        }
    }
    public var dias: Int {
        switch self {
        case .mes: return 31
        case .tresMeses: return 92
        case .semestre: return 183
        case .ano: return 365
        }
    }
    /// (início, fim) em "YYYY-MM-DD".
    public func intervalo(hoje: String) -> (inicio: String, fim: String) { (somarDias(hoje, -dias), somarDias(hoje, 120)) }
}

/// Corpo do PDF "Exportar jogos" (POST /api/reports/jogos), o mesmo do web (Estatísticas › Jogos).
public func corpoRelatorioJogos(clubeId: String, inicio: String, fim: String, rotulo: String) -> [String: Json] {
    ["club_id": .texto(clubeId), "start_date": .texto(inicio), "end_date": .texto(fim),
     "filter_type": "custom", "period_label": .texto(rotulo)]
}

/// "Desempenho_<clube>_<período>.pdf" (o nome do web).
public func nomePdfJogos(clube: String, rotulo: String) -> String {
    "Desempenho_\(nomeArquivoSeguro(clube))_\(nomeArquivoSeguro(rotulo.isEmpty ? "periodo" : rotulo)).pdf"
}

/// Corpo da convocação (POST /api/reports/convocacao). tamanho: letra dos nomes —
/// "normal" | "grande" | "muito_grande".
public func corpoConvocacao(_ sessaoId: String, tamanho: String = "normal") -> [String: Json] {
    var c: [String: Json] = ["session_id": .texto(sessaoId)]
    if tamanho != "normal" { c["tamanho_fonte"] = .texto(tamanho) }
    return c
}

/// Letra do PDF da convocação (menu Exportar do jogo): (valor, rótulo).
public let TAMANHOS_CONVOCACAO: [(String, String)] = [("normal", "Convocação (PDF)"), ("grande", "Convocação · letra grande (PDF)"),
                                                      ("muito_grande", "Convocação · letra muito grande (PDF)")]

/// Hora digitada → "HH:MM" enquanto digita ("1630" → "16:30", "9" → "9"). Só dígitos, até 4.
public func mascaraHora(_ s: String) -> String {
    let d = String(s.filter(\.isNumber).prefix(4))
    return d.count <= 2 ? d : "\(d.prefix(2)):\(d.dropFirst(2))"
}

/// Relatório de UM jogo (POST /api/reports/jogo): placar, lances, atletas com minutos/gols/cartões.
public func corpoRelatorioJogo(_ sessaoId: String) -> [String: Json] { ["session_id": .texto(sessaoId)] }

/// "Jogo_Rival_FC_24-10-2026.pdf" (o nome do web).
public func nomePdfRelatorioJogo(adversario: String?, data: String) -> String {
    let adv = (adversario ?? "").trimmingCharacters(in: .whitespaces).isEmpty ? "Adversário" : adversario!
    let base = "Jogo_\(adv.split(whereSeparator: { $0.isWhitespace }).joined(separator: "_"))_\(dataBR(data).replacingOccurrences(of: "/", with: "-"))"
    return nomeArquivoSeguro(base) + ".pdf"
}

/// "Analise_Rival_FC_24-10-2026.pdf" — Análise do adversário (POST /api/reports/analise).
/// `extensao` "pptx" = PowerPoint com os vídeos.
public func nomePdfAnalise(adversario: String?, data: String, extensao: String = "pdf") -> String {
    let adv = (adversario ?? "").trimmingCharacters(in: .whitespaces).isEmpty ? "Adversário" : adversario!
    let base = "Analise_\(adv.split(whereSeparator: { $0.isWhitespace }).joined(separator: "_"))_\(dataBR(data).replacingOccurrences(of: "/", with: "-"))"
    return nomeArquivoSeguro(base) + ".\(extensao)"
}

/// "Convocacao_Rival_FC_24-10-2026.pdf" (o nome do web).
public func nomePdfConvocacao(adversario: String?, data: String) -> String {
    let adv = (adversario ?? "").trimmingCharacters(in: .whitespaces).isEmpty ? "Adversário" : adversario!
    let base = "Convocacao_\(adv.split(whereSeparator: { $0.isWhitespace }).joined(separator: "_"))_\(dataBR(data).replacingOccurrences(of: "/", with: "-"))"
    return nomeArquivoSeguro(base) + ".pdf"
}

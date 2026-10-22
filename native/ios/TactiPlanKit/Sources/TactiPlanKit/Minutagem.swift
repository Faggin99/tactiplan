import Foundation

// Minutagem do jogo pelas substituições (e pela expulsão) + regras da substituição.
// Porte fiel de frontend/src/lib/minutagem.js (= backend-node/src/utils/minutagem.js).
// Convenção em match_events (substitution): player_id = quem ENTRA, secondary_player_id = quem SAI.
// Só eventos do nosso time (team 'own' ou vazio) contam.
//   titular sem substituição → duração · titular substituído aos X → X
//   reserva que entra aos X → duração − X · entrou aos X e saiu aos Y → Y − X
//   expulso aos X (vermelho nosso) → sai aos X · reserva que não entrou → 0
//   minutes_manual → vale o minutes_played informado · substituição incompleta → ignorada
// Paridade: native/paridade/jogo.json (gerado do web) + dados/jogo/Minutagem.kt (Android).

/// Estado do atleta no jogo (o objeto de computeMinutagem).
public struct EstadoMinutagem: Equatable, Sendable {
    public let minutos: Int
    public let auto: Int
    public let manual: Bool
    public let titular: Bool
    public let entrou: Bool
    public let entrouAos: Int?
    public let saiuAos: Int?
    public let expulsoAos: Int?
    public let jogou: Bool
}

/// `Number(v)` do JS limitado a [0, duração] e arredondado. nil (null no banco) vale 0, como no web.
private func paraMinuto(_ v: Int?, _ duracao: Int) -> Int { max(0, min(duracao, v ?? 0)) }

/// Eventos que mexem na minutagem, em ordem de minuto (estável).
private func linhaDoTempo(_ eventos: [EventoJogo]) -> [EventoJogo] {
    eventos.enumerated()
        .filter { $0.element.doNossoTime && ($0.element.tipo == EVENTO_SUBSTITUICAO || $0.element.tipo == EVENTO_VERMELHO) }
        .sorted { a, b in
            let ma = a.element.minuto ?? 0, mb = b.element.minuto ?? 0
            return ma != mb ? ma < mb : a.offset < b.offset
        }
        .map(\.element)
}

private func vazio(_ s: String?) -> Bool { s == nil || s == "" }

/// computeMinutagem: estado de cada atleta (chave = athlete_id).
public func calcularMinutagem(jogadores: [JogadorJogo], eventos: [EventoJogo], duracao: Int) -> [String: EstadoMinutagem] {
    let dur = max(0, duracao)
    let tl = linhaDoTempo(eventos)
    var saida: [String: EstadoMinutagem] = [:]
    for p in jogadores where !p.atletaId.isEmpty {
        let id = p.atletaId
        let titular = p.titular
        var entrada: Int? = titular ? 0 : nil
        var saidaMin: Int?
        var entrouAos: Int?
        var expulsoAos: Int?
        for e in tl {
            let m = paraMinuto(e.minuto, dur)
            if e.tipo == EVENTO_SUBSTITUICAO {
                if vazio(e.jogadorId) || vazio(e.jogador2Id) { continue } // incompleta (legado): não conta
                if e.jogadorId == id && entrada == nil && !titular { entrada = m; entrouAos = m }
                else if e.jogador2Id == id, let ent = entrada, saidaMin == nil, m >= ent { saidaMin = m }
            } else if e.tipo == EVENTO_VERMELHO, e.jogadorId == id, let ent = entrada, saidaMin == nil, m >= ent {
                saidaMin = m
                expulsoAos = m
            }
        }
        let auto = entrada.map { max(0, (saidaMin ?? dur) - $0) } ?? 0
        let manual = p.minutosManual
        let manualVal = max(0, p.minutosJogados)
        let minutos = manual ? manualVal : auto
        saida[id] = EstadoMinutagem(minutos: minutos, auto: auto, manual: manual, titular: titular,
                                    entrou: !titular && entrouAos != nil, entrouAos: entrouAos, saiuAos: saidaMin,
                                    expulsoAos: expulsoAos, jogou: minutos > 0 || titular || entrouAos != nil)
    }
    return saida
}

private func semEvento(_ eventos: [EventoJogo], _ ignorar: String?) -> [EventoJogo] {
    guard let ignorar else { return eventos }
    return eventos.filter { $0.id != ignorar }
}

private func semManual(_ jogadores: [JogadorJogo]) -> [JogadorJogo] {
    jogadores.map { var p = $0; p.minutosManual = false; return p }
}

/// emCampo: quem está em campo no minuto (quem saiu nesse minuto já não está).
public func emCampo(jogadores: [JogadorJogo], eventos: [EventoJogo], duracao: Int, minuto: Int, ignorar: String? = nil) -> [JogadorJogo] {
    let st = calcularMinutagem(jogadores: semManual(jogadores), eventos: semEvento(eventos, ignorar), duracao: max(duracao, minuto))
    return jogadores.filter { p in
        guard let s = st[p.atletaId] else { return false }
        let entrou = s.titular || (s.entrouAos.map { $0 <= minuto } ?? false)
        let saiu = s.saiuAos.map { $0 <= minuto } ?? false
        return entrou && !saiu
    }
}

/// reservasDisponiveis: reservas relacionados que ainda não entraram.
public func reservasDisponiveis(jogadores: [JogadorJogo], eventos: [EventoJogo], ignorar: String? = nil) -> [JogadorJogo] {
    let usados = Set(semEvento(eventos, ignorar)
        .filter { $0.doNossoTime && $0.tipo == EVENTO_SUBSTITUICAO && !vazio($0.jogadorId) }
        .compactMap(\.jogadorId))
    return jogadores.filter { $0.reserva && !usados.contains($0.atletaId) }
}

/// validarSubstituicao: nil = ok; senão a frase de erro (a mesma do web).
/// `entra` = player_id, `sai` = secondary_player_id.
public func validarSubstituicao(jogadores: [JogadorJogo], eventos: [EventoJogo], duracao: Int,
                                minuto: Int?, entra: String?, sai: String?, ignorar: String? = nil) -> String? {
    func nome(_ id: String?) -> String { jogadores.first { $0.atletaId == id }?.nomeExibido ?? "O atleta" }
    guard let sai, !sai.isEmpty else { return "Escolha quem sai." }
    guard let entra, !entra.isEmpty else { return "Escolha quem entra." }
    if entra == sai { return "Quem sai e quem entra precisam ser atletas diferentes." }
    guard let minuto, minuto >= 1 else { return "Informe o minuto da substituição." }

    let outros = semEvento(eventos, ignorar)
    let pIn = jogadores.first { $0.atletaId == entra }
    let pOut = jogadores.first { $0.atletaId == sai }
    if pOut == nil { return "\(nome(sai)) não está relacionado para o jogo." }
    guard let pIn else { return "\(nome(entra)) não está relacionado para o jogo." }
    if !pIn.reserva { return "\(nome(entra)) é titular: quem entra precisa ser reserva." }

    let subs = outros.filter { $0.doNossoTime && $0.tipo == EVENTO_SUBSTITUICAO }
    if subs.contains(where: { $0.jogadorId == entra }) { return "\(nome(entra)) já entrou no jogo." }
    if subs.contains(where: { $0.jogador2Id == sai }) { return "\(nome(sai)) já saiu do jogo." }

    let st = calcularMinutagem(jogadores: semManual(jogadores), eventos: outros, duracao: max(duracao, minuto))[sai]
    if let exp = st?.expulsoAos, exp <= minuto { return "\(nome(sai)) foi expulso aos \(exp)'." }
    let emCampoAgora = st.map { s in
        (s.titular || (s.entrouAos.map { $0 <= minuto } ?? false)) && !(s.saiuAos.map { $0 <= minuto } ?? false)
    } ?? false
    if !emCampoAgora {
        if let ent = st?.entrouAos, ent > minuto { return "\(nome(sai)) só entra aos \(ent)'." }
        return "\(nome(sai)) não está em campo aos \(minuto)'."
    }
    return nil
}

/// checarSubstituicoes do servidor (o que ele recusa com 400 quando vai `subs_check: true`).
/// O app confere antes de mandar, para dar o aviso na hora (e a fila offline não guardar o que
/// o servidor vai recusar). nil = ok.
public func checarSubstituicoes(jogadores: [JogadorJogo], eventos: [EventoJogo]) -> String? {
    var porId: [String: JogadorJogo] = [:]
    for p in jogadores { porId[p.atletaId] = p }
    func nome(_ id: String) -> String { porId[id]?.nome.flatMap { $0.isEmpty ? nil : $0 } ?? "Atleta" }
    var entrou = Set<String>()
    for e in eventos where e.tipo == EVENTO_SUBSTITUICAO && e.doNossoTime {
        guard let entra = e.jogadorId, !entra.isEmpty, let sai = e.jogador2Id, !sai.isEmpty else { continue }
        let min = e.minuto.map { " (\($0)')" } ?? ""
        if entra == sai { return "Substituição\(min): quem saiu e quem entrou são o mesmo atleta." }
        guard let p = porId[entra] else { return "Substituição\(min): quem entrou não está relacionado para o jogo." }
        if p.titular { return "Substituição\(min): \(nome(entra)) é titular. Quem entra numa substituição precisa ser reserva." }
        if entrou.contains(entra) { return "Substituição\(min): \(nome(entra)) já entrou em outra substituição." }
        entrou.insert(entra)
    }
    return nil
}

/// Texto curto da minutagem do atleta na lista: "↑32'", "↓67'", "exp. 55'" (nil = nada a marcar).
public func marcadorMinutagem(_ s: EstadoMinutagem?) -> (texto: String, tom: String)? {
    guard let s, !s.manual else { return nil }
    if let e = s.expulsoAos { return ("exp. \(e)'", "expulso") }
    if s.entrou, let m = s.entrouAos { return ("↑\(m)'", "entrou") }
    if s.titular, let m = s.saiuAos { return ("↓\(m)'", "saiu") }
    return nil
}

/// "Titular · saiu aos 67'" (a dica do MinutesCell do web).
public func dicaMinutagem(_ s: EstadoMinutagem?) -> String {
    guard let s else { return "" }
    var partes = [s.titular ? "Titular" : (s.entrou ? "Entrou aos \(s.entrouAos ?? 0)'" : "Não entrou")]
    if let e = s.expulsoAos { partes.append("expulso aos \(e)'") } else if let m = s.saiuAos { partes.append("saiu aos \(m)'") }
    return partes.joined(separator: " · ")
}

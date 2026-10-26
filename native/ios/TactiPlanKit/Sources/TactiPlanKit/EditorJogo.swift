import Foundation

// O estado da tela do Jogo e as operações do GameModal do web, sem tela (testado no Linux):
// carregar, escalar por vaga (colocar, mover, trocar, tirar), trocar formação (remapFormation),
// "Encaixar sugestão" (suggestSlots), relacionados (PlayerSelectionModal), camisa do jogo,
// eventos, ajuste manual da minutagem e o CORPO do POST /api/games/:id (o mesmo do web).
// Paridade: dados/jogo/EditorJogo.kt (Android).

/// Os campos do topo do jogo (dados da sessão).
public struct DadosGerais: Codable, Equatable, Sendable {
    public var adversario: String
    public var duracao: Int
    public var campeonatoId: String
    public var rodada: String
    /// "home" | "away" | "neutral" | ""
    public var local: String
    public var video: String
    /// Horário, local do jogo e apresentação (migration 061; aparecem na Convocação).
    public var horario: String
    public var localDoJogo: String
    public var apresentacao: String

    public init(adversario: String = "", duracao: Int = 90, campeonatoId: String = "", rodada: String = "",
                local: String = "", video: String = "", horario: String = "", localDoJogo: String = "", apresentacao: String = "") {
        self.adversario = adversario; self.duracao = duracao; self.campeonatoId = campeonatoId; self.rodada = rodada
        self.local = local; self.video = video
        self.horario = horario; self.localDoJogo = localDoJogo; self.apresentacao = apresentacao
    }

    // Editor guardado no aparelho antes da 061 não tem os campos novos: lê como vazio.
    enum CodingKeys: String, CodingKey { case adversario, duracao, campeonatoId, rodada, local, video, horario, localDoJogo, apresentacao }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        adversario = try c.decodeIfPresent(String.self, forKey: .adversario) ?? ""
        duracao = try c.decodeIfPresent(Int.self, forKey: .duracao) ?? 90
        campeonatoId = try c.decodeIfPresent(String.self, forKey: .campeonatoId) ?? ""
        rodada = try c.decodeIfPresent(String.self, forKey: .rodada) ?? ""
        local = try c.decodeIfPresent(String.self, forKey: .local) ?? ""
        video = try c.decodeIfPresent(String.self, forKey: .video) ?? ""
        horario = try c.decodeIfPresent(String.self, forKey: .horario) ?? ""
        localDoJogo = try c.decodeIfPresent(String.self, forKey: .localDoJogo) ?? ""
        apresentacao = try c.decodeIfPresent(String.self, forKey: .apresentacao) ?? ""
    }
}

public struct EditorJogo: Codable, Equatable, Sendable {
    public var sessaoId: String
    public var modalidade: String
    public var dados: DadosGerais
    public var formacao: String
    public var jogadores: [JogadorJogo]
    public var eventos: [EventoJogo]

    public init(sessaoId: String, modalidade: String, dados: DadosGerais, formacao: String,
                jogadores: [JogadorJogo] = [], eventos: [EventoJogo] = []) {
        self.sessaoId = sessaoId; self.modalidade = modalidade; self.dados = dados; self.formacao = formacao
        self.jogadores = jogadores; self.eventos = eventos
    }

    public var config: ConfigEsporte { configEsporte(modalidade) }

    /// loadMatchData do GameModal: formação resolvida, titular com vaga fora da formação fica
    /// "sem vaga", camisa do jogo (ou a do plantel), nome do atleta.
    public static func carregar(dia: DiaDoJogo, jogo: DadosDoJogo, modalidade: String?) -> EditorJogo {
        let cfg = configEsporte(modalidade)
        let f = resolverFormacao(cfg.modalidade, jogo.formacao ?? dia.formacao)
        let total = totalVagas(f)
        let jogadores = jogo.jogadores.map { p -> JogadorJogo in
            var q = p
            q.vaga = (p.titular && p.vaga.map { $0 >= 0 && $0 < total } == true) ? p.vaga : nil
            q.camisa = p.camisa ?? p.atleta?.camisa
            q.nome = p.atleta?.nome
            return q
        }
        let d = DadosGerais(adversario: dia.adversario ?? "", duracao: (dia.duracao ?? 0) > 0 ? dia.duracao! : cfg.duracaoPadrao,
                            campeonatoId: dia.campeonatoId ?? "", rodada: dia.rodada ?? "", local: dia.local ?? "",
                            video: dia.video ?? "", horario: dia.horario ?? "", localDoJogo: dia.localDoJogo ?? "",
                            apresentacao: dia.apresentacao ?? "")
        let eventos = jogo.eventos.map { e -> EventoJogo in
            var x = e
            x.jogadorId = e.jogadorId ?? e.jogador?.id
            x.jogador2Id = e.jogador2Id ?? e.jogador2?.id
            return x
        }
        return EditorJogo(sessaoId: dia.id, modalidade: cfg.modalidade, dados: d, formacao: f, jogadores: jogadores, eventos: eventos)
    }

    // MARK: leitura

    public var vagas: [Vaga] { vagasDa(formacao) }
    public func ocupante(_ vaga: Int) -> JogadorJogo? { jogadores.first { $0.titular && $0.vaga == vaga } }
    public func jogador(_ atletaId: String?) -> JogadorJogo? { jogadores.first { $0.atletaId == atletaId } }

    /// Titulares em ordem de vaga (sem vaga no fim).
    public var titulares: [JogadorJogo] {
        jogadores.enumerated().filter { $0.element.titular }
            .sorted { a, b in
                let va = a.element.vaga ?? 99, vb = b.element.vaga ?? 99
                return va != vb ? va < vb : a.offset < b.offset
            }.map(\.element)
    }
    public var semVaga: [JogadorJogo] { titulares.filter { $0.vaga == nil } }
    public var reservas: [JogadorJogo] { jogadores.filter { $0.reserva } }
    public var vagasLivres: Int { vagas.count - (titulares.count - semVaga.count) }

    public var golsFeitos: Int { eventos.filter { $0.tipo == EVENTO_GOL }.count }
    public var golsSofridos: Int { eventos.filter { $0.tipo == EVENTO_GOL_SOFRIDO }.count }

    public var minutagem: [String: EstadoMinutagem] {
        calcularMinutagem(jogadores: jogadores, eventos: eventos, duracao: dados.duracao)
    }

    /// Duas pessoas com a mesma camisa no jogo (quase sempre digitação).
    public func camisaRepetida(_ atletaId: String) -> Bool {
        guard let n = jogador(atletaId)?.camisa else { return false }
        return jogadores.filter { $0.camisa == n }.count > 1
    }

    /// Nome de quem está no evento (p.name || athlete.name || o nome que veio no evento || plantel).
    public func nome(_ id: String?, _ reserva: AtletaDoEvento? = nil, plantel: [AtletaResumo] = []) -> String? {
        guard let id, !id.isEmpty else { return reserva?.nome }
        if let p = jogador(id), let n = p.nomeExibido { return n }
        if let n = reserva?.nome, !n.isEmpty { return n }
        return plantel.first { $0.id == id }?.nome
    }

    /// Substituição antiga incompleta (sem quem entra ou sem quem sai) ou com titular como
    /// "quem entrou": aparece com aviso e não conta na minutagem.
    public func problemaDaSubstituicao(_ e: EventoJogo) -> ProblemaSubstituicao? {
        guard e.tipo == EVENTO_SUBSTITUICAO else { return nil }
        if (e.jogadorId ?? "").isEmpty || (e.jogador2Id ?? "").isEmpty { return .incompleta }
        if jogador(e.jogadorId)?.titular == true { return .titular }
        return nil
    }

    /// A linha de baixo do evento (getEventDetail do web, em texto).
    public func detalheDoEvento(_ e: EventoJogo, plantel: [AtletaResumo] = []) -> String? {
        let p1 = nome(e.jogadorId, e.jogador, plantel: plantel)
        let p2 = nome(e.jogador2Id, e.jogador2, plantel: plantel)
        if let prob = problemaDaSubstituicao(e) {
            switch prob {
            case .incompleta:
                return "⇄ Substituição (incompleta)\(p2.map { ": sai \($0)" } ?? "")\(p1.map { ": entra \($0)" } ?? ""). Toque para completar."
            case .titular:
                return "⇄ \(p1 ?? "") é titular e está como \"quem entrou\". Toque para corrigir."
            }
        }
        if e.tipo == EVENTO_SUBSTITUICAO { return "↓ Sai \(p2 ?? "—") · ↑ Entra \(p1 ?? "—")" }
        if e.tipo == EVENTO_GOL {
            if p1 == nil && p2 == nil { return nil }
            return (p1 ?? "Sem autor") + (p2.map { " · assist. \($0)" } ?? "")
        }
        return p1
    }

    /// Eventos em ordem de minuto (estável).
    public var eventosOrdenados: [EventoJogo] {
        eventos.enumerated().sorted { a, b in
            let ma = a.element.minuto ?? 0, mb = b.element.minuto ?? 0
            return ma != mb ? ma < mb : a.offset < b.offset
        }.map(\.element)
    }

    // MARK: escalação no campo

    /// placeAthlete: põe o atleta na vaga. Se ele estava em outra vaga, os dois trocam; quem estava
    /// na vaga e não tem para onde ir vira reserva (devolve o aviso "X foi para as reservas").
    @discardableResult
    public mutating func colocar(_ atleta: AtletaResumo, naVaga vaga: Int) -> String? {
        let ocup = ocupante(vaga)
        let existente = jogador(atleta.id)
        if let ex = existente, ex.titular, ex.vaga == vaga { return nil }
        let deVaga = (existente?.titular ?? false) ? existente?.vaga : nil
        jogadores = jogadores.map { p in
            var q = p
            if p.atletaId == atleta.id { q.status = STATUS_TITULAR; q.vaga = vaga }
            else if let o = ocup, p.atletaId == o.atletaId {
                if let de = deVaga { q.vaga = de } else { q.status = STATUS_RESERVA; q.vaga = nil }
            }
            return q
        }
        if existente == nil {
            jogadores.append(JogadorJogo(atletaId: atleta.id, status: STATUS_TITULAR, vaga: vaga, minutosJogados: 0,
                                         camisa: atleta.camisa, atleta: atleta, nome: atleta.nome))
        }
        if let o = ocup, deVaga == nil { return "\(o.nomeExibido ?? "Atleta") foi para as reservas" }
        return nil
    }

    /// moveTo: leva o atleta para a vaga (troca com quem estiver lá).
    public mutating func mover(_ atletaId: String, paraVaga vaga: Int) {
        guard let m = jogador(atletaId), m.vaga != vaga else { return }
        let ocup = ocupante(vaga)
        let deVaga = m.titular ? m.vaga : nil
        jogadores = jogadores.map { p in
            var q = p
            if p.atletaId == m.atletaId { q.status = STATUS_TITULAR; q.vaga = vaga }
            else if let o = ocup, p.atletaId == o.atletaId { q.vaga = deVaga }
            return q
        }
    }

    /// Arrastar e soltar numa vaga (dropOnSlot do web): titular troca de vaga com quem estiver lá;
    /// reserva entra e quem estava vai para as reservas. Devolve o aviso, se houver.
    @discardableResult
    public mutating func soltar(_ atletaId: String, naVaga vaga: Int) -> String? {
        guard let m = jogador(atletaId) else { return nil }
        if m.titular && m.vaga == vaga { return nil }
        let ocup = ocupante(vaga)
        let eraTitular = m.titular
        let deVaga = eraTitular ? m.vaga : nil
        jogadores = jogadores.map { p in
            var q = p
            if p.atletaId == m.atletaId { q.status = STATUS_TITULAR; q.vaga = vaga }
            else if let o = ocup, p.atletaId == o.atletaId {
                if eraTitular { q.vaga = deVaga } else { q.status = STATUS_RESERVA; q.vaga = nil }
            }
            return q
        }
        if let o = ocup, !eraTitular { return "\(o.nomeExibido ?? "Atleta") foi para as reservas" }
        return nil
    }

    /// Tirar do campo: vira reserva.
    public mutating func tirarDoCampo(_ atletaId: String) {
        jogadores = jogadores.map { p in
            var q = p
            if p.atletaId == atletaId { q.status = STATUS_RESERVA; q.vaga = nil }
            return q
        }
    }

    /// Tirar do jogo: sai da lista e do campo.
    public mutating func tirarDoJogo(_ atletaId: String) { jogadores.removeAll { $0.atletaId == atletaId } }

    /// changeFormation: remapeia por papel; devolve o aviso de quem ficou sem vaga.
    @discardableResult
    public mutating func trocarFormacao(_ nova: String) -> String? {
        guard nova != formacao else { return nil }
        let r = remapearFormacao(jogadores, de: formacao, para: nova)
        jogadores = r.jogadores
        formacao = nova
        guard !r.deslocados.isEmpty else { return nil }
        let nomes = r.deslocados.compactMap(\.nomeExibido).joined(separator: ", ")
        let quem = r.deslocados.count == 1 ? "1 atleta ficou" : "\(r.deslocados.count) atletas ficaram"
        return "\(quem) sem vaga na \(nova): \(nomes). Toque no atleta destacado para reposicionar."
    }

    /// "Encaixar sugestão": devolve o aviso de quantos foram encaixados (nil se nenhum).
    @discardableResult
    public mutating func encaixarSugestao() -> String? {
        let antes = semVaga.count
        jogadores = sugerirVagas(jogadores, formacao: formacao)
        let n = antes - semVaga.count
        return n > 0 ? "\(n) encaixado(s) pela posição cadastrada. Confira e ajuste se precisar." : nil
    }

    // MARK: relacionados (PlayerSelectionModal)

    /// handlePlayersConfirm: a seleção nova (atleta + titular/reserva) mantém vaga, camisa e
    /// minutagem manual de quem já estava; quem virou reserva perde a vaga.
    public mutating func confirmarRelacionados(_ selecao: [(atletaId: String, status: String)], plantel: [AtletaResumo]) {
        jogadores = selecao.map { s in
            let antes = jogador(s.atletaId)
            let atleta = antes?.atleta ?? plantel.first { $0.id == s.atletaId }
            return JogadorJogo(
                atletaId: s.atletaId, status: s.status,
                vaga: s.status == STATUS_TITULAR ? antes?.vaga : nil,
                minutosJogados: antes?.minutosJogados ?? 0, minutosManual: antes?.minutosManual ?? false,
                camisa: antes != nil ? antes!.camisa : atleta?.camisa,
                atleta: atleta, nome: antes?.nome ?? atleta?.nome)
        }
    }

    /// Camisa neste jogo: vazio = sem número; senão 1…99.
    public mutating func mudarCamisa(_ atletaId: String, _ valor: Int?) {
        let v = valor.map { min(99, max(1, $0)) }
        jogadores = jogadores.map { p in var q = p; if p.atletaId == atletaId { q.camisa = v }; return q }
    }

    // MARK: minutagem manual

    public mutating func ajustarMinutos(_ atletaId: String, _ valor: Int) {
        let v = max(0, min(200, valor))
        jogadores = jogadores.map { p in
            var q = p
            if p.atletaId == atletaId { q.minutosManual = true; q.minutosJogados = v }
            return q
        }
    }

    public mutating func voltarAoAutomatico(_ atletaId: String) {
        jogadores = jogadores.map { p in var q = p; if p.atletaId == atletaId { q.minutosManual = false }; return q }
    }

    // MARK: eventos

    public mutating func adicionarEvento(_ e: EventoJogo) { eventos.append(e) }

    public mutating func atualizarEvento(_ e: EventoJogo) {
        eventos = eventos.map { $0.id == e.id ? e : $0 }
    }

    public mutating func removerEvento(_ id: String) { eventos.removeAll { $0.id == id } }

    // MARK: salvar

    /// O corpo do POST /api/games/:id — o mesmo do `saveAllMatchData` do web (com `subs_check`).
    /// Minutagem: a calculada (o servidor refaz a conta); futsal não rastreia (0, sem manual).
    public func corpoSalvar() -> Json {
        let rastreia = config.rastreiaMinutos
        let mins = minutagem
        let ps: [Json] = jogadores.map { p in
            var o: [String: Json] = [
                "athlete_id": .texto(p.atletaId),
                "status": .texto(p.status),
                "slot": p.vaga.map { .numero(Double($0)) } ?? .nulo,
                "minutes_played": .numero(Double(rastreia ? (mins[p.atletaId]?.minutos ?? 0) : 0)),
                "minutes_manual": .booleano(rastreia ? p.minutosManual : false),
                "jersey_number": p.camisa.map { .numero(Double($0)) } ?? .texto(""),
            ]
            if let n = p.nomeExibido { o["name"] = .texto(n) }
            return .objeto(o)
        }
        let es: [Json] = eventos.map { e in
            var o: [String: Json] = [
                "event_type": .texto(e.tipo),
                "team": e.time.map { .texto($0) } ?? .nulo,
                "goal_type": e.tipoGol.map { .texto($0) } ?? .nulo,
                "minute": e.minuto.map { .numero(Double($0)) } ?? .nulo,
                "player_id": e.jogadorId.flatMap { $0.isEmpty ? nil : Json.texto($0) } ?? .nulo,
                "secondary_player_id": e.jogador2Id.flatMap { $0.isEmpty ? nil : Json.texto($0) } ?? .nulo,
            ]
            if let n = e.notas, !n.isEmpty { o["notes"] = .texto(n) }
            return .objeto(o)
        }
        func ouNulo(_ s: String) -> Json { s.isEmpty ? .nulo : .texto(s) }
        return .objeto([
            "formation": .texto(formacao),
            "opponent_name": .texto(dados.adversario),
            "match_duration": .numero(Double(dados.duracao)),
            "players": .lista(ps),
            "events": .lista(es),
            "competition_id": ouNulo(dados.campeonatoId),
            "match_round": ouNulo(dados.rodada),
            "match_location": ouNulo(dados.local),
            "video_full_url": ouNulo(dados.video),
            "match_kickoff": ouNulo(dados.horario),
            "match_venue": ouNulo(dados.localDoJogo.trimmingCharacters(in: .whitespaces)),
            "match_meet_time": ouNulo(dados.apresentacao),
            "subs_check": true,
        ])
    }

    /// Assinatura de tudo o que vai no corpo (alteração não salva = assinatura diferente).
    public var assinatura: String { corpoSalvar().textoJson() }

    /// lineupSig do web: o que sai na convocação (para pedir "salve antes de exportar").
    public var assinaturaConvocacao: String {
        Json.lista([
            .texto(formacao), .texto(dados.adversario), .texto(dados.campeonatoId), .texto(dados.rodada), .texto(dados.local),
            .texto(dados.horario), .texto(dados.localDoJogo), .texto(dados.apresentacao),
            .lista(jogadores.map { p in
                .lista([.texto(p.atletaId), .texto(p.status), p.vaga.map { .numero(Double($0)) } ?? .nulo,
                        .texto(p.camisa.map(String.init) ?? "")])
            }),
        ]).textoJson()
    }

    /// Confere o que o servidor recusaria (400) antes de mandar.
    public func conferirAntesDeSalvar() -> String? {
        if dados.duracao < 1 { return "Informe a duração do jogo." }
        return checarSubstituicoes(jogadores: jogadores, eventos: eventos)
    }
}

public enum ProblemaSubstituicao: String, Equatable, Sendable { case incompleta, titular }

// MARK: remapFormation / suggestSlots

/// "LIN" (formação de uma linha só, ex. futsal 4-0) aceita qualquer jogador de linha.
private func papelCasa(_ de: String, _ para: String) -> Bool {
    de == para || (de != "GOL" && para != "GOL" && (de == "LIN" || para == "LIN"))
}

/// Troca de formação mantendo os atletas por ordem de vaga, linha a linha (por papel).
/// Quem não couber volta para "sem vaga".
public func remapearFormacao(_ jogadores: [JogadorJogo], de: String, para: String) -> (jogadores: [JogadorJogo], deslocados: [JogadorJogo]) {
    let origem = vagasDa(de)
    let destino = vagasDa(para)
    var livres = destino.map(\.indice)
    var novaVaga: [String: Int?] = [:]
    var deslocados: [JogadorJogo] = []
    let comVaga = jogadores.enumerated().filter { $0.element.titular && $0.element.vaga != nil }
        .sorted { a, b in a.element.vaga! != b.element.vaga! ? a.element.vaga! < b.element.vaga! : a.offset < b.offset }
        .map(\.element)
    for p in comVaga {
        let v = p.vaga!
        let papel = v < origem.count ? origem[v].papel : nil
        let i = papel.flatMap { pa in livres.firstIndex { papelCasa(pa, destino[$0].papel) } }
        if let i { novaVaga[p.atletaId] = .some(livres.remove(at: i)) }
        else { novaVaga[p.atletaId] = .some(nil); deslocados.append(p) }
    }
    let novos = jogadores.map { p -> JogadorJogo in
        guard let nv = novaVaga[p.atletaId] else { return p }
        var q = p; q.vaga = nv; return q
    }
    return (novos, deslocados)
}

/// Encaixa os titulares sem vaga nas vagas livres: primeiro onde o papel bate com a posição
/// cadastrada; depois em qualquer vaga livre que não seja a do gol.
public func sugerirVagas(_ jogadores: [JogadorJogo], formacao: String) -> [JogadorJogo] {
    let vs = vagasDa(formacao)
    let ocupadas = Set(jogadores.filter { $0.titular && $0.vaga != nil }.compactMap(\.vaga))
    var livres = vs.filter { !ocupadas.contains($0.indice) }
    let semVaga = jogadores.filter { $0.titular && $0.vaga == nil }
    var escolha: [String: Int] = [:]
    for p in semVaga {
        guard let papel = PAPEL_POR_POSICAO[p.atleta?.posicao ?? ""] else { continue }
        if let i = livres.firstIndex(where: { $0.papel == papel }) { escolha[p.atletaId] = livres.remove(at: i).indice }
    }
    for p in semVaga where escolha[p.atletaId] == nil && !livres.isEmpty {
        if let i = livres.firstIndex(where: { $0.papel != "GOL" }) { escolha[p.atletaId] = livres.remove(at: i).indice }
    }
    return jogadores.map { p in
        guard let v = escolha[p.atletaId] else { return p }
        var q = p; q.vaga = v; return q
    }
}

import Foundation

// A folha "Novo evento" (EventModal do web), sem tela: tipo, time (cartões), momento do gol e
// bola parada, tempo de jogo (1º/2º + acréscimo), quem (autor/assistência; na substituição quem
// SAI — só quem está em campo no minuto — e quem ENTRA — só reservas que ainda não entraram),
// resumo e validação. Paridade: dados/jogo/FormEvento.kt (Android).

public struct OpcaoAtleta: Equatable, Sendable, Identifiable {
    public let id: String
    public let nome: String
    public let camisa: Int?
    /// "Lucas Martins · camisa 5"
    public var rotulo: String { camisa.map { "\(nome) · camisa \($0)" } ?? nome }
}

public enum ResultadoForm: Equatable, Sendable {
    case erro(String)
    /// Gol sem autor: o web pergunta "Salvar gol sem atribuir ao atleta?".
    case confirmarSemAutor
    case ok(EventoJogo)
}

public struct FormEvento: Equatable, Sendable {
    public var tipo: String
    /// 'own' | 'opponent' (só cartões escolhem)
    public var time: String
    public var momento: String
    public var subtipoBP: String
    public var tempo: Int
    public var minutoNoTempo: Int
    public var acrescimo: Int
    /// protagonista: autor do gol, atleta do cartão, quem ENTROU
    public var jogadorId: String
    /// assistência OU quem SAIU
    public var jogador2Id: String
    /// id do evento em edição (nil = novo)
    public let editando: String?
    public let duracao: Int
    public let modalidade: String

    /// Novo evento (padrões do web: gol feito, nosso time, org., 1º tempo, minuto 1) ou edição.
    public init(editando e: EventoJogo? = nil, duracao: Int, modalidade: String?) {
        let cfg = configEsporte(modalidade)
        self.duracao = max(1, duracao)
        self.modalidade = cfg.modalidade
        self.editando = e?.id
        if let e {
            tipo = e.tipo.isEmpty ? EVENTO_GOL : e.tipo
            time = (e.time ?? "").isEmpty ? "own" : e.time!
            let g = lerTipoGol(e.tipoGol)
            momento = g.momento
            subtipoBP = g.subtipoBP
            let m = lerMinuto(e.minuto ?? 0, duracao: self.duracao)
            tempo = m.tempo; minutoNoTempo = m.minutoNoTempo; acrescimo = m.acrescimo
            jogadorId = e.jogadorId ?? e.jogador?.id ?? ""
            jogador2Id = e.jogador2Id ?? e.jogador2?.id ?? ""
        } else {
            tipo = EVENTO_GOL
            time = "own"
            momento = "org"
            subtipoBP = cfg.subtiposBolaParada.first?.valor ?? "falta"
            tempo = 1; minutoNoTempo = 1; acrescimo = 0
            jogadorId = ""; jogador2Id = ""
        }
    }

    public var tipos: [TipoEvento] { tiposDeEvento(modalidade) }
    public var subtiposBP: [OpcaoRotulo] { configEsporte(modalidade).subtiposBolaParada }
    public var ehGol: Bool { tipo == EVENTO_GOL || tipo == EVENTO_GOL_SOFRIDO }
    public var ehCartao: Bool { tipo == EVENTO_AMARELO || tipo == EVENTO_VERMELHO }
    public var ehSubstituicao: Bool { tipo == EVENTO_SUBSTITUICAO }
    public var mostraTime: Bool { ehCartao }
    /// Autor do gol (gol feito) ou atleta do cartão do NOSSO time.
    public var mostraJogador: Bool { tipo == EVENTO_GOL || (ehCartao && time == "own") }
    public var mostraAssistencia: Bool { tipo == EVENTO_GOL }
    public var momentos: [(valor: String, rotulo: String, curto: String)] { momentosDoGol(tipo) }

    public var timeFinal: String {
        switch tipo {
        case EVENTO_GOL, EVENTO_SUBSTITUICAO: return "own"
        case EVENTO_GOL_SOFRIDO: return "opponent"
        default: return time
        }
    }

    // MARK: tempo de jogo

    public var fim1oTempo: Int { fimDo1oTempo(duracao) }
    public var maxNoTempo: Int { tempo == 1 ? fim1oTempo : duracaoDo2oTempo(duracao) }
    public var minuto: MinutoDoJogo { MinutoDoJogo(tempo: tempo, minutoNoTempo: minutoNoTempo, acrescimo: acrescimo) }
    public var minutoTotalAtual: Int { minutoTotal(minuto, duracao: duracao) }
    public var minutoTexto: String { textoMinuto(minuto, duracao: duracao) }
    /// "Minuto (0-45)" / "Minuto (46-90)"
    public var faixaDoTempo: String { tempo == 1 ? "0-\(fim1oTempo)" : "\(fim1oTempo + 1)-\(duracao)" }

    /// Trocar o tipo limpa os atletas (como no web).
    public mutating func mudarTipo(_ t: String) { tipo = t; jogadorId = ""; jogador2Id = "" }

    public mutating func mudarTempo(_ t: Int) {
        tempo = t == 2 ? 2 : 1
        acrescimo = 0
        if minutoNoTempo > maxNoTempo { minutoNoTempo = maxNoTempo }
    }

    public mutating func mudarMinuto(_ v: Int) {
        minutoNoTempo = min(max(v, 1), max(1, maxNoTempo))
        acrescimo = 0
    }

    public mutating func mudarAcrescimo(_ v: Int) {
        acrescimo = min(max(v, 0), 15)
        if v > 0 { minutoNoTempo = maxNoTempo }
    }

    /// −/+ do minuto corrido: anda pelo jogo inteiro (1º tempo → acréscimo → 2º tempo → acréscimo).
    /// No acréscimo, o −/+ mexe no acréscimo; fora dele, anda pelo tempo normal (o "+" no fim do
    /// 1º tempo passa para o 2º; acréscimo só pelo campo próprio).
    public mutating func passo(_ delta: Int) {
        if acrescimo > 0 { acrescimo = min(max(acrescimo + delta, 0), 15); return }
        let total = min(max(minutoTotalAtual + delta, 1), duracao)
        if total <= fim1oTempo { tempo = 1; minutoNoTempo = total } else { tempo = 2; minutoNoTempo = total - fim1oTempo }
    }

    // MARK: opções de atletas

    private func opcao(_ p: JogadorJogo) -> OpcaoAtleta {
        OpcaoAtleta(id: p.atletaId, nome: p.nomeExibido ?? "—", camisa: p.camisa ?? p.atleta?.camisa)
    }

    private func porNome(_ a: OpcaoAtleta, _ b: OpcaoAtleta) -> Bool {
        a.nome.compare(b.nome, locale: Locale(identifier: "pt_BR")) == .orderedAscending
    }

    /// Todos os relacionados, por nome.
    public func relacionados(_ ed: EditorJogo) -> [OpcaoAtleta] {
        ed.jogadores.filter { !$0.atletaId.isEmpty }.map(opcao).sorted(by: porNome)
    }

    /// Quem SAI: em campo no minuto escolhido.
    public func opcoesSai(_ ed: EditorJogo) -> [OpcaoAtleta] {
        emCampo(jogadores: ed.jogadores, eventos: ed.eventos, duracao: ed.dados.duracao, minuto: minutoTotalAtual, ignorar: editando)
            .map(opcao).sorted(by: porNome)
    }

    /// Quem ENTRA: reservas relacionados que ainda não entraram.
    public func opcoesEntra(_ ed: EditorJogo) -> [OpcaoAtleta] {
        reservasDisponiveis(jogadores: ed.jogadores, eventos: ed.eventos, ignorar: editando).map(opcao).sorted(by: porNome)
    }

    /// Autor do gol / atleta do cartão (sem quem já é a assistência).
    public func opcoesJogador(_ ed: EditorJogo) -> [OpcaoAtleta] { relacionados(ed).filter { $0.id != jogador2Id } }
    public func opcoesAssistencia(_ ed: EditorJogo) -> [OpcaoAtleta] { relacionados(ed).filter { $0.id != jogadorId } }

    public static let SEM_RESERVA = "Nenhum reserva disponível: todos já entraram ou não há reservas relacionados. Use \"Selecionar\" no jogo para relacionar reservas."
    public func semNinguemEmCampo() -> String { "Ninguém em campo aos \(minutoTexto)" }

    // MARK: resumo e validação

    /// O "Resumo:" do EventModal.
    public func resumo(_ ed: EditorJogo) -> String {
        let todos = relacionados(ed)
        let n1 = todos.first { $0.id == jogadorId }?.nome
        let n2 = todos.first { $0.id == jogador2Id }?.nome
        let mom = momentos.first { $0.valor == momento }?.rotulo ?? ""
        let bp = subtiposBP.first { $0.valor == subtipoBP }?.rotulo ?? ""
        let momTexto = ehGol ? " em \(mom)\(momento == "bp" ? " · \(bp)" : "")" : ""
        let min = minutoTexto
        switch tipo {
        case EVENTO_GOL: return "Gol \(n1.map { "de \($0)" } ?? "")\(n2.map { " (assist. \($0))" } ?? "")\(momTexto) aos \(min)"
        case EVENTO_GOL_SOFRIDO: return "Gol sofrido\(momTexto) aos \(min)"
        case EVENTO_AMARELO: return "Amarelo \(time == "own" ? (n1.map { "pra \($0)" } ?? "(nosso time)") : "(adversário)") aos \(min)"
        case EVENTO_VERMELHO: return "Vermelho \(time == "own" ? (n1.map { "pra \($0)" } ?? "(nosso time)") : "(adversário)") aos \(min)"
        case EVENTO_SUBSTITUICAO: return "Sai \(n2 ?? "—"), entra \(n1 ?? "—") aos \(min)"
        default: return ""
        }
    }

    /// Na substituição: "Minutagem automática: Lucas 67' · Pedro 23'. Pedro assume a vaga VOL."
    public func previaMinutagem(_ ed: EditorJogo) -> String? {
        guard ehSubstituicao, ed.config.rastreiaMinutos, !jogadorId.isEmpty, !jogador2Id.isEmpty,
              case .ok(let e) = montar(ed, confirmouSemAutor: true) else { return nil }
        var simulado = ed
        if editando != nil { simulado.atualizarEvento(e) } else { simulado.adicionarEvento(e) }
        let m = simulado.minutagem
        let sai = ed.jogador(jogador2Id), entra = ed.jogador(jogadorId)
        guard let ms = m[jogador2Id], let me = m[jogadorId] else { return nil }
        var t = "Minutagem automática: \(nomeCurto(sai?.nomeExibido)) \(ms.minutos)' · \(nomeCurto(entra?.nomeExibido)) \(me.minutos)'."
        if let v = sai?.vaga, sai?.titular == true, let pos = etiquetaDaVaga(ed.formacao, v, ed.modalidade) {
            t += " \(nomeCurto(entra?.nomeExibido)) assume a vaga \(pos)."
        }
        return t
    }

    /// handleAdd: valida e monta o evento (com o id do evento em edição).
    public func montar(_ ed: EditorJogo, confirmouSemAutor: Bool = false, novoId: String = "local-\(UUID().uuidString)") -> ResultadoForm {
        // O web exige o atleta em todo cartão, mas o seletor só aparece para o nosso time (cartão do
        // adversário nunca salvava): aqui só o do nosso time exige.
        if ehCartao && time == "own" && jogadorId.isEmpty { return .erro("Selecione o atleta que recebeu o cartão.") }
        if ehSubstituicao, let erro = validarSubstituicao(
            jogadores: ed.jogadores, eventos: ed.eventos, duracao: ed.dados.duracao, minuto: minutoTotalAtual,
            entra: jogadorId, sai: jogador2Id, ignorar: editando) {
            return .erro(erro)
        }
        if tipo == EVENTO_GOL && jogadorId.isEmpty && !confirmouSemAutor { return .confirmarSemAutor }
        let comAtleta = mostraJogador || ehSubstituicao
        return .ok(EventoJogo(
            id: editando ?? novoId, tipo: tipo, time: timeFinal,
            tipoGol: ehGol ? gravarTipoGol(momento: momento, subtipoBP: subtipoBP, tipoEvento: tipo) : nil,
            minuto: minutoTotalAtual,
            jogadorId: comAtleta && !jogadorId.isEmpty ? jogadorId : nil,
            jogador2Id: (ehGol || ehSubstituicao) && !jogador2Id.isEmpty ? jogador2Id : nil))
    }
}

import Foundation
import Testing
@testable import TactiPlanKit

// Jogo (T2): modelos, editor (regras do GameModal), formulário do evento (EventModal), corpo do
// POST, lista de jogos, rotas, fila offline e sincronização. Paridade: dados/jogo/*Test.kt.

/// GET /api/games/:id de verdade (formato do servidor), com campo novo e número em texto.
let JOGO_REAL = """
{"formation":"4-3-3","players":[
{"id":"mp1","session_id":"s1","athlete_id":"a1","status":"starter","minutes_played":90,"jersey_number":null,"slot":0,"minutes_manual":false,"athlete":{"id":"a1","name":"Gabriel Lima","jersey_number":1,"position":"GOL","photo_url":null}},
{"id":"mp2","athlete_id":"a2","status":"starter","minutes_played":"67","jersey_number":"5","slot":5,"minutes_manual":false,"athlete":{"id":"a2","name":"Lucas Martins","jersey_number":8,"position":"VOL"}},
{"id":"mp3","athlete_id":"a3","status":"starter","minutes_played":90,"jersey_number":null,"slot":14,"athlete":{"id":"a3","name":"Rafael Souza","jersey_number":9,"position":"CA"}},
{"id":"mp4","athlete_id":"a4","status":"substitute","minutes_played":23,"jersey_number":null,"slot":null,"athlete":{"id":"a4","name":"Pedro Alves","jersey_number":17,"position":"MEI"}}],
"events":[
{"id":"e1","event_type":"goal_scored","team":"own","goal_type":"bp_off_corner","minute":12,"player_id":"a3","secondary_player_id":"a2","player":{"id":"a3","name":"Rafael Souza","jersey_number":9},"secondary_player":{"id":"a2","name":"Lucas Martins","jersey_number":8},"campo_novo":1},
{"id":"e2","event_type":"substitution","team":"own","goal_type":null,"minute":67,"player_id":"a4","secondary_player_id":"a2","player":null,"secondary_player":null},
{"id":"e3","event_type":"goal_conceded","team":"opponent","goal_type":"org_def","minute":"80","player_id":null,"secondary_player_id":null}]}
"""

let DIA_REAL = """
{"id":"s1","date":"2026-10-24","day_name":"Sábado","session_type":"match","opponent_name":"Rival FC","match_duration":90,"competition_id":"c1","match_round":"7","match_location":"away","video_full_url":null,"formation":"4-3-3","blocks":[]}
"""

func pacoteReal() throws -> (DiaDoJogo, DadosDoJogo) {
    (try JSONDecoder().decode(DiaDoJogo.self, from: Data(DIA_REAL.utf8)),
     try JSONDecoder().decode(DadosDoJogo.self, from: Data(JOGO_REAL.utf8)))
}

func editorReal(_ modalidade: String = "football_11") throws -> EditorJogo {
    let (d, j) = try pacoteReal()
    return EditorJogo.carregar(dia: d, jogo: j, modalidade: modalidade)
}

let PLANTEL = [
    AtletaResumo(id: "a1", nome: "Gabriel Lima", camisa: 1, posicao: "GOL"),
    AtletaResumo(id: "a2", nome: "Lucas Martins", camisa: 8, posicao: "VOL"),
    AtletaResumo(id: "a3", nome: "Rafael Souza", camisa: 9, posicao: "CA"),
    AtletaResumo(id: "a4", nome: "Pedro Alves", camisa: 17, posicao: "MEI"),
    AtletaResumo(id: "a5", nome: "Caio Rocha", camisa: 2, posicao: "LD"),
    AtletaResumo(id: "a6", nome: "Diego Nunes", camisa: 8, posicao: "ZAG"),
]

@Suite struct ModelosJogoTests {
    @Test func `jogo real decodifica e o editor carrega como o web`() throws {
        let ed = try editorReal()
        #expect(ed.formacao == "4-3-3")
        #expect(ed.dados.adversario == "Rival FC")
        #expect(ed.dados.local == "away")
        #expect(ed.dados.rodada == "7")
        #expect(ed.jogadores.count == 4)
        // camisa do jogo (override "5") ou a do plantel
        #expect(ed.jogador("a2")?.camisa == 5)
        #expect(ed.jogador("a1")?.camisa == 1)
        // vaga fora da formação (14) vira "sem vaga"
        #expect(ed.jogador("a3")?.vaga == nil)
        #expect(ed.semVaga.map(\.atletaId) == ["a3"])
        #expect(ed.jogador("a2")?.nome == "Lucas Martins")
        #expect(ed.golsFeitos == 1 && ed.golsSofridos == 1)
        #expect(ed.eventos[2].minuto == 80)
        // minutagem pela substituição: Lucas saiu aos 67, Pedro entrou aos 67
        #expect(ed.minutagem["a2"]?.minutos == 67)
        #expect(ed.minutagem["a4"]?.minutos == 23)
        #expect(marcadorMinutagem(ed.minutagem["a4"])?.texto == "↑67'")
        #expect(marcadorMinutagem(ed.minutagem["a2"])?.texto == "↓67'")
        #expect(dicaMinutagem(ed.minutagem["a2"]) == "Titular · saiu aos 67'")
    }

    @Test func `jogo sem formacao usa a padrao e duracao padrao da modalidade`() throws {
        let d = DiaDoJogo(id: "s", data: "2026-10-24", duracao: nil)
        let ed = EditorJogo.carregar(dia: d, jogo: DadosDoJogo(), modalidade: "futsal")
        #expect(ed.formacao == "2-2")
        #expect(ed.dados.duracao == 40)
        #expect(!ed.config.rastreiaMinutos)
        #expect(EditorJogo.carregar(dia: d, jogo: DadosDoJogo(formacao: "4-4-2"), modalidade: "football_7").formacao == "2-3-1")
    }

    @Test func `rotulos de evento detalhe e substituicao incompleta`() throws {
        var ed = try editorReal()
        let gol = ed.eventos[0]
        #expect(rotuloDoEvento(gol) == "Gol")
        #expect(rotuloTipoGol(gol.tipoGol) == "Bola parada · Escanteio")
        #expect(ed.detalheDoEvento(gol) == "Rafael Souza · assist. Lucas Martins")
        #expect(ed.detalheDoEvento(ed.eventos[1]) == "↓ Sai Lucas Martins · ↑ Entra Pedro Alves")
        #expect(rotuloDoEvento(EventoJogo(id: "x", tipo: EVENTO_AMARELO, time: "opponent")) == "Amarelo (adv.)")
        ed.adicionarEvento(EventoJogo(id: "e9", tipo: EVENTO_SUBSTITUICAO, time: "own", minuto: 50, jogadorId: nil, jogador2Id: "a1"))
        let inc = ed.eventos.last!
        #expect(ed.problemaDaSubstituicao(inc) == .incompleta)
        #expect(ed.detalheDoEvento(inc) == "⇄ Substituição (incompleta): sai Gabriel Lima. Toque para completar.")
        ed.adicionarEvento(EventoJogo(id: "e10", tipo: EVENTO_SUBSTITUICAO, time: "own", minuto: 50, jogadorId: "a1", jogador2Id: "a2"))
        #expect(ed.problemaDaSubstituicao(ed.eventos.last!) == .titular)
        #expect(ed.eventosOrdenados.map(\.id) == ["e1", "e9", "e10", "e2", "e3"])
    }
}

@Suite struct EditorJogoTests {
    @Test func `colocar na vaga vazia troca de vaga e manda o ocupante para as reservas`() throws {
        var ed = try editorReal()
        // vaga vazia
        #expect(ed.colocar(PLANTEL[4], naVaga: 4) == nil)
        #expect(ed.jogador("a5")?.vaga == 4)
        #expect(ed.jogador("a5")?.camisa == 2)
        // atleta que já está em campo vai para a vaga ocupada → os dois trocam
        #expect(ed.colocar(PLANTEL[4], naVaga: 0) == nil)
        #expect(ed.jogador("a5")?.vaga == 0)
        #expect(ed.jogador("a1")?.vaga == 4)
        // reserva na vaga ocupada → ocupante vira reserva (aviso)
        #expect(ed.colocar(PLANTEL[3], naVaga: 0) == "Caio Rocha foi para as reservas")
        #expect(ed.jogador("a4")?.titular == true)
        #expect(ed.jogador("a5")?.reserva == true && ed.jogador("a5")?.vaga == nil)
        // a mesma vaga: nada muda
        let antes = ed
        #expect(ed.colocar(PLANTEL[3], naVaga: 0) == nil)
        #expect(ed == antes)
    }

    @Test func `mover tirar do campo e tirar do jogo`() throws {
        var ed = try editorReal()
        ed.mover("a3", paraVaga: 9) // sem vaga → vaga livre
        #expect(ed.jogador("a3")?.vaga == 9)
        ed.mover("a3", paraVaga: 0) // troca com o goleiro
        #expect(ed.jogador("a3")?.vaga == 0 && ed.jogador("a1")?.vaga == 9)
        ed.tirarDoCampo("a3")
        #expect(ed.jogador("a3")?.reserva == true && ed.jogador("a3")?.vaga == nil)
        ed.tirarDoJogo("a3")
        #expect(ed.jogador("a3") == nil)
    }

    @Test func `trocar formacao avisa quem ficou sem vaga e encaixar sugestao`() throws {
        var ed = try editorReal()
        _ = ed.colocar(PLANTEL[4], naVaga: 8) // EE no 4-3-3 (ATA)
        _ = ed.colocar(PLANTEL[5], naVaga: 9) // CA
        let aviso = ed.trocarFormacao("4-5-1") // 1 atacante só
        #expect(aviso == "1 atleta ficou sem vaga na 4-5-1: Diego Nunes. Toque no atleta destacado para reposicionar.")
        #expect(ed.formacao == "4-5-1")
        #expect(ed.trocarFormacao("4-5-1") == nil)
        let n = ed.semVaga.count
        let msg = ed.encaixarSugestao()
        #expect(msg == "\(n) encaixado(s) pela posição cadastrada. Confira e ajuste se precisar.")
        #expect(ed.semVaga.isEmpty)
        // Rafael (CA) e Diego (ZAG): ZAG vai para uma vaga de DEF
        let diego = try #require(ed.jogador("a6")?.vaga)
        #expect(papelDaVaga("4-5-1", diego) == "DEF")
    }

    @Test func `relacionados mantem vaga camisa e manual de quem ja estava`() throws {
        var ed = try editorReal()
        ed.ajustarMinutos("a2", 70)
        ed.confirmarRelacionados([("a1", STATUS_TITULAR), ("a2", STATUS_RESERVA), ("a6", STATUS_TITULAR)], plantel: PLANTEL)
        #expect(ed.jogadores.map(\.atletaId) == ["a1", "a2", "a6"])
        #expect(ed.jogador("a1")?.vaga == 0)
        #expect(ed.jogador("a2")?.vaga == nil, "virou reserva, perde a vaga")
        #expect(ed.jogador("a2")?.camisa == 5)
        #expect(ed.jogador("a2")?.minutosManual == true)
        #expect(ed.jogador("a6")?.camisa == 8)
        #expect(ed.jogador("a6")?.nome == "Diego Nunes")
    }

    @Test func `camisa repetida e limites da camisa e dos minutos`() throws {
        var ed = try editorReal()
        ed.mudarCamisa("a1", 5)
        #expect(ed.camisaRepetida("a1") && ed.camisaRepetida("a2"))
        #expect(!ed.camisaRepetida("a3"))
        ed.mudarCamisa("a1", 150)
        #expect(ed.jogador("a1")?.camisa == 99)
        ed.mudarCamisa("a1", nil)
        #expect(ed.jogador("a1")?.camisa == nil && !ed.camisaRepetida("a1"))
        ed.ajustarMinutos("a1", 500)
        #expect(ed.minutagem["a1"]?.minutos == 200 && ed.minutagem["a1"]?.manual == true)
        ed.voltarAoAutomatico("a1")
        #expect(ed.minutagem["a1"]?.minutos == 90 && ed.minutagem["a1"]?.manual == false)
    }

    @Test func `corpo do POST igual ao do web`() throws {
        var ed = try editorReal()
        ed.ajustarMinutos("a1", 88)
        ed.dados.video = ""
        let c = ed.corpoSalvar()
        #expect(c["formation"] == "4-3-3")
        #expect(c["opponent_name"] == "Rival FC")
        #expect(c["match_duration"] == 90)
        #expect(c["competition_id"] == "c1")
        #expect(c["match_round"] == "7")
        #expect(c["match_location"] == "away")
        #expect(c["video_full_url"] == .nulo)
        #expect(c["subs_check"] == true)
        guard case .lista(let ps)? = c["players"], case .lista(let es)? = c["events"] else { Issue.record("sem listas"); return }
        #expect(ps[0] == ["athlete_id": "a1", "status": "starter", "slot": 0, "minutes_played": 88, "minutes_manual": true,
                          "jersey_number": 1, "name": "Gabriel Lima"])
        #expect(ps[2]["slot"] == .nulo)
        #expect(ps[1]["minutes_played"] == 67)
        #expect(ps[3]["minutes_played"] == 23)
        #expect(es[1] == ["event_type": "substitution", "team": "own", "goal_type": .nulo, "minute": 67,
                          "player_id": "a4", "secondary_player_id": "a2"])
        // futsal: não rastreia (0, sem manual)
        var fs = try editorReal("futsal")
        fs.ajustarMinutos("a1", 30)
        guard case .lista(let fps)? = fs.corpoSalvar()["players"] else { return }
        #expect(fps[0]["minutes_played"] == 0 && fps[0]["minutes_manual"] == false)
    }

    @Test func `assinaturas mudam com alteracao`() throws {
        var ed = try editorReal()
        let a = ed.assinatura, c = ed.assinaturaConvocacao
        ed.dados.video = "https://youtu.be/x"
        #expect(ed.assinatura != a)
        #expect(ed.assinaturaConvocacao == c, "vídeo não muda a convocação")
        ed.mudarCamisa("a1", 12)
        #expect(ed.assinaturaConvocacao != c)
    }

    @Test func `conferir antes de salvar pega o que o servidor recusa`() throws {
        var ed = try editorReal()
        #expect(ed.conferirAntesDeSalvar() == nil)
        ed.adicionarEvento(EventoJogo(id: "x", tipo: EVENTO_SUBSTITUICAO, time: "own", minuto: 70, jogadorId: "a1", jogador2Id: "a3"))
        #expect(ed.conferirAntesDeSalvar() == "Substituição (70'): Gabriel Lima é titular. Quem entra numa substituição precisa ser reserva.")
    }
}

@Suite struct FormEventoTests {
    @Test func `novo evento com os padroes do web`() throws {
        let f = FormEvento(duracao: 90, modalidade: "football_11")
        #expect(f.tipo == EVENTO_GOL && f.time == "own" && f.momento == "org")
        #expect(f.subtipoBP == "falta_frontal")
        #expect(f.minutoTexto == "1'")
        #expect(f.tipos.map(\.valor) == [EVENTO_GOL, EVENTO_GOL_SOFRIDO, EVENTO_AMARELO, EVENTO_VERMELHO, EVENTO_SUBSTITUICAO])
        let fs = FormEvento(duracao: 40, modalidade: "futsal")
        #expect(!fs.tipos.contains { $0.valor == EVENTO_SUBSTITUICAO })
        #expect(fs.tipos.map(\.rotulo).suffix(2) == ["Falta Acum.", "6ª Falta"])
        #expect(fs.subtiposBP.map(\.valor) == ["falta", "corner", "lateral", "penalty", "tiro_livre", "falta_acumulada"])
    }

    @Test func `tempo de jogo acrescimo e passo`() {
        var f = FormEvento(duracao: 90, modalidade: nil)
        f.mudarMinuto(60)
        #expect(f.minutoNoTempo == 45 && f.minutoTexto == "45'")
        f.mudarAcrescimo(3)
        #expect(f.minutoTexto == "45+3'" && f.minutoTotalAtual == 48)
        f.mudarTempo(2)
        #expect(f.acrescimo == 0 && f.minutoTexto == "90'")
        f.mudarMinuto(22)
        #expect(f.minutoTexto == "67'" && f.minutoTotalAtual == 67)
        #expect(f.faixaDoTempo == "46-90")
        f.passo(-22)
        #expect(f.tempo == 1 && f.minutoNoTempo == 45)
        f.passo(1)
        #expect(f.tempo == 2 && f.minutoNoTempo == 1 && f.minutoTexto == "46'")
        f.mudarAcrescimo(20)
        #expect(f.acrescimo == 15)
        f.passo(-1)
        #expect(f.minutoTexto == "90+14'")
        // edição: 47' = acréscimo do 1º tempo
        let e = FormEvento(editando: EventoJogo(id: "x", tipo: EVENTO_AMARELO, time: "opponent", minuto: 47), duracao: 90, modalidade: nil)
        #expect(e.tempo == 1 && e.acrescimo == 2 && e.time == "opponent" && e.minutoTexto == "45+2'")
    }

    @Test func `substituicao so com quem esta em campo e reservas nao usados`() throws {
        let ed = try editorReal()
        var f = FormEvento(duracao: 90, modalidade: "football_11")
        f.mudarTipo(EVENTO_SUBSTITUICAO)
        f.mudarTempo(2)
        f.mudarMinuto(30) // 75'
        // Lucas já saiu aos 67, Pedro entrou
        #expect(f.opcoesSai(ed).map(\.id) == ["a1", "a4", "a3"])
        #expect(f.opcoesEntra(ed).isEmpty, "o único reserva já entrou")
        #expect(f.opcoesSai(ed).first?.rotulo == "Gabriel Lima · camisa 1")
        f.jogador2Id = "a1"
        #expect(f.montar(ed) == .erro("Escolha quem entra."))
        #expect(f.resumo(ed) == "Sai Gabriel Lima, entra — aos 75'")
        // editando a substituição existente: Pedro volta a ser opção de quem entra
        let edicao = FormEvento(editando: ed.eventos[1], duracao: 90, modalidade: nil)
        #expect(edicao.opcoesEntra(ed).map(\.id) == ["a4"])
        #expect(edicao.opcoesSai(ed).map(\.id).contains("a2"))
        guard case .ok(let ev) = edicao.montar(ed) else { Issue.record("devia validar"); return }
        #expect(ev.id == "e2" && ev.minuto == 67 && ev.jogadorId == "a4" && ev.jogador2Id == "a2")
    }

    @Test func `previa da minutagem na substituicao`() throws {
        var ed = try editorReal()
        ed.confirmarRelacionados(ed.jogadores.map { ($0.atletaId, $0.status) } + [("a5", STATUS_RESERVA)], plantel: PLANTEL)
        var f = FormEvento(duracao: 90, modalidade: nil)
        f.mudarTipo(EVENTO_SUBSTITUICAO)
        f.mudarTempo(2); f.mudarMinuto(25) // 70'
        f.jogador2Id = "a1"; f.jogadorId = "a5"
        #expect(f.previaMinutagem(ed) == "Minutagem automática: Lima 70' · Rocha 20'. Rocha assume a vaga GOL.")
        #expect(f.resumo(ed) == "Sai Gabriel Lima, entra Caio Rocha aos 70'")
    }

    @Test func `gol sem autor pede confirmacao e cartao exige atleta do nosso time`() throws {
        let ed = try editorReal()
        var f = FormEvento(duracao: 90, modalidade: nil)
        #expect(f.montar(ed) == .confirmarSemAutor)
        guard case .ok(let g) = f.montar(ed, confirmouSemAutor: true, novoId: "n1") else { Issue.record("gol"); return }
        #expect(g == EventoJogo(id: "n1", tipo: EVENTO_GOL, time: "own", tipoGol: "org_off", minuto: 1))
        f.momento = "bp"; f.subtipoBP = "corner"; f.jogadorId = "a3"; f.jogador2Id = "a2"
        #expect(f.resumo(ed) == "Gol de Rafael Souza (assist. Lucas Martins) em Bola Parada Ofensiva · Escanteio aos 1'")
        guard case .ok(let g2) = f.montar(ed, novoId: "n2") else { return }
        #expect(g2.tipoGol == "bp_off_corner" && g2.jogador2Id == "a2")
        f.mudarTipo(EVENTO_AMARELO)
        #expect(f.montar(ed) == .erro("Selecione o atleta que recebeu o cartão."))
        f.time = "opponent"
        #expect(f.resumo(ed) == "Amarelo (adversário) aos 1'")
        guard case .ok(let c) = f.montar(ed, novoId: "n3") else { Issue.record("cartão adv."); return }
        #expect(c.time == "opponent" && c.jogadorId == nil && c.tipoGol == nil)
        f.mudarTipo(EVENTO_GOL_SOFRIDO)
        f.momento = "trans"
        #expect(f.resumo(ed) == "Gol sofrido em Transição Defensiva aos 1'")
        guard case .ok(let s) = f.montar(ed, novoId: "n4") else { return }
        #expect(s.time == "opponent" && s.tipoGol == "trans_def")
    }
}

@Suite struct ListaJogosTests {
    let jogos = [
        JogoDaLista(sessaoId: "p1", data: "2026-10-17", adversario: "União EC", golsFeitos: 2, golsSofridos: 1, local: "home", campeonatoId: "c1"),
        JogoDaLista(sessaoId: "p2", data: "2026-10-10", adversario: "EC Serra", golsFeitos: 1, golsSofridos: 1, local: "away"),
        JogoDaLista(sessaoId: "p3", data: "2026-10-03", adversario: "Real Bairro", golsFeitos: 0, golsSofridos: 2, local: "home", campeonatoId: "c1"),
        JogoDaLista(sessaoId: "h", data: "2026-10-22", adversario: "Hoje FC"),
        JogoDaLista(sessaoId: "f2", data: "2026-11-07", adversario: "Longe FC", campeonatoId: "c1"),
        JogoDaLista(sessaoId: "f1", data: "2026-10-24", adversario: "Rival FC", rodada: "7", local: "away", campeonatoId: "c1"),
    ]

    @Test func `proximo em destaque passados com V E D`() {
        let l = organizarJogos(jogos, hoje: "2026-10-22")
        #expect(l.proximo?.sessaoId == "h")
        #expect(l.proximos.map(\.sessaoId) == ["f1", "f2"])
        #expect(l.passados.map(\.sessaoId) == ["p1", "p2", "p3"])
        #expect((l.vitorias, l.empates, l.derrotas) == (1, 1, 1))
        let c1 = organizarJogos(jogos, hoje: "2026-10-22", campeonatoId: "c1")
        #expect(c1.proximo?.sessaoId == "f1")
        #expect((c1.vitorias, c1.empates, c1.derrotas) == (1, 0, 1))
        // jogo de hoje com gol já é resultado
        #expect(!jogoFuturo(JogoDaLista(sessaoId: "x", data: "2026-10-22", golsFeitos: 1), hoje: "2026-10-22"))
    }

    @Test func `textos da linha e do heroi`() {
        #expect(placarDaLinha(jogos[0], clube: "Demo FC") == "Demo FC 2 × 1 União EC")
        #expect(placarDaLinha(jogos[1], clube: "Demo FC") == "EC Serra 1 × 1 Demo FC")
        #expect(detalheDaLinha(jogos[5], campeonato: "Estadual") == "Sábado, 24/10 · Fora · Rodada 7 · Estadual")
        #expect(emQuantosDias("2026-10-24", hoje: "2026-10-22") == "em 2 dias")
        #expect(emQuantosDias("2026-10-23", hoje: "2026-10-22") == "amanhã")
        #expect(emQuantosDias("2026-10-22", hoje: "2026-10-22") == "hoje")
        #expect(resultadoDo(feitos: 0, sofridos: 2) == .derrota)
        #expect(PeriodoJogos.mes.intervalo(hoje: "2026-10-22") == ("2026-09-21", "2027-02-19"))
    }

    @Test func `matchesHistory real decodifica`() throws {
        let j = #"{"session_id":"s1","date":"2026-10-17T00:00:00.000Z","opponent":"União EC","goals_scored":"2","goals_conceded":1,"result":"win","match_round":6,"match_location":"home","competition_id":null}"#
        let x = try JSONDecoder().decode(JogoDaLista.self, from: Data(j.utf8))
        #expect(x.data == "2026-10-17" && x.golsFeitos == 2 && x.rodada == "6" && x.campeonatoId == nil)
    }

    @Test func `corpos e nomes dos PDFs`() {
        #expect(corpoConvocacao("s1") == ["session_id": "s1"])
        #expect(corpoRelatorioJogos(clubeId: "c", inicio: "2026-09-21", fim: "2026-10-22", rotulo: "Último mês")
                == ["club_id": "c", "start_date": "2026-09-21", "end_date": "2026-10-22", "filter_type": "custom", "period_label": "Último mês"])
        #expect(nomePdfConvocacao(adversario: "Rival FC", data: "2026-10-24") == "Convocacao_Rival_FC_24-10-2026.pdf")
        #expect(nomePdfConvocacao(adversario: nil, data: "2026-10-24") == "Convocacao_Adversario_24-10-2026.pdf")
        #expect(nomePdfJogos(clube: "Demo FC", rotulo: "3 meses") == "Desempenho_Demo_FC_3_meses.pdf")
    }
}

@Suite struct ApiJogoHttpTests {
    @Test func `rotas cabecalhos e corpo do salvar`() async throws {
        let t = TransporteFalso()
        let api = ApiJogoHttp(api: Api(base: "https://x.test/api", transporte: t), token: "tpa_abc", workspaceId: "ws-1")
        t.respostas = [
            Resposta(status: 200, corpo: Data(#"{"totalMatches":1,"matchesHistory":[{"session_id":"s1","date":"2026-10-17","goals_scored":1,"goals_conceded":0}]}"#.utf8)),
            Resposta(status: 200, corpo: Data(JOGO_REAL.utf8)),
            Resposta(status: 200, corpo: Data(#"[{"id":"a1","name":"Gabriel","jersey_number":"1"}]"#.utf8)),
            Resposta(status: 200, corpo: Data(#"[{"id":"c1","name":"Estadual","season":2026}]"#.utf8)),
            Resposta(status: 200, corpo: Data(#"{"message":"Game data saved successfully"}"#.utf8)),
        ]
        let l = try await api.listarJogos(clubeId: "c 1", inicio: "2026-09-21", fim: "2027-02-19")
        #expect(l.map(\.sessaoId) == ["s1"])
        let j = try await api.jogo("s1")
        #expect(j.jogadores.count == 4)
        let a = try await api.atletas(clubeId: "c1")
        #expect(a.first?.camisa == 1)
        let c = try await api.campeonatos(clubeId: "c1")
        #expect(c.first?.rotulo == "Estadual · 2026")
        try await api.salvar("s1", corpo: ["subs_check": true])
        let p = t.pedidos
        #expect(p.map { $0.url.absoluteString } == [
            "https://x.test/api/stats/games?clubId=c%201&start_date=2026-09-21&end_date=2027-02-19",
            "https://x.test/api/games/s1",
            "https://x.test/api/athletes?status=active&club_id=c1",
            "https://x.test/api/competitions?clubId=c1",
            "https://x.test/api/games/s1",
        ])
        #expect(p.allSatisfy { $0.cabecalho("x-workspace-id") == "ws-1" && $0.cabecalho("authorization") == "Bearer tpa_abc" })
        #expect(p[4].metodo == "POST")
        #expect(try Json.ler(p[4].corpo!) == ["subs_check": true])
    }

    @Test func `mensagens amigaveis de escrita`() {
        #expect(mensagemErroJogo(ErroApi(status: 403, codigo: nil, mensagem: "Sem permissão pra editar jogos")) == MSG_SEM_PERMISSAO_JOGO)
        #expect(mensagemErroJogo(ErroApi(status: 402, codigo: "READ_ONLY", mensagem: "assine")) == TEXTO_NAO_EDITA)
        #expect(mensagemErroJogo(ErroApi(status: 409, codigo: "CLUB_ARCHIVED", mensagem: "x")) == TEXTO_CLUBE_ARQUIVADO)
        #expect(mensagemErroJogo(ErroApi(status: 400, codigo: "INVALID_SUBSTITUTION", mensagem: "Substituição (3'): …")) == "Substituição (3'): …")
    }
}

// MARK: fila offline

final class ApiJogoFalsa: ApiJogo, @unchecked Sendable {
    private let trava = NSLock()
    var dia: DiaDoJogo
    var jogoAtual: DadosDoJogo
    var erroSalvar: Error?
    var erroLer: Error?
    private var _salvos: [Json] = []
    var salvos: [Json] { trava.withLock { _salvos } }

    init(dia: DiaDoJogo, jogo: DadosDoJogo) { self.dia = dia; self.jogoAtual = jogo }

    func listarJogos(clubeId: String, inicio: String, fim: String) async throws -> [JogoDaLista] { [] }
    func dia(_ sessaoId: String) async throws -> DiaDoJogo { if let erroLer { throw erroLer }; return dia }
    func jogo(_ sessaoId: String) async throws -> DadosDoJogo { if let erroLer { throw erroLer }; return jogoAtual }
    func atletas(clubeId: String) async throws -> [AtletaResumo] { PLANTEL }
    func campeonatos(clubeId: String) async throws -> [Campeonato] { [] }
    func salvar(_ sessaoId: String, corpo: Json) async throws {
        if let erroSalvar { throw erroSalvar }
        trava.withLock { _salvos.append(corpo) }
    }
}

@Suite struct FilaJogosTests {
    func montar() throws -> (ApiJogoFalsa, FilaJogos, SincronizadorJogos, EditorJogo) {
        let (d, j) = try pacoteReal()
        let api = ApiJogoFalsa(dia: d, jogo: j)
        let fila = FilaJogos(armazem: ArmazemMemoria())
        let sinc = SincronizadorJogos(servico: ServicoJogo(api: api, clubeId: "c1", modalidade: "football_11"), fila: fila)
        return (api, fila, sinc, EditorJogo.carregar(dia: d, jogo: j, modalidade: "football_11"))
    }

    @Test func `guardar junta alteracoes e mantem a base da primeira vez`() throws {
        let (_, fila, _, ed) = try montar()
        try fila.guardar(ed, base: "B1", alteracoes: 2, agora: 10)
        var ed2 = ed
        ed2.dados.video = "v"
        let p = try fila.guardar(ed2, base: "B2", alteracoes: 3, agora: 20)
        #expect(p.alteracoes == 5 && p.base == "B1" && p.editor.dados.video == "v")
        #expect(fila.todas().map(\.sessaoId) == ["s1"])
        #expect(textoFila(alteracoes: 5, semConexao: true) == "Sem conexão · 5 alterações para enviar")
        #expect(textoFila(alteracoes: 1, semConexao: false) == "1 alteração para enviar")
    }

    @Test func `envia sem conflito quando o servidor nao mudou`() async throws {
        let (api, fila, sinc, ed) = try montar()
        var local = ed
        local.adicionarEvento(EventoJogo(id: "local-1", tipo: EVENTO_GOL, time: "own", tipoGol: "org_off", minuto: 88, jogadorId: "a3"))
        try fila.guardar(local, base: ed.assinaturaServidor, alteracoes: 1)
        #expect(await sinc.enviar("s1") == .enviado(conflito: false))
        #expect(fila.pendencia("s1") == nil)
        #expect(api.salvos.count == 1)
        #expect(api.salvos[0] == local.corpoSalvar())
    }

    @Test func `conflito vale o local e avisa`() async throws {
        let (api, fila, sinc, ed) = try montar()
        try fila.guardar(ed, base: ed.assinaturaServidor, alteracoes: 1)
        api.jogoAtual.eventos.removeAll() // alguém mexeu pelo web
        #expect(await sinc.enviar("s1") == .enviado(conflito: true))
        #expect(api.salvos.first == ed.corpoSalvar(), "mandou o do aparelho")
    }

    @Test func `sem rede fica na fila e recusa fica marcada`() async throws {
        let (api, fila, sinc, ed) = try montar()
        try fila.guardar(ed, base: nil, alteracoes: 1)
        api.erroSalvar = ErroApi.offline()
        #expect(await sinc.enviar("s1") == .semRede)
        #expect(fila.pendencia("s1")?.erro == nil)
        api.erroSalvar = ErroApi(status: 402, codigo: "READ_ONLY", mensagem: "x")
        #expect(await sinc.enviar("s1") == .recusado(TEXTO_NAO_EDITA))
        #expect(fila.pendencia("s1")?.erro == TEXTO_NAO_EDITA)
        api.erroSalvar = ErroApi(status: 401, codigo: nil, mensagem: "x")
        if case .sessaoEncerrada = await sinc.enviar("s1") {} else { Issue.record("401 encerra a sessão") }
        api.erroSalvar = nil
        api.erroLer = ErroApi(status: 503, codigo: nil, mensagem: "x")
        fila.remover("s1")
        try fila.guardar(ed, base: "B", alteracoes: 1)
        #expect(await sinc.enviar("s1") == .semRede, "conferir a versão sem rede = sem rede")
        api.erroLer = nil
        #expect(await sinc.enviar("nada") == .nadaAEnviar)
    }

    @Test func `pendencia que o servidor recusaria nao e enviada`() async throws {
        let (api, fila, sinc, ed) = try montar()
        var ruim = ed
        ruim.adicionarEvento(EventoJogo(id: "x", tipo: EVENTO_SUBSTITUICAO, time: "own", minuto: 70, jogadorId: "a1", jogador2Id: "a3"))
        try fila.guardar(ruim, base: nil, alteracoes: 1)
        if case .recusado(let m) = await sinc.enviar("s1") { #expect(m.contains("é titular")) } else { Issue.record("devia recusar") }
        #expect(api.salvos.isEmpty)
    }

    @Test func `cache do pacote para abrir sem sinal`() throws {
        let (_, fila, _, _) = try montar()
        let (d, j) = try pacoteReal()
        fila.guardarCache(PacoteJogo(dia: d, jogo: j, atletas: PLANTEL, campeonatos: []))
        #expect(fila.cache("s1")?.jogo == j)
        #expect(fila.cache("s1")?.atletas.count == 6)
        #expect(fila.todas().isEmpty, "cache não é pendência")
    }
}

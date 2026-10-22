import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Testing
@testable import TactiPlanKit

// E2E OPCIONAL contra o servidor de verdade, com o token do app (só roda com as variáveis):
//   TACTIPLAN_E2E_BASE=http://127.0.0.1:3001/api TACTIPLAN_E2E_TOKEN=tpa_… TACTIPLAN_E2E_WS=<workspace>
//   TACTIPLAN_E2E_CLUBE=<clube> TACTIPLAN_E2E_JOGO=<session_id de um dia de JOGO vazio> swift test --filter E2E
// Usa o código do Kit de ponta a ponta: carrega o jogo, escala por vaga, lança eventos pelo
// FormEvento (com substituições), salva no POST do web, confere a minutagem gravada pelo servidor,
// a recusa da substituição inválida (400), a fila offline com conflito e os PDFs.
// Só na conta demo ou com usuário temporário; quem roda apaga o jogo depois.

private let ENV = ProcessInfo.processInfo.environment
private let E2E_LIGADO = ENV["TACTIPLAN_E2E_TOKEN"] != nil && ENV["TACTIPLAN_E2E_JOGO"] != nil

@Suite(.enabled(if: E2E_LIGADO), .serialized) struct E2EJogoTests {
    let base = ENV["TACTIPLAN_E2E_BASE"] ?? "http://127.0.0.1:3001/api"
    let token = ENV["TACTIPLAN_E2E_TOKEN"] ?? ""
    let ws = ENV["TACTIPLAN_E2E_WS"] ?? ""
    let clube = ENV["TACTIPLAN_E2E_CLUBE"] ?? ""
    let jogo = ENV["TACTIPLAN_E2E_JOGO"] ?? ""

    var servico: ServicoJogo {
        ServicoJogo(api: ApiJogoHttp(api: Api(base: base, transporte: TransporteURLSession(timeout: 60)), token: token, workspaceId: ws),
                    clubeId: clube, modalidade: "football_11")
    }

    func evento(_ ed: EditorJogo, _ f: (inout FormEvento) -> Void) throws -> EventoJogo {
        var form = FormEvento(duracao: ed.dados.duracao, modalidade: ed.modalidade)
        f(&form)
        switch form.montar(ed, confirmouSemAutor: true) {
        case .ok(let e): return e
        case .erro(let m): throw ErroApi(status: 0, codigo: "FORM", mensagem: m)
        case .confirmarSemAutor: throw ErroApi(status: 0, codigo: "FORM", mensagem: "sem autor")
        }
    }

    @Test func `escalar lancar eventos salvar e conferir a minutagem do servidor`() async throws {
        let s = servico
        let p = try await s.carregar(jogo)
        #expect(p.atletas.count >= 14, "plantel do clube")
        var ed = EditorJogo.carregar(dia: p.dia, jogo: p.jogo, modalidade: "football_11")
        ed.trocarFormacao("4-3-3")
        let goleiros = p.atletas.filter { $0.posicao == "GOL" }
        let linha = p.atletas.filter { $0.posicao != "GOL" }
        let titulares = [goleiros[0]] + Array(linha.prefix(10))
        let reservas = Array(linha.dropFirst(10).prefix(3))
        ed.confirmarRelacionados(titulares.map { ($0.id, STATUS_TITULAR) } + reservas.map { ($0.id, STATUS_RESERVA) }, plantel: p.atletas)
        #expect(ed.semVaga.count == 11)
        ed.encaixarSugestao()
        #expect(ed.semVaga.isEmpty, "todos encaixados")
        #expect(ed.ocupante(0)?.atletaId == goleiros[0].id, "goleiro na vaga do gol")
        // posição EM CAMPO derivada da vaga
        #expect(ed.titulares.compactMap { etiquetaDaVaga(ed.formacao, $0.vaga, ed.modalidade) }
                == ["GOL", "LE", "ZAG", "ZAG", "LD", "MEI", "MEI", "MEI", "EE", "CA", "ED"])
        // camisa repetida avisa
        ed.mudarCamisa(titulares[1].id, titulares[2].camisa)
        #expect(ed.camisaRepetida(titulares[1].id))
        ed.mudarCamisa(titulares[1].id, titulares[1].camisa)

        let ca = try #require(ed.ocupante(9)), mei = try #require(ed.ocupante(6)), zag = try #require(ed.ocupante(2))
        ed.adicionarEvento(try evento(ed) { f in
            f.mudarMinuto(23); f.jogadorId = ca.atletaId; f.jogador2Id = mei.atletaId; f.momento = "bp"; f.subtipoBP = "corner"
        })
        ed.adicionarEvento(try evento(ed) { f in f.mudarTipo(EVENTO_GOL_SOFRIDO); f.mudarMinuto(40); f.momento = "trans" })
        ed.adicionarEvento(try evento(ed) { f in f.mudarTipo(EVENTO_AMARELO); f.mudarMinuto(44); f.jogadorId = zag.atletaId })
        // substituição: quem saiu primeiro (em campo), quem entrou (banco)
        var sub = FormEvento(duracao: ed.dados.duracao, modalidade: ed.modalidade)
        sub.mudarTipo(EVENTO_SUBSTITUICAO); sub.mudarTempo(2); sub.mudarMinuto(15) // 60'
        #expect(sub.opcoesSai(ed).count == 11)
        #expect(sub.opcoesEntra(ed).map(\.id).sorted() == reservas.map(\.id).sorted())
        sub.jogador2Id = mei.atletaId; sub.jogadorId = reservas[0].id
        #expect(sub.previaMinutagem(ed)?.contains("assume a vaga MEI") == true)
        guard case .ok(let s1) = sub.montar(ed) else { Issue.record("sub 60"); return }
        ed.adicionarEvento(s1)
        // quem entrou aos 60 sai aos 75 (joga a diferença)
        ed.adicionarEvento(try evento(ed) { f in
            f.mudarTipo(EVENTO_SUBSTITUICAO); f.mudarTempo(2); f.mudarMinuto(30); f.jogador2Id = reservas[0].id; f.jogadorId = reservas[1].id
        })
        // expulsão de titular aos 80
        ed.adicionarEvento(try evento(ed) { f in f.mudarTipo(EVENTO_VERMELHO); f.mudarTempo(2); f.mudarMinuto(35); f.jogadorId = zag.atletaId })
        // o reserva já usado não aparece mais para entrar
        var outra = FormEvento(duracao: 90, modalidade: nil); outra.mudarTipo(EVENTO_SUBSTITUICAO)
        #expect(outra.opcoesEntra(ed).map(\.id) == [reservas[2].id])
        ed.ajustarMinutos(ca.atletaId, 88) // ajuste manual
        let local = ed.minutagem

        try await s.api.salvar(jogo, corpo: ed.corpoSalvar())
        let p2 = try await s.carregar(jogo)
        let ed2 = EditorJogo.carregar(dia: p2.dia, jogo: p2.jogo, modalidade: "football_11")
        #expect(ed2.formacao == "4-3-3")
        #expect(ed2.eventos.count == 6)
        #expect(ed2.golsFeitos == 1 && ed2.golsSofridos == 1)
        for j in p2.jogo.jogadores {
            #expect(j.minutosJogados == local[j.atletaId]?.minutos, "minutagem do servidor = do app (\(j.nomeExibido ?? j.atletaId))")
        }
        #expect(p2.jogo.jogadores.first { $0.atletaId == mei.atletaId }?.minutosJogados == 60)
        #expect(p2.jogo.jogadores.first { $0.atletaId == reservas[0].id }?.minutosJogados == 15)
        #expect(p2.jogo.jogadores.first { $0.atletaId == reservas[1].id }?.minutosJogados == 15)
        #expect(p2.jogo.jogadores.first { $0.atletaId == zag.atletaId }?.minutosJogados == 80)
        #expect(p2.jogo.jogadores.first { $0.atletaId == ca.atletaId }?.minutosManual == true)
        #expect(p2.jogo.jogadores.first { $0.atletaId == ca.atletaId }?.minutosJogados == 88)
        #expect(p2.jogo.jogadores.first { $0.atletaId == reservas[2].id }?.minutosJogados == 0)
        // a assinatura do que voltou bate com a do que foi (sem conflito falso na fila)
        #expect(ed2.assinaturaServidor == ed.assinaturaServidor)
        print("E2E minutagem:", p2.jogo.jogadores.map { "\($0.atleta?.nome ?? "?"): \($0.minutosJogados)\($0.minutosManual ? " (manual)" : "")" })
    }

    @Test func `substituicao invalida recusada com 400 e fila offline com conflito`() async throws {
        let s = servico
        let p = try await s.carregar(jogo)
        var ed = EditorJogo.carregar(dia: p.dia, jogo: p.jogo, modalidade: "football_11")
        let tit = ed.titulares
        guard tit.count >= 2 else { Issue.record("rode o outro teste antes"); return }
        // titular como "quem entrou": o servidor recusa (subs_check)
        var ruim = ed
        ruim.adicionarEvento(EventoJogo(id: "x", tipo: EVENTO_SUBSTITUICAO, time: "own", minuto: 70, jogadorId: tit[0].atletaId, jogador2Id: tit[1].atletaId))
        #expect(ruim.conferirAntesDeSalvar() != nil, "o app já pega antes")
        do {
            try await s.api.salvar(jogo, corpo: ruim.corpoSalvar())
            Issue.record("devia recusar")
        } catch let e as ErroApi {
            #expect(e.status == 400 && e.codigo == "INVALID_SUBSTITUTION")
            #expect(mensagemErroJogo(e) == ruim.conferirAntesDeSalvar())
        }
        // fila: guardado sem sinal com a base de agora; alguém muda pelo web; ao enviar, vale o local
        let fila = FilaJogos(armazem: ArmazemMemoria())
        let baseAgora = ed.assinaturaServidor
        ed.adicionarEvento(EventoJogo(id: "local-1", tipo: EVENTO_GOL, time: "own", tipoGol: "org_off", minuto: 89, jogadorId: tit[1].atletaId))
        try fila.guardar(ed, base: baseAgora, alteracoes: 1)
        var web = EditorJogo.carregar(dia: p.dia, jogo: p.jogo, modalidade: "football_11")
        web.dados.rodada = "99"
        try await s.api.salvar(jogo, corpo: web.corpoSalvar()) // "o web" mexeu
        let r = await SincronizadorJogos(servico: s, fila: fila).enviar(jogo)
        #expect(r == .enviado(conflito: true))
        let p3 = try await s.carregar(jogo)
        let ed3 = EditorJogo.carregar(dia: p3.dia, jogo: p3.jogo, modalidade: "football_11")
        #expect(ed3.golsFeitos == ed.golsFeitos, "valeu o local (gol lançado sem sinal)")
        #expect(ed3.dados.rodada != "99")
        #expect(fila.pendencia(jogo) == nil)
        // sem mudança no servidor: sem conflito
        var ed4 = ed3
        ed4.dados.video = "https://youtu.be/teste-t2"
        try fila.guardar(ed4, base: ed3.assinaturaServidor, alteracoes: 1)
        #expect(await SincronizadorJogos(servico: s, fila: fila).enviar(jogo) == .enviado(conflito: false))
    }

    @Test func `pdf da convocacao e dos jogos`() async throws {
        let t = ApiTreinoHttp(api: Api(base: base, transporte: TransporteURLSession(timeout: 90)), upload: nil, token: token, workspaceId: ws)
        let conv = try await t.pdfDoRelatorio("convocacao", corpo: corpoConvocacao(jogo))
        #expect(conv.prefix(4) == Data("%PDF".utf8))
        let hoje = hojeBrasilia()
        let iv = PeriodoJogos.ano.intervalo(hoje: hoje)
        let jogos = try await t.pdfDoRelatorio("jogos", corpo: corpoRelatorioJogos(clubeId: clube, inicio: iv.inicio, fim: hoje, rotulo: "1 ano"))
        #expect(jogos.prefix(4) == Data("%PDF".utf8))
        let lista = try await servico.api.listarJogos(clubeId: clube, inicio: iv.inicio, fim: iv.fim)
        let org = organizarJogos(lista, hoje: hoje)
        #expect((org.proximos + [org.proximo].compactMap { $0 } + org.passados).contains { $0.sessaoId == jogo }, "o jogo aparece na lista")
        let dir = FileManager.default.temporaryDirectory
        try conv.write(to: dir.appendingPathComponent("e2e-convocacao.pdf"))
        try jogos.write(to: dir.appendingPathComponent("e2e-jogos.pdf"))
        print("E2E PDFs: convocação \(conv.count) bytes, jogos \(jogos.count) bytes em \(dir.path)")
    }
}

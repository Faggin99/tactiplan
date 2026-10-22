import Foundation
import Testing
@testable import TactiPlanKit

private actor TransporteQuadro: Transporte {
    var pedidos: [Requisicao] = []
    let respostas: [String: (Int, String)]
    init(_ r: [String: (Int, String)]) { respostas = r }
    func enviar(_ r: Requisicao) async throws -> Resposta {
        pedidos.append(r)
        let chave = "\(r.metodo) \(r.url.path)"
        let (s, c) = respostas[chave] ?? (404, "{\"error\":\"x\"}")
        return Resposta(status: s, corpo: Data(c.utf8))
    }
    func todos() -> [Requisicao] { pedidos }
}

@Suite struct QuadroTests {
    private func api(_ t: TransporteQuadro) -> ApiQuadroHttp {
        ApiQuadroHttp(ClienteWeb(api: Api(base: "https://x.test/api", transporte: t), token: "tpa_1", workspaceId: "ws-1"))
    }

    @Test func `rotas do quadro com token e conta`() async throws {
        let t = TransporteQuadro([
            "GET /api/plays": (200, #"[{"id":"p1","name":"Saída","keyframes":[{"index":0,"elements":[],"drawings":[]}],"club_name":"Sub-17","updated_at":"2026-10-22T12:00:00.000Z"}]"#),
            "POST /api/plays": (201, #"{"id":"p2","name":"Nova"}"#),
            "PUT /api/plays/p1": (200, #"{"id":"p1","name":"Renomeada"}"#),
            "DELETE /api/plays/p1": (200, #"{"message":"ok"}"#),
            "GET /api/plays/p1": (200, #"{"id":"p1","name":"Saída"}"#),
        ])
        let a = api(t)
        let l = try await a.listar()
        #expect(l.map(\.id) == ["p1"] && l[0].totalQuadros == 1 && l[0].clubeNome == "Sub-17")
        #expect(try await a.criar(["name": "Nova"]).id == "p2")
        #expect(try await a.atualizar("p1", ["name": "Renomeada"]).nome == "Renomeada")
        #expect(try await a.abrir("p1").nome == "Saída")
        try await a.excluir("p1")
        let ps = await t.todos()
        #expect(ps.map(\.metodo) == ["GET", "POST", "PUT", "GET", "DELETE"])
        #expect(ps.allSatisfy { $0.cabecalho("X-Workspace-Id") == "ws-1" && $0.cabecalho("authorization") == "Bearer tpa_1" })
    }

    @Test func `erro do servidor vira mensagem`() async {
        let t = TransporteQuadro(["POST /api/plays": (402, #"{"error":"Esta conta está em modo só leitura","code":"READ_ONLY"}"#)])
        do { _ = try await api(t).criar(["name": "x"]); Issue.record("devia falhar") } catch {
            #expect(mensagemErroQuadro(error) == "Esta conta está em modo só leitura")
        }
    }

    @Test func `busca e resumo da lista`() {
        let js: [Jogada] = [
            Jogada(["id": "1", "name": "Saída de bola", "keyframes": [[:], [:], [:]], "club_name": "Sub-17", "updated_at": "2026-10-22T02:00:00.000Z"]),
            Jogada(["id": "2", "name": "Escanteio curto", "description": "bola parada", "keyframes": [[:]]]),
        ]
        #expect(filtrarJogadas(js, busca: "SAIDA").map(\.id) == ["1"])
        #expect(filtrarJogadas(js, busca: "parada").map(\.id) == ["2"])
        #expect(filtrarJogadas(js, busca: "  ").count == 2)
        let brt = TimeZone(identifier: "America/Sao_Paulo")!
        #expect(resumoJogada(js[0], fuso: brt) == "3 quadros · 21/10/2026 · criada em Sub-17")
        #expect(resumoJogada(js[1], fuso: brt) == "1 quadro")
    }

    @Test func `duplicar e renomear mandam o mesmo corpo do salvar do web`() {
        let j = Jogada(["id": "1", "name": "Saída", "description": "d", "field_type": "futsal", "keyframes": [["index": 0, "elements": []]]])
        let c = corpoDaJogada(j, nome: nomeDaCopia(j.nome), clubeId: "c1")
        #expect(c["name"] == "Saída (cópia)" && c["description"] == "d" && c["club_id"] == "c1" && c["field_type"] == "futsal")
        #expect(c["keyframes"] == [["index": 0, "elements": [], "drawings": []]])
        #expect(nomeValidoJogada("  ") == nil && nomeValidoJogada(" A ") == "A")
    }

    @Test func `permissoes do quadro`() {
        func ctx(_ perms: [String], leitura: Bool, arquivado: Bool = false) -> ContextoClube {
            let conta = Conta(id: "w", nome: "W", papel: "owner", permissoes: perms, somenteLeitura: leitura)
            return ContextoClube(conta: conta, clube: nil, permissoes: Set(perms), somenteLeitura: leitura || arquivado, mensagemSomenteLeitura: "")
        }
        #expect(permissoesQuadro(ctx(["tactical:view", "tactical:edit"], leitura: false)) == PermissoesQuadro(ver: true, editar: true))
        #expect(permissoesQuadro(ctx(["tactical:view", "tactical:edit"], leitura: true)) == PermissoesQuadro(ver: true, editar: false))
        #expect(permissoesQuadro(ctx(["tactical:view"], leitura: false)) == PermissoesQuadro(ver: true, editar: false))
        // Clube arquivado não trava jogada (é da conta).
        #expect(permissoesQuadro(ctx(["tactical:view", "tactical:edit"], leitura: false, arquivado: true)).editar)
    }

    @Test func `play avanca pelo relogio e para no ultimo quadro`() {
        #expect(Reproducao(atual: 0, total: 1) == nil)
        var r = Reproducao(atual: 2, total: 3)!
        #expect(r.quadro == 0)
        r.avancar(750, velocidade: 1)
        #expect(r.quadro == 0 && abs(r.t - 0.5) < 1e-9)
        let trocou = r.avancar(750, velocidade: 1)
        #expect(trocou)
        #expect(r.quadro == 1 && !r.terminou)
        r.avancar(750, velocidade: 2)
        #expect(r.terminou && r.quadro == 2)
        var q = Reproducao(atual: 0, total: 4)!
        q.avancar(10_000, velocidade: 0.5)
        #expect(q.terminou && q.quadro == 3)
    }

    @Test func `toque acha a peca e o desenho de cima`() {
        let d = DimensoesCanvas(larguraTela: 800, alturaTela: 500, campoX: 48, campoY: 30, largura: 700, altura: 450)
        let ps = [Peca(["id": "a", "type": "player", "x": 50, "y": 50]), Peca(["id": "b", "type": "ball", "x": 51, "y": 50])]
        #expect(pecaNoPonto(ps, 357, 225, d)?.id == "b")
        #expect(pecaNoPonto(ps, 340, 225, d)?.id == "a")
        #expect(pecaNoPonto(ps, 10, 10, d) == nil)
        let ds = [Desenho(["id": "s", "drawType": "arrow_straight", "x1": 0, "y1": 0, "x2": 100, "y2": 0]),
                  Desenho(["id": "z", "drawType": "zone_rect", "x": 10, "y": 10, "w": 20, "h": 20])]
        #expect(desenhoNoPonto(ds, 350, 5, d)?.id == "s")
        #expect(desenhoNoPonto(ds, 140, 90, d)?.id == "z")
        #expect(desenhoNoPonto(ds, 600, 400, d) == nil)
    }

    @Test func `rascunho de desenho vira o mesmo objeto do web`() {
        let d = dimensoesCanvas(844, 390, tipo: "football_11", vista: "full", reservaBaixo: 64)
        var r = RascunhoDesenho(modo: "zone_rect", cor: "#ef4444", tracejado: [], x: 40, y: 30)
        r.mover(20, 60)
        let z = r.terminar(20, 60, dims: d)!
        #expect(z["x"] == 20 && z["y"] == 30 && z["w"] == 20 && z["h"] == 30)
        #expect(z["color"] == "rgba(239,68,68,0.15)" && z["strokeColor"] == "rgba(239,68,68,0.5)")
        var l = RascunhoDesenho(modo: "free_draw", cor: "#fff", tracejado: [], x: 1, y: 1)
        #expect(l.terminar(1, 1, dims: d) == nil)
        l.mover(2, 2)
        let lv = l.terminar(2, 2, dims: d)!
        #expect(lv["points"] == [1, 1, 2, 2] && lv["dash"] == nil && lv["strokeWidth"] == 2.5)
        #expect(dadosTexto("  ", x: 1, y: 1, cor: "#fff") == nil)
        #expect(dadosTexto(" Oi ", x: 1, y: 2, cor: "#fff")?["text"] == "Oi")
        // Fim fora da tela é preso (margem 4 px).
        var s = RascunhoDesenho(modo: "arrow_straight", cor: "#fff", tracejado: [8, 5], x: 50, y: 50)
        s.mover(500, 50)
        let sv = s.terminar(500, 50, dims: d)!
        #expect(sv["x2"]!.numero! == limitesArrasto(d, margem: 4).maxX && sv["dash"] == [8, 5])
    }

    @Test func `cores css do desenho nativo`() {
        #expect(corCss("#ff0000") == CorRGBA(1, 0, 0, 1))
        #expect(corCss("#3b82f699")!.a == Double(0x99) / 255)
        #expect(corCss("rgba(250, 204, 21, 0.15)") == CorRGBA(250.0 / 255, 204.0 / 255, 21.0 / 255, 0.15))
        #expect(corCss("white") == CorRGBA(1, 1, 1))
        #expect(corCss("bogus") == nil)
    }

    @Test func `nome do video e subtitulo`() {
        #expect(nomeArquivoVideo("Saída de bola 4-3-3", hojeISO: "2026-10-22") == "Saída_de_bola_4_3_3_2026-10-22.mp4")
        #expect(nomeArquivoVideo("", hojeISO: "2026-10-22") == "jogada_2026-10-22.mp4")
        #expect(subtituloEditor(tipo: "football_11", vista: "full", atual: 1, total: 3) == "Futebol 11 · campo inteiro · quadro 2 de 3")
        #expect(rotuloMedidas("futsal") == "40 × 20 m")
    }

    @Test func `caminho do desenho livre passa por todos os pontos`() {
        let c = caminhoLivre([0, 0, 10, 0, 20, 10, 30, 10])
        guard case .mover(0, 0) = c.first, case .quadratica(_, _, _, _) = c[1], case .quadratica(_, _, 30, 10) = c.last else {
            Issue.record("caminho \(c)"); return
        }
        #expect(caminhoLivre([0, 0, 5, 5]) == [.mover(0, 0), .linha(5, 5)])
    }

    @Test func `jogador do plantel, goleiro, bola e objeto`() {
        let at = dadosJogadorAtleta("B", atletaId: "at1", nome: "Lia", camisa: nil, proxima: 4, aleatorio: { 0.5 })
        #expect(at["jerseyNumber"] == 4 && at["athleteId"] == "at1" && at["x"] == 50 && at["isGoalkeeper"] == false)
        #expect(dadosJogadorAtleta("A", atletaId: "x", nome: "x", camisa: 9, proxima: 2, aleatorio: { 0 })["jerseyNumber"] == 9)
        #expect(dadosGoleiro("B")["x"] == 95 && dadosGoleiro("A")["name"] == "GOL")
        #expect(dadosBola()["team"] == .nulo)
        #expect(dadosObjeto("cone", aleatorio: { 1 })["x"] == 65)
    }
}

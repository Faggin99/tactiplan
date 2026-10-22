import Foundation
import Testing
@testable import TactiPlanKit

// PARIDADE T5 (quadro tático) com o web: native/paridade/quadro.json é gerado do código do web
// (node native/paridade/gerar-quadro.mjs; o npm test do backend falha se ficar desatualizado).
// O Android lê o mesmo arquivo (ParidadeQuadroTest.kt).

private let RAIZ_Q = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

private let Q: Json = try! Json.ler(Data(contentsOf: RAIZ_Q.appendingPathComponent("native/paridade/quadro.json")))

private func lista(_ j: Json?) -> [Json] { if case .lista(let l)? = j { return l }; return [] }
private func num(_ j: Json?) -> Double { j?.numero ?? .nan }

/// Igualdade de JSON com folga de 1e-9 nos números (ordem de chaves não importa).
func jsonQuase(_ a: Json?, _ b: Json?) -> Bool {
    switch (a ?? .nulo, b ?? .nulo) {
    case (.numero(let x), .numero(let y)): return x == y || abs(x - y) <= 1e-9 * max(1, abs(x), abs(y))
    case (.lista(let x), .lista(let y)): return x.count == y.count && zip(x, y).allSatisfy { jsonQuase($0, $1) }
    case (.objeto(let x), .objeto(let y)):
        return Set(x.keys) == Set(y.keys) && x.allSatisfy { jsonQuase($0.value, y[$0.key]) }
    case (let x, let y): return x == y
    }
}

private func perto(_ a: Double, _ b: Double) -> Bool { a == b || abs(a - b) <= 1e-9 * max(1, abs(a), abs(b)) }

/// Mesma normalização do gerador: ids viram "#n" pela ordem quadros → peças → desenhos.
private func normalizarQuadros(_ qs: [QuadroJogada]) -> (Json, [String: String]) {
    var mapa: [String: String] = [:]
    func nome(_ id: Json?) -> Json {
        guard let s = id?.texto else { return id ?? .nulo }
        if mapa[s] == nil { mapa[s] = "#\(mapa.count + 1)" }
        return .texto(mapa[s]!)
    }
    let frames: [Json] = qs.map { q in
        var o = q.extras
        o["elements"] = .lista(q.elementos.map { e in var d = e.dados; d["id"] = nome(d["id"]); return .objeto(d) })
        o["drawings"] = .lista(q.desenhos.map { e in var d = e.dados; d["id"] = nome(d["id"]); return .objeto(d) })
        return .objeto(o)
    }
    return (.lista(frames), mapa)
}

private func estadoNormalizado(_ e: EditorQuadro) -> Json {
    let (frames, mapa) = normalizarQuadros(e.quadros)
    func sel(_ id: String?) -> Json { guard let id else { return .nulo }; return .texto(mapa[id] ?? "?") }
    return .objeto([
        "frames": frames, "currentFrameIndex": .numero(Double(e.atual)), "canUndo": .booleano(e.podeDesfazer),
        "canRedo": .booleano(e.podeRefazer), "isDirty": .booleano(e.alterado), "fieldType": .texto(e.tipoCampo),
        "fieldView": .texto(e.vista), "teamAColor": .texto(e.corA), "teamBColor": .texto(e.corB),
        "selectedElementId": sel(e.pecaSelecionada), "selectedDrawingId": sel(e.desenhoSelecionado),
    ])
}

private func posicoes(_ j: Json?) -> [PosicaoFormacao] {
    lista(j).map { p in
        PosicaoFormacao(num(p["x"]), num(p["y"]), Int(num(p["jerseyNumber"])), p["name"]?.texto ?? "",
                        goleiro: verdadeiroJs(p["isGoalkeeper"]))
    }
}

private func rodarRoteiro(_ nome: String, _ passos: [Json], tipoInicial: String = "football_11") {
    var e = EditorQuadro(tipoInicial: tipoInicial)
    e.agoraMs = { 1_767_225_600_000 }
    var refs: [Int: String] = [:]
    for (k, passo) in passos.enumerated() {
        let a = passo["acao"]!
        let ref = a["ref"].flatMap { $0.numero }.map { refs[Int($0)] ?? "?" }
        var resultado: Json = .nulo
        switch a["op"]!.texto! {
        case "addElement": refs[k] = e.adicionarPeca(a["data"]!.objeto!)
        case "removeElement": e.removerPeca(ref!)
        case "updateElementPosition": e.moverPeca(ref!, x: num(a["x"]), y: num(a["y"]))
        case "updateElementProps": e.alterarPeca(ref!, a["patch"]!.objeto!)
        case "nextGenericJersey": resultado = .numero(e.proximaCamisa(a["team"]!.texto!))
        case "applyFormations":
            let r = e.aplicarFormacoes(lista(a["apps"]).map { AplicacaoFormacao(time: $0["team"]!.texto!, posicoes: posicoes($0["positions"])) })
            resultado = ["repositioned": .numero(Double(r.reposicionados)), "added": .numero(Double(r.adicionados)), "kept": .numero(Double(r.mantidos))]
        case "addDrawing": refs[k] = e.adicionarDesenho(a["data"]!.objeto!)
        case "removeDrawing": e.removerDesenho(ref!)
        case "updateDrawing": e.alterarDesenho(ref!, a["patch"]!.objeto!)
        case "selectElement": e.pecaSelecionada = ref
        case "selectDrawing": e.desenhoSelecionado = ref
        case "addFrame": e.adicionarQuadro()
        case "deleteFrame": e.excluirQuadro()
        case "goToFrame": e.irParaQuadro(Int(num(a["index"])))
        case "goToNextFrame": e.proximo()
        case "goToPrevFrame": e.anterior()
        case "undo": e.desfazer()
        case "redo": e.refazer()
        case "markSaved": e.marcarSalvo()
        case "resetBoard": e.limpar()
        case "loadPlay": e.abrir(a["play"]!)
        case "setFieldType": e.definirTipoCampo(a["value"]!.texto!)
        case "setFieldView": e.definirVista(a["value"]!.texto!)
        case "setTeamAColor": e.definirCorA(a["value"]!.texto!)
        case "setTeamBColor": e.definirCorB(a["value"]!.texto!)
        case "getPlayData":
            var o = e.dadosDaJogada.objeto!
            o["keyframes"] = normalizarQuadros(e.quadros).0
            resultado = .objeto(o)
        default: Issue.record("op desconhecida \(a["op"]!)")
        }
        let esperado = passo["resultado"] ?? .nulo
        #expect(jsonQuase(resultado, esperado), "\(nome) passo \(k) \(a["op"]!) resultado")
        let st = estadoNormalizado(e)
        if let est = passo["estado"] {
            #expect(jsonQuase(st, est), "\(nome) passo \(k) \(a["op"]!.texto!) estado")
        } else if let m = passo["marcas"] {
            #expect(e.atual == Int(num(m["currentFrameIndex"])), "\(nome) passo \(k) quadro atual")
            #expect(e.podeDesfazer == m["canUndo"]?.booleano, "\(nome) passo \(k) desfazer")
            #expect(e.podeRefazer == m["canRedo"]?.booleano, "\(nome) passo \(k) refazer")
            #expect(e.alterado == m["isDirty"]?.booleano, "\(nome) passo \(k) alterado")
            #expect(e.quadros.map { Double($0.elementos.count) } == lista(m["pecas"]).map { num($0) }, "\(nome) passo \(k) peças")
        }
    }
}

@Suite struct ParidadeQuadroTests {
    @Test func `medidas, vistas e conversao iguais ao fieldDimensions`() {
        let c = Q["campo"]!
        for (k, v) in c["tipos"]!.objeto! {
            let meu = ["FOOTBALL_11": TipoCampo.futebol11, "FOOTBALL_7": TipoCampo.futebol7, "FUTSAL": TipoCampo.futsal][k]
            #expect(meu == v.texto, "\(k)")
        }
        #expect(Set(c["vistas"]!.objeto!.values.compactMap(\.texto)) == Set(VistaCampo.todas))
        for (tipo, m) in c["medidas"]!.objeto! {
            let f = medidasCampo(tipo)
            #expect(f.comprimento == num(m["length"]) && f.largura == num(m["width"]), "\(tipo)")
            #expect(f.marcaPenalti == num(m["penaltySpot"]) && f.circuloCentral == num(m["centerCircle"]), "\(tipo)")
            #expect(f.raioEscanteio == num(m["cornerRadius"]), "\(tipo)")
            #expect(f.gol.largura == num(m["goal"]?["width"]) && f.gol.profundidade == num(m["goal"]?["depth"]), "\(tipo)")
            #expect(f.grandeArea?.profundidade == m["penaltyArea"]?["depth"]?.numero, "\(tipo)")
            #expect(f.grandeArea?.largura == m["penaltyArea"]?["width"]?.numero, "\(tipo)")
            #expect(f.pequenaArea?.profundidade == m["goalArea"]?["depth"]?.numero, "\(tipo)")
            #expect(f.pequenaArea?.largura == m["goalArea"]?["width"]?.numero, "\(tipo)")
            #expect(f.raioMeiaLua == m["penaltyArcRadius"]?.numero, "\(tipo)")
            #expect(f.raioAreaFutsal == m["futsalAreaRadius"]?.numero, "\(tipo)")
            #expect(f.segundoPenalti == m["secondPenaltySpot"]?.numero, "\(tipo)")
            #expect(perto(meiaLuaGraus(tipo), num(c["meiaLua"]?[tipo])), "\(tipo) meia-lua")
        }
        for cv in lista(c["conversao"]) {
            #expect(perto(paraPixel(num(cv["pct"]), num(cv["total"])), num(cv["px"])))
            #expect(perto(paraPercentual(num(cv["px"]), num(cv["total"])), num(cv["volta"])))
        }
        for cl in lista(c["clamp"]) {
            let l = cl["limites"]!
            let b = LimitesArrasto(minX: num(l["minX"]), maxX: num(l["maxX"]), minY: num(l["minY"]), maxY: num(l["maxY"]))
            let p = prender(num(cl["x"]), num(cl["y"]), b)
            #expect(perto(p.x, num(cl["saida"]?["x"])) && perto(p.y, num(cl["saida"]?["y"])))
        }
    }

    @Test func `dimensoes do canvas, limites de arrasto e geometria iguais ao web`() {
        for caso in lista(Q["campo"]?["dimensoes"]) {
            let en = caso["entrada"]!
            let rot = "\(en.textoJson())"
            let d = dimensoesCanvas(num(en["w"]), num(en["h"]), tipo: en["tipo"]?.texto, vista: en["vista"]?.texto, reservaBaixo: num(en["reserva"]))
            let w = caso["dims"]!
            #expect(d.larguraTela == num(w["stageWidth"]) && d.alturaTela == num(w["stageHeight"]), "\(rot)")
            #expect(d.campoX == num(w["fieldX"]) && d.campoY == num(w["fieldY"]), "\(rot)")
            #expect(d.largura == num(w["width"]) && d.altura == num(w["height"]), "\(rot)")
            for (chave, margem) in [("limites20", 20.0), ("limites4", 4.0)] {
                let l = limitesArrasto(d, margem: margem), e = caso[chave]!
                #expect(perto(l.minX, num(e["minX"])) && perto(l.maxX, num(e["maxX"])), "\(rot) \(chave)")
                #expect(perto(l.minY, num(e["minY"])) && perto(l.maxY, num(e["maxY"])), "\(rot) \(chave)")
            }
            let g = geometriaCampo(en["tipo"]?.texto, en["vista"]?.texto, d), ge = caso["geometria"]!
            #expect(perto(g.s, num(ge["s"])) && perto(g.ox, num(ge["ox"])) && perto(g.oy, num(ge["oy"])), "\(rot) geometria")
            #expect(perto(g.X(0), num(ge["x0"])) && perto(g.X(g.medidas.comprimento), num(ge["xL"])), "\(rot)")
            if let clipX = ge["clip"]?["clipX"]?.numero {
                #expect(perto(g.recorte?.x ?? .nan, clipX) && perto(g.recorte?.largura ?? .nan, num(ge["clip"]?["clipWidth"])), "\(rot) recorte")
            } else {
                #expect(g.recorte == nil, "\(rot) sem recorte")
            }
        }
    }

    @Test func `formacoes e espelho iguais ao defaultFormations`() {
        for (tipo, fs) in Q["formacoes"]!.objeto! {
            let meus = formacoesDoCampo(tipo)
            let web = lista(fs)
            #expect(meus.map(\.chave) == web.map { $0["chave"]!.texto! }, "\(tipo)")
            for (m, w) in zip(meus, web) {
                #expect(m.rotulo == w["rotulo"]?.texto)
                #expect(m.posicoes == posicoes(w["posicoes"]), "\(tipo) \(m.chave)")
                #expect(espelharFormacao(m.posicoes) == posicoes(w["espelho"]), "\(tipo) \(m.chave) espelho")
            }
        }
        // Alvo da tela: B e Ambos entram espelhados.
        let f = FORMACOES_F11[0]
        #expect(aplicacoesDaFormacao(f, alvo: .b).map(\.posicoes) == [espelharFormacao(f.posicoes)])
        #expect(aplicacoesDaFormacao(f, alvo: .ambos).map(\.time) == ["A", "B"])
        #expect(avisoFormacao(f, alvo: .ambos, ResultadoFormacao(reposicionados: 1, adicionados: 0, mantidos: 2))
                == "4-4-2 aplicada aos dois times · 2 jogadores mantidos fora da formação")
        #expect(avisoFormacao(f, alvo: .a, ResultadoFormacao(reposicionados: 1, adicionados: 0, mantidos: 1))
                == "4-4-2 aplicada ao Time A · 1 jogador mantido fora da formação")
    }

    @Test func `interpolacao igual ao web`() {
        let real = Jogada(Q["jogadaReal"]!).quadros
        for c in lista(Q["interpolacao"]) {
            let a: QuadroJogada?, b: QuadroJogada?
            if let qa = c["quadroA"] {
                a = QuadroJogada(json: qa)
                b = c["quadroB"].flatMap { $0 == .nulo ? nil : QuadroJogada(json: $0) }
            } else {
                a = real[Int(num(c["a"]))]; b = real[Int(num(c["b"]))]
            }
            let meu = Json.lista(interpolarPecas(a, b, num(c["t"])).map { .objeto($0.dados) })
            #expect(jsonQuase(meu, c["saida"]), "t=\(num(c["t"]))")
        }
    }

    @Test func `desenho igual ao TacticalCanvas e ao Konva`() {
        let d = Q["desenho"]!
        for c in lista(d["rgba"]) {
            #expect(hexParaRgba(c["cor"]?.texto, num(c["alfa"])) == c["saida"]?.texto, "\(c.textoJson())")
        }
        let w = d["dimsDesenho"]!
        let dims = DimensoesCanvas(larguraTela: num(w["stageWidth"]), alturaTela: num(w["stageHeight"]), campoX: num(w["fieldX"]),
                                   campoY: num(w["fieldY"]), largura: num(w["width"]), altura: num(w["height"]))
        for t in lista(d["tracos"]) {
            let (x1, y1, x2, y2) = (num(t["x1"]), num(t["y1"]), num(t["x2"]), num(t["y2"]))
            let c = controleCurva(x1, y1, x2, y2)
            #expect(perto(c.cx, num(t["curva"]?["cx"])) && perto(c.cy, num(t["curva"]?["cy"])))
            #expect(perto(raioZonaPct(x1, y1, x2, y2, dims), num(t["raio"])))
            #expect(perto(distanciaPx(x1, y1, x2, y2, dims), num(t["distPx"])))
            var r = RascunhoDesenho(modo: "arrow_straight", cor: "#fff", tracejado: [], x: x1, y: y1)
            r.mover(x2, y2)
            #expect((r.terminar(x2, y2, dims: dims) != nil) == t["valido"]?.booleano, "\(t.textoJson())")
        }
        for l in lista(d["livre"]) {
            let meu = pontosDeTensao(lista(l["pontos"]).map { num($0) }, tensao: num(l["tensao"]))
            let web = lista(l["controle"]).map { num($0) }
            #expect(meu.count == web.count && zip(meu, web).allSatisfy { perto($0, $1) }, "\(l["pontos"]!.textoJson())")
        }
        for c in lista(d["nomeToken"]) { #expect(nomeNoToken(c["nome"]!.texto!) == c["saida"]?.texto) }
        for c in lista(d["camisa"]) {
            let m = camisaConfirmada(c["valor"]!.texto!, atual: c["atual"])
            #expect(m.map { Json.numero(Double($0)) } ?? .nulo == c["saida"], "\(c.textoJson())")
        }
        for c in lista(d["nomeSelecao"]) { #expect(nomeConfirmado(c["valor"]!.texto!) == c["saida"]?.texto) }
        for c in lista(d["rotacao"]) { #expect(girar(num(c["rotacao"]), num(c["delta"])) == num(c["saida"]), "\(c.textoJson())") }
    }

    @Test func `catalogos iguais a pagina do quadro`() {
        let c = Q["catalogos"]!
        let setas = lista(c["setas"])
        #expect(FERRAMENTAS_SETA.count == setas.count)
        for (m, w) in zip(FERRAMENTAS_SETA, setas) {
            #expect(m.id == w["id"]?.texto && m.modo == w["mode"]?.texto && m.rotulo == w["label"]?.texto)
            #expect(m.descricao == w["desc"]?.texto && m.cor == w["color"]?.texto)
            #expect(m.tracejado == lista(w["dash"]).map { num($0) })
        }
        #expect(TIPOS_OBJETO.map(\.tipo) == lista(c["objetos"]).map { $0["type"]!.texto! })
        #expect(TIPOS_OBJETO.map(\.rotulo) == lista(c["objetos"]).map { $0["label"]!.texto! })
        #expect(TIPOS_OBJETO.map(\.icone) == lista(c["objetos"]).map { $0["icon"]!.texto! })
        #expect(VISTAS_CAMPO.map(\.vista) == lista(c["vistas"]).map { $0["view"]!.texto! })
        #expect(VISTAS_CAMPO.map(\.rotulo) == lista(c["vistas"]).map { $0["label"]!.texto! })
        #expect(TIPOS_CAMPO.map(\.tipo) == lista(c["tiposCampo"]).map { $0["type"]!.texto! })
        #expect(TIPOS_CAMPO.map(\.rotulo) == lista(c["tiposCampo"]).map { $0["label"]!.texto! })
        #expect(CORES_DESENHO == lista(c["coresDesenho"]).compactMap(\.texto))
        #expect(VELOCIDADES_QUADRO == lista(c["velocidades"]).map { num($0) })
        #expect(OBJETOS_QUE_GIRAM == Set(lista(c["girar"]).compactMap(\.texto)))
    }

    @Test func `ritmo do play e do video igual ao web`() {
        let r = Q["ritmo"]!
        #expect(QUADRO_MS == num(r["quadroMs"]))
        #expect(Double(VIDEO_FPS) == num(r["video"]?["fps"]) && VIDEO_QUADRO_MS == num(r["video"]?["quadroMs"]))
        for l in lista(r["video"]?["linhas"]) {
            let n = Int(num(l["quadros"]))
            #expect(Double(linhaDoVideo(n).count) == num(l["total"]), "\(n) quadros")
            #expect(perto(Double(linhaDoVideo(n).count) / Double(VIDEO_FPS), num(l["segundos"])))
        }
        let web = lista(r["video"]?["linha3"])
        let meu = linhaDoVideo(3)
        #expect(meu.count == web.count)
        for (m, w) in zip(meu, web) {
            #expect(Double(m.quadro) == num(lista(w)[0]) && perto(m.t, num(lista(w)[1])))
        }
    }

    @Test(arguments: ["pecasEQuadros", "desfazerRefazerESalvo", "limiteDoHistorico", "limiteComSalvo", "desenhos", "formacoes", "abrirESalvar"])
    func `editor igual ao useTacticalBoard`(_ nome: String) {
        rodarRoteiro(nome, lista(Q["editor"]?[nome]))
    }

    @Test func `editor comeca no campo da modalidade`() {
        rodarRoteiro("inicialFutsal", lista(Q["editor"]?["inicialFutsal"]), tipoInicial: "futsal")
    }

    @Test func `jogada real abre e salva igual ao web`() {
        for c in lista(Q["salvar"]) {
            var e = EditorQuadro()
            e.abrir(c["jogada"]!)
            let corpo = e.corpoSalvar(nome: c["nome"]!.texto!, descricao: c["descricao"]!.texto!, clubeId: c["clubeId"]?.texto)
            #expect(jsonQuase(corpo, c["corpo"]), "\(c["nome"]!)")
            #expect(jsonQuase(corpoDaJogada(Jogada(c["jogada"]!), nome: c["nome"]!.texto!, descricao: c["descricao"]!.texto!,
                                            clubeId: c["clubeId"]?.texto), c["corpo"]))
        }
        // Abrir e salvar de volta sem mexer não muda nenhum quadro (round-trip 100%).
        let real = Q["jogadaReal"]!
        var e = EditorQuadro()
        e.abrir(real)
        #expect(jsonQuase(e.dadosDaJogada["keyframes"], real["keyframes"]))
        #expect(!e.alterado)
        let j = Jogada(real)
        #expect(j.nome == "Pressão pós-perda (5 segundos)" && j.totalQuadros == 2 && j.clubeNome == "Demo FC")
    }
}

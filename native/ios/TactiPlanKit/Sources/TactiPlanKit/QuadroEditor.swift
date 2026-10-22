import Foundation

// QUADRO TÁTICO (T5): estado do editor = hooks/useTacticalBoard.js do web, regra por regra:
// peça nova entra no quadro atual E nos seguintes; mover vale só no quadro atual (é assim que a
// animação por quadros funciona); identidade (nº, nome, time, goleiro) e desenhos valem em TODOS;
// histórico de 50 passos; "alterações não salvas" = posição no histórico ≠ do último salvar, ou
// tipo de campo/vista/cores mexidos. Paridade: quadro.json (editor) e dados/quadro/Editor.kt.

public let MAX_HISTORICO_QUADRO = 50

public struct EditorQuadro: Sendable {
    public private(set) var quadros: [QuadroJogada]
    public private(set) var atual: Int = 0
    public private(set) var tipoCampo: String
    public private(set) var vista: String = VistaCampo.inteiro
    public private(set) var corA = "#3b82f6"
    public private(set) var corB = "#ef4444"
    public var pecaSelecionada: String?
    public var desenhoSelecionado: String?

    private var historico: [[QuadroJogada]]
    private var indiceHistorico = 0
    private var indiceSalvo = 0
    private var metaAlterada = false
    private var contador = 0
    /// Relógio dos ids (`tipo-<ms>-<n>`, como o web). Os testes fixam.
    public var agoraMs: @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1000) }

    public init(tipoInicial: String? = nil) {
        let q = [QuadroJogada(indice: 0)]
        quadros = q
        historico = [q]
        tipoCampo = tipoInicial ?? TipoCampo.futebol11
    }

    // MARK: leitura

    public var quadroAtual: QuadroJogada { quadros.indices.contains(atual) ? quadros[atual] : QuadroJogada(indice: 0) }
    public var proximoQuadro: QuadroJogada? { quadros.indices.contains(atual + 1) ? quadros[atual + 1] : nil }
    public var totalQuadros: Int { quadros.count }
    public var podeDesfazer: Bool { indiceHistorico > 0 }
    public var podeRefazer: Bool { indiceHistorico < historico.count - 1 }
    public var alterado: Bool { indiceHistorico != indiceSalvo || metaAlterada }

    public func peca(_ id: String?) -> Peca? { guard let id else { return nil }; return quadroAtual.elementos.first { $0.id == id } }
    public func desenho(_ id: String?) -> Desenho? { guard let id else { return nil }; return quadroAtual.desenhos.first { $0.id == id } }

    /// Atletas já em campo (em qualquer quadro) — o Plantel marca e não deixa repetir.
    public var atletasEmCampo: Set<String> {
        var s = Set<String>()
        for q in quadros { for e in q.elementos where e.tipo == "player" { if let a = e.atletaId, verdadeiroJs(.texto(a)) { s.insert(a) } } }
        return s
    }

    // MARK: histórico

    private mutating func gravar(_ novo: [QuadroJogada]) {
        var h = Array(historico.prefix(indiceHistorico + 1))
        h.append(novo)
        if h.count > MAX_HISTORICO_QUADRO {
            h.removeFirst()
            if indiceSalvo >= 0 { indiceSalvo -= 1 }
        }
        historico = h
        indiceHistorico = h.count - 1
        quadros = novo
    }

    private mutating func novoId(_ tipo: String) -> String {
        contador += 1
        return "\(tipo)-\(agoraMs())-\(contador)"
    }

    // MARK: peças

    /// addElement: entra no quadro atual e em todos os seguintes. Devolve o id.
    @discardableResult
    public mutating func adicionarPeca(_ dadosPeca: [String: Json]) -> String {
        let id = novoId(dadosPeca["type"]?.texto ?? "undefined")
        var d = dadosPeca
        d["id"] = .texto(id)
        let p = Peca(d)
        var n = quadros
        for i in n.indices where i >= atual { n[i].elementos.append(p) }
        gravar(n)
        return id
    }

    /// removeElement: sai de todos os quadros.
    public mutating func removerPeca(_ id: String) {
        var n = quadros
        for i in n.indices { n[i].elementos.removeAll { $0.id == id } }
        gravar(n)
        if pecaSelecionada == id { pecaSelecionada = nil }
    }

    /// updateElementPosition: só no quadro atual.
    public mutating func moverPeca(_ id: String, x: Double, y: Double) {
        var n = quadros
        if n.indices.contains(atual) {
            for j in n[atual].elementos.indices where n[atual].elementos[j].id == id {
                n[atual].elementos[j].x = x
                n[atual].elementos[j].y = y
            }
        }
        gravar(n)
    }

    /// updateElementProps: identidade vale em TODOS os quadros.
    public mutating func alterarPeca(_ id: String, _ patch: [String: Json]) {
        var n = quadros
        for i in n.indices {
            for j in n[i].elementos.indices where n[i].elementos[j].id == id {
                for (k, v) in patch { n[i].elementos[j].dados[k] = v }
            }
        }
        gravar(n)
    }

    /// nextGenericJersey: maior nº do time no quadro atual + 1 (o 1 é do goleiro; mínimo 2).
    public func proximaCamisa(_ time: String) -> Double {
        let els = quadros.indices.contains(atual) ? quadros[atual].elementos : []
        let nums = els.filter { $0.tipo == "player" && $0.time == time }.map { ouNumero($0.camisa, 0) }
        let maior = nums.isEmpty ? 1 : nums.max()!
        return max(2, maior + 1)
    }

    // MARK: formações (não-destrutivo, por time)

    public mutating func aplicarFormacoes(_ aplicacoes: [AplicacaoFormacao]) -> ResultadoFormacao {
        var repos = 0, novos = 0, mantidos = 0
        var n = quadros
        for ap in aplicacoes {
            let curr = n.indices.contains(atual) ? n[atual].elementos : []
            // Goleiro primeiro, depois camisa crescente, desempate pela ordem de entrada.
            let doTime = curr.enumerated()
                .filter { $0.element.tipo == "player" && $0.element.time == ap.time }
                .sorted { a, b in
                    let ga = a.element.goleiro, gb = b.element.goleiro
                    if ga != gb { return ga }
                    let na = ouNumero(a.element.camisa, 999), nb = ouNumero(b.element.camisa, 999)
                    if na != nb { return na < nb }
                    return a.offset < b.offset
                }
                .map(\.element)
            for (i, slot) in ap.posicoes.enumerated() {
                if i < doTime.count {
                    let par = doTime[i]
                    let real = verdadeiroJs(par.dados["athleteId"])
                    for fi in n.indices {
                        for j in n[fi].elementos.indices where n[fi].elementos[j].id == par.id {
                            if !real {
                                n[fi].elementos[j].dados["jerseyNumber"] = .numero(Double(slot.camisa))
                                n[fi].elementos[j].dados["name"] = .texto(slot.nome)
                                n[fi].elementos[j].dados["isGoalkeeper"] = .booleano(slot.goleiro)
                            }
                            if fi == atual {
                                n[fi].elementos[j].x = slot.x
                                n[fi].elementos[j].y = slot.y
                            }
                        }
                    }
                    repos += 1
                } else {
                    let id = novoId("player")
                    let p = Peca([
                        "id": .texto(id), "type": "player", "team": .texto(ap.time),
                        "jerseyNumber": .numero(Double(slot.camisa)), "name": .texto(slot.nome), "athleteId": .nulo,
                        "isGoalkeeper": .booleano(slot.goleiro), "x": .numero(slot.x), "y": .numero(slot.y),
                    ])
                    for fi in n.indices where fi >= atual { n[fi].elementos.append(p) }
                    novos += 1
                }
            }
            mantidos += max(0, doTime.count - ap.posicoes.count)
        }
        gravar(n)
        return ResultadoFormacao(reposicionados: repos, adicionados: novos, mantidos: mantidos)
    }

    // MARK: desenhos

    @discardableResult
    public mutating func adicionarDesenho(_ dadosDesenho: [String: Json]) -> String {
        let id = novoId("draw")
        var d = dadosDesenho
        d["id"] = .texto(id)
        let dz = Desenho(d)
        var n = quadros
        for i in n.indices where i >= atual { n[i].desenhos.append(dz) }
        gravar(n)
        return id
    }

    public mutating func removerDesenho(_ id: String) {
        var n = quadros
        for i in n.indices { n[i].desenhos.removeAll { $0.id == id } }
        gravar(n)
        if desenhoSelecionado == id { desenhoSelecionado = nil }
    }

    /// updateDrawing: em TODOS os quadros (desenho é anotação estática copiada entre quadros).
    public mutating func alterarDesenho(_ id: String, _ patch: [String: Json]) {
        var n = quadros
        for i in n.indices {
            for j in n[i].desenhos.indices where n[i].desenhos[j].id == id {
                for (k, v) in patch { n[i].desenhos[j].dados[k] = v }
            }
        }
        gravar(n)
    }

    // MARK: quadros

    /// addFrame: copia o atual logo depois dele e vai para a cópia.
    public mutating func adicionarQuadro() {
        let base = quadroAtual
        var n = quadros
        let novo = QuadroJogada(indice: n.count, elementos: base.elementos, desenhos: base.desenhos)
        n.insert(novo, at: min(atual + 1, n.count))
        for i in n.indices { n[i].extras["index"] = .numero(Double(i)) }
        gravar(n)
        atual += 1
    }

    /// deleteFrame: nunca apaga o último que sobra.
    public mutating func excluirQuadro() {
        guard quadros.count > 1 else { return }
        var n = quadros
        n.remove(at: atual)
        for i in n.indices { n[i].extras["index"] = .numero(Double(i)) }
        gravar(n)
        atual = max(0, atual - 1)
    }

    public mutating func irParaQuadro(_ i: Int) { atual = max(0, min(i, quadros.count - 1)) }
    public mutating func proximo() { atual = min(atual + 1, quadros.count - 1) }
    public mutating func anterior() { atual = max(atual - 1, 0) }

    // MARK: desfazer / refazer

    public mutating func desfazer() {
        guard indiceHistorico > 0 else { return }
        indiceHistorico -= 1
        quadros = historico[indiceHistorico]
        atual = min(atual, quadros.count - 1)
    }

    public mutating func refazer() {
        guard indiceHistorico < historico.count - 1 else { return }
        indiceHistorico += 1
        quadros = historico[indiceHistorico]
        atual = min(atual, quadros.count - 1)
    }

    // MARK: abrir / limpar / salvar

    /// loadPlay: aceita a linha de /api/plays (ou qualquer objeto com os mesmos campos).
    public mutating func abrir(_ jogada: Json) {
        tipoCampo = ouTexto(jogada["field_type"], TipoCampo.futebol11)
        vista = ouTexto(jogada["field_view"], VistaCampo.inteiro)
        corA = ouTexto(jogada["team_a_color"], "#3b82f6")
        corB = ouTexto(jogada["team_b_color"], "#ef4444")
        var q: [QuadroJogada] = []
        if case .lista(let l)? = jogada["keyframes"] { q = l.map(QuadroJogada.init(json:)) }
        if q.isEmpty { q = [QuadroJogada(indice: 0)] }
        quadros = q
        atual = 0
        pecaSelecionada = nil
        desenhoSelecionado = nil
        historico = [q]
        indiceHistorico = 0
        indiceSalvo = 0
        metaAlterada = false
    }

    /// resetBoard: um quadro vazio (tipo de campo, vista e cores ficam).
    public mutating func limpar() {
        let q = [QuadroJogada(indice: 0)]
        quadros = q
        atual = 0
        pecaSelecionada = nil
        desenhoSelecionado = nil
        historico = [q]
        indiceHistorico = 0
        indiceSalvo = 0
        metaAlterada = false
    }

    /// markSaved.
    public mutating func marcarSalvo() {
        indiceSalvo = indiceHistorico
        metaAlterada = false
    }

    public mutating func definirTipoCampo(_ v: String) { tipoCampo = v; metaAlterada = true }
    public mutating func definirVista(_ v: String) { vista = v; metaAlterada = true }
    public mutating func definirCorA(_ v: String) { corA = v; metaAlterada = true }
    public mutating func definirCorB(_ v: String) { corB = v; metaAlterada = true }

    /// getPlayData.
    public var dadosDaJogada: Json {
        .objeto([
            "field_type": .texto(tipoCampo), "field_view": .texto(vista),
            "team_a_color": .texto(corA), "team_b_color": .texto(corB),
            "keyframes": .lista(quadros.map(\.json)),
        ])
    }

    /// Corpo do POST/PUT /api/plays do web (persistPlay): getPlayData + name, description, club_id.
    public func corpoSalvar(nome: String, descricao: String, clubeId: String?) -> Json {
        var o = dadosDaJogada.objeto ?? [:]
        o["name"] = .texto(nome)
        o["description"] = .texto(descricao)
        o["club_id"] = clubeId.map(Json.texto) ?? .nulo
        return .objeto(o)
    }
}

// MARK: ações da tela (TacticalBoardPage) que viram peça

/// Jogador genérico do time (nº seguinte, perto do meio — `aleatorio` em 0..<1 como Math.random).
public func dadosJogadorGenerico(_ time: String, camisa: Double, aleatorio: () -> Double) -> [String: Json] {
    let x = 50 + (aleatorio() - 0.5) * 20
    let y = 50 + (aleatorio() - 0.5) * 20
    return ["type": "player", "team": .texto(time), "jerseyNumber": .numero(camisa), "name": "", "athleteId": .nulo,
            "isGoalkeeper": false, "x": .numero(x), "y": .numero(y)]
}

/// Atleta do Plantel (PlayerPalette): camisa do cadastro ou a próxima livre.
public func dadosJogadorAtleta(_ time: String, atletaId: String, nome: String, camisa: Int?, proxima: Double,
                               aleatorio: () -> Double) -> [String: Json] {
    var d = dadosJogadorGenerico(time, camisa: proxima, aleatorio: aleatorio)
    if let camisa, camisa != 0 { d["jerseyNumber"] = .numero(Double(camisa)) }
    d["name"] = .texto(nome)
    d["athleteId"] = .texto(atletaId)
    return d
}

/// handleAddGoalkeeper: nº 1, "GOL", no gol do time.
public func dadosGoleiro(_ time: String) -> [String: Json] {
    ["type": "player", "team": .texto(time), "jerseyNumber": 1, "name": "GOL", "athleteId": .nulo,
     "isGoalkeeper": true, "x": .numero(time == "A" ? 5 : 95), "y": 50]
}

public func dadosBola() -> [String: Json] { ["type": "ball", "team": .nulo, "x": 50, "y": 50] }

public func dadosObjeto(_ tipo: String, aleatorio: () -> Double) -> [String: Json] {
    ["type": "marker", "team": .nulo, "markerType": .texto(tipo),
     "x": .numero(50 + (aleatorio() - 0.5) * 30), "y": .numero(50 + (aleatorio() - 0.5) * 30)]
}

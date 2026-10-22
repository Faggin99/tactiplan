import Foundation
import Testing
@testable import TactiPlanKit

// T3: Elenco, Staff, Estatísticas e Cadastros — regras puras e os clientes HTTP (com transporte falso).

private func corpo(_ r: Requisicao) throws -> Json { try Json.ler(r.corpo ?? Data()) }
private func web(_ t: TransporteFalso) -> ClienteWeb {
    ClienteWeb(api: Api(base: "https://x.test/api", transporte: t), token: "tpa_abc", workspaceId: "ws-1", upload: t, fronteira: { "F" })
}
private func ok(_ s: String) -> Resposta { Resposta(status: 200, corpo: Data(s.utf8)) }

@Suite struct ElencoTests {
    let atletas = [
        Atleta(id: "1", nome: "Gabriel Rocha", posicao: "GOL", camisa: 1, grupo: "1", categoriaId: "k1", nascimento: "2009-04-29"),
        Atleta(id: "2", nome: "Diego Lima", posicao: "ZAG", camisa: 3, grupo: "1", categoriaId: "k2"),
        Atleta(id: "3", nome: "Kauã Souza", posicao: "MEI", camisa: 8, grupo: "DM"),
        Atleta(id: "4", nome: "Ênio", posicao: "CA", camisa: 9, grupo: "Transição", categoriaId: "k1"),
        Atleta(id: "5", nome: "Zé", posicao: "LD", grupo: nil),
        Atleta(id: "6", nome: "Ana", posicao: "LE", grupo: "estranho"),
    ]

    @Test func `grupos na ordem do web e grupo desconhecido em Sem grupo`() {
        let s = agruparElenco(atletas)
        #expect(s.map(\.grupo.nome) == ["Grupo 1", "Transição", "Departamento médico", "Sem grupo"])
        #expect(s[0].atletas.map(\.id) == ["1", "2"], "GOL antes de ZAG")
        #expect(s[3].atletas.map(\.nome) == ["Zé", "Ana"], "LD (2) antes de LE (4)")
        #expect(agruparElenco(atletas, porPosicao: false)[3].atletas.map(\.nome) == ["Ana", "Zé"])
    }

    @Test func `busca sem acento, camisa, categoria e posicao`() {
        #expect(agruparElenco(atletas, busca: "enio").flatMap(\.atletas).map(\.id) == ["4"])
        #expect(agruparElenco(atletas, busca: "KAUA").flatMap(\.atletas).map(\.id) == ["3"])
        #expect(agruparElenco(atletas, busca: "3").flatMap(\.atletas).map(\.id) == ["2"])
        #expect(agruparElenco(atletas, categoria: "k1").flatMap(\.atletas).map(\.id).sorted() == ["1", "4"])
        #expect(agruparElenco(atletas, categoria: CATEGORIA_SEM).flatMap(\.atletas).map(\.id).sorted() == ["3", "5", "6"])
        #expect(agruparElenco(atletas, posicao: "ZAG").flatMap(\.atletas).map(\.id) == ["2"])
    }

    @Test func `DM mostra a lesao ativa como resumo`() {
        let l = Lesao(id: "l1", atletaId: "3", tipo: "Lesão muscular", retornoPrevisto: "2026-10-30")
        let dm = agruparElenco(atletas, lesoesAtivas: [l]).first { $0.grupo.valor == "DM" }
        #expect(dm?.resumo == "Kauã: lesão muscular · volta 30/10")
        #expect(resumoElenco(atletas) == "6 atletas · 1 no DM")
    }

    @Test func `idade e detalhe da linha`() {
        #expect(idadeEm("2009-04-29", hoje: "2026-04-28") == 16)
        #expect(idadeEm("2009-04-29", hoje: "2026-04-29") == 17)
        #expect(idadeEm(nil, hoje: "2026-01-01") == nil)
        #expect(detalheAtleta(atletas[0], hoje: "2026-10-22") == "GOL · 17 anos")
        var s = atletas[1]; s.status = "suspended"
        #expect(detalheAtleta(s, hoje: "2026-10-22") == "ZAG · Suspenso")
    }

    @Test func `validacao do atleta e da lesao`() {
        #expect(erroAtleta(nome: " ", posicao: "GOL", camisa: nil, altura: nil) == MSG_NOME_OBRIGATORIO)
        #expect(erroAtleta(nome: "A", posicao: nil, camisa: nil, altura: nil) == MSG_POSICAO_OBRIGATORIA)
        #expect(erroAtleta(nome: "A", posicao: "GOL", camisa: 100, altura: nil) == MSG_CAMISA_INVALIDA)
        #expect(erroAtleta(nome: "A", posicao: "GOL", camisa: 10, altura: 99) == MSG_ALTURA_INVALIDA)
        #expect(erroAtleta(nome: "A", posicao: "GOL", camisa: 10, altura: 180) == nil)
        #expect(erroLesao(tipo: "  ") == MSG_TIPO_LESAO)
        let c = corpoLesao(tipo: " Entorse ", local: "", gravidade: "x", inicio: nil, retornoPrevisto: "2026-11-01", notas: nil, hoje: "2026-10-22")
        #expect(c == ["injury_type": "Entorse", "body_part": .nulo, "severity": "medium", "started_at": "2026-10-22",
                      "expected_return": "2026-11-01", "notes": .nulo])
    }

    @Test func `corpo do atleta e completo, mantem a foto e formata o nome`() {
        let a = Atleta(id: "1", nome: "joão da silva", posicao: "GOL", camisa: 1, status: nil, grupo: "DM", fotoUrl: "/uploads/athlete-photos/x.jpg",
                       categoriaId: "", nascimento: "2009-04-29", alturaCm: 180, pe: "left")
        let c = corpoAtleta(a, clubeId: "c1")
        #expect(c["name"] == "João da Silva")
        #expect(c["photo_url"] == "/uploads/athlete-photos/x.jpg")
        #expect(c["status"] == "active")
        #expect(c["category_id"] == .nulo)
        #expect(c["club_id"] == "c1")
        #expect(Set(c.objeto!.keys) == ["name", "position", "jersey_number", "status", "observation", "group", "photo_url", "club_id",
                                         "category_id", "birthdate", "height_cm", "preferred_foot", "previous_club"])
    }

    @Test func `atleta decodifica camisa em texto e grupo numerico`() throws {
        let a = try Json.ler(Data(#"{"id":"x","name":"A","jersey_number":"7","group":2,"birthdate":"2009-04-29T00:00:00.000Z","position":""}"#.utf8))
            .decodificar(Atleta.self)
        #expect(a.camisa == 7); #expect(a.grupo == "2"); #expect(a.nascimento == "2009-04-29"); #expect(a.posicao == nil)
    }

    @Test func `nome de arquivo do PDF sem acento`() {
        #expect(nomeDeArquivo("Esporte Clube Vila Nova") == "Esporte_Clube_Vila_Nova")
        #expect(nomeDeArquivo("São Paulo F.C.") == "Sao_Paulo_FC")
        #expect(nomePdfPlantel("Grêmio", hoje: "2026-10-22") == "Plantel_Gremio_2026-10-22.pdf")
    }

    @Test func `api do elenco: rotas, cabecalho, corpo e foto multipart`() async throws {
        let t = TransporteFalso()
        let api = ApiElencoHttp(web(t))
        t.respostas = [
            ok(#"[{"id":"a1","name":"Bruno","jersey_number":10,"group":"1"}]"#),
            ok(#"{"data":[{"id":"l1","athlete_id":"a1","injury_type":"Entorse","started_at":"2026-10-01"}]}"#),
            ok(#"{"id":"a1","name":"Bruno"}"#),
            ok(#"[]"#),
            ok(#"{"id":"a1","name":"Bruno","photo_url":"/uploads/athlete-photos/f.jpg"}"#),
            ok(#"{}"#),
            ok(#"{}"#),
        ]
        let l = try await api.atletas(clubeId: "c 1")
        #expect(l.first?.camisa == 10)
        _ = try await api.lesoesAtivas()
        _ = try await api.atualizarAtleta("a1", ["name": "Bruno"])
        try await api.moverGrupo(["a1", "a2"], para: "DM")
        let f = try await api.enviarFoto("a1", ArquivoUpload(nome: "f.jpg", tipo: "image/jpeg", dados: Data([1, 2])))
        #expect(f.fotoUrl == "/uploads/athlete-photos/f.jpg")
        try await api.darAlta("l1", hoje: "2026-10-22")
        try await api.removerLesao("l1")
        let p = t.pedidos
        #expect(p.map(\.metodo) == ["GET", "GET", "PUT", "PUT", "POST", "PUT", "DELETE"])
        #expect(p.map { $0.url.absoluteString } == [
            "https://x.test/api/athletes?club_id=c%201", "https://x.test/api/injuries/active", "https://x.test/api/athletes/a1",
            "https://x.test/api/athletes/batch-groups", "https://x.test/api/athletes/a1/photo", "https://x.test/api/injuries/l1",
            "https://x.test/api/injuries/l1",
        ])
        #expect(p.allSatisfy { $0.cabecalho("x-workspace-id") == "ws-1" && $0.cabecalho("authorization") == "Bearer tpa_abc" })
        #expect(try corpo(p[3]) == ["athletes": [["id": "a1", "group": "DM"], ["id": "a2", "group": "DM"]]])
        #expect(p[4].cabecalho("content-type") == "multipart/form-data; boundary=F")
        #expect(String(decoding: p[4].corpo ?? Data(), as: UTF8.self).contains("name=\"photo\"; filename=\"f.jpg\""))
        #expect(try corpo(p[5]) == ["resolved_at": "2026-10-22"])
    }

    @Test func `servico salva primeiro e sobe a foto depois (atleta novo)`() async throws {
        let t = TransporteFalso()
        t.respostas = [ok(#"{"id":"novo","name":"Bruno Mendes"}"#), ok(#"{"id":"novo","name":"Bruno Mendes","photo_url":"/u/x.jpg"}"#)]
        let s = ServicoElenco(api: ApiElencoHttp(web(t)), clubeId: "c1")
        let a = try await s.salvar(Atleta(id: "", nome: "bruno mendes", posicao: "MEI"), novo: true,
                                   foto: ArquivoUpload(nome: "f.jpg", tipo: "image/jpeg", dados: Data([1])))
        #expect(a.fotoUrl == "/u/x.jpg")
        #expect(t.pedidos.map { $0.url.path } == ["/api/athletes", "/api/athletes/novo/photo"])
        #expect(try corpo(t.pedidos[0])["name"] == "Bruno Mendes")
        await #expect(throws: ErroApi.self) { try await s.salvar(Atleta(id: "", nome: "", posicao: "GOL"), novo: true, foto: nil) }
        #expect(t.pedidos.count == 2, "validação não chama o servidor")
    }

    @Test func `erros do elenco em frase neutra`() {
        #expect(mensagemErroElenco(erro(403, nil, "Sem permissão pra editar atletas")) == MSG_SEM_PERMISSAO_ATLETAS)
        #expect(mensagemErroElenco(erro(402, "PLAN_REQUIRED", "Seu plano permite até 30 atletas.")) == TEXTO_NAO_EDITA)
        #expect(mensagemErroElenco(erro(409, "CLUB_ARCHIVED")) == TEXTO_CLUBE_ARQUIVADO)
    }
}

@Suite struct StaffTests {
    @Test func `limite de convidados e quem pode convidar`() {
        #expect(textoLimiteEquipe(usados: 2, limite: 5) == "Responsável + 5 convidados · 2 em uso, contando convites pendentes")
        #expect(textoLimiteEquipe(usados: 0, limite: 1) == "Responsável + 1 convidado · 0 em uso, contando convites pendentes")
        #expect(textoLimiteEquipe(usados: 9, limite: -1) == "Sem limite de convidados")
        #expect(textoLimiteEquipe(usados: 0, limite: nil) == nil)
        #expect(podeConvidar(usados: 4, limite: 5)); #expect(!podeConvidar(usados: 5, limite: 5))
        #expect(podeConvidar(usados: 50, limite: -1)); #expect(!podeConvidar(usados: 0, limite: 0)); #expect(!podeConvidar(usados: 0, limite: nil))
    }

    @Test func `textos do staff sem compra`() {
        for t in [MSG_LIMITE_EQUIPE, MSG_SO_DONO_EQUIPE, MSG_SEM_PERMISSAO_EQUIPE, MSG_CONVITE_INDISPONIVEL,
                  textoLimiteEquipe(usados: 1, limite: 5)!, textoLimiteEquipe(usados: 1, limite: -1)!] {
            #expect(textoNeutro(t), "\(t)")
        }
        #expect(mensagemErroStaff(erro(402, "MEMBER_LIMIT", "O seu plano inclui o responsável + 5 convidados.")) == MSG_LIMITE_EQUIPE)
        #expect(mensagemErroStaff(erro(402, "PLAN_REQUIRED", "O plano atual não permite convidar membros.")) == MSG_CONVITE_INDISPONIVEL)
        #expect(mensagemErroStaff(erro(403, nil, "Apenas o dono pode convidar")) == MSG_SO_DONO_EQUIPE)
        #expect(mensagemErroStaff(erro(409, nil, "Já existe um convite pendente pra esse email")) == "Já existe um convite pendente pra esse email")
    }

    @Test func `rascunho: trocar papel segue o padrao ate mexer`() {
        var r = RascunhoMembro()
        #expect(r.permissoes == permissoesEfetivas("head_coach", nil))
        r.trocarPapel("assistant_coach")
        #expect(r.permissoes == Set(PADROES_PAPEL["assistant_coach"]!))
        r.alternar("games:edit", true)
        r.trocarPapel("specialist")
        #expect(r.permissoes.contains("games:edit"), "mexeu: não volta ao padrão sozinho")
        r.voltarAoPadrao()
        #expect(r.permissoes == Set(PADROES_PAPEL["specialist"]!))
    }

    @Test func `corpo do convite e da edicao (permissions so quando mexeu)`() {
        var r = RascunhoMembro(email: " Ana@Clube.com ", papel: "other", categoriaIds: ["k1"])
        #expect(r.erro(convite: true) == nil)
        #expect(r.corpoConvite() == ["email": "ana@clube.com", "role": "other", "category_ids": ["k1"], "permissions": .nulo])
        #expect(r.corpoEdicao() == ["role": "other", "category_ids": ["k1"]], "sem mexer: não manda permissions (mantém)")
        r.alternar("training:edit", true)
        #expect(r.corpoEdicao()["permissions"] == .lista(PERMISSOES.filter { r.permissoes.contains($0) }.map { .texto($0) }))
        r.voltarAoPadrao()
        #expect(r.corpoEdicao()["permissions"] == .nulo)
        r.categoriaIds = []
        #expect(r.erro(convite: false) == MSG_ESCOLHA_CATEGORIA)
        #expect(RascunhoMembro(email: "x").erro(convite: true) == MSG_EMAIL_CONVITE)
    }

    @Test func `resumo das permissoes em linguagem simples`() {
        let r = resumoPermissoes(permissoesEfetivas("head_coach", nil))
        #expect(r.first == "Treinos: ver, editar e apagar")
        #expect(r.contains("Jogos: ver e editar"))
        #expect(!r.joined().contains("assinatura"))
    }

    @Test func `api do staff`() async throws {
        let t = TransporteFalso()
        t.respostas = [
            ok(#"{"owner":{"id":"u","name":"Dono","email":"d@x.com","role":"owner"},"members":[{"id":"m1","role":"other","permissions":["training:view"],"accepted_at":"2026-10-01","user_name":"Ana"},{"id":"m2","role":"head_coach","invited_email":"b@x.com","accepted_at":null,"category_ids":null}],"is_owner":true,"limite_convidados":5}"#),
            ok(#"{"id":"m3","accept_url":"https://app/#/accept-invite/tok"}"#),
            ok(#"{}"#), ok(#"{"ok":true}"#), ok(#"{"ok":true,"accept_url":"https://app/#/accept-invite/t2"}"#),
        ]
        let api = ApiStaffHttp(web(t))
        let e = try await api.equipe(clubeId: "c1")
        #expect(e.souDono && e.limiteConvidados == 5 && e.usados == 2)
        #expect(e.ativos.map(\.id) == ["m1"]); #expect(e.pendentes.map(\.nomeExibido) == ["b@x.com"])
        #expect(e.membros[0].efetivas == ["training:view"]); #expect(e.membros[0].personalizadas)
        #expect(try await api.convidar(clubeId: "c1", RascunhoMembro(email: "z@x.com").corpoConvite()) == "https://app/#/accept-invite/tok")
        try await api.atualizar(clubeId: "c1", membroId: "m1", ["role": "other"])
        try await api.remover(clubeId: "c1", membroId: "m2")
        #expect(try await api.reenviar(clubeId: "c1", membroId: "m2") == "https://app/#/accept-invite/t2")
        #expect(t.pedidos.map { "\($0.metodo) \($0.url.path)" } == [
            "GET /api/clubs/c1/members", "POST /api/clubs/c1/invite", "PUT /api/clubs/c1/members/m1",
            "DELETE /api/clubs/c1/members/m2", "POST /api/clubs/c1/members/m2/resend",
        ])
        #expect(escopoCategorias(nil, categorias: []) == "Todas as categorias")
        #expect(escopoCategorias(["k1"], categorias: [CategoriaCadastro(id: "k1", nome: "Sub-17")]) == "Sub-17")
        #expect(textoConvite(clube: "Vila", url: "u") == "Convite para a comissão do Vila no TactiPlan: u")
    }
}

@Suite struct EstatisticasTests {
    let treino = """
    {"totals":{"activities":91,"minutes":1690,"sessions":25},"byDimension":[{"dimension":"tatico","label":"Tático","count":44,"minutes":935},{"dimension":"fisico","count":27,"minutes":449},{"dimension":"tecnico","count":18,"minutes":286},{"dimension":"mental","count":0,"minutes":0}],
     "byDimensionPredominance":[{"dimension":"tatico","sessions":26},{"dimension":"fisico","sessions":5}],
     "byContent":[{"content_id":"jt","name":"Jogo Treino","dimension":"tatico","count":13,"minutes":350},{"content_id":"oo","name":"OO","dimension":"tatico","count":13,"minutes":200},{"content_id":"co","name":"Coordenação","dimension":"fisico","count":11,"minutes":156}],
     "byContentPredominance":[{"content_id":"jt","name":"Jogo Treino","dimension":"tatico","sessions":10}],
     "bySubcontent":[{"subcontent_id":"s1","name":"2ª Fase","content_id":"oo","dimension":"tatico","count":6,"minutes":75},{"subcontent_id":"s2","name":"Escanteio","content_id":"bp","dimension":"tatico","count":7}],
     "topTitles":[{"title_id":"t","title":"Rondo","dimension":"tatico","count":8,"minutes":200}],
     "distance":{"daysWithData":2,"avgKm":6.25,"totalKm":12.5,"maxKm":7,"granularity":"day","series":[{"label":"19/10","avgKm":5.5,"days":1}]}}
    """

    @Test func `treino: cards, pilares e conteudos`() throws {
        let s = try Json.ler(Data(treino.utf8)).decodificar(StatsTreino.self)
        #expect(s.atividades == 91 && s.minutos == 1690 && s.sessoes == 25)
        let mais = maisUsadoPorPilar(s)
        #expect(mais.map(\.pilar.id) == ["tatico", "fisico"]); #expect(mais[0].conteudo.nome == "Jogo Treino", "empate: o 1º")
        let tempo = distribuicaoPilares(s, modo: .tempo)
        #expect(tempo.map(\.pilar.id) == ["tatico", "fisico", "tecnico"], "pilar zerado some")
        #expect(tempo.map(\.pct) == [56, 27, 17])
        #expect(distribuicaoPilares(s, modo: .sessoes).map(\.valor) == [26, 5])
        #expect(conteudosDoPilar(s, pilar: "tatico", modo: .sessoes).map(\.valor) == [10])
        #expect(conteudosDoPilar(s, pilar: "tatico", modo: .tempo).map(\.item.nome) == ["Jogo Treino", "OO"])
        #expect(submomentosTaticos(s).map(\.nome) == ["Escanteio", "2ª Fase"])
        #expect(submomentosTaticos(s, conteudoId: "oo").map(\.nome) == ["2ª Fase"])
        #expect(s.distancia.diasComDado == 2 && kmTexto(s.distancia.mediaKm) == "6,3")
        #expect(textoValorPilar(65, modo: .tempo) == "1h 5min")
        let vazio = try Json.ler(Data(#"{"totals":{"activities":0},"distance":{"daysWithData":1}}"#.utf8)).decodificar(StatsTreino.self)
        #expect(vazio.vazio && vazio.temDados)
    }

    @Test func `jogos decodifica o retorno real e os cards`() throws {
        let st = try Json.ler(Data(#"{"totalMatches":5,"wins":3,"draws":1,"losses":1,"pointsWon":10,"pointsPlayed":15,"winStreak":2,"unbeatenStreak":2,"goalDifference":5,"avgGoalsScored":1.8,"avgGoalsConceded":0.8,"biggestLoss":{"opponent":"X","goals_scored":0,"goals_conceded":2},"form":[{"result":"win","goals_scored":3,"goals_conceded":1}],"playerStats":[{"athlete_id":"a","name":"A","minutes":440,"called_up":5}],"minutesPossible":450,"modality":"futsal"}"#.utf8))
            .decodificar(StatsJogos.self)
        let c = cardsJogos(st)
        #expect(c.pct == 67 && c.sequencia == "2 vitórias seguidas" && c.saldo == "+5" && c.media == "1,8 × 0,8")
        #expect(c.maiorVitoria == "Sem vitórias" && c.maiorDerrota == "0×2 vs X")
        #expect(st.forma.first?.letra == "V" && st.futsal)
        #expect(ordenarMinutagem(st.jogadores, minutosPossiveis: st.minutosPossiveis, ordem: OrdemMinutagem()).first?.pct == 98)
    }

    @Test func `alternar ordem da minutagem`() {
        let o = OrdemMinutagem()
        #expect(alternarOrdem(o, .minutos) == OrdemMinutagem(chave: .minutos, crescente: true))
        #expect(alternarOrdem(o, .nome) == OrdemMinutagem(chave: .nome, crescente: true))
        #expect(alternarOrdem(o, .pct) == OrdemMinutagem(chave: .pct, crescente: false))
    }

    @Test func `filtro personalizado e rotulos`() {
        #expect(periodoDoFiltro(.personalizado, referencia: "2026-10-22") == nil)
        #expect(fimAoMudarInicio(.umMicro, inicio: "2026-10-22") == nil)
        #expect(FiltroPeriodo.allCases.map(\.rotulo) == ["1 Microciclo", "4 Microciclos", "Semestre", "1 Ano", "Personalizado"])
        #expect(rotuloIntervalo(Intervalo(inicio: "2026-10-19", fim: "2026-10-25")) == "19/10 – 25/10")
        #expect(decimalWeb(2) == "2" && decimalWeb(0.33) == "0,33" && decimalWeb(nil) == "0")
    }

    @Test func `api e corpo do PDF`() async throws {
        let t = TransporteFalso()
        t.respostas = [ok(treino), ok(#"{"totalMatches":0}"#)]
        let api = ApiEstatisticasHttp(web(t))
        let i = Intervalo(inicio: "2026-01-01", fim: "2026-12-31")
        _ = try await api.treino(clubeId: "c1", i)
        _ = try await api.jogos(clubeId: "c1", i)
        #expect(t.pedidos.map { $0.url.absoluteString } == [
            "https://x.test/api/stats/training?start_date=2026-01-01&end_date=2026-12-31&clubId=c1",
            "https://x.test/api/stats/games?start_date=2026-01-01&end_date=2026-12-31&clubId=c1",
        ])
        #expect(corpoPdfEstatisticas(clubeId: "c1", i, filtro: .ano) == ["club_id": "c1", "start_date": "2026-01-01", "end_date": "2026-12-31",
                                                                         "filter_type": "1-year", "period_label": "1 Ano"])
        #expect(nomePdfEstatisticas(jogos: true, clube: "Vila Nova", filtro: .umMicro) == "Desempenho_Vila_Nova_1_Microciclo.pdf")
        #expect(nomePdfEstatisticas(jogos: false, clube: "Vila", filtro: .semestre) == "Estatisticas_Treino_Vila_Semestre.pdf")
    }
}

@Suite struct CadastrosTests {
    @Test func `limite de clubes sem preco`() {
        #expect(textoLimiteClubes(LimiteClubes(limite: 1, atuais: 1)) == "Clubes ativos: 1 de 1 · clubes arquivados não contam.")
        #expect(textoLimiteClubes(LimiteClubes(limite: -1, atuais: 2)) == "2 clubes ativos · sem limite nesta conta")
        #expect(LimiteClubes(limite: 1, atuais: 1).cheio && !LimiteClubes(limite: -1, atuais: 9).cheio)
        for t in [MSG_LIMITE_CLUBES, MSG_LIMITE_CATEGORIAS, textoArquivarClube("X"), textoDesarquivarClube("X"),
                  textoLimiteClubes(LimiteClubes(limite: 1, atuais: 0))] {
            #expect(textoNeutro(t), "\(t)")
        }
    }

    @Test func `erros dos cadastros em frase neutra`() {
        let e = ErroApi(status: 402, codigo: "ADDON_REQUIRED", mensagem: "Seu plano permite 1 clube(s) ativo(s)… (R$20/mês por clube).",
                        extras: ["required_feature": "max_clubs"])
        #expect(mensagemErroCadastro(e) == MSG_LIMITE_CLUBES)
        #expect(mensagemErroCadastro(erro(402, "ADDON_REQUIRED", "categorias R$5"), limite: MSG_LIMITE_CATEGORIAS) == MSG_LIMITE_CATEGORIAS)
        #expect(mensagemErroCadastro(erro(403, nil, "Sem permissão")) == MSG_SEM_PERMISSAO_CADASTRO)
        #expect(mensagemErroCadastro(erro(409, nil, "Já existe uma categoria com esse nome neste clube")) == "Já existe uma categoria com esse nome neste clube")
    }

    @Test func `campeonato manda o objeto completo`() {
        var c = CampeonatoCadastro(id: "k", nome: " Estadual ", temporada: "2026", formato: "Mata-mata", inicio: "2026-03-01", fim: nil, clubeId: nil)
        c.arquivado = true
        #expect(corpoCampeonato(c, clubeId: "c1") == ["club_id": "c1", "name": "Estadual", "season": "2026", "format": "Mata-mata",
                                                      "start_date": "2026-03-01", "end_date": .nulo, "is_archived": true])
        #expect(c.detalhe == "Mata-mata · 01/03/2026")
    }

    @Test func `conteudos: proprio pelo workspace_id, busca casa submomento`() throws {
        let cs = try Json.ler(Data(#"[{"id":"1","name":"Organização Ofensiva","abbreviation":"OO","dimension":"tatico","workspace_id":null,"tenant_id":"t","active":true},{"id":"2","name":"Saída de Bola","dimension":"tatico","workspace_id":"ws","active":false},{"id":"3","name":"Aeróbio","dimension":"fisico"}]"#.utf8))
            .decodificar([ConteudoItem].self)
        #expect(!cs[0].proprio && cs[1].proprio && !cs[1].ativo && cs[2].ativo)
        let subs = [SubmomentoItem(id: "s", conteudoId: "1", nome: "Criação", ordem: 3), SubmomentoItem(id: "t", conteudoId: "1", nome: "Finalização", ordem: 1)]
        #expect(conteudosDoPilarCadastro(cs, pilar: "tatico", busca: "").map(\.id) == ["1", "2"])
        #expect(conteudosDoPilarCadastro(cs, pilar: "tatico", busca: "criacao", submomentos: subs).map(\.id) == ["1"])
        #expect(submomentosDe("1", subs).map(\.nome) == ["Finalização", "Criação"])
        #expect(corpoSubmomento(conteudoId: "1", nome: "X", descricao: "", ordem: nil) == ["content_id": "1", "name": "X", "description": .nulo, "display_order": 999])
    }

    @Test func `atividades: busca, filtro, aviso de uso`() {
        let l = [AtividadeBiblioteca(id: "1", titulo: "Rondo 5v2", conteudoId: "oo"), AtividadeBiblioteca(id: "2", titulo: "Ativação", conteudoId: "co"),
                 AtividadeBiblioteca(id: "3", titulo: "Rondo antigo", conteudoId: "oo", arquivada: true)]
        #expect(filtrarAtividades(l, busca: "rondo", conteudoId: nil, arquivadas: false).map(\.id) == ["1"])
        #expect(filtrarAtividades(l, busca: "", conteudoId: "oo", arquivadas: true).map(\.id) == ["3"])
        #expect(erroAtividadeBiblioteca(pilar: nil, conteudoId: nil, titulo: "") == "Selecione o pilar.")
        #expect(erroAtividadeBiblioteca(pilar: "tatico", conteudoId: "oo", titulo: " ") == "Informe o nome da atividade.")
        #expect(avisoUsoAtividade(usos: 0, arquivar: true) == nil)
        #expect(avisoUsoAtividade(usos: 2, arquivar: false)?.hasPrefix("Esta atividade foi utilizada em 2 treinos.") == true)
    }

    @Test func `api dos cadastros: rotas e metodos`() async throws {
        let t = TransporteFalso()
        t.respostas = [ok(#"[{"id":"k","name":"Estadual","season":2026,"is_archived":false}]"#), ok("{}"),
                       ok(#"{"limit":1,"current":1,"plan_limit":1,"extra_slots":0}"#), ok("{}"), ok("{}"), ok(#"{"ok":true}"#),
                       ok("{}"), ok(#"{"count":"3"}"#), ok("{}"), ok("{}")]
        let api = ApiCadastrosHttp(web(t))
        let cs = try await api.campeonatos(clubeId: "c1")
        #expect(cs.first?.temporada == "2026")
        try await api.salvarCampeonato("k", corpoCampeonato(cs[0], clubeId: "c1"))
        let lim = try await api.limiteClubes()
        #expect(lim.cheio)
        try await api.arquivarClube("c2", arquivar: false)
        try await api.salvarClube(nil, corpoClube(nome: "Novo", modalidade: "futsal", descricao: nil))
        try await api.ativarConteudo("1", false)
        try await api.salvarSubmomento("s1", corpoSubmomento(conteudoId: "1", nome: "X", descricao: nil, ordem: 2))
        #expect(try await api.usoAtividade("t1") == 3)
        try await api.arquivarAtividade("t1", arquivar: true)
        try await api.removerCategoria("k1")
        #expect(t.pedidos.map { "\($0.metodo) \($0.url.absoluteString.replacingOccurrences(of: "https://x.test/api", with: ""))" } == [
            "GET /competitions?clubId=c1&includeArchived=true", "PUT /competitions/k", "GET /clubs/limit", "POST /clubs/c2/unarchive",
            "POST /clubs", "PATCH /contents/1/active", "PUT /stages/s1", "GET /titles/t1/usage-count", "PUT /titles/t1/archive",
            "DELETE /categories/k1",
        ])
        #expect(try corpo(t.pedidos[5]) == ["active": false])
        #expect(corpoRelatorioClube(clubeId: "c1", ano: "2026") == ["club_id": "c1", "start_date": "2026-01-01", "end_date": "2026-12-31", "period_label": "2026"])
    }
}

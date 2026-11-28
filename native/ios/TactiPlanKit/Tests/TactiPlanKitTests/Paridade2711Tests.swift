import Foundation
import Testing
@testable import TactiPlanKit

// Paridade com o web de 27/11/2026 (native/PARIDADE-27-11.md): transição, contagem de atividades, goleiro,
// sessões salvas, anexos da sessão, arquivos da semana, fotos da ficha, escudos, goleiros nas estatísticas,
// lado do zagueiro/campograma e excluir conta.

private func bloco(_ nome: String, _ ordem: Int, min: Int?, dim: String? = "tatico", anexos: Int? = nil) -> Bloco {
    Bloco(id: "b\(ordem)", nome: nome, ordem: ordem,
          atividade: Atividade(id: "a\(ordem)", minutos: min, anexos: anexos,
                               conteudos: dim.map { [ConteudoDaAtividade(id: nil, nome: "C", dimensao: $0)] }))
}

private func treino(_ id: String, periodo: String? = "manha", transicao: Bool = false, _ blocos: [Bloco]) -> Dia {
    Dia(id: id, data: "2026-11-20", nomeDia: "Sexta", diaDaSemana: 5, tipoBruto: "training", blocos: blocos,
        periodo: periodo, treinoTransicao: transicao)
}

@Suite struct TransicaoEAtividadesTests {
    @Test func `Academia e Ativacao nao contam como atividade, goleiro nao conta nem soma`() {
        #expect(ehBlocoAtivacao(" ativação ") && ehBlocoAtivacao("Academia") && !ehBlocoAtivacao("Atividade 1"))
        let d = treino("s1", [bloco("Academia", 1, min: 20, dim: "fisico", anexos: 1), bloco("Ativação", 2, min: 15),
                              bloco("Atividade 1", 3, min: 30), bloco("Atividade 2", 4, min: 25),
                              bloco("Treino de goleiro", 6, min: 40, anexos: 2)])
        let r = resumoDoDia(d)
        #expect(r.atividades == 2)
        #expect(r.blocosComAtividade == 5)
        #expect(r.minutos == 90)
        #expect(r.minutosGoleiro == 40)
        #expect(r.anexos == 3)
        #expect(textoGoleiro(r) == "+40′ gol")
        #expect(detalheDaLinha(r) == "90 min +40′ gol")
        #expect(fraseDoHeroi(r) == "Pilar predominante Tático · 2 atividades · 3 anexos")
        // só a ativação: "1 bloco", mas nenhuma "atividade" — não é "Sem atividades"
        let so = resumoDoDia(treino("s2", [bloco("Ativação", 2, min: 15)]))
        #expect(so.atividades == 0 && so.blocosComAtividade == 1)
        #expect(detalheDaLinha(so) == "15 min")
    }

    @Test func `transicao fica fora do total, dos pilares, do goleiro e da divisao`() throws {
        let t = treino("s2", periodo: "tarde", transicao: true, [bloco("Atividade 1", 3, min: 45), bloco("Treino de goleiro", 6, min: 20)])
        #expect(ehTransicao(t))
        let r = resumoDoDia(t)
        #expect(r.minutos == 0 && r.minutosGoleiro == 0 && r.pilares.isEmpty && r.minutosPorPilar.isEmpty)
        #expect(r.atividades == 1, "as atividades continuam aparecendo")
        #expect(r.transicao)
        #expect(rotuloLinhaPeriodo(t, pilares: ["Tático"]) == "Tarde · Transição")
        #expect(tituloDaLinhaDoDia(t) == "Tarde · Transição")
        #expect(detalheDaLinha(r) == "Transição · fora do total")
        // jogo com a flag não é transição
        var jogo = t
        jogo.tipoBruto = "match"
        #expect(!ehTransicao(jogo))
        // dia com 2 períodos: Manhã 90 + Tarde transição
        var m = treino("s1", [bloco("Atividade 1", 3, min: 90)])
        m.periodos = [m, t]
        #expect(divisaoMinutos(m) == nil, "nunca 90+0")
        let todo = resumoDoDiaInteiro(m)
        #expect(todo.minutos == 90)
        #expect(todo.atividades == 2)
        #expect(todo.transicao)
        #expect(tituloDaLinhaDoDia(m) == "Manhã · Tático + Tarde · Transição")
        // lê do JSON
        let j = #"{"id":"x","date":"2026-11-20","day_of_week":5,"session_type":"training","treino_transicao":true,"blocks":[]}"#
        #expect(try JSONDecoder().decode(Dia.self, from: Data(j.utf8)).treinoTransicao)
    }

    @Test func `corpo do PUT de transicao`() {
        #expect(corpoTransicao(true) == ["session_type": "training", "opponent_name": .nulo, "treino_transicao": .booleano(true)])
        #expect(corpoTransicao(false)["treino_transicao"] == .booleano(false))
    }

    @Test func `servico marca transicao e adiciona periodo de transicao`() async throws {
        let api = ApiTreinoFalsa()
        let s = ServicoTreino(api: api)
        let d = treino("s1", periodo: nil, [bloco("Atividade 1", 3, min: 30)])
        // a falsa não implementa marcarTransicao (padrão = offline): o serviço chega até a chamada
        await #expect(throws: ErroApi.self) {
            try await s.marcarTransicao(d, true, semana: SemanaISO(data: d.data), clubeId: "c")
        }
        var jogo = d
        jogo.tipoBruto = "match"
        await #expect(throws: ErroApi(status: 0, codigo: "TIPO_INVALIDO", mensagem: "Treino de transição só vale em dia de treino.")) {
            try await s.marcarTransicao(jogo, true, semana: SemanaISO(data: d.data), clubeId: "c")
        }
        // período novo de transição: sem implementação própria, cai no adicionarPeriodo de sempre
        _ = try await s.adicionarPeriodo(d, novo: .tarde, atual: .manha, transicao: true, semana: SemanaISO(data: d.data), clubeId: "c")
        #expect(api.chamadas.contains { $0.hasPrefix("periodo+:s1:tarde:manha") })
    }
}

@Suite struct FotosPosicaoTests {
    @Test func `esquerda padrao, direita, fim e blocos antigo`() {
        #expect(normalizarPosicaoFotos(nil) == "esquerda")
        #expect(normalizarPosicaoFotos("xyz") == "esquerda")
        #expect(normalizarPosicaoFotos("blocos") == "direita")
        #expect(normalizarPosicaoFotos("direita") == "direita")
        #expect(normalizarPosicaoFotos("fim") == "fim")
        #expect(POSICOES_FOTOS.map(\.rotulo) == ["Ao lado do bloco · esquerda", "Ao lado do bloco · direita", "No final da ficha"])
        let lista = ListaFotosRelatorio(fotos: [FotoRelatorio(id: "a")], semana: false)
        #expect(EscolhaFotos(lista: lista).posicao == "esquerda")
        #expect(EscolhaFotos(lista: lista, preferencias: PreferenciasFotos(posicao: "blocos")).posicao == "direita")
        #expect(EscolhaFotos(lista: lista, preferencias: PreferenciasFotos(posicao: "fim")).configuracao["posicao"] == "fim")
        let semana = ListaFotosRelatorio(fotos: [FotoRelatorio(id: "a")], semana: true)
        #expect(EscolhaFotos(lista: semana).configuracao["posicao"] == nil)
        #expect(EscolhaFotos(lista: semana).quantasSelecionadas == 0, "semana vem sem fotos marcadas")
    }
}

let JSON_SESSOES_SALVAS = """
{"data":[
 {"id":"m1","nome":"Treino de sexta","descricao":null,"criado_por":"Marcos","created_at":"2026-11-20T21:00:00.000Z",
  "origem_data":"2026-11-20","origem_periodo":"manha","atividades":2,"minutos":75,"goleiro":20,"midias":1,
  "blocos":[
   {"ordem":2,"nome":"Ativação","titulo":null,"conteudo":"Aeróbio","pilar":"fisico","minutos":15,"descricao":null,"midias":[]},
   {"ordem":3,"nome":"Atividade 1","titulo":"Rondo 4x2","conteudo":"Posse","pilar":"tatico","minutos":"45","descricao":"Dois toques",
    "midias":[{"url":"/uploads/session-files/x.jpg","tipo":"image","nome":"Foto"}]},
   {"ordem":1,"nome":"Academia","titulo":null,"conteudo":null,"pilar":null,"minutos":0,"descricao":null,"midias":[]},
   {"ordem":6,"nome":"Treino de goleiro","titulo":null,"conteudo":"Defesa","pilar":"tecnico","minutos":20,"descricao":null,"midias":[]},
   {"ordem":4,"nome":"Atividade 2","titulo":null,"conteudo":"Finalização","pilar":"tecnico","minutos":15,"descricao":null,"midias":[]}
  ]},
 {"id":"m2","nome":"Antiga","origem_data":null,"origem_periodo":null,"atividades":1,"minutos":0,"goleiro":0,"midias":0,"blocos":[]}
]}
"""

@Suite struct SessoesSalvasTests {
    func lista() throws -> [SessaoSalva] { try lerSessoesSalvas(try Json.ler(Data(JSON_SESSOES_SALVAS.utf8))) }

    @Test func `le a lista na ordem do servidor`() throws {
        let l = try lista()
        #expect(l.map(\.id) == ["m1", "m2"])
        let m = l[0]
        #expect(m.blocos.map(\.ordem) == [1, 2, 3, 4, 6], "blocos na ordem")
        #expect(m.blocos[2].minutos == 45)
        #expect(m.blocos[2].midias.first?.especie == .foto)
        #expect(m.blocos[0].preenchido == false && m.blocos[2].preenchido)
        #expect(origemDaSessao(m) == "Treino de sexta, 20/11 · Manhã")
        #expect(origemDaSessao(l[1]) == nil)
        #expect(resumoDaSessao(m) == "2 atividades · 75 min · +20′ gol")
        #expect(resumoDaSessao(l[1]) == "1 atividade")
        let p = pilaresDaSessao(m)
        #expect(p.map(\.pilar) == ["tatico", "fisico", "tecnico"], "goleiro fora")
        #expect(abs(p[0].fracao - 45.0 / 75.0) < 0.0001)
    }

    @Test func `nome padrao, substituir e dia sem treino`() {
        #expect(nomePadraoSessao(treino("s", [])) == "Treino de sexta, 20/11")
        #expect(textoSubstituirSessao(3) == "Esse treino já tem 3 atividades. Substituir pelas da sessão salva?")
        #expect(textoSubstituirSessao(1) == "Esse treino já tem 1 atividade. Substituir pelas da sessão salva?")
        var jogo = treino("s", [])
        jogo.tipoBruto = "match"
        #expect(erroDiaSemTreino(jogo) == "Esse dia está marcado como jogo. Para usar a sessão, mude o dia para treino (ou adicione um período de treino).")
        #expect(erroDiaSemTreino(treino("s", [])) == nil)
        var dois = treino("s1", [])
        dois.periodos = [dois, treino("s2", periodo: "tarde", []), jogo]
        #expect(periodosParaAplicar(dois).map(\.id) == ["s1", "s2"])
        #expect(!podeSalvarSessao(treino("s", [])))
        #expect(podeSalvarSessao(treino("s", [bloco("Ativação", 2, min: 10)])))
    }

    @Test func `409 TEM_ATIVIDADES traz o numero de atividades`() async throws {
        let t = TransporteFalso()
        t.respostas = [Resposta(status: 409, corpo: Data(#"{"error":"Esse treino já tem 3 atividades.","code":"TEM_ATIVIDADES","atividades":3}"#.utf8)),
                       Resposta(status: 200, corpo: Data(#"{"ok":true}"#.utf8))]
        let api = ApiTreinoHttp(api: Api(base: "https://x.test/api", transporte: t), upload: t, token: "tpa", workspaceId: "ws")
        do {
            try await api.aplicarSessao("m1", sessaoId: "s1", substituir: false)
            Issue.record("devia dar 409")
        } catch {
            #expect(atividadesQueSeraoTrocadas(error) == 3)
        }
        try await api.aplicarSessao("m1", sessaoId: "s1", substituir: true)
        #expect(t.pedidos.map(\.url.path) == ["/api/treinos-modelo/m1/aplicar", "/api/treinos-modelo/m1/aplicar"])
        #expect(try Json.ler(t.pedidos[0].corpo!) == ["session_id": "s1"])
        #expect(try Json.ler(t.pedidos[1].corpo!) == ["session_id": "s1", "substituir": .booleano(true)])
        #expect(atividadesQueSeraoTrocadas(ErroApi.offline()) == nil)
        #expect(atividadesQueSeraoTrocadas(ErroApi(status: 409, codigo: "TEM_ATIVIDADES", mensagem: "Esse treino já tem 4 atividades.")) == 4)
        #expect(atividadesQueSeraoTrocadas(ErroApi(status: 409, codigo: "TEM_ATIVIDADES", mensagem: "x")) == 1)
    }

    @Test func `salvar, renomear e excluir chamam as rotas`() async throws {
        let t = TransporteFalso()
        t.respostas = [Resposta(status: 201, corpo: Data(#"{"id":"m9","nome":"X"}"#.utf8))]
        let api = ApiTreinoHttp(api: Api(base: "https://x.test/api", transporte: t), upload: t, token: "tpa", workspaceId: "ws")
        let id = try await ServicoTreino(api: api).salvarSessao(treino("s1", [bloco("Atividade 1", 3, min: 30)]), nome: "  Treino A  ")
        #expect(id == "m9")
        try await api.renomearSessao("m9", nome: "B")
        try await api.excluirSessao("m9")
        #expect(t.pedidos.map { "\($0.metodo) \($0.url.path)" } == ["POST /api/treinos-modelo", "PATCH /api/treinos-modelo/m9", "DELETE /api/treinos-modelo/m9"])
        #expect(try Json.ler(t.pedidos[0].corpo!) == ["nome": "Treino A", "session_id": "s1"])
        await #expect(throws: ErroApi.self) { try await ServicoTreino(api: api).salvarSessao(treino("s1", []), nome: "x") }
        await #expect(throws: ErroApi(status: 0, codigo: "NOME", mensagem: MSG_NOME_SESSAO)) {
            try await ServicoTreino(api: api).salvarSessao(treino("s1", [bloco("Atividade 1", 3, min: 30)]), nome: "  ")
        }
    }

    @Test func `aplicar num dia que nao existe cria a semana antes`() async throws {
        let api = ApiTreinoFalsa()
        api.garantido = Microciclo(id: "m", dias: [Dia(id: "real", data: "2026-11-20", diaDaSemana: 5, tipoBruto: "training",
                                                       blocos: NOMES_BLOCOS.enumerated().map { Bloco(id: "b\($0.offset)", nome: $0.element, ordem: $0.offset + 1) })])
        // a falsa não implementa aplicarSessao (padrão = offline), mas o ensure vem antes
        await #expect(throws: ErroApi.self) {
            try await ServicoTreino(api: api).aplicarSessao("m1", em: diaVazio("2026-11-20"), substituir: false,
                                                            semana: SemanaISO(data: "2026-11-20"), clubeId: "c")
        }
        #expect(api.chamadas.first?.hasPrefix("ensure:") == true)
    }
}

@Suite struct ArquivosTreinoTests {
    func api(_ t: TransporteFalso) -> ApiTreinoHttp {
        ApiTreinoHttp(api: Api(base: "https://x.test/api", transporte: t), upload: t, token: "tpa_abc", workspaceId: "ws-1",
                      fronteira: { "FRONTEIRA" })
    }

    @Test func `anexo da sessao: session_id e title antes do arquivo, sem activity_id`() async throws {
        let t = TransporteFalso()
        t.respostas = [Resposta(status: 201, corpo: Data(#"{"id":"f1","activity_id":null,"title":"Carga","mime_type":"text/csv"}"#.utf8))]
        let a = try await api(t).enviarAnexoDaSessao(sessaoId: "s1", arquivo: ArquivoUpload(nome: "carga.csv", tipo: "text/csv", dados: Data([1])),
                                                     titulo: "Carga") { _ in }
        #expect(a.id == "f1" && a.atividadeId == nil)
        let r = try #require(t.pedidos.first)
        #expect(r.url.absoluteString == "https://x.test/api/files/upload")
        let corpo = String(decoding: try #require(r.corpo), as: UTF8.self)
        let iS = try #require(corpo.range(of: "name=\"session_id\"\r\n\r\ns1\r\n"))
        let iT = try #require(corpo.range(of: "name=\"title\"\r\n\r\nCarga\r\n"))
        let iF = try #require(corpo.range(of: "name=\"file\"; filename=\"carga.csv\"\r\nContent-Type: text/csv"))
        #expect(iS.lowerBound < iT.lowerBound && iT.lowerBound < iF.lowerBound)
        #expect(!corpo.contains("activity_id"))
    }

    @Test func `arquivo da semana: week e club_id antes do arquivo; 404 chama o ensure e repete`() async throws {
        let t = TransporteFalso()
        t.respostas = [
            Resposta(status: 404, corpo: Data(#"{"error":"Semana não encontrada. Abra a semana na Programação antes."}"#.utf8)),
            Resposta(status: 200, corpo: Data(#"{"id":"mc","sessions":[]}"#.utf8)),
            Resposta(status: 201, corpo: Data(#"{"id":"w1","title":"Plano","url":"/uploads/semana-files/x.pdf","file_name":"plano.pdf","file_size":"1258291","mime_type":"application/pdf","created_at":"2026-11-23T14:00:00.000Z"}"#.utf8)),
        ]
        let s = SemanaISO(data: "2026-11-23")
        let w = try await ServicoTreino(api: api(t)).enviarArquivoSemana(s, clubeId: "c1",
                                                                         arquivo: ArquivoUpload(nome: "plano.pdf", tipo: "application/pdf", dados: Data([1])),
                                                                         titulo: nil)
        #expect(w.id == "w1")
        #expect(t.pedidos.map(\.url.path) == ["/api/arquivos-semana", "/api/microcycles/ensure", "/api/arquivos-semana"])
        let corpo = String(decoding: try #require(t.pedidos[2].corpo), as: UTF8.self)
        let iW = try #require(corpo.range(of: "name=\"week\"\r\n\r\n\(s.identificador)\r\n"))
        let iC = try #require(corpo.range(of: "name=\"club_id\"\r\n\r\nc1\r\n"))
        let iF = try #require(corpo.range(of: "name=\"file\"; filename=\"plano.pdf\""))
        #expect(iW.lowerBound < iC.lowerBound && iC.lowerBound < iF.lowerBound)
        #expect(!corpo.contains("name=\"title\""))
        #expect(w.detalhe == "1,2 MB · 23/11")
    }

    @Test func `lista da semana, filtro dos anexos da sessao e tipos`() throws {
        let j = #"{"data":[{"id":"w1","title":"","url":"/u/a.xlsx","file_name":"carga.xlsx","file_size":2048,"mime_type":"application/vnd.ms-excel","created_at":"2026-11-24T01:30:00.000Z","enviado_por":"Ana"}]}"#
        let l = try lerArquivosSemana(try Json.ler(Data(j.utf8)))
        #expect(l.count == 1)
        #expect(l[0].rotulo == "carga.xlsx")
        #expect(l[0].detalhe == "2 KB · Ana · 23/11", "01h30 UTC = 22h30 do dia 23 em Brasília")
        #expect(especieDoArquivo(l[0].tipo) == .planilha)
        #expect(l[0].comoAnexo.caminho == "/u/a.xlsx")
        #expect(rotuloArquivosSemana(0) == "Arquivos da semana" && rotuloArquivosSemana(3) == "Arquivos da semana (3)")
        let anexos = [Anexo(id: "1", atividadeId: "a1", titulo: nil, caminho: nil, tipo: nil), Anexo(id: "2", atividadeId: nil, titulo: nil, caminho: nil, tipo: nil)]
        #expect(anexosDaSessao(anexos).map(\.id) == ["2"])
        #expect(mimeDoArquivo("Plano.PPTX") == "application/vnd.openxmlformats-officedocument.presentationml.presentation")
        #expect(mimeDoArquivo("x.zip") == nil)
        #expect(problemaDoArquivoTreino(tipo: "text/csv", tamanho: 10) == nil)
        #expect(problemaDoArquivoTreino(tipo: "application/zip", tamanho: 10) == MSG_ARQUIVO_TIPO)
        #expect(problemaDoArquivoTreino(tipo: "application/pdf", tamanho: MAX_BYTES_ANEXO + 1) == MSG_ANEXO_GRANDE)
        #expect(tamanhoLegivel(nil) == "" && tamanhoLegivel(100) == "1 KB" && tamanhoLegivel(5 * 1_048_576) == "5,0 MB")
    }
}

@Suite struct EscudosJogoTests {
    @Test func `mandante primeiro, sigla e horario`() throws {
        let j = #"{"id":"g","date":"2026-11-22","day_of_week":7,"session_type":"match","opponent_name":"Rival FC","opponent_logo":"/uploads/analise/r.png","match_location":"away","match_kickoff":"19:30:00","blocks":[]}"#
        let d = try JSONDecoder().decode(Dia.self, from: Data(j.utf8))
        #expect(d.adversarioLogo == "/uploads/analise/r.png" && d.mando == "away" && d.horario == "19:30:00")
        let fora = escudosDoJogo(nossoNome: "Esporte Clube Vila Nova", nossoLogo: nil, adversario: d.adversario,
                                 adversarioLogo: d.adversarioLogo, mando: d.mando)
        #expect(fora.casa.nome == "Rival FC" && fora.casa.url == "/uploads/analise/r.png" && !fora.casa.nosso)
        #expect(fora.fora.nosso && fora.fora.sigla == "ECV")
        let casa = escudosDoJogo(nossoNome: "Vila", nossoLogo: "https://x/logo.png", adversario: nil, adversarioLogo: nil, mando: "home")
        #expect(casa.casa.nosso && casa.fora.nome == "Adversário")
        #expect(escudosDoJogo(nossoNome: "Vila", nossoLogo: nil, adversario: "B", adversarioLogo: "", mando: nil).casa.nosso)
        #expect(siglaDoEscudo("Rival FC") == "RF")
        #expect(siglaDoEscudo("Clube de Regatas do Flamengo") == "CRF")
        #expect(siglaDoEscudo("") == "?")
        #expect(horarioDoJogo(d.horario) == "19h30")
        #expect(horarioDoJogo(nil) == nil)
        let semLogo = #"{"id":"g","date":"2026-11-22","day_of_week":7,"session_type":"match","opponent_logo":null,"blocks":[]}"#
        #expect(try JSONDecoder().decode(Dia.self, from: Data(semLogo.utf8)).adversarioLogo == nil)
    }
}

@Suite struct GoleirosStatsTests {
    @Test func `le goleiros e esconde quando vazio`() throws {
        let j = #"{"totals":{"activities":3,"minutes":120,"sessions":2},"goleiros":{"minutes":"95","sessions":3,"activities":4,"byContent":[{"content_id":"c1","name":"Defesa","dimension":"tecnico","count":2,"minutes":30},{"content_id":"c2","name":"Saída","dimension":"tecnico","count":1,"minutes":65},{"content_id":"c3","name":"a","count":1,"minutes":1},{"content_id":"c4","name":"b","count":1,"minutes":1},{"content_id":"c5","name":"c","count":1,"minutes":1},{"content_id":"c6","name":"d","count":1,"minutes":0}]}}"#
        let s = try JSONDecoder().decode(StatsTreino.self, from: Data(j.utf8))
        #expect(s.goleiros.minutos == 95 && s.goleiros.sessoes == 3 && s.goleiros.atividades == 4)
        #expect(s.goleiros.mostrar)
        #expect(s.goleiros.topConteudos.count == 5)
        #expect(s.goleiros.topConteudos.first?.nome == "Saída")
        let vazio = try JSONDecoder().decode(StatsTreino.self, from: Data(#"{"totals":{}}"#.utf8))
        #expect(!vazio.goleiros.mostrar)
    }
}

@Suite struct LadoECampogramaTests {
    @Test func `ZAG mostra o lado e o corpo so manda lado no zagueiro`() throws {
        let j = #"{"id":"a","name":"Leo","position":"ZAG","lado_preferido":"direita"}"#
        let a = try JSONDecoder().decode(Atleta.self, from: Data(j.utf8))
        #expect(a.ladoPreferido == "direita")
        #expect(rotuloPosicaoAtleta(a) == "ZAG · D")
        #expect(detalheAtleta(a, hoje: "2026-11-27") == "ZAG · D")
        var e = a; e.ladoPreferido = "esquerda"
        #expect(rotuloPosicaoAtleta(e) == "ZAG · E")
        e.ladoPreferido = "ambos"
        #expect(rotuloPosicaoAtleta(e) == "ZAG · D/E")
        e.ladoPreferido = nil
        #expect(rotuloPosicaoAtleta(e) == "ZAG")
        #expect(corpoAtleta(a, clubeId: "c")["lado_preferido"] == "direita")
        var mei = a; mei.posicao = "MEI"
        #expect(rotuloPosicaoAtleta(mei) == "MEI")
        #expect(corpoAtleta(mei, clubeId: "c")["lado_preferido"] == .nulo)
        #expect(perguntaLado("ZAG") && !perguntaLado("MEI"))
        let lixo = try JSONDecoder().decode(Atleta.self, from: Data(#"{"id":"a","name":"x","lado_preferido":"cima"}"#.utf8))
        #expect(lixo.ladoPreferido == nil)
    }

    @Test func `campograma igual ao do servidor (campograma.json)`() throws {
        let raiz = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let j = try Json.ler(Data(contentsOf: raiz.appendingPathComponent("native/paridade/campograma.json")))
        guard case .lista(let casos)? = j["casos"] else { Issue.record("sem casos"); return }
        #expect(casos.count >= 2)
        for caso in casos {
            let atletas = try caso["atletas"]!.decodificar([Atleta].self)
            let c = montarCampograma(atletas, modalidade: caso["modalidade"]?.texto)
            guard case .lista(let zonas)? = caso["saida"]?["zonas"], case .lista(let sem)? = caso["saida"]?["semLugar"] else {
                Issue.record("saída"); continue
            }
            #expect(c.zonas.map(\.chave) == zonas.map { $0["key"]?.texto ?? "" })
            for (z, e) in zip(c.zonas, zonas) {
                #expect(z.nome == e["nome"]?.texto)
                #expect(z.left == e["left"]?.numero && z.top == e["top"]?.numero, "\(z.chave)")
                #expect(z.tx.rawValue == e["tx"]?.texto && z.ty.rawValue == e["ty"]?.texto, "\(z.chave)")
                guard case .lista(let as_)? = e["atletas"] else { continue }
                #expect(z.atletas.map(\.id) == as_.map { $0["id"]?.texto ?? "" }, "\(z.chave)")
                #expect(z.atletas.map(\.nome) == as_.map { $0["nome"]?.texto ?? "" })
                #expect(z.atletas.map(\.dm) == as_.map { $0["dm"]?.booleano ?? false })
                #expect(z.atletas.map(\.trans) == as_.map { $0["trans"]?.booleano ?? false })
                #expect(z.atletas.map { $0.numero.map(Double.init) } == as_.map { $0["numero"]?.numero })
            }
            #expect(c.semLugar.map(\.id) == sem.map { $0["id"]?.texto ?? "" })
        }
    }

    @Test func `campograma esconde o DM e conta a lesao aberta`() {
        let atletas = [Atleta(id: "4", nome: "Duda", posicao: "GOL", camisa: 1, grupo: "DM"),
                       Atleta(id: "5", nome: "Edu", posicao: "GOL", camisa: 12)]
        #expect(montarCampograma(atletas, modalidade: nil, mostrarDM: false).zonas[0].atletas.map(\.id) == ["5"])
        let lesao = Lesao(id: "l", atletaId: "5", tipo: "Entorse")
        #expect(montarCampograma(atletas, modalidade: nil, lesoesAtivas: [lesao]).zonas[0].atletas.allSatisfy { $0.dm })
        #expect(nomeCurtoCampo("Carlos Alberto Souza") == "Carlos S." && nomeCurtoCampo("Pelé") == "Pelé")
    }
}

@Suite struct ExcluirContaTests {
    @Test func `corpo com senha ou vazio`() {
        #expect(corpoExcluirConta(senha: "x") == ["password": "x"])
        #expect(corpoExcluirConta(senha: nil) == .objeto([:]))
        #expect(corpoExcluirConta(senha: "") == .objeto([:]))
    }

    @Test func `DELETE auth me com o token`() async throws {
        let t = TransporteFalso()
        t.respostas = [Resposta(status: 401, corpo: Data(#"{"error":"Senha incorreta"}"#.utf8)), Resposta(status: 200, corpo: Data("{}".utf8))]
        let api = ApiAppHttp(api: Api(base: "https://x.test/api", transporte: t))
        await #expect(throws: ErroApi(status: 401, codigo: nil, mensagem: "Senha incorreta")) {
            try await api.excluirConta(token: "tpa_1", senha: "errada")
        }
        try await api.excluirConta(token: "tpa_1", senha: nil)
        #expect(t.pedidos.map { "\($0.metodo) \($0.url.path)" } == ["DELETE /api/auth/me", "DELETE /api/auth/me"])
        #expect(t.pedidos[0].cabecalho("authorization") == "Bearer tpa_1")
        #expect(try Json.ler(t.pedidos[0].corpo!) == ["password": "errada"])
    }
}

@Suite struct LinkDaSessaoTests {
    @Test func validaEHost() {
        #expect(linkValido(" youtube.com/watch?v=1 ") == "https://youtube.com/watch?v=1")
        #expect(linkValido("http://a.co") == "http://a.co")
        #expect(linkValido("javascript:alert(1)") == nil)
        #expect(linkValido("ftp://a.b") == nil)
        #expect(linkValido("abc") == nil)
        #expect(hostDoLink("https://www.drive.google.com/x") == "drive.google.com")
        let a = Anexo(id: "l1", atividadeId: nil, titulo: "Vídeo", caminho: "https://youtube.com/x", tipo: MIME_LINK)
        #expect(a.ehLink)
    }
}

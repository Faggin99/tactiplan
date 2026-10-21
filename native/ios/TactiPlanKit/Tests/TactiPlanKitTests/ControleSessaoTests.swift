import Testing
@testable import TactiPlanKit

@MainActor
@Suite struct ControleSessaoTests {
    let doisClubes = me([
        conta("w1", "Demo FC", clubes: [clube("c1", "Demo FC")]),
        conta("w2", "Escolinha", dono: false, clubes: [clube("c3", "Escolinha Demo")]),
    ])
    let umClube = me([conta("w1", "Demo FC", clubes: [clube("c1", "Demo FC")])])

    func controle(_ api: ApiFalsa = ApiFalsa(), _ cofre: CofreSessao = CofreSessaoMemoria()) -> ControleSessao {
        ControleSessao(api: api, cofre: cofre, relogio: { 1000 })
    }

    @Test func `sem sessao abre no entrar`() {
        #expect(controle().estado == .entrar)
    }

    @Test func `login com um clube so entra direto e guarda a escolha`() {
        let cofre = CofreSessaoMemoria()
        let c = controle(ApiFalsa(), cofre)
        c.entrou(RespostaLogin(token: "tpa_1", me: umClube))
        guard case .noClube(let s, let ctx) = c.estado else { Issue.record("esperava noClube"); return }
        #expect(s.token == "tpa_1")
        #expect(s.meEm == 1000)
        #expect(ctx.nome == "Demo FC")
        #expect(cofre.ler()?.escolha == Escolha(workspaceId: "w1", clubeId: "c1"))
        #expect(cofre.lerUltimaEscolha("u1") == Escolha(workspaceId: "w1", clubeId: "c1"))
    }

    @Test func `login com dois clubes pergunta e lembra a ultima escolha`() {
        let cofre = CofreSessaoMemoria()
        let c = controle(ApiFalsa(), cofre)
        c.entrou(RespostaLogin(token: "tpa_1", me: doisClubes))
        guard case .ondeEntrar(_, let atual) = c.estado else { Issue.record("esperava ondeEntrar"); return }
        #expect(atual == nil)
        c.escolher(Escolha(workspaceId: "w2", clubeId: "c3"))
        guard case .noClube(_, let ctx) = c.estado else { Issue.record("esperava noClube"); return }
        #expect(ctx.conta.id == "w2")
        // reabrir o app: volta direto no clube
        #expect(controle(ApiFalsa(), cofre).estado.sessao?.escolha == Escolha(workspaceId: "w2", clubeId: "c3"))
        // sair e entrar de novo: volta na última escolha
        let c2 = controle(ApiFalsa(), cofre)
        cofre.limpar()
        c2.entrou(RespostaLogin(token: "tpa_2", me: doisClubes))
        if case .noClube(_, let ctx2) = c2.estado { #expect(ctx2.conta.id == "w2") } else { Issue.record("esperava noClube") }
    }

    @Test func `escolha invalida e ignorada`() {
        let c = controle()
        c.entrou(RespostaLogin(token: "tpa_1", me: doisClubes))
        c.escolher(Escolha(workspaceId: "w9", clubeId: "x"))
        if case .ondeEntrar = c.estado {} else { Issue.record("deveria continuar no ondeEntrar") }
    }

    @Test func `trocar clube e cancelar volta ao atual`() {
        let c = controle()
        c.entrou(RespostaLogin(token: "tpa_1", me: doisClubes))
        c.escolher(Escolha(workspaceId: "w1", clubeId: "c1"))
        c.abrirTroca()
        guard case .ondeEntrar(_, let atual) = c.estado else { Issue.record("esperava ondeEntrar"); return }
        #expect(atual == Escolha(workspaceId: "w1", clubeId: "c1"))
        c.cancelarTroca()
        if case .noClube(_, let ctx) = c.estado { #expect(ctx.clube?.id == "c1") } else { Issue.record("esperava noClube") }
    }

    @Test func `sair apaga a sessao e avisa o servidor mesmo sem rede`() async {
        let api = ApiFalsa()
        api.erroSair = ErroApi.offline()
        let cofre = CofreSessaoMemoria()
        let c = controle(api, cofre)
        c.entrou(RespostaLogin(token: "tpa_1", me: umClube))
        await c.sair()
        #expect(c.estado == .entrar)
        #expect(cofre.ler() == nil)
        #expect(api.chamadas == ["sair:tpa_1"])
    }

    @Test func `401 so derruba a sessao do mesmo token`() {
        let c = controle()
        c.entrou(RespostaLogin(token: "tpa_novo", me: umClube))
        #expect(!c.tratarErro(erro(401, nil), token: "tpa_velho"))
        #expect(c.sessao != nil)
        #expect(!c.tratarErro(erro(500, nil), token: "tpa_novo"))
        #expect(c.tratarErro(erro(401, "SESSAO_INVALIDA"), token: "tpa_novo"))
        #expect(c.estado == .entrar)
    }

    @Test func `atualizar me: novo dado, sem rede e 401`() async {
        let api = ApiFalsa()
        let c = controle(api)
        c.entrou(RespostaLogin(token: "tpa_1", me: umClube))
        var renomeado = umClube
        renomeado.usuario.nome = "Marcos A."
        api.respostaMe = .success(renomeado)
        await c.atualizarMe()
        #expect(c.sessao?.me.usuario.nome == "Marcos A.")
        #expect(!c.semConexao)
        api.respostaMe = .failure(ErroApi.offline())
        await c.atualizarMe()
        #expect(c.semConexao)
        #expect(c.sessao?.me.usuario.nome == "Marcos A.") // mantém o último
        api.respostaMe = .failure(erro(401, "SESSAO_INVALIDA"))
        await c.atualizarMe()
        #expect(c.estado == .entrar)
    }

    @Test func `clube removido no servidor volta para o onde entrar`() async {
        let api = ApiFalsa()
        let c = controle(api)
        c.entrou(RespostaLogin(token: "tpa_1", me: doisClubes))
        c.escolher(Escolha(workspaceId: "w2", clubeId: "c3"))
        api.respostaMe = .success(me([
            conta("w1", "Demo FC", clubes: [clube("c1", "Demo FC")]),
            conta("w4", "Outra", clubes: [clube("c4", "Outra")]),
        ]))
        await c.atualizarMe()
        if case .ondeEntrar = c.estado {} else { Issue.record("esperava ondeEntrar") }
    }

    @Test func `aceitar convite entra direto quando a equipe tem um clube`() async throws {
        let api = ApiFalsa()
        let c = controle(api)
        c.entrou(RespostaLogin(token: "tpa_1", me: me([conta("w1", "Demo FC", clubes: [clube("c1", "Demo FC")])],
                                                   convites: [Convite(token: "abc")])))
        if case .ondeEntrar = c.estado {} else { Issue.record("convite pendente mostra a tela") }
        api.respostaConvite = .success(RespostaConvite(workspaceId: "w2", me: doisClubes))
        try await c.aceitarConvite("abc")
        #expect(api.chamadas.last == "aceitar:abc")
        if case .noClube(_, let ctx) = c.estado { #expect(ctx.conta.id == "w2") } else { Issue.record("esperava noClube") }
    }

    @Test func `convite recusado pelo servidor sobe o erro`() async {
        let api = ApiFalsa()
        let c = controle(api)
        c.entrou(RespostaLogin(token: "tpa_1", me: me([], convites: [Convite(token: "abc")])))
        api.respostaConvite = .failure(erro(403, "CONVITE_OUTRO_EMAIL", "Este convite é para outro e-mail."))
        await #expect(throws: ErroApi.self) { try await c.aceitarConvite("abc") }
        if case .ondeEntrar = c.estado {} else { Issue.record("continua no ondeEntrar") }
    }

    @Test func `push so com sessao`() async {
        let api = ApiFalsa()
        let c = controle(api)
        await c.registrarPush("tok", plataforma: PLATAFORMA_IOS)
        #expect(api.chamadas.isEmpty)
        c.entrou(RespostaLogin(token: "tpa_1", me: umClube))
        await c.registrarPush("tok", plataforma: PLATAFORMA_IOS)
        #expect(api.chamadas == ["push:tok:ios"])
    }
}

@MainActor
@Suite struct EntrarTests {
    func modelo(_ api: ApiFalsa, _ entrou: @escaping (RespostaLogin) -> Void = { _ in }) -> EntrarModelo {
        EntrarModelo(api: api, aparelho: Aparelho(plataforma: PLATAFORMA_IOS), aoEntrar: entrou)
    }

    @Test func `valida antes de chamar o servidor`() async {
        let api = ApiFalsa()
        let m = modelo(api)
        m.mudarEmail("sem-arroba")
        m.mudarSenha("x")
        await m.entrar()
        #expect(m.estado.erro == MSG_EMAIL_INVALIDO)
        m.mudarEmail("a@b.com")
        m.mudarSenha("")
        await m.entrar()
        #expect(m.estado.erro == MSG_SENHA_VAZIA)
        #expect(api.chamadas.isEmpty)
    }

    @Test func `entrou limpa a senha e chama de volta`() async {
        let api = ApiFalsa()
        api.respostaLogin = .success(RespostaLogin(token: "tpa_1", me: me([])))
        var recebido: String?
        let m = modelo(api) { recebido = $0.token }
        m.mudarEmail(" a@b.com ")
        m.mudarSenha("segredo")
        await m.entrar()
        #expect(recebido == "tpa_1")
        #expect(m.estado.senha == "")
        #expect(!m.estado.carregando)
        #expect(api.chamadas == ["entrar:a@b.com"])
    }

    @Test func `mensagens de erro do login`() async {
        let api = ApiFalsa()
        let m = modelo(api)
        m.mudarEmail("a@b.com")
        m.mudarSenha("x")
        api.respostaLogin = .failure(erro(401, "CREDENCIAIS", "E-mail ou senha incorretos."))
        await m.entrar()
        #expect(m.estado.erro == "E-mail ou senha incorretos.")
        api.respostaLogin = .failure(ErroApi.offline())
        await m.entrar()
        #expect(m.estado.erro == ErroApi.MSG_OFFLINE)
        api.respostaLogin = .failure(erro(502, nil))
        await m.entrar()
        #expect(m.estado.erro == ErroApi.MSG_FALHA)
        m.mudarSenha("y")
        #expect(m.estado.erro == nil) // digitar apaga o erro
    }

    @Test func `config do servidor e social`() async {
        let api = ApiFalsa()
        api.respostaConfig = .success(ConfigApp(apple: .init(ativo: true), esqueciSenhaUrl: "https://e"))
        let m = modelo(api)
        await m.carregarConfig()
        #expect(m.estado.config.apple?.ativo == true)
        #expect(m.estado.esqueciSenhaUrl == "https://e")
        api.respostaLogin = .failure(erro(404, "SEM_CONTA", "Não encontramos uma conta TactiPlan com este e-mail."))
        await m.entrarComApple("tok", nome: "Ana")
        #expect(m.estado.erro?.hasPrefix("Não encontramos") == true)
        m.falhaSocial(nil)
        #expect(m.estado.erro == nil)
        api.respostaConfig = .failure(ErroApi.offline())
        let m2 = modelo(api)
        await m2.carregarConfig()
        #expect(m2.estado.config == .padrao)
    }
}

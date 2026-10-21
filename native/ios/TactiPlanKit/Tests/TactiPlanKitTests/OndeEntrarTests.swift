import Testing
@testable import TactiPlanKit

@Suite struct OndeEntrarTests {
    let demo = conta("w1", "Demo FC", clubes: [
        clube("c1", "Demo FC", cats: ["Sub-15", "Sub-17", "Sub-20", "Sub-11"]),
        clube("c0", "Demo Antigo", arquivado: true),
    ])
    let escolinha = conta("w2", "Escolinha", dono: false, leitura: true, permissoes: ["training:view"],
                          clubes: [clube("c3", "Escolinha Demo")])

    @Test func `uma linha por clube, ativos antes, conta sem clube vira uma linha`() {
        let semClube = conta("w3", "Minha conta", clubes: [])
        let o = opcoesDeEntrada(me([demo, escolinha, semClube]))
        #expect(o.map(\.titulo) == ["Demo FC", "Demo Antigo", "Escolinha Demo", "Minha conta"])
        #expect(o[0].subtitulo == "Futebol 11 · Sub-15, Sub-17, Sub-20 +1")
        #expect(o[1].arquivado && o[1].somenteLeitura)
        #expect(o[2].somenteLeitura)
        #expect(o[2].subtitulo.contains("só leitura"))
        #expect(o[2].subtitulo.contains("Escolinha")) // mais de uma conta: diz de qual é
        #expect(o[3].escolha == Escolha(workspaceId: "w3", clubeId: nil))
        #expect(o[2].papelRotulo == "Treinador auxiliar")
    }

    @Test func `arquivados ficam numa secao a parte`() {
        let s = secoesDeEntrada(me([demo, escolinha]))
        #expect(s.ativas.map(\.titulo) == ["Demo FC", "Escolinha Demo"])
        #expect(s.arquivadas.map(\.titulo) == ["Demo Antigo"])
    }

    @Test func `escolha automatica`() {
        let um = me([demo])
        // um ativo + um arquivado: entra no ativo
        #expect(escolhaAutomatica(um, atual: nil, ultima: nil) == Escolha(workspaceId: "w1", clubeId: "c1"))
        let dois = me([demo, escolinha])
        #expect(escolhaAutomatica(dois, atual: nil, ultima: nil) == nil)
        let ultima = Escolha(workspaceId: "w2", clubeId: "c3")
        #expect(escolhaAutomatica(dois, atual: nil, ultima: ultima) == ultima)
        // a escolha some (clube apagado): pergunta de novo
        #expect(escolhaAutomatica(dois, atual: Escolha(workspaceId: "w2", clubeId: "x"), ultima: nil) == nil)
        // convite pendente: sempre mostra a tela
        let comConvite = me([demo], convites: [Convite(token: "t")])
        #expect(escolhaAutomatica(comConvite, atual: nil, ultima: nil) == nil)
        #expect(escolhaAutomatica(me([]), atual: nil, ultima: nil) == nil)
    }

    @Test func `contexto do clube permissoes e so leitura`() throws {
        let m = me([demo, escolinha])
        let dono = try #require(contextoDe(m, Escolha(workspaceId: "w1", clubeId: "c1")))
        #expect(!dono.somenteLeitura)
        #expect(dono.podeEditar("training:edit"))
        #expect(!dono.podeEditar("games:edit"))
        #expect(dono.editaAlgo)
        #expect(dono.categorias.count == 4)
        let leitor = try #require(contextoDe(m, Escolha(workspaceId: "w2", clubeId: "c3")))
        #expect(leitor.somenteLeitura)
        #expect(leitor.pode("training:view"))
        #expect(!leitor.editaAlgo)
        #expect(leitor.mensagemSomenteLeitura == TEXTO_SO_LEITURA)
        let arquivado = try #require(contextoDe(m, Escolha(workspaceId: "w1", clubeId: "c0")))
        #expect(arquivado.somenteLeitura)
        #expect(!arquivado.podeEditar("training:edit"))
        #expect(contextoDe(m, Escolha(workspaceId: "w1", clubeId: "nao")) == nil)
        #expect(contextoDe(m, nil) == nil)
    }

    @Test func `frase de so leitura do servidor so vale se for neutra`() {
        var m = me([demo])
        m.mensagemSomenteLeitura = "Assine o plano para editar"
        #expect(textoSomenteLeitura(m) == TEXTO_SO_LEITURA)
        m.mensagemSomenteLeitura = "Somente leitura. Fale com o treinador."
        #expect(textoSomenteLeitura(m) == "Somente leitura. Fale com o treinador.")
        #expect(textoSomenteLeitura(nil) == TEXTO_SO_LEITURA)
    }

    @Test func `abas: quadro some sem tactical view`() throws {
        let m = me([demo, escolinha])
        let comQuadro = try #require(contextoDe(m, Escolha(workspaceId: "w1", clubeId: "c1")))
        #expect(abasDoContexto(comQuadro).map(\.id) == ["semana", "jogos", "elenco", "quadro", "mais"])
        let sem = try #require(contextoDe(m, Escolha(workspaceId: "w2", clubeId: "c3")))
        #expect(abasDoContexto(sem).map(\.id) == ["semana", "jogos", "elenco", "mais"])
        #expect(abasDoContexto(nil).count == 5)
    }

    @Test func `rotulo de papel padrao`() {
        #expect(rotuloPapel("owner") == "Dono")
        #expect(rotuloPapel("head_coach") == "Treinador principal")
        #expect(rotuloPapel("novo") == "Comissão")
        #expect(rotuloPapel(nil) == "Comissão")
    }
}

@Suite struct LoginSocialTests {
    let tudo = ConfigApp(google: .init(ativo: true, iosClientId: "ios", androidServerClientId: "web"), apple: .init(ativo: true))

    @Test func `apple precisa do servidor e do build`() {
        #expect(mostrarApple(tudo, appleNoBuild: true))
        #expect(!mostrarApple(tudo, appleNoBuild: false))
        #expect(!mostrarApple(.padrao, appleNoBuild: true))
    }

    @Test func `google no iPhone so com a Apple junto (regra 4_8)`() {
        #expect(googleIOSClientId(tudo, appleNoBuild: true) == "ios")
        #expect(googleIOSClientId(tudo, appleNoBuild: false) == nil)
        let semIos = ConfigApp(google: .init(ativo: true, androidServerClientId: "web"), apple: .init(ativo: true))
        #expect(googleIOSClientId(semIos, appleNoBuild: true) == nil)
    }

    @Test func `google no android so com o client web`() {
        #expect(googleAndroidServerClientId(tudo) == "web")
        #expect(googleAndroidServerClientId(.padrao) == nil)
        #expect(googleAndroidServerClientId(ConfigApp(google: .init(ativo: false, androidServerClientId: "web"))) == nil)
    }
}

@Suite struct TravaTests {
    @Test func `trava ao abrir e depois da carencia`() {
        var t = TravaApp(ligada: true)
        #expect(t.bloqueada)
        t.desbloqueou()
        t.foiProFundo(agora: 0)
        t.voltou(agora: 30_000, ligada: true)
        #expect(!t.bloqueada)
        t.foiProFundo(agora: 100_000)
        t.voltou(agora: 100_000 + CARENCIA_BIOMETRIA_MS, ligada: true)
        #expect(t.bloqueada)
        t.mudouOpcao(ligada: false)
        #expect(!t.bloqueada)
        let a = ArmazemMemoria()
        gravarBiometria(a, true)
        #expect(biometriaLigada(a))
        gravarBiometria(a, false)
        #expect(!biometriaLigada(a))
    }
}

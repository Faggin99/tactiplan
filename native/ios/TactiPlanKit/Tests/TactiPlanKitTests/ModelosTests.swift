import Foundation
import Testing
@testable import TactiPlanKit

@Suite struct ModelosTests {
    @Test func `decodifica o me real e ignora campo novo`() throws {
        let m = try decodificarMe(ME_REAL)
        #expect(m.usuario.nome == "Teste App T0")
        #expect(m.usuario.temSenha == true)
        let w = try #require(m.workspaces.first)
        #expect(w.papelRotulo == "Treinador auxiliar")
        #expect(w.somenteLeitura == false)
        #expect(w.permissoes?.contains("training:edit") == true)
        let c = try #require(w.clubes?.first)
        #expect(c.modalidade == "football_11")
        #expect(c.personalizacao?.corPrimaria?.claro == "#15803d")
        #expect(c.categorias?.map(\.nome) == ["Sub-17"])
    }

    @Test func `me sem listas vira listas vazias`() throws {
        let m = try decodificarMe(#"{"usuario":{"id":"u"}}"#)
        #expect(m.workspaces.isEmpty)
        #expect(m.convites.isEmpty)
    }

    @Test func `resposta de login e config com snake_case`() throws {
        let r = try JSONDecoder().decode(RespostaLogin.self, from: Data(#"{"token":"tpa_x","expira_em":"2027-04-19T02:57:22.232Z","me":{"usuario":{"id":"u"}}}"#.utf8))
        #expect(r.token == "tpa_x")
        #expect(r.expiraEm == "2027-04-19T02:57:22.232Z")
        let c = try JSONDecoder().decode(ConfigApp.self, from: Data(#"{"google":{"ativo":true,"ios_client_id":"i","android_server_client_id":"w"},"apple":{"ativo":false},"versao_minima":{"ios":"1.0.1","android":null},"esqueci_senha_url":"https://e"}"#.utf8))
        #expect(c.google?.iosClientId == "i")
        #expect(c.versaoMinima?.ios == "1.0.1")
        #expect(c.esqueciSenhaUrl == "https://e")
    }

    @Test func `sessao ida e volta pelo cofre`() throws {
        let cofre = CofreSessaoArmazem(armazem: ArmazemMemoria())
        #expect(cofre.ler() == nil)
        let s = Sessao(token: "tpa_1", me: try decodificarMe(ME_REAL), escolha: Escolha(workspaceId: "w", clubeId: "c"), meEm: 5)
        cofre.salvar(s)
        #expect(cofre.ler() == s)
        cofre.guardarUltimaEscolha("u", Escolha(workspaceId: "w", clubeId: nil))
        cofre.limpar()
        #expect(cofre.ler() == nil)
        #expect(cofre.lerUltimaEscolha("u") == Escolha(workspaceId: "w", clubeId: nil))
    }

    @Test func `blob ilegivel no cofre le como nil`() {
        let a = ArmazemMemoria()
        a.gravar(CofreSessaoArmazem.CHAVE, "{lixo")
        #expect(CofreSessaoArmazem(armazem: a).ler() == nil)
    }

    @Test func `montarCofre recupera ou cai na memoria`() {
        struct Falha: Error {}
        var tentativas = 0
        var apagou = false
        let c = montarCofre(abrirArmazem: { tentativas += 1; if tentativas == 1 { throw Falha() }; return ArmazemMemoria() },
                            apagarCofre: { apagou = true })
        #expect(c is CofreSessaoArmazem)
        #expect(apagou)
        let m = montarCofre(abrirArmazem: { throw Falha() }, apagarCofre: {})
        #expect(m is CofreSessaoMemoria)
    }

    @Test func `reinstalado comeca sem sessao uma vez so`() throws {
        let marcador = ArmazemMemoria()
        let cofre = CofreSessaoMemoria()
        cofre.salvar(Sessao(token: "t", me: try decodificarMe(ME_REAL)))
        limparSeReinstalado(marcador: marcador, cofre: cofre)
        #expect(cofre.ler() == nil)
        cofre.salvar(Sessao(token: "t2", me: try decodificarMe(ME_REAL)))
        limparSeReinstalado(marcador: marcador, cofre: cofre)
        #expect(cofre.ler()?.token == "t2")
    }

    @Test func `erros da api`() {
        #expect(semRede(ErroApi.offline()))
        #expect(semRede(erro(502, nil)))
        #expect(!semRede(erro(401, nil)))
        #expect(sessaoEncerrada(erro(401, "SESSAO_INVALIDA")))
        #expect(mensagemDeErro(erro(402, "READ_ONLY", "assine o plano")) == TEXTO_NAO_EDITA)
        #expect(mensagemDeErro(erro(409, "CLUB_ARCHIVED", "Clube arquivado")) == TEXTO_CLUBE_ARQUIVADO)
        #expect(mensagemDeErro(erro(403, "X", "Sem acesso")) == "Sem acesso")
    }
}

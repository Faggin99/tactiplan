import Testing
@testable import TactiPlanKit

@Suite struct FormatosTests {
    @Test func `modalidade iniciais e primeiro nome`() {
        #expect(rotuloModalidade("football_11") == "Futebol 11")
        #expect(rotuloModalidade("futsal") == "Futsal")
        #expect(rotuloModalidade("x") == "")
        #expect(iniciais("Marcos Andrade") == "MA")
        #expect(iniciais("  ana ") == "A")
        #expect(iniciais("Ana Maria de Souza") == "AS")
        #expect(iniciais(nil) == "?")
        #expect(primeiroNome("Marcos Andrade") == "Marcos")
        #expect(primeiroNome("") == nil)
    }

    @Test func `lista curta e contagem`() {
        #expect(listaCurta(["Sub-15", "Sub-17"]) == "Sub-15, Sub-17")
        #expect(listaCurta(["A", "B", "C", "D", "E"], maximo: 3) == "A, B, C +2")
        #expect(listaCurta([]) == "")
        #expect(contagem(1, "convite", "convites") == "1 convite")
        #expect(contagem(2, "convite", "convites") == "2 convites")
    }

    @Test func `versao do app e comparacao`() {
        #expect(rotuloVersao("1.0.0", "7") == "TactiPlan · versão 1.0.0 (7)")
        #expect(rotuloVersao("1.0.0", "1.0.0") == "TactiPlan · versão 1.0.0")
        #expect(rotuloVersao(nil, nil) == "TactiPlan")
        #expect(compararVersoes("1.2.10", "1.10") == -1)
        #expect(compararVersoes("1.0", "1.0.0") == 0)
        #expect(compararVersoes("2.0", "1.9.9") == 1)
        #expect(precisaAtualizar(instalada: "1.0.0", minima: "1.0.1"))
        #expect(!precisaAtualizar(instalada: "1.0.1", minima: "1.0.1"))
        #expect(!precisaAtualizar(instalada: "1.0.0", minima: nil))
    }

    @Test func `tempo desde e faixa sem conexao`() {
        let agora: Int64 = 10_000_000_000
        #expect(tempoDesde(agora - 30_000, agora: agora) == "agora há pouco")
        #expect(tempoDesde(agora - 5 * 60_000, agora: agora) == "há 5 min")
        #expect(tempoDesde(agora - 3 * 3_600_000, agora: agora) == "há 3 h")
        #expect(tempoDesde(agora - 2 * 86_400_000, agora: agora) == "há 2 dias")
        #expect(textoSemConexao(agora - 5 * 60_000, agora: agora).hasSuffix("atualizado há 5 min"))
        #expect(textoSemConexao(nil).hasPrefix("Sem conexão"))
    }

    @Test func `data por extenso no fuso de Brasilia`() {
        // 2026-10-21 02:00 UTC = 20/10 23:00 em Brasília (terça)
        #expect(dataPorExtenso(1_792_548_000_000) == "terça, 20 de outubro")
    }

    @Test func `email plausivel`() {
        #expect(emailPlausivel("a@b.com"))
        #expect(emailPlausivel(" treinador@exemplo.com.br "))
        #expect(!emailPlausivel("a@b"))
        #expect(!emailPlausivel("ab.com"))
        #expect(!emailPlausivel("a@@b.com"))
        #expect(!emailPlausivel("a b@c.com"))
    }

    @Test func `nenhum texto fixo fala de compra`() {
        for t in [TEXTO_SO_LEITURA, TEXTO_NAO_EDITA, TEXTO_CLUBE_ARQUIVADO, TEXTO_SEM_EQUIPE, TEXTO_EM_BREVE,
                  TEXTO_TROCAR_DEPOIS, DICA_CONVITE_ENTRAR, TEXTO_CORES_CLUBE, TEXTO_TEMA] {
            #expect(textoNeutro(t), "\(t)")
        }
        #expect(!textoNeutro("Assine o plano Clube"))
        #expect(!textoNeutro("Veja no site"))
    }

    @Test func `google oauth do iPhone`() {
        let id = "415077581451-abc.apps.googleusercontent.com"
        #expect(esquemaRetornoGoogle(id) == "com.googleusercontent.apps.415077581451-abc")
        #expect(redirectGoogle(id) == "com.googleusercontent.apps.415077581451-abc:/oauth2redirect")
        #expect(codigoDoRetornoGoogle("x:/oauth2redirect?state=e1&code=c9", estado: "e1") == "c9")
        #expect(codigoDoRetornoGoogle("x:/oauth2redirect?state=outro&code=c9", estado: "e1") == nil)
        #expect(urlAutorizacaoGoogle(clientId: id, desafio: "d", estado: "e").contains("code_challenge_method=S256"))
    }

    @Test func `codifica componente de url`() {
        #expect(codificarComponente("ab cd/é") == "ab%20cd%2F%C3%A9")
        #expect(codificarComponente("0797d455") == "0797d455")
    }
}

import Testing
@testable import TactiPlanKit

@Suite struct CoresTests {
    @Test func `contraste nos extremos`() {
        #expect(contraste("#000000", "#FFFFFF").rounded() == 21)
        #expect(contraste("#DC2626", "#dc2626") == 1)
        #expect(contraste("azul", "#FFFFFF") == 1)
    }

    @Test func `texto sobre a cor do clube passa AA`() {
        #expect(textoSobre("#2563EB") == BRANCO)
        #expect(textoSobre("#FACC15") == NAVY) // amarelo pede texto escuro
        #expect(textoSobre(LIME) == NAVY)
        for cor in ["#2563EB", "#FACC15", "#15803D", "#DC2626", "#FFFFFF", "#000000", "#21A652"] {
            #expect(contraste(cor, textoSobre(cor)) >= AA, "\(cor)")
        }
    }

    @Test func `tinta legivel no claro e no escuro`() {
        for cor in ["#FACC15", "#C8FF00", "#FFFFFF", "#21A652", "#0F172A"] {
            #expect(contraste(tintaLegivelNoClaro(cor), "#FFFFFF") >= AA, "\(cor)")
            #expect(contraste(tintaLegivelNoEscuro(cor), SUPERFICIE_ESCURA) >= AA, "\(cor)")
        }
        #expect(tintaLegivelNoClaro("#DC2626") == "#DC2626") // já passa: não mexe
        #expect(tintaLegivelNoClaro(nil) == ACAO_PADRAO)
        #expect(normalizarHex(" 15803d ") == "#15803D")
    }

    @Test func `paleta sem clube e a azul do TactiPlan`() {
        let c = coresDoClube(nil, escuro: false)
        #expect(c.acao.hex == ACAO_PADRAO)
        #expect(c.sobreAcao.hex == BRANCO)
        #expect(c.heroi.hex == NAVY)
        #expect(c.fundo.hex == "#F2F4F7")
        let e = coresDoClube(nil, escuro: true)
        #expect(e.escuro)
        #expect(contraste(e.acaoTinta.hex, e.superficie.hex) >= AA)
    }

    @Test func `cor do clube entra no lugar do azul com trava de contraste`() {
        let amarelo = Personalizacao(corPrimaria: CorPrimaria(claro: "#facc15", escuro: nil))
        let c = coresDoClube(amarelo, escuro: false)
        #expect(c.acao.hex == "#FACC15")
        #expect(c.sobreAcao.hex == NAVY)
        #expect(contraste(c.acaoTinta.hex, c.superficie.hex) >= AA)
        // sem cor do escuro: vale a do claro, clareada até ler na superfície escura
        let e = coresDoClube(amarelo, escuro: true)
        #expect(contraste(e.acao.hex, e.superficie.hex) >= AA)
        #expect(contraste(e.acao.hex, e.sobreAcao.hex) >= AA)
    }

    @Test func `clube branco nao some no botao`() {
        let c = coresDoClube(Personalizacao(corPrimaria: CorPrimaria(claro: "#FFFFFF")), escuro: false)
        #expect(contraste(c.acao.hex, c.superficie.hex) >= AA)
        #expect(contraste(c.acao.hex, c.sobreAcao.hex) >= AA)
    }

    @Test func `textos da paleta clara e escura passam AA no fundo`() {
        for escuro in [false, true] {
            let c = coresDoClube(nil, escuro: escuro)
            #expect(contraste(c.tinta.hex, c.fundo.hex) >= AA)
            #expect(contraste(c.tinta2.hex, c.fundo.hex) >= AA)
            #expect(contraste(c.tinta2.hex, c.superficie.hex) >= AA)
            #expect(contraste(c.avisoTinta.hex, c.avisoFundo.hex) >= AA)
            #expect(contraste(c.erroTinta.hex, c.erroFundo.hex) >= AA)
            #expect(contraste(c.neutroTinta.hex, c.neutroFundo.hex) >= AA)
            #expect(contraste(c.sobreHeroi.hex, c.heroi.hex) >= AA)
        }
    }

    @Test func `logo escura so no escuro`() {
        let p = Personalizacao(logoUrl: "https://x/l.png", logoEscuraUrl: "https://x/e.png")
        #expect(logoDoClube(p, escuro: false) == "https://x/l.png")
        #expect(logoDoClube(p, escuro: true) == "https://x/e.png")
        #expect(logoDoClube(Personalizacao(logoUrl: "https://x/l.png"), escuro: true) == "https://x/l.png")
        #expect(logoDoClube(nil, escuro: false) == nil)
    }
}

package com.faggin.tactiplan.app.dados

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Paridade: TactiPlanKitTests (contraste e personalização do clube).
class CoresTest {
    @Test fun `contraste WCAG nos extremos e cor invalida`() {
        assertEquals(21.0, contraste("#000000", "#FFFFFF"), 0.01)
        assertEquals(1.0, contraste("#DC2626", "#DC2626"), 0.001)
        assertEquals(1.0, contraste("azul", "#FFFFFF"), 0.001)
        assertEquals(1.0, contraste(null, "#FFFFFF"), 0.001)
    }

    @Test fun `normaliza hex sem cerquilha, minusculo e com espacos`() {
        assertEquals("#15803D", normalizarHex("  15803d "))
        assertNull(normalizarHex("#12345"))
        assertNull(normalizarHex("#GGGGGG"))
    }

    @Test fun `texto sobre a cor do clube - amarelo pede navy, azul pede branco`() {
        assertEquals(NAVY, textoSobre("#FACC15"))
        assertEquals(NAVY, textoSobre(LIME))
        assertEquals(BRANCO, textoSobre(ACAO_PADRAO))
        assertEquals(BRANCO, textoSobre("lixo"))
    }

    @Test fun `tinta legivel passa AA no claro e no escuro`() {
        for (cor in listOf("#FACC15", LIME, "#FFFFFF", "#15803D", "#2563EB", "#000000")) {
            assertTrue(cor, contraste(tintaLegivelNoClaro(cor), BRANCO) >= AA)
            assertTrue(cor, contraste(tintaLegivelNoEscuro(cor), SUPERFICIE_ESCURA) >= AA)
        }
        assertEquals("#DC2626", tintaLegivelNoClaro("#DC2626"))
        assertEquals(ACAO_PADRAO, tintaLegivelNoClaro(null))
    }

    @Test fun `sem cor do clube vale o azul do TactiPlan`() {
        val c = coresDoClube(null, false)
        assertEquals(ACAO_PADRAO, c.acao.hex)
        assertEquals(BRANCO, c.sobreAcao.hex)
        assertTrue(contraste(c.acaoTinta.hex, c.superficie.hex) >= AA)
    }

    @Test fun `cor do clube substitui a acao com trava de contraste`() {
        val p = Personalizacao(CorPrimaria("#facc15", null))
        val claro = coresDoClube(p, false)
        assertEquals("#FACC15", claro.acao.hex)
        assertEquals(NAVY, claro.sobreAcao.hex)
        assertTrue(contraste(claro.acaoTinta.hex, BRANCO) >= AA)
        // escuro sem cor própria: usa a do claro, clareada até ler sobre a superfície escura
        assertEquals("#FACC15", corDoClube(p, true))
        val escuro = coresDoClube(p, true)
        assertTrue(contraste(escuro.acaoTinta.hex, SUPERFICIE_ESCURA) >= AA)
        assertTrue(contraste(escuro.sobreAcao.hex, escuro.acao.hex) >= AA)
    }

    @Test fun `clube branco nao some no botao`() {
        val c = coresDoClube(Personalizacao(CorPrimaria("#FFFFFF")), false)
        assertTrue(contraste(c.acao.hex, c.superficie.hex) >= AA)
        assertTrue(contraste(c.sobreAcao.hex, c.acao.hex) >= AA)
    }

    @Test fun `texto secundario passa AA no fundo, nos dois modos`() {
        for (escuro in listOf(false, true)) {
            val c = coresDoClube(null, escuro)
            assertTrue(contraste(c.tinta2.hex, c.fundo.hex) >= AA)
            assertTrue(contraste(c.tinta.hex, c.superficie.hex) >= AA)
        }
    }

    @Test fun `logo escura so no escuro e cai na normal`() {
        val p = Personalizacao(logoUrl = "https://x/a.png", logoEscuraUrl = "https://x/b.png")
        assertEquals("https://x/b.png", logoDoClube(p, true))
        assertEquals("https://x/a.png", logoDoClube(p, false))
        assertEquals("https://x/a.png", logoDoClube(Personalizacao(logoUrl = "https://x/a.png"), true))
        assertNull(logoDoClube(null, false))
    }

    @Test fun `cor vira ARGB com alfa`() {
        assertEquals(0xFF2563EBL, Cor.de(ACAO_PADRAO).argb)
        assertEquals(0x1F2563EBL, Cor.de(ACAO_PADRAO, 0.12).argb)
        assertEquals(ACAO_PADRAO, Cor.de("lixo").hex)
    }

    @Test fun `pilares com as cores do web`() {
        assertEquals("#3B82F6", Tokens.pilares["tatico"])
        assertEquals("#F59E0B", Tokens.pilares["fisico"])
    }
}

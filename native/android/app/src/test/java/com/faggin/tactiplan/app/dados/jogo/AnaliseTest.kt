package com.faggin.tactiplan.app.dados.jogo

import com.faggin.tactiplan.app.dados.JsonApp
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

// Análise do adversário no app. Paridade com o servidor: native/paridade/analise.json (gerado de
// backend-node/src/services/analiseAdversario.js e src/reports/formacaoLivre.js por gerar-analise.js).
class AnaliseTest {
    private val par = JsonApp.parseToJsonElement(arquivoDoRepo("native/paridade/analise.json").readText()).jsonObject

    @Test fun `todo campo do esquema aponta para uma chave do formato do servidor`() {
        val vazio = par["vazio"]!!
        val exemplo = par["exemplo"]!!
        for (c in caminhosDoEsquema()) {
            // itens de listas (Repetir): o exemplo normalizado tem TODAS as chaves de cada item;
            // fontes: chave livre por seção (o objeto "fontes" existe); o resto existe no formato vazio
            val existe = when {
                "0" in c -> lerEm(exemplo, c) != null
                c.first() == "fontes" -> lerEm(vazio, listOf("fontes")) is JsonObject && c.size == 2
                else -> lerEm(vazio, c) != null
            }
            assertTrue("caminho do esquema sem chave no servidor: $c", existe)
        }
        assertEquals(13, SECOES_ANALISE.size)
        // as seções preenchidas do exemplo são marcadas como preenchidas
        val preenchidas = (par["secoesExemplo"] as JsonArray).map { it.jsonPrimitive.content }
        for (k in preenchidas) assertTrue(k, secaoPreenchida(exemplo, k))
        assertFalse(secaoPreenchida(vazio, "sistema"))
        // mesma ordem do relatório; ataque/defesa com os nomes novos (28/10)
        assertEquals((par["ordem"] as JsonArray).map { it.jsonPrimitive.content }, SECOES_ANALISE.map { it.chave })
        val titulos = par["titulos"]!!.jsonObject
        for (k in listOf("sistema", "individuais", "ataque", "defesa")) {
            assertEquals(k, titulos[k]!!.jsonPrimitive.content, SECOES_ANALISE.first { it.chave == k }.titulo)
        }
    }

    @Test fun `escudo e videos - o que o servidor recusaria`() {
        assertEquals(null, problemaMidiaAnalise("escudo", "image/png", 2_000))
        assertTrue(problemaMidiaAnalise("escudo", "video/mp4", 2_000)!!.contains("imagem"))
        assertTrue(problemaMidiaAnalise("escudo", "image/png", MAX_BYTES_ESCUDO + 1)!!.contains("3 MB"))
        assertEquals(null, problemaMidiaAnalise("video", "video/quicktime", 10_000_000))
        assertTrue(problemaMidiaAnalise("video", "video/mp4", MAX_BYTES_VIDEO_ANALISE + 1)!!.contains("50 MB"))
        assertTrue(problemaMidiaAnalise("video", "video/mp4", 1, videosNaAnalise = 12)!!.contains("Limite"))
        assertEquals("saida-curta", tituloDoVideo("saida-curta.mp4"))
        assertTrue(problemaMidiaAnalise("video", "video/mp4", MAX_BYTES_VIDEO_ANALISE + 1)!!.contains("link"))
        assertEquals(null, problemaLinkVideo(" https://youtu.be/abc "))
        assertEquals(null, problemaLinkVideo("https://drive.google.com/file/d/1/view"))
        assertTrue(problemaLinkVideo("youtu.be/abc")!!.contains("inválido"))
        assertTrue(problemaLinkVideo("javascript:alert(1)")!!.contains("inválido"))
        assertTrue(problemaLinkVideo("https://youtu.be/x", linksNaAnalise = 20)!!.contains("Limite"))
        val m = JsonApp.decodeFromString(MidiaAnalise.serializer(),
            """{"id":"m1","tipo":"video","secao":"ataque","titulo":"Saída","url":"/uploads/analise/x.mp4","size_bytes":"2003"}""")
        assertEquals("ataque", m.secao)
    }

    @Test fun `vagas da formacao livre iguais as do servidor`() {
        val vagas = par["vagas"]!!.jsonObject
        for ((f, lista) in vagas) {
            val app = vagasLivres(f)
            val srv = (lista as JsonArray).map { it.jsonObject }
            assertEquals(f, srv.size, app.size)
            srv.forEachIndexed { i, o ->
                assertEquals(f, o["vaga"]!!.jsonPrimitive.int, app[i].vaga)
                assertEquals(f, o["papel"]!!.jsonPrimitive.content, app[i].papel)
                assertEquals(f, o["x"]!!.jsonPrimitive.double, app[i].x, 0.0001)
                assertEquals(f, o["y"]!!.jsonPrimitive.double, app[i].y, 0.0001)
            }
        }
    }

    @Test fun `ler e gravar por caminho, listas e escalacao`() {
        var d: kotlinx.serialization.json.JsonElement = JsonObject(emptyMap())
        d = gravarEm(d, listOf("sistema", "ofensivo", "formacao"), JsonPrimitive("4-3-3"))
        assertEquals("4-3-3", textoEm(d, listOf("sistema", "ofensivo", "formacao")))
        d = gravarEm(d, listOf("sistema", "defensivo", "itens"), textoComoLista("a\n\nb"))
        assertEquals("a\n\nb", listaComoTexto(d, listOf("sistema", "defensivo", "itens")))
        d = gravarEm(d, listOf("variacoes"), JsonArray(listOf(JsonObject(emptyMap()))))
        d = gravarEm(d, listOf("variacoes", "0", "formacao"), JsonPrimitive("2-3-5"))
        assertEquals("2-3-5", textoEm(d, listOf("variacoes", "0", "formacao")))
        d = mudarJogadorDaVaga(d, 3, "nome", JsonPrimitive("Léo Ortiz"))
        d = mudarJogadorDaVaga(d, 0, "numero", JsonPrimitive(1))
        d = mudarJogadorDaVaga(d, 3, "numero", JsonPrimitive(3))
        val js = lerEm(d, listOf("escalacao", "jogadores")) as JsonArray
        assertEquals(listOf(0, 3), js.map { it.jsonObject["vaga"]!!.jsonPrimitive.int })
        assertEquals("Léo Ortiz", jogadorDaVaga(d, 3)!!["nome"]!!.jsonPrimitive.content)
        assertEquals(JsonPrimitive(3), jogadorDaVaga(d, 3)!!["numero"])
        assertNotNull(jogadorDaVaga(d, 0)); assertEquals(JsonNull, gravarEm(null, emptyList(), JsonNull))
        assertTrue(secaoPreenchida(d, "sistema")); assertTrue(secaoPreenchida(d, "escalacao")); assertFalse(secaoPreenchida(d, "final"))
        assertEquals("Analise_Rival_FC_24-10-2026.pdf", nomePdfAnalise("Rival FC", "2026-10-24"))
        assertEquals("Analise_Rival_FC_24-10-2026.pptx", nomePdfAnalise("Rival FC", "2026-10-24", "pptx"))
    }
}

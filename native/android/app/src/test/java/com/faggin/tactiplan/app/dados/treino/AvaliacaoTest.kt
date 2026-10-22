package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.jogo.arquivoDoRepo
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

// Período de AVALIAÇÃO (session_type "assessment"). Paridade com o web: native/paridade/avaliacao.json
// (gerado de frontend/src/lib/periodos.js por native/paridade/gerar-avaliacao.mjs). iOS: AvaliacaoTests.swift.

private fun av(): JsonObject = JsonApp.parseToJsonElement(arquivoDoRepo("native/paridade/avaliacao.json").readText()) as JsonObject
private fun JsonElement?.o() = this as JsonObject
private fun JsonElement?.l() = (this as? JsonArray) ?: JsonArray(emptyList())
private fun JsonElement?.s(): String? = (this as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull
private fun JsonElement?.strs(): List<String> = l().map { it.s()!! }
private fun diaDe(j: JsonElement): Dia = JsonApp.decodeFromJsonElement(Dia.serializer(), j).normalizado()

private val JSON_MICRO_AVALIACAO = """
{"id":"m","week_identifier":"2026-43","start_date":"2026-10-19","end_date":"2026-10-25","sessions":[
 {"id":"s1","date":"2026-10-19","day_name":"Segunda","day_of_week":1,"session_type":"assessment","periodo":"manha",
  "assessment_types":["fisica","tecnica"],"assessment_other":null,
  "blocks":[{"id":"b0","name":"Aquecimento","order":1,"activity":{"id":"a0","duration_minutes":40,
   "contents":[{"name":"Resistência","dimension":"fisico"}]}}],
  "periodos":[
   {"id":"s1","date":"2026-10-19","day_of_week":1,"session_type":"assessment","periodo":"manha",
    "assessment_types":["fisica","tecnica"],
    "blocks":[{"id":"b0","name":"Aquecimento","order":1,"activity":{"id":"a0","duration_minutes":40,
     "contents":[{"name":"Resistência","dimension":"fisico"}]}}]},
   {"id":"s2","date":"2026-10-19","day_of_week":1,"session_type":"training","periodo":"tarde","avg_distance_km":6,
    "blocks":[{"id":"b1","name":"Aquecimento","order":1,"activity":{"id":"a1","duration_minutes":125,
     "contents":[{"name":"Organização Ofensiva","dimension":"tatico"}]}}]}
  ]},
 {"id":"s3","date":"2026-10-20","day_name":"Terça","day_of_week":2,"session_type":"assessment","periodo":null,
  "assessment_types":["outra"],"assessment_other":"Yo-Yo","blocks":[]},
 {"id":"s4","date":"2026-10-21","day_name":"Quarta","day_of_week":3,"session_type":"training","periodo":null,"blocks":[]}
]}
"""

class AvaliacaoTest {
    private val d = av()
    private fun micro() = JsonApp.decodeFromString(Microciclo.serializer(), JSON_MICRO_AVALIACAO).normalizado()

    @Test fun `lista fixa igual ao web`() {
        assertEquals(TipoAvaliacao.entries.map { it.bruto }, d["tipos"].l().map { it.o()["tipo"].s() })
        assertEquals(TipoAvaliacao.entries.map { it.rotulo }, d["tipos"].l().map { it.o()["rotulo"].s() })
        assertEquals(MAX_OUTRA_AVALIACAO, (d["maxOutra"] as JsonPrimitive).doubleOrNull!!.toInt())
    }

    @Test fun `normalizarAvaliacao igual ao web`() {
        val casos = d["normalizar"].l()
        assertTrue(casos.size >= 6)
        casos.forEach { c ->
            val e = c.o()["entrada"].o()
            val tipos = (e["tipos"] as? JsonArray)?.let { it.strs() }
            val r = normalizarAvaliacao(tipos, e["outra"].s())
            val s = c.o()["saida"].o()
            assertEquals("$e", (s["ok"] as JsonPrimitive).booleanOrNull, r.ok)
            if (r.ok) {
                assertEquals(s["tipos"].strs(), r.tipos)
                assertEquals(s["outra"].s(), r.outra)
            } else assertEquals(s["erro"].s(), r.erro)
        }
    }

    @Test fun `rotulos, linha, divisao e minutos iguais ao web`() {
        d["rotulos"].l().forEach { c ->
            val dia = diaDe(c.o()["sessao"]!!)
            assertEquals(c.o()["rotulos"].strs(), rotulosAvaliacao(dia))
            assertEquals(c.o()["texto"].s(), textoAvaliacao(dia))
        }
        d["linha"].l().forEach { c ->
            assertEquals(c.o()["texto"].s(), rotuloLinhaPeriodo(diaDe(c.o()["sessao"]!!), c.o()["pilares"].strs()))
        }
        d["divisao"].l().forEach { c ->
            val ps = c.o()["periodos"].l()
            val dia = diaDe(JsonObject(ps[0].o() + ("periodos" to ps)))
            assertEquals(c.o()["divisao"].s(), divisaoMinutos(dia))
        }
        d["minutos"].l().forEach { c ->
            assertEquals((c.o()["minutos"] as JsonPrimitive).doubleOrNull!!.toInt(), minutosDoPeriodo(diaDe(c.o()["sessao"]!!)))
        }
    }

    @Test fun `semana com manha de avaliacao e tarde de treino`() {
        val m = micro()
        val seg = m.dias[0]
        assertEquals(TipoDia.AVALIACAO, seg.tipo)
        assertEquals(listOf("fisica", "tecnica"), seg.tiposAvaliacao)
        assertEquals("Manhã · Avaliação + Tarde · Tático", tituloDaLinhaDoDia(seg))
        val r = resumoDoDiaInteiro(seg)
        assertEquals(TipoDia.TREINO, r.tipo)
        assertEquals(125, r.minutos)
        assertEquals("Física, Técnica", r.avaliacao)
        assertNull("nunca 125+0", divisaoMinutos(seg))
        assertEquals("125 min · 6 km · Avaliação: Física, Técnica", detalheDaLinha(r))
        val ter = m.dias[1]
        assertEquals("Manhã · Avaliação", tituloDaLinhaDoDia(ter))
        val rt = resumoDoDiaInteiro(ter)
        assertEquals(TipoDia.AVALIACAO, rt.tipo)
        assertEquals(0, rt.minutos)
        assertEquals("Yo-Yo", detalheDaLinha(rt))
        assertEquals("Dia de avaliação", fraseDoHeroi(rt))
        assertEquals(listOf(Periodo.TARDE, Periodo.NOITE), periodosParaTrocar(ter, ter))
    }

    @Test fun `servico manda os tipos ao trocar e ao adicionar periodo`() = runBlocking {
        val m = micro()
        val api = ApiTreinoFalsa()
        val s = ServicoTreino(api)
        val semana = SemanaISO.de("2026-10-19")
        val esc = normalizarAvaliacao(listOf("tecnica", "fisica"), null)
        s.mudarTipo(m.dias[2], TipoDia.AVALIACAO, null, semana, "c", esc)
        s.adicionarPeriodo(m.dias[2], Periodo.TARDE, Periodo.MANHA, semana, "c", esc)
        try { s.mudarTipo(m.dias[2], TipoDia.AVALIACAO, null, semana, "c", normalizarAvaliacao(listOf("outra"), null)); fail() } catch (_: ErroApi) {}
        assertTrue(api.chamadas.toString(), "tipo:s4:assessment::fisica,tecnica" in api.chamadas)
        assertTrue(api.chamadas.toString(), "periodo+:s4:tarde:manha:av=fisica,tecnica" in api.chamadas)
    }
}

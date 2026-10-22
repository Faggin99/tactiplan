package com.faggin.tactiplan.app.dados.jogo

import com.faggin.tactiplan.app.dados.JsonApp
import java.io.File
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

// PARIDADE com o web: native/paridade/jogo.json é gerado pelo código do web
// (node native/paridade/gerar-jogo.js; o npm test do backend falha se ficar desatualizado).
// O iPhone lê o mesmo arquivo (ParidadeJogoTests.swift).

/** Sobe a partir do diretório do teste (app/) até achar o arquivo do repositório. */
fun arquivoDoRepo(caminho: String): File {
    var d: File? = File("").absoluteFile
    while (d != null) {
        val f = File(d, caminho)
        if (f.exists()) return f
        d = d.parentFile
    }
    error("não achei $caminho")
}

fun paridade(): JsonObject = JsonApp.parseToJsonElement(arquivoDoRepo("native/paridade/jogo.json").readText()) as JsonObject

private fun lista(j: JsonElement?): List<JsonElement> = (j as? JsonArray) ?: emptyList()
private fun obj(j: JsonElement?): JsonObject? = j as? JsonObject
private fun txt(j: JsonElement?): String? = (j as? JsonPrimitive)?.takeIf { it !is JsonNull && it.isString }?.contentOrNull
private fun int(j: JsonElement?): Int? = (j as? JsonPrimitive)?.takeIf { it !is JsonNull }?.doubleOrNull?.toInt()
private fun num(j: JsonElement?): Double = (j as JsonPrimitive).doubleOrNull!!
private fun bool(j: JsonElement?): Boolean? = (j as? JsonPrimitive)?.takeIf { it !is JsonNull }?.booleanOrNull
private operator fun JsonElement?.get(k: String): JsonElement? = (this as? JsonObject)?.get(k)

internal fun jogadoresDe(j: JsonElement?): List<JogadorJogo> = lista(j).map { p ->
    val id = txt(p["athlete_id"]) ?: ""
    JogadorJogo.de(id, txt(p["status"]) ?: STATUS_TITULAR, int(p["slot"]), int(p["minutes_played"]) ?: 0,
        bool(p["minutes_manual"]) ?: false, null, AtletaResumo(id, txt(p["name"]) ?: "", posicao = txt(p["posicao"])), txt(p["name"]))
}

internal fun eventosDe(j: JsonElement?): List<EventoJogo> = lista(j).map { e ->
    EventoJogo(id = txt(e["id"]) ?: "?", tipo = txt(e["event_type"]) ?: "", time = txt(e["team"]), minuto = int(e["minute"]),
        jogadorId = txt(e["player_id"]), jogador2Id = txt(e["secondary_player_id"]))
}

class ParidadeJogoTest {
    private val p = paridade()

    @Test fun `formacoes iguais ao shared formacoes json`() {
        val web = JsonApp.parseToJsonElement(arquivoDoRepo("shared/formacoes.json").readText()) as JsonObject
        assertEquals(web.keys, FORMACOES.keys)
        for ((m, cfg) in FORMACOES) {
            assertEquals(txt(web[m]["padrao"]), cfg.padrao)
            assertEquals(lista(web[m]["opcoes"]).map { txt(it) }, cfg.opcoes)
        }
    }

    @Test fun `vagas e posicao em campo de todas as formacoes`() {
        for (caso in lista(p["vagas"])) {
            val f = txt(caso["formacao"])!!
            val m = txt(caso["modalidade"])!!
            val vs = vagasDa(f)
            assertEquals(int(caso["total"]), totalVagas(f))
            val esp = lista(caso["vagas"])
            assertEquals(f, esp.size, vs.size)
            for ((v, e) in vs.zip(esp)) {
                assertEquals(int(e["indice"]), v.indice)
                assertEquals(txt(e["papel"]), v.papel)
                assertEquals(int(e["linha"]), v.linha)
                assertEquals("$f x", num(e["x"]), v.x, 1e-9)
                assertEquals("$f y", num(e["y"]), v.y, 1e-9)
                assertEquals("$f espaco", num(e["espaco"]), v.espaco, 1e-9)
            }
            assertEquals("$m $f", lista(caso["posicoes"]).map { txt(it) }, vs.map { posicaoEmCampo(f, it.indice, m) })
        }
        for (caso in lista(p["posicao_extra"])) {
            assertEquals(caso.toString(), txt(caso["posicao"]), posicaoEmCampo(txt(caso["formacao"]), int(caso["vaga"]), txt(caso["modalidade"])))
        }
        for (caso in lista(p["resolver"])) {
            assertEquals(txt(caso["resultado"]), resolverFormacao(txt(caso["modalidade"]), txt(caso["formacao"])))
        }
    }

    @Test fun `remapear formacao e encaixar sugestao`() {
        for (caso in lista(p["remapear"])) {
            val (js, desl) = remapearFormacao(jogadoresDe(caso["entrada"]), txt(caso["de"])!!, txt(caso["para"])!!)
            val esp = lista(caso["saida"])
            assertEquals(esp.map { txt(it["athlete_id"]) }, js.map { it.atletaId })
            assertEquals(caso.toString(), esp.map { int(it["slot"]) }, js.map { it.vaga })
            assertEquals(lista(caso["deslocados"]).map { txt(it) }, desl.map { it.atletaId })
        }
        for (caso in lista(p["sugerir"])) {
            val r = sugerirVagas(jogadoresDe(caso["entrada"]), txt(caso["formacao"])!!)
            assertEquals(caso.toString(), lista(caso["saida"]).map { int(it["slot"]) }, r.map { it.vaga })
        }
        for (caso in lista(p["nomes"])) {
            assertEquals(txt(caso["iniciais"]), iniciaisDoAtleta(txt(caso["nome"])))
            assertEquals(txt(caso["curto"]), nomeCurto(txt(caso["nome"])))
        }
    }

    @Test fun `minutagem em campo reservas e checagem do servidor`() {
        for (caso in lista(p["minutagem"])) {
            val nome = txt(caso["nome"])!!
            val ps = jogadoresDe(caso["players"])
            val es = eventosDe(caso["events"])
            val dur = int(caso["duration"])!!
            val r = calcularMinutagem(ps, es, dur)
            for ((id, e) in obj(caso["resultado"])!!) {
                val s = r[id]
                assertNotNull("$nome $id", s)
                s!!
                assertEquals("$nome $id minutes", int(e["minutes"]), s.minutos)
                assertEquals("$nome $id auto", int(e["auto"]), s.auto)
                assertEquals(bool(e["manual"]), s.manual)
                assertEquals(bool(e["started"]), s.titular)
                assertEquals("$nome $id entered", bool(e["entered"]), s.entrou)
                assertEquals("$nome $id enteredAt", int(e["enteredAt"]), s.entrouAos)
                assertEquals("$nome $id leftAt", int(e["leftAt"]), s.saiuAos)
                assertEquals("$nome $id sentOffAt", int(e["sentOffAt"]), s.expulsoAos)
                assertEquals("$nome $id played", bool(e["played"]), s.jogou)
            }
            for (ec in lista(caso["em_campo"])) {
                assertEquals("$nome em campo ${int(ec["minuto"])}", lista(ec["ids"]).map { txt(it) },
                    emCampo(ps, es, dur, int(ec["minuto"])!!).map { it.atletaId })
            }
            obj(caso["em_campo_ignorando"])?.let { ign ->
                assertEquals("$nome ignorando", lista(ign["ids"]).map { txt(it) },
                    emCampo(ps, es, dur, int(ign["minuto"])!!, txt(ign["ignorar"])).map { it.atletaId })
            }
            assertEquals("$nome reservas", lista(caso["reservas"]).map { txt(it) }, reservasDisponiveis(ps, es).map { it.atletaId })
            obj(caso["reservas_ignorando"])?.let { ign ->
                assertEquals(lista(ign["ids"]).map { txt(it) }, reservasDisponiveis(ps, es, txt(ign["ignorar"])).map { it.atletaId })
            }
            val chk = caso["checar"]
            assertEquals("$nome checar", if (bool(chk["ok"]) == true) null else txt(chk["error"]), checarSubstituicoes(ps, es))
        }
    }

    @Test fun `validar substituicao com as frases do web`() {
        val ps = jogadoresDe(p["validar_jogadores"])
        val es = eventosDe(p["validar_eventos"])
        for (caso in lista(p["validar"])) {
            assertEquals(caso.toString(), txt(caso["erro"]),
                validarSubstituicao(ps, es, 90, int(caso["minuto"]), txt(caso["entra"]), txt(caso["sai"]), txt(caso["ignorar"])))
        }
        for (caso in lista(p["checar"])) {
            assertEquals(caso.toString(), txt(caso["erro"]), checarSubstituicoes(ps, eventosDe(caso["events"])))
        }
    }

    @Test fun `tipo de gol e minuto do evento`() {
        for (caso in lista(p["tipo_gol"])) {
            val v = txt(caso["valor"])
            val l = lerTipoGol(v)
            assertEquals("$v", txt(caso["lido"]["moment"]), l.momento)
            assertEquals("$v", txt(caso["lido"]["bpSubtype"]), l.subtipoBP)
            assertEquals("$v", txt(caso["rotulo"]), rotuloTipoGol(v))
        }
        for (caso in lista(p["gravar_tipo_gol"])) {
            assertEquals(txt(caso["resultado"]), gravarTipoGol(txt(caso["momento"])!!, txt(caso["subtipo"]), txt(caso["evento"])!!))
        }
        var n = 0
        for (caso in lista(p["minutos"])) {
            val dur = int(caso["duracao"])!!
            val total = int(caso["total"])!!
            val m = lerMinuto(total, dur)
            assertEquals("$dur $total", int(caso["lido"]["half"]), m.tempo)
            assertEquals("$dur $total", int(caso["lido"]["minuteInHalf"]), m.minutoNoTempo)
            assertEquals("$dur $total", int(caso["lido"]["stoppageTime"]), m.acrescimo)
            assertEquals("$dur $total", int(caso["de_volta"]), minutoTotal(m, dur))
            assertEquals("$dur $total", txt(caso["texto"]), textoMinuto(m, dur))
            n++
        }
        assertTrue(n > 50)
    }
}

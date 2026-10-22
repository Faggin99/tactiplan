package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

// Porte de TactiPlanKitTests/PeriodosTests.swift (paridade). JSON no formato do servidor:
// `sessions` 1 por dia; o dia com 2+ períodos traz `periodos`.

private val JSON_MICRO_PERIODOS = """
{"id":"m","week_identifier":"2031-11","start_date":"2031-03-10","end_date":"2031-03-16","sessions":[
 {"id":"seg","date":"2031-03-10","day_name":"Segunda","day_of_week":1,"session_type":null,"periodo":null,
  "blocks":[{"id":"b1","name":"Aquecimento","order":1,"activity":{"id":"a0","duration_minutes":30,
   "contents":[{"name":"Resistência","dimension":"fisico"}]}}]},
 {"id":"t1","date":"2031-03-11","day_name":"Terça","day_of_week":2,"session_type":"training","periodo":"manha",
  "avg_distance_km":"5.00",
  "blocks":[{"id":"m1","name":"Aquecimento","order":1,"activity":{"id":"a1","duration_minutes":90,"files_count":1,
   "contents":[{"name":"Organização Ofensiva","dimension":"tatico"}]}}],
  "periodos":[
   {"id":"t2","date":"2031-03-11","day_of_week":2,"session_type":"training","periodo":"tarde","avg_distance_km":3.5,
    "blocks":[{"id":"x1","name":"Aquecimento","order":1,"activity":{"id":"a2","duration_minutes":60,
     "contents":[{"name":"Resistência","dimension":"fisico"}]}}]},
   {"id":"t1","date":"2031-03-11","day_of_week":2,"session_type":"training","periodo":"manha","avg_distance_km":"5.00",
    "blocks":[{"id":"m1","name":"Aquecimento","order":1,"activity":{"id":"a1","duration_minutes":90,"files_count":1,
     "contents":[{"name":"Organização Ofensiva","dimension":"tatico"}]}}]}
  ]}
]}
"""

class PeriodosTest {
    private fun micro() = lerMicrociclo(JSON_MICRO_PERIODOS)

    @Test fun `dia de 2 periodos decodifica e sessions segue 1 por dia`() {
        val m = micro()
        assertEquals(2, m.dias.size)
        val seg = m.dias[0]
        assertNull(seg.periodo)
        assertNull(seg.periodos)
        assertFalse(seg.temPeriodos)
        assertEquals(listOf("seg"), seg.listaPeriodos.map { it.id })
        val ter = m.dias[1]
        assertEquals("t1", ter.id)
        assertEquals("manha", ter.periodo)
        assertTrue(ter.temPeriodos)
        assertEquals(listOf("t1", "t2"), ter.listaPeriodos.map { it.id })
        assertEquals(90, resumoDoDia(ter).minutos)
    }

    @Test fun `selo divisao e resumo do dia inteiro somam os periodos`() {
        val ter = micro().dias[1]
        assertEquals("2 períodos", seloPeriodos(ter))
        assertNull(seloPeriodos(micro().dias[0]))
        assertEquals("90+60", divisaoMinutos(ter))
        val r = resumoDoDiaInteiro(ter)
        assertEquals(150, r.minutos)
        assertEquals(listOf("tatico"), r.pilares)
        assertEquals(1, r.anexos)
        assertEquals(8.5, r.distanciaKm!!, 0.0001)
        assertEquals(TipoDia.TREINO, r.tipo)
        assertEquals("150 min · 8,5 km", detalheDaLinha(r))
        assertEquals(resumoDoDia(micro().dias[0]), resumoDoDiaInteiro(micro().dias[0]))
    }

    @Test fun `regras de adicionar periodo iguais ao servidor`() {
        val m = micro()
        val seg = m.dias[0]
        val ter = m.dias[1]
        assertEquals(Periodo.entries.toList(), periodosDisponiveis(seg))
        assertEquals(Periodo.MANHA to Periodo.TARDE, sugestaoNovoPeriodo(seg))
        assertEquals(listOf(Periodo.NOITE), periodosDisponiveis(ter))
        assertEquals(null to Periodo.NOITE, sugestaoNovoPeriodo(ter))
        assertEquals(MSG_PERIODO_IGUAL, erroNovoPeriodo(seg, Periodo.MANHA, Periodo.MANHA))
        assertTrue(erroNovoPeriodo(seg, null, Periodo.TARDE) != null)
        assertNull(erroNovoPeriodo(seg, Periodo.MANHA, Periodo.TARDE))
        assertEquals("O dia já tem o período Tarde.", erroNovoPeriodo(ter, null, Periodo.TARDE))
        val descanso = seg.copy(tipoBruto = "rest")
        assertTrue(periodosDisponiveis(descanso).isEmpty())
        assertEquals(MSG_PERIODO_DESCANSO, erroNovoPeriodo(descanso, Periodo.MANHA, Periodo.TARDE))
        val cheio = ter.copy(periodos = ter.listaPeriodos + Dia(id = "t3", data = ter.data, diaDaSemanaBruto = 2, periodo = "noite"))
        assertTrue(periodosDisponiveis(cheio).isEmpty())
        assertEquals(MSG_PERIODO_MAXIMO, erroNovoPeriodo(cheio, null, Periodo.NOITE))
    }

    @Test fun `jogo mais periodo de treino aparece como jogo e soma o treino`() {
        val ter0 = micro().dias[1]
        val ps = ter0.periodos!!.toMutableList()
        ps[1] = ps[1].copy(tipoBruto = "match", adversario = "Rival FC")
        val ter = ter0.copy(periodos = ps)
        val r = resumoDoDiaInteiro(ter)
        assertEquals(TipoDia.JOGO, r.tipo)
        assertEquals("Jogo vs Rival FC", tituloDaLinha(r))
        assertEquals(5.0, r.distanciaKm!!, 0.0001)
        assertTrue(textoRemoverPeriodo(ps[1]).contains("O jogo deste período"))
    }

    @Test fun `adicionar e remover periodo pelo servico`() = runBlocking {
        val api = ApiTreinoFalsa()
        val s = ServicoTreino(api)
        val semana = SemanaISO.de("2031-03-11")
        val seg = micro().dias[0]
        s.adicionarPeriodo(seg, Periodo.TARDE, Periodo.MANHA, semana, "c")
        val ter = micro().dias[1]
        s.adicionarPeriodo(ter, Periodo.NOITE, Periodo.MANHA, semana, "c")
        assertEquals(2, s.removerPeriodo(ter.listaPeriodos[1]))
        assertEquals(listOf("periodo+:seg:tarde:manha", "periodo+:t1:noite:", "periodo-:t2"), api.chamadas)
        try { s.removerPeriodo(seg); fail() } catch (_: ErroApi) {}
        try { s.adicionarPeriodo(ter, Periodo.TARDE, null, semana, "c"); fail() } catch (_: ErroApi) {}
    }

    @Test fun `trocar horario so os nomes livres e as regras do servidor`() = runBlocking {
        val ter = micro().dias[1]   // Manhã (t1) + Tarde (t2)
        val manha = ter.listaPeriodos[0]
        assertEquals(listOf(Periodo.NOITE), periodosParaTrocar(ter, manha))
        assertEquals(listOf(Periodo.NOITE), periodosParaTrocar(ter, ter.listaPeriodos[1]))
        val seg = micro().dias[0]   // 1 período, sem nome = Manhã
        assertEquals(Periodo.MANHA, periodoEfetivo(seg))
        assertEquals(listOf(Periodo.TARDE, Periodo.NOITE), periodosParaTrocar(seg, seg))
        assertEquals("O período já é Manhã.", erroTrocarPeriodo(seg, seg, Periodo.MANHA))
        assertNull(erroTrocarPeriodo(seg, seg, Periodo.NOITE))
        val tarde = seg.copy(periodo = "tarde")
        assertEquals(Periodo.TARDE, periodoEfetivo(tarde))
        assertEquals(Periodo.TARDE to Periodo.MANHA, sugestaoNovoPeriodo(tarde))
        assertEquals("Manhã · Físico", tituloDaLinhaDoDia(seg))
        assertEquals("Tarde · Físico", tituloDaLinhaDoDia(tarde))
        val descanso = seg.copy(tipoBruto = "rest")
        assertNull(periodoEfetivo(descanso))
        assertTrue(periodosParaTrocar(descanso, descanso).isEmpty())
        assertEquals("Descanso", tituloDaLinhaDoDia(descanso))
        val jogo = seg.copy(tipoBruto = "match")
        assertTrue(periodosParaTrocar(jogo, jogo).isEmpty())
        assertEquals("Jogo", tituloDaLinhaDoDia(jogo))
        assertEquals("O dia já tem o período Tarde.", erroTrocarPeriodo(ter, manha, Periodo.TARDE))
        assertEquals("O período já é Manhã.", erroTrocarPeriodo(ter, manha, Periodo.MANHA))
        assertNull(erroTrocarPeriodo(ter, manha, Periodo.NOITE))
        val api = ApiTreinoFalsa()
        val s = ServicoTreino(api)
        s.trocarPeriodo(manha, ter, Periodo.NOITE)
        assertEquals(listOf("periodo~:t1:noite"), api.chamadas)
        try { s.trocarPeriodo(manha, ter, Periodo.TARDE); fail() } catch (_: ErroApi) {}
        assertEquals(1, api.chamadas.size)
    }

    @Test fun `ficha do dia inteiro ou so do periodo e nome do PDF`() {
        val ter = micro().dias[1]
        assertEquals(mapOf("session_id" to JsonPrimitive("t2")), corpoFichaDoDia("t2"))
        assertEquals(mapOf("session_id" to JsonPrimitive("t2"), "so_periodo" to JsonPrimitive(true)), corpoFichaDoDia("t2", soPeriodo = true))
        assertEquals("treino-Terca-11-03-2031.pdf", nomePdfDoDia(ter))
        assertEquals("treino-Terca-11-03-2031-Tarde.pdf", nomePdfDoDia(ter, "tarde"))
        assertEquals("/sessions/t1/periodos", CaminhosTreino.periodos("t1"))
        assertEquals("/sessions/t2/periodo", CaminhosTreino.periodo("t2"))
    }

    @Test fun `fotos agrupadas por periodo na ficha e por dia e periodo na semana`() {
        val fotos = listOf(
            FotoRelatorio("1", "2031-03-11", "Terça-feira", "11/03", periodo = "tarde", periodoRotulo = "Tarde"),
            FotoRelatorio("2", "2031-03-11", "Terça-feira", "11/03", periodo = "manha", periodoRotulo = "Manhã"),
            FotoRelatorio("3", "2031-03-10", "Segunda-feira", "10/03"),
        )
        val ficha = EscolhaFotos.de(ListaFotosRelatorio(fotos.take(2), semana = false))
        assertEquals(listOf("Manhã", "Tarde"), ficha.grupos.map { it.rotulo })
        assertEquals(listOf("2", "1"), ficha.ordemExibida)
        val semana = EscolhaFotos.de(ListaFotosRelatorio(fotos, semana = true))
        assertEquals(listOf("Segunda-feira · 10/03", "Terça-feira · 11/03 · Manhã", "Terça-feira · 11/03 · Tarde"), semana.grupos.map { it.rotulo })
        val simples = EscolhaFotos.de(ListaFotosRelatorio(listOf(fotos[2]), semana = false))
        assertEquals(listOf<String?>(null), simples.grupos.map { it.rotulo })
        val f = JsonApp.decodeFromString(FotoRelatorio.serializer(), """{"id":"9","periodo":"noite","periodoRotulo":"Noite"}""")
        assertEquals("Noite", f.periodoRotulo)
    }
}

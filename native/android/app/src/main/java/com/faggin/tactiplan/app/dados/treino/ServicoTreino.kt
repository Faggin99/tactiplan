package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.ehSomenteLeitura
import com.faggin.tactiplan.app.dados.mensagemDeErro
import com.faggin.tactiplan.app.dados.sessaoEncerrada
import java.text.Normalizer
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive

// A SEQUÊNCIA de salvar um bloco, igual ao onSave do web: ensure (dia sem id) → apagar/atualizar/
// criar a atividade → distância → SÓ ENTÃO os anexos com o activity_id real.
// Paridade: TactiPlanKit/ServicoTreino.swift.

class EnvioAnexo(val anexo: AnexoNovo, val arquivo: ArquivoUpload)

/** `distancia`: null = não mexe; Mudar(null) = limpar. */
data class MudarKm(val km: Double?)

class PedidoSalvar(
    val semana: SemanaISO,
    val clubeId: String,
    val dia: Dia,
    val ordemDoBloco: Int,
    val form: FormAtividade,
    val distancia: MudarKm? = null,
    val anexos: List<EnvioAnexo> = emptyList(),
)

data class ResultadoSalvar(
    val diaId: String,
    val atividadeId: String?,
    val anexosEnviados: List<Anexo>,
    val anexosComFalha: Map<String, String>,
) {
    val mensagemFalhas: String?
        get() {
            val n = anexosComFalha.size
            if (n == 0) return null
            return if (n == 1) "1 anexo não foi enviado. Abra a atividade e tente de novo."
            else "$n anexos não foram enviados. Abra a atividade e tente de novo."
        }
}

sealed interface Etapa {
    data object Preparando : Etapa
    data object Salvando : Etapa
    data class Enviando(val indice: Int, val total: Int, val progresso: Double) : Etapa
}

class ServicoTreino(val api: ApiTreino) {
    suspend fun diaReal(dia: Dia, semana: SemanaISO, clubeId: String): Dia {
        if (dia.id != null && dia.blocos.all { it.id != null }) return dia
        val m = api.garantirMicrociclo(semana.identificador, clubeId)
        val real = m.dias.firstOrNull { it.diaDaSemana == dia.diaDaSemana } ?: m.dias.firstOrNull { it.data == dia.data }
        if (real?.id == null) throw ErroApi(0, null, "Não foi possível preparar o dia. Tente de novo.")
        return real
    }

    suspend fun salvar(p: PedidoSalvar, etapa: (Etapa) -> Unit = {}): ResultadoSalvar {
        etapa(Etapa.Preparando)
        val dia = diaReal(p.dia, p.semana, p.clubeId)
        val diaId = dia.id ?: throw ErroApi(0, null, ErroApi.MSG_FALHA)
        val bloco = dia.blocos.firstOrNull { it.ordem == p.ordemDoBloco }
        val blocoId = bloco?.id ?: throw ErroApi(0, null, "Não foi possível achar o bloco. Atualize a semana e tente de novo.")
        etapa(Etapa.Salvando)
        var atividadeId: String? = null
        val existente = bloco.atividade?.id
        if (!p.form.preenchido) {
            if (bloco.atividade != null) api.apagarAtividadeDoBloco(blocoId)
        } else if (existente != null) {
            api.atualizarAtividade(existente, p.form.corpo())
            atividadeId = existente
        } else {
            atividadeId = api.criarAtividade(p.form.corpo(blocoId))
        }
        p.distancia?.let { api.mudarDistancia(diaId, it.km) }

        val enviados = mutableListOf<Anexo>()
        val falhas = linkedMapOf<String, String>()
        if (atividadeId != null) {
            p.anexos.forEachIndexed { i, envio ->
                etapa(Etapa.Enviando(i, p.anexos.size, 0.0))
                try {
                    enviados += api.enviarAnexo(atividadeId, envio.arquivo, envio.anexo.tituloFinal) { pr ->
                        etapa(Etapa.Enviando(i, p.anexos.size, pr))
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    if (sessaoEncerrada(e)) throw e
                    falhas[envio.anexo.id] = mensagemDeErro(e)
                }
            }
        } else {
            p.anexos.forEach { falhas[it.anexo.id] = MSG_ANEXO_ORFAO }
        }
        return ResultadoSalvar(diaId, atividadeId, enviados, falhas)
    }

    suspend fun mudarTipo(dia: Dia, tipo: TipoDia, adversario: String?, semana: SemanaISO, clubeId: String): String {
        val id = diaReal(dia, semana, clubeId).id ?: throw ErroApi(0, null, ErroApi.MSG_FALHA)
        api.mudarTipo(id, tipo, adversario)
        return id
    }

    /** Adiciona um período ao dia (cria o dia antes, se preciso). Devolve o id do período novo. */
    suspend fun adicionarPeriodo(dia: Dia, novo: Periodo, atual: Periodo?, semana: SemanaISO, clubeId: String): String {
        erroNovoPeriodo(dia, atual, novo)?.let { throw ErroApi(0, "PERIODO_INVALIDO", it) }
        val id = diaReal(dia, semana, clubeId).id ?: throw ErroApi(0, null, ErroApi.MSG_FALHA)
        return api.adicionarPeriodo(id, novo, if (dia.temPeriodos) null else atual)
    }

    /** Remove um período (só no dia com 2+). Devolve os anexos apagados. */
    suspend fun removerPeriodo(periodo: Dia): Int {
        val id = periodo.id
        if (id == null || periodo.periodo == null) throw ErroApi(0, "PERIODO_INVALIDO", "O dia tem um período só: não há o que remover.")
        return api.removerPeriodo(id)
    }

    /** Troca o horário de um período (dia com 2+). A ordem do dia muda junto (sai do nome). */
    suspend fun trocarPeriodo(periodo: Dia, dia: Dia, para: Periodo) {
        erroTrocarPeriodo(dia, periodo, para)?.let { throw ErroApi(0, "PERIODO_INVALIDO", it) }
        val id = periodo.id ?: throw ErroApi(0, null, ErroApi.MSG_FALHA)
        api.trocarPeriodo(id, para)
    }

    suspend fun mudarDistancia(dia: Dia, km: Double?, semana: SemanaISO, clubeId: String): String {
        val id = diaReal(dia, semana, clubeId).id ?: throw ErroApi(0, null, ErroApi.MSG_FALHA)
        api.mudarDistancia(id, km)
        return id
    }
}

// ---------- mensagens amigáveis ----------

const val MSG_SEM_PERMISSAO_TREINO = "Você não tem permissão para editar treinos. Peça ao responsável pela equipe."
const val MSG_SEM_PERMISSAO_APAGAR = "Você não tem permissão para apagar treinos. Peça ao responsável pela equipe."
const val MSG_SEM_PERMISSAO_BIBLIOTECA = "Você não tem permissão para cadastrar atividades na biblioteca. Peça ao responsável pela equipe."
const val MSG_NAO_EXPORTA = "Não é possível exportar agora. Fale com o responsável pela equipe."

fun mensagemErroTreino(e: Throwable, permissao: String = MSG_SEM_PERMISSAO_TREINO): String {
    val erro = e as? ErroApi
    if (erro != null) {
        if (erro.status == 403 && !ehSomenteLeitura(e)) return permissao
        if (erro.codigo == "PLAN_REQUIRED") return MSG_NAO_EXPORTA
    }
    return mensagemDeErro(e)
}

// ---------- relatórios ----------

/** Dia com 2+ períodos: sai o dia inteiro; `soPeriodo` = só o período de `diaId`. */
fun corpoFichaDoDia(diaId: String, soPeriodo: Boolean = false): Map<String, JsonElement> =
    if (soPeriodo) mapOf("session_id" to JsonPrimitive(diaId), "so_periodo" to JsonPrimitive(true))
    else mapOf("session_id" to JsonPrimitive(diaId))

fun corpoRelatorioSemana(s: SemanaISO, clubeId: String): Map<String, JsonElement> = mapOf(
    "club_id" to JsonPrimitive(clubeId), "start_date" to JsonPrimitive(s.segunda),
    "end_date" to JsonPrimitive(s.domingo), "filter_type" to JsonPrimitive("1-micro"),
)

/** Só um período: "treino-Quarta-21-10-2026-Tarde.pdf". */
fun nomePdfDoDia(d: Dia, periodo: String? = null): String {
    val nome = d.nomeDia ?: NOMES_DIAS[(d.diaDaSemana - 1).coerceIn(0, 6)]
    val sufixo = rotuloDoPeriodo(periodo)?.let { "-$it" } ?: ""
    return nomeArquivoSeguro("treino-$nome-${dataBR(d.data).replace("/", "-")}$sufixo") + ".pdf"
}

fun nomePdfDaSemana(s: SemanaISO, clube: String): String =
    "Estatisticas_Treino_${nomeArquivoSeguro(clube)}_Semana_${s.numero}_${s.ano}.pdf"

/** O `safeFileName` do web: tira acentos, espaço vira "_", sobra só [A-Za-z0-9_-]. */
fun nomeArquivoSeguro(s: String): String {
    val semAcento = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("[\\u0300-\\u036f]"), "")
    val r = semAcento.replace(Regex("\\s+"), "_").replace(Regex("[^A-Za-z0-9_-]"), "")
    return if (r.isEmpty()) "relatorio" else r.take(80)
}


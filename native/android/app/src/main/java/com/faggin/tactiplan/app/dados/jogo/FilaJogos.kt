package com.faggin.tactiplan.app.dados.jogo

import com.faggin.tactiplan.app.dados.Armazem
import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.agoraMs
import com.faggin.tactiplan.app.dados.semRede
import com.faggin.tactiplan.app.dados.sessaoEncerrada
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable

// Jogo SEM INTERNET (decisão do dono, 21/10): a tela do Jogo grava escalação e eventos sem sinal
// e envia depois. Só nesta tela. O POST /api/games/:id regrava o jogo inteiro, então a fila de um
// jogo é UMA pendência: o retrato mais recente do editor + quantas alterações ele junta + a
// assinatura do servidor de quando o jogo foi aberto ("base").
// Conflito (o jogo mudou no servidor enquanto o aparelho estava sem sinal): PREVALECE O LOCAL e a
// pessoa é avisada (quem está na beira do campo é a fonte mais confiável; o servidor não junta
// pedaços). Paridade: TactiPlanKit/FilaJogos.swift.

@Serializable
data class PendenciaJogo(
    val sessaoId: String,
    val editor: EditorJogo,
    val base: String? = null,
    val alteracoes: Int = 0,
    val atualizadoEm: Long = 0,
    /** Último erro que NÃO é falta de rede (400, 402, 403, 409…). */
    val erro: String? = null,
)

fun textoFila(alteracoes: Int, semConexao: Boolean): String {
    val qtd = if (alteracoes == 1) "1 alteração" else "$alteracoes alterações"
    return if (semConexao) "Sem conexão · $qtd para enviar" else "$qtd para enviar"
}

const val MSG_CONFLITO = "Este jogo tinha sido alterado no servidor (por outra pessoa ou outro aparelho) enquanto você estava sem conexão. Valeram as alterações deste aparelho: confira a escalação e os eventos."
const val MSG_GUARDADO = "Sem conexão: as alterações ficaram guardadas no aparelho e serão enviadas quando a internet voltar."

/** A fila persistente (uma pendência por jogo), sobre um [Armazem]. */
class FilaJogos(private val armazem: Armazem) {
    companion object {
        const val PREFIXO = "fila-jogo:"
        const val PREFIXO_CACHE = "cache-jogo:"
    }

    private fun lerPendencia(s: String?): PendenciaJogo? =
        s?.let { runCatching { JsonApp.decodeFromString(PendenciaJogo.serializer(), it) }.getOrNull() }

    @Synchronized fun pendencia(sessaoId: String): PendenciaJogo? = lerPendencia(armazem.ler(PREFIXO + sessaoId))

    @Synchronized fun todas(): List<PendenciaJogo> =
        armazem.chaves().filter { it.startsWith(PREFIXO) }.mapNotNull { lerPendencia(armazem.ler(it)) }.sortedBy { it.atualizadoEm }

    /** Guarda (ou junta à pendência que já existe). LANÇA se não ficou no disco. */
    @Synchronized
    fun guardar(editor: EditorJogo, base: String?, alteracoes: Int, agora: Long = agoraMs()): PendenciaJogo {
        val anterior = lerPendencia(armazem.ler(PREFIXO + editor.sessaoId))
        val p = PendenciaJogo(editor.sessaoId, editor, if (anterior != null) anterior.base else base,
            (anterior?.alteracoes ?: 0) + maxOf(1, alteracoes), agora)
        armazem.gravarOuFalhar(PREFIXO + editor.sessaoId, JsonApp.encodeToString(PendenciaJogo.serializer(), p))
        return p
    }

    @Synchronized fun marcarErro(sessaoId: String, erro: String?) {
        val p = lerPendencia(armazem.ler(PREFIXO + sessaoId)) ?: return
        armazem.gravar(PREFIXO + sessaoId, JsonApp.encodeToString(PendenciaJogo.serializer(), p.copy(erro = erro)))
    }

    @Synchronized fun remover(sessaoId: String) = armazem.remover(PREFIXO + sessaoId)

    @Synchronized fun guardarCache(p: PacoteJogo) {
        runCatching { armazem.gravar(PREFIXO_CACHE + p.dia.id, JsonApp.encodeToString(PacoteJogo.serializer(), p)) }
    }

    @Synchronized fun cache(sessaoId: String): PacoteJogo? =
        armazem.ler(PREFIXO_CACHE + sessaoId)?.let { runCatching { JsonApp.decodeFromString(PacoteJogo.serializer(), it) }.getOrNull() }
}

sealed class ResultadoEnvio {
    data class Enviado(val conflito: Boolean) : ResultadoEnvio()
    data object SemRede : ResultadoEnvio()
    data class Recusado(val mensagem: String) : ResultadoEnvio()
    data class SessaoEncerrada(val erro: ErroApi) : ResultadoEnvio()
    data object NadaAEnviar : ResultadoEnvio()
}

class SincronizadorJogos(val servico: ServicoJogo, val fila: FilaJogos) {
    suspend fun enviar(sessaoId: String): ResultadoEnvio {
        val p = fila.pendencia(sessaoId) ?: return ResultadoEnvio.NadaAEnviar
        return try {
            var conflito = false
            if (p.base != null) conflito = servico.assinaturaNoServidor(sessaoId) != p.base
            p.editor.conferirAntesDeSalvar()?.let {
                fila.marcarErro(sessaoId, it)
                return ResultadoEnvio.Recusado(it)
            }
            servico.api.salvar(sessaoId, p.editor.corpoSalvar())
            fila.remover(sessaoId)
            ResultadoEnvio.Enviado(conflito)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (sessaoEncerrada(e) && e is ErroApi) return ResultadoEnvio.SessaoEncerrada(e)
            if (semRede(e)) return ResultadoEnvio.SemRede
            val msg = mensagemErroJogo(e)
            fila.marcarErro(sessaoId, msg)
            ResultadoEnvio.Recusado(msg)
        }
    }

    suspend fun enviarTodas(): Map<String, ResultadoEnvio> {
        val r = LinkedHashMap<String, ResultadoEnvio>()
        for (p in fila.todas()) r[p.sessaoId] = enviar(p.sessaoId)
        return r
    }
}

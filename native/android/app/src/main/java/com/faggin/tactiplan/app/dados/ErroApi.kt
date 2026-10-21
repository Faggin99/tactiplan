package com.faggin.tactiplan.app.dados

// Erros da API (mesma semântica do Gestsport). Paridade: TactiPlanKit/ErroApi.swift.

/**
 * Erro de qualquer chamada à API.
 * - Sem conexão/timeout: status 0, codigo "OFFLINE".
 * - Resposta não-2xx: status HTTP, mensagem do `{error}` do corpo, `codigo` do `{code}`.
 */
class ErroApi(
    val status: Int,
    val codigo: String?,
    val mensagem: String,
    val demo: Boolean = false,
    /** Os outros campos de TEXTO do corpo do erro. */
    val extras: Map<String, String> = emptyMap(),
) : Exception(mensagem) {
    companion object {
        const val OFFLINE = "OFFLINE"
        const val MSG_OFFLINE = "Sem conexão. Confira a internet e tente de novo."
        const val MSG_FALHA = "Não foi possível falar com o servidor agora. Tente de novo."

        fun offline() = ErroApi(0, OFFLINE, MSG_OFFLINE)
    }
}

/** "Sem rede": OFFLINE, status 0 ou 5xx. Só esses mantêm o último dado na tela. 4xx NUNCA. */
fun semRede(e: Throwable?): Boolean {
    val erro = e as? ErroApi ?: return false
    return erro.codigo == ErroApi.OFFLINE || erro.status == 0 || erro.status >= 500
}

/** Regra ÚNICA de "sessão acabou": QUALQUER 401, seja qual for o código. */
fun sessaoEncerrada(e: Throwable?): Boolean = (e as? ErroApi)?.status == 401

/** O servidor recusou uma escrita porque a equipe está em só leitura (402 READ_ONLY). */
fun ehSomenteLeitura(e: Throwable?): Boolean {
    val erro = e as? ErroApi ?: return false
    return erro.codigo == "READ_ONLY" || (erro.status == 402 && erro.extras["read_only"] == "true")
}

/** Escrita em clube ARQUIVADO (409 CLUB_ARCHIVED, migration 055): o clube é só consulta. */
fun ehClubeArquivado(e: Throwable?): Boolean = (e as? ErroApi)?.codigo == "CLUB_ARCHIVED"

/**
 * Texto para a tela. Só leitura → SEMPRE a frase neutra (Apple 3.1.3), mesmo que o servidor
 * mande outra. O resto: a mensagem do servidor.
 */
fun mensagemDeErro(e: Throwable, padrao: String = ErroApi.MSG_FALHA): String {
    if (ehSomenteLeitura(e)) return TEXTO_NAO_EDITA
    if (ehClubeArquivado(e)) return TEXTO_CLUBE_ARQUIVADO
    val m = (e as? ErroApi)?.mensagem
    return if (!m.isNullOrEmpty()) m else padrao
}

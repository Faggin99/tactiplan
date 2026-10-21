package com.faggin.tactiplan.app.dados

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// Tela Entrar: e-mail e senha + "Continuar com o Google" (atrás das flags do servidor). Sem botão
// da Apple no Android. Não há "Criar conta": o app é só por convite. Paridade: TactiPlanKit/Entrar.swift.

data class EstadoEntrar(
    val email: String = "",
    val senha: String = "",
    val carregando: Boolean = false,
    val erro: String? = null,
    val config: ConfigApp = ConfigApp.padrao,
) {
    val camposHabilitados: Boolean get() = !carregando
    val podeEntrar: Boolean get() = !carregando && email.isNotBlank() && senha.isNotEmpty()
    val esqueciSenhaUrl: String get() = config.esqueciSenhaUrl ?: ESQUECI_SENHA_URL_PADRAO
}

class EntrarModelo(
    private val api: ApiApp,
    private val aparelho: Aparelho,
    private val aoEntrar: (RespostaLogin) -> Unit,
) {
    private val _estado = MutableStateFlow(EstadoEntrar())
    val estado: StateFlow<EstadoEntrar> = _estado

    private fun mudar(f: (EstadoEntrar) -> EstadoEntrar) { _estado.value = f(_estado.value) }

    /** Flags do servidor (Google, links). Falhou: só e-mail e senha. */
    suspend fun carregarConfig() {
        try { val c = api.config(); mudar { it.copy(config = c) } } catch (_: Exception) {}
    }

    fun mudarEmail(v: String) = mudar { it.copy(email = v, erro = null) }
    fun mudarSenha(v: String) = mudar { it.copy(senha = v, erro = null) }

    suspend fun entrar() {
        val e = _estado.value
        if (e.carregando) return
        val email = e.email.trim()
        if (!emailPlausivel(email)) return mudar { it.copy(erro = MSG_EMAIL_INVALIDO) }
        if (e.senha.isEmpty()) return mudar { it.copy(erro = MSG_SENHA_VAZIA) }
        tentar { api.entrar(email, e.senha, aparelho) }
    }

    suspend fun entrarComGoogle(idToken: String) {
        if (_estado.value.carregando) return
        tentar { api.entrarComGoogle(idToken, aparelho) }
    }

    suspend fun entrarComApple(identityToken: String, nome: String?) {
        if (_estado.value.carregando) return
        tentar { api.entrarComApple(identityToken, nome, aparelho) }
    }

    /** O botão social não conseguiu a credencial (cancelado = null: nada aparece). */
    fun falhaSocial(mensagem: String?) = mudar { it.copy(carregando = false, erro = mensagem) }

    private suspend fun tentar(chamada: suspend () -> RespostaLogin) {
        mudar { it.copy(carregando = true, erro = null) }
        try {
            val r = chamada()
            mudar { it.copy(carregando = false, senha = "") }
            aoEntrar(r)
        } catch (e: Exception) {
            mudar { it.copy(carregando = false, erro = mensagemDoLogin(e)) }
        }
    }
}

/** Erro do login → frase da tela. */
fun mensagemDoLogin(e: Throwable): String {
    if (semRede(e)) return if ((e as? ErroApi)?.status == 0) ErroApi.MSG_OFFLINE else ErroApi.MSG_FALHA
    return mensagemDeErro(e, MSG_SOCIAL_FALHOU)
}

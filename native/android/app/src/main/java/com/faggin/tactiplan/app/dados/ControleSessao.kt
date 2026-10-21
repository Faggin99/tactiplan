package com.faggin.tactiplan.app.dados

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// Dono da sessão do app (um por processo). Decide a tela de cima — Entrar, Onde entrar ou as
// abas do clube — e é a porta ÚNICA de entrar, escolher/trocar de clube, atualizar o /me,
// aceitar convite e sair. A tela só observa [estado]. Paridade: TactiPlanKit/ControleSessao.swift.

sealed interface EstadoApp {
    val sessao: Sessao?

    /** Sem sessão: tela Entrar. */
    data object Entrar : EstadoApp { override val sessao: Sessao? = null }

    /** Com sessão, escolhendo o clube. `atual` = o clube em uso (Trocar clube: dá para voltar). */
    data class OndeEntrar(override val sessao: Sessao, val atual: Escolha?) : EstadoApp

    /** No clube: as abas, com o tema do clube. */
    data class NoClube(override val sessao: Sessao, val contexto: ContextoClube) : EstadoApp
}

class ControleSessao(
    private val api: ApiApp,
    private val cofre: CofreSessao,
    private val relogio: () -> Long = { agoraMs() },
) {
    private val _estado = MutableStateFlow<EstadoApp>(EstadoApp.Entrar)
    val estado: StateFlow<EstadoApp> = _estado

    /** O último /me não veio (sem rede/servidor fora): a casca mostra a faixa "sem conexão". */
    private val _semConexao = MutableStateFlow(false)
    val semConexao: StateFlow<Boolean> = _semConexao

    init {
        cofre.ler()?.let { _estado.value = decidir(it) }
    }

    val sessao: Sessao? get() = _estado.value.sessao

    /** Com sessão, o clube que vale: a escolha guardada (se ainda existe) ou a automática. */
    private fun decidir(s0: Sessao): EstadoApp {
        var s = s0
        val auto = escolhaAutomatica(s.me, s.escolha, cofre.lerUltimaEscolha(s.me.usuario.id))
        val ctx = auto?.let { contextoDe(s.me, it) }
        if (auto != null && ctx != null) {
            if (s.escolha != auto) {
                s = s.copy(escolha = auto)
                cofre.salvar(s)
                cofre.guardarUltimaEscolha(s.me.usuario.id, auto)
            }
            return EstadoApp.NoClube(s, ctx)
        }
        if (s.escolha != null) {
            s = s.copy(escolha = null)
            cofre.salvar(s)
        }
        return EstadoApp.OndeEntrar(s, null)
    }

    private fun publicar(s: Sessao) {
        cofre.salvar(s)
        _estado.value = decidir(s)
    }

    // ---------- entrar / sair ----------

    /** Login aceito pelo servidor (e-mail/senha ou Google). */
    fun entrou(r: RespostaLogin) {
        _semConexao.value = false
        val ultima = cofre.lerUltimaEscolha(r.me.usuario.id)
        publicar(Sessao(r.token, r.expiraEm, r.me, ultima, relogio()))
    }

    /** Sair: avisa o servidor (revoga o token; sem rede, segue mesmo assim) e apaga a sessão. */
    suspend fun sair() {
        val token = sessao?.token
        encerrarLocal()
        if (token != null) try { api.sair(token) } catch (_: Exception) {}
    }

    private fun encerrarLocal() {
        cofre.limpar()
        _semConexao.value = false
        _estado.value = EstadoApp.Entrar
    }

    /**
     * Erro de chamada feita COM o token [token]: 401 encerra a sessão (só se ainda for a mesma).
     * Devolve true quando tratou (a tela não mostra nada).
     */
    fun tratarErro(e: Throwable, token: String?): Boolean {
        if (!sessaoEncerrada(e) || token == null || token != sessao?.token) return false
        encerrarLocal()
        return true
    }

    // ---------- clube ----------

    /** Escolheu um clube no "Onde entrar". */
    fun escolher(e: Escolha) {
        val s0 = sessao ?: return
        val ctx = contextoDe(s0.me, e) ?: return
        val s = s0.copy(escolha = e)
        cofre.guardarUltimaEscolha(s.me.usuario.id, e)
        cofre.salvar(s)
        _estado.value = EstadoApp.NoClube(s, ctx)
    }

    /** Mais › Clube › Trocar: abre o "Onde entrar" (com volta para o clube atual). */
    fun abrirTroca() {
        val e = _estado.value as? EstadoApp.NoClube ?: return
        _estado.value = EstadoApp.OndeEntrar(e.sessao, e.contexto.escolha)
    }

    /** Fechou o "Onde entrar" sem escolher: volta ao clube em uso (se houver). */
    fun cancelarTroca() {
        val e = _estado.value as? EstadoApp.OndeEntrar ?: return
        val atual = e.atual ?: return
        val ctx = contextoDe(e.sessao.me, atual) ?: return
        _estado.value = EstadoApp.NoClube(e.sessao, ctx)
    }

    // ---------- servidor ----------

    /** Atualiza o /me. Sem rede: mantém o último dado e liga [semConexao]. 401: sai. */
    suspend fun atualizarMe() {
        val s0 = sessao ?: return
        try {
            val me = api.me(s0.token)
            val atualS = sessao ?: return
            if (atualS.token != s0.token) return
            val s = atualS.copy(me = me, meEm = relogio())
            _semConexao.value = false
            val trocando = _estado.value as? EstadoApp.OndeEntrar
            cofre.salvar(s)
            if (trocando != null) {
                // Trocando de clube: continua na lista, com os dados novos.
                _estado.value = EstadoApp.OndeEntrar(s, trocando.atual?.takeIf { escolhaValida(it, me) })
            } else {
                _estado.value = decidir(s)
            }
        } catch (e: Exception) {
            if (tratarErro(e, s0.token)) return
            if (semRede(e)) _semConexao.value = true
        }
    }

    /** Aceita um convite pendente. Entra direto no clube novo quando ele é o único ativo da equipe. */
    suspend fun aceitarConvite(convite: String) {
        val s0 = sessao ?: return
        try {
            val r = api.aceitarConvite(s0.token, convite)
            val atualS = sessao ?: return
            if (atualS.token != s0.token) return
            val s = atualS.copy(me = r.me, meEm = relogio())
            cofre.salvar(s)
            val conta = r.workspaceId?.let { ws -> r.me.workspaces.firstOrNull { it.id == ws } }
            if (conta != null) {
                val clubes = conta.clubes.orEmpty().filter { it.arquivado != true }
                if (clubes.size == 1) {
                    _estado.value = EstadoApp.OndeEntrar(s, null)
                    escolher(Escolha(conta.id, clubes[0].id))
                    return
                }
            }
            _estado.value = EstadoApp.OndeEntrar(s, escolhaAtual())
        } catch (e: Exception) {
            if (tratarErro(e, s0.token)) return
            throw e
        }
    }

    private fun escolhaAtual(): Escolha? = when (val e = _estado.value) {
        is EstadoApp.OndeEntrar -> e.atual
        is EstadoApp.NoClube -> e.contexto.escolha
        EstadoApp.Entrar -> null
    }

    /** Push (estrutura pronta, DESLIGADA): só com token do sistema. Falha não importa. */
    suspend fun registrarPush(tokenPush: String, plataforma: String) {
        val s = sessao ?: return
        if (tokenPush.isEmpty()) return
        try {
            api.registrarPush(s.token, tokenPush, plataforma)
        } catch (e: Exception) {
            tratarErro(e, s.token)
        }
    }
}

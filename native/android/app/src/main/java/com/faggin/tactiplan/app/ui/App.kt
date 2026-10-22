package com.faggin.tactiplan.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.faggin.tactiplan.app.BuildConfig
import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.Aparelho
import com.faggin.tactiplan.app.dados.treino.ApiTreino
import com.faggin.tactiplan.app.dados.treino.ApiTreinoHttp
import com.faggin.tactiplan.app.dados.treino.ServicoTreino
import com.faggin.tactiplan.app.dados.jogo.ApiJogo
import com.faggin.tactiplan.app.dados.jogo.ApiJogoHttp
import com.faggin.tactiplan.app.dados.ApiApp
import com.faggin.tactiplan.app.dados.ConfigApp
import com.faggin.tactiplan.app.dados.ControleSessao
import com.faggin.tactiplan.app.dados.EntrarModelo
import com.faggin.tactiplan.app.dados.EstadoApp
import com.faggin.tactiplan.app.dados.PRIVACIDADE_URL_PADRAO
import com.faggin.tactiplan.app.dados.TERMOS_URL_PADRAO
import com.faggin.tactiplan.app.dados.precisaAtualizar
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.design.TactiPlanTema
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.casca.Casca
import com.faggin.tactiplan.app.ui.comum.LocalTravaDoApp
import com.faggin.tactiplan.app.ui.comum.TelaBloqueio
import com.faggin.tactiplan.app.ui.comum.TravaDoApp
import com.faggin.tactiplan.app.ui.comum.rememberAutenticar
import com.faggin.tactiplan.app.ui.entrar.EntrarTela
import com.faggin.tactiplan.app.ui.entrar.LoginGoogle
import com.faggin.tactiplan.app.ui.entrar.OndeEntrarTela
import com.faggin.tactiplan.app.ui.t3.ServicosT3
import com.faggin.tactiplan.app.dados.quadro.ApiQuadro
import com.faggin.tactiplan.app.dados.quadro.ApiQuadroHttp
import kotlinx.coroutines.launch

/**
 * Raiz do app (paridade: TactiPlanApp.swift): lê o [ControleSessao] e escolhe Entrar, Onde entrar
 * ou as abas do clube — com o tema do clube em uso (cor + logo; o escuro segue o aparelho).
 */
@Composable
fun App(
    controle: ControleSessao,
    api: ApiApp,
    aparelho: Aparelho,
    google: LoginGoogle?,
    trava: TravaDoApp?,
    versaoInstalada: String,
    apiBase: String = BuildConfig.API_BASE,
    /** Rotas de treino do web com o token do app (os testes trocam por uma falsa). */
    fabricaTreino: (token: String, workspaceId: String) -> ApiTreino = { t, w -> ApiTreinoHttp(Api(apiBase), t, w) },
    /** Rotas de jogo do web (T2). */
    fabricaJogo: (token: String, workspaceId: String) -> ApiJogo = { t, w -> ApiJogoHttp(Api(apiBase), t, w) },
    /** Rotas do web da T3 (elenco, staff, estatísticas, cadastros). */
    fabricaT3: (token: String, workspaceId: String) -> ServicosT3 = { t, w -> ServicosT3.http(apiBase, t, w) },
    /** Jogadas do quadro tático (T5): /api/plays do web. */
    fabricaQuadro: (token: String, workspaceId: String) -> ApiQuadro = { t, w -> ApiQuadroHttp(Api(apiBase), t, w) },
) {
    val estado by controle.estado.collectAsState()
    val semConexao by controle.semConexao.collectAsState()
    val escopo = rememberCoroutineScope()
    var config by remember { mutableStateOf(ConfigApp.padrao) }
    LaunchedEffect(api) { try { config = api.config() } catch (_: Exception) {} }

    val personalizacao = (estado as? EstadoApp.NoClube)?.contexto?.clube?.personalizacao
    TactiPlanTema(personalizacao) {
        CompositionLocalProvider(LocalTravaDoApp provides trava) {
            Box(
                Modifier.fillMaxSize().background(TactiPlan.cores.fundo)
                    .then(if (estado is EstadoApp.Entrar) Modifier else Modifier.windowInsetsPadding(WindowInsets.safeDrawing)),
            ) {
                when (val e = estado) {
                    EstadoApp.Entrar -> {
                        val modelo = remember(controle) { EntrarModelo(api, aparelho) { controle.entrou(it) } }
                        EntrarTela(modelo, google)
                    }
                    is EstadoApp.OndeEntrar -> OndeEntrarTela(
                        e, semConexao,
                        escolher = { controle.escolher(it.escolha) },
                        aceitar = { controle.aceitarConvite(it.token) },
                        recusar = { controle.recusarConvite(it.token) },
                        voltar = { controle.cancelarTroca() },
                        sair = { escopo.launch { controle.sair() } },
                    )
                    is EstadoApp.NoClube -> key(e.sessao.token, e.contexto.escolha) {
                        val token = e.sessao.token
                        val treino = remember(token, e.contexto.escolha.workspaceId) {
                            ServicoTreino(fabricaTreino(token, e.contexto.escolha.workspaceId))
                        }
                        val jogo = remember(token, e.contexto.escolha.workspaceId) { fabricaJogo(token, e.contexto.escolha.workspaceId) }
                        val t3 = remember(token, e.contexto.escolha.workspaceId) { fabricaT3(token, e.contexto.escolha.workspaceId) }
                        val quadro = remember(token, e.contexto.escolha.workspaceId) { fabricaQuadro(token, e.contexto.escolha.workspaceId) }
                        Casca(
                            AmbienteClube(
                                contexto = e.contexto,
                                nomePessoa = e.sessao.me.usuario.nome.orEmpty(),
                                email = e.sessao.me.usuario.email.orEmpty(),
                                convitesPendentes = e.sessao.me.convites.size,
                                semConexao = semConexao,
                                meEm = e.sessao.meEm,
                                precisaAtualizar = precisaAtualizar(versaoInstalada, config.versaoMinima?.android),
                                privacidadeUrl = config.privacidadeUrl ?: PRIVACIDADE_URL_PADRAO,
                                termosUrl = config.termosUrl ?: TERMOS_URL_PADRAO,
                                trocarClube = { controle.abrirTroca() },
                                sair = { escopo.launch { controle.sair() } },
                                usuarioId = e.sessao.me.usuario.id,
                                apiBase = apiBase,
                                treino = treino,
                                jogo = jogo,
                                t3 = t3,
                                quadro = quadro,
                                atualizarMe = { try { controle.atualizarMe() } catch (_: Exception) {} },
                                tratarErro = { err -> controle.tratarErro(err, token) },
                            ),
                        )
                    }
                }
                // A trava por cima de tudo (só com sessão); a casca fica montada por baixo.
                if (trava != null && estado !is EstadoApp.Entrar && trava.bloqueada) {
                    val autenticar = rememberAutenticar { ok -> if (ok) trava.desbloqueou() }
                    TelaBloqueio(autenticar)
                }
            }
        }
    }
}

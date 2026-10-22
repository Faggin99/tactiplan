package com.faggin.tactiplan.app.ui.casca

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.ABA_ELENCO
import com.faggin.tactiplan.app.dados.ABA_JOGOS
import com.faggin.tactiplan.app.dados.ABA_MAIS
import com.faggin.tactiplan.app.dados.ABA_QUADRO
import com.faggin.tactiplan.app.dados.ABA_SEMANA
import com.faggin.tactiplan.app.dados.ContextoClube
import com.faggin.tactiplan.app.dados.DefAba
import com.faggin.tactiplan.app.dados.abasDoContexto
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.dados.treino.ServicoTreino
import com.faggin.tactiplan.app.ui.semana.SemanaAba
import com.faggin.tactiplan.app.ui.jogos.JogosAba
import com.faggin.tactiplan.app.dados.jogo.ApiJogo

/** O que a casca entrega às telas do clube (tudo que vem da sessão + as ações do Mais). */
class AmbienteClube(
    val contexto: ContextoClube,
    val nomePessoa: String,
    val email: String,
    val convitesPendentes: Int,
    val semConexao: Boolean,
    val meEm: Long?,
    val precisaAtualizar: Boolean,
    val privacidadeUrl: String,
    val termosUrl: String,
    val trocarClube: () -> Unit,
    val sair: () -> Unit,
    /** T1: id da pessoa (preferências do aparelho), token da sessão e as rotas de treino do web. */
    val usuarioId: String = "",
    val apiBase: String = "",
    val treino: ServicoTreino? = null,
    /** Erro de qualquer chamada com o token: 401 encerra a sessão (devolve true quando tratou). */
    val tratarErro: (Throwable) -> Boolean = { false },
    /** T2: as rotas de jogo do web com o token do app. */
    val jogo: ApiJogo? = null,
)

fun iconeDaAba(a: DefAba): ImageVector = when (a.id) {
    ABA_SEMANA.id -> Icones.calendario
    ABA_JOGOS.id -> Icones.trofeu
    ABA_ELENCO.id -> Icones.grupo
    ABA_QUADRO.id -> Icones.rota
    else -> Icones.mais
}

/**
 * Barra de 5 abas (Semana · Jogos · Elenco · Quadro · Mais) — NavigationBar do Material 3, fixa,
 * com a pílula de indicação na cor do clube. Sem `tactical:view` o Quadro some.
 * Voltar do sistema numa aba que não é a 1ª volta para a Semana.
 */
@Composable
fun Casca(amb: AmbienteClube) {
    val abas = abasDoContexto(amb.contexto)
    var ativa by rememberSaveable { mutableStateOf(abas.first().id) }
    if (abas.none { it.id == ativa }) ativa = abas.first().id
    val c = TactiPlan.cores
    BackHandler(enabled = ativa != abas.first().id) { ativa = abas.first().id }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) {
            when (ativa) {
                ABA_MAIS.id -> MaisTela(amb)
                ABA_SEMANA.id -> if (amb.treino != null) SemanaAba(amb, amb.treino) else EmBreveTela(abas.first { it.id == ativa }, amb)
                ABA_JOGOS.id -> if (amb.treino != null && amb.jogo != null) JogosAba(amb, amb.treino, amb.jogo) else EmBreveTela(abas.first { it.id == ativa }, amb)
                else -> EmBreveTela(abas.first { it.id == ativa }, amb)
            }
        }
        NavigationBar(containerColor = c.superficie, tonalElevation = 0.dp) {
            abas.forEach { a ->
                NavigationBarItem(
                    selected = a.id == ativa,
                    onClick = { ativa = a.id },
                    icon = { Icon(iconeDaAba(a), contentDescription = null, modifier = Modifier.size(22.dp)) },
                    label = { Text(a.rotulo, fontWeight = FontWeight.SemiBold, style = TactiPlan.tipos.legenda11) },
                    modifier = Modifier.testTag("aba:${a.id}"),
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = c.acaoTinta, selectedTextColor = c.acaoTinta,
                        indicatorColor = c.acaoSuave, unselectedIconColor = c.tinta2, unselectedTextColor = c.tinta2,
                    ),
                )
            }
        }
    }
}

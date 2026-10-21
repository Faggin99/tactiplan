package com.faggin.tactiplan.app.ui.comum

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.design.TactiPlan

/**
 * Esqueleto das telas: título grande que recolhe ao rolar (LargeTopAppBar do Material 3) e
 * conteúdo que rola (padding 16, espaço 12). Com `aoVoltar`, a seta de voltar na barra (o gesto
 * de voltar do sistema é tratado pela casca). `topo` = faixas fixas acima do conteúdo
 * (só leitura, sem conexão).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TelaRaiz(
    titulo: String,
    aoVoltar: (() -> Unit)? = null,
    acoes: @Composable RowScope.() -> Unit = {},
    pequena: Boolean = false,
    conteudo: @Composable ColumnScope.() -> Unit,
) {
    val c = TactiPlan.cores
    val comportamento = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val cores = TopAppBarDefaults.topAppBarColors(
        containerColor = c.fundo, scrolledContainerColor = c.superficie,
        titleContentColor = c.tinta, navigationIconContentColor = c.acaoTinta, actionIconContentColor = c.acaoTinta,
    )
    val voltar: @Composable () -> Unit = {
        if (aoVoltar != null) IconButton(onClick = aoVoltar) { Icon(Icones.esquerda, contentDescription = "Voltar") }
    }
    Scaffold(
        modifier = Modifier.fillMaxSize().nestedScroll(comportamento.nestedScrollConnection),
        containerColor = c.fundo,
        contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
        topBar = {
            if (pequena) {
                TopAppBar(
                    title = { Text(titulo, style = TactiPlan.tipos.cabecalho17, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    navigationIcon = voltar, actions = acoes, scrollBehavior = comportamento,
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = c.fundo, scrolledContainerColor = c.superficie, titleContentColor = c.tinta,
                        navigationIconContentColor = c.acaoTinta, actionIconContentColor = c.acaoTinta,
                    ),
                )
            } else {
                LargeTopAppBar(
                    title = { Text(titulo, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    navigationIcon = voltar, actions = acoes, scrollBehavior = comportamento, colors = cores,
                )
            }
        },
    ) { dentro ->
        Column(
            Modifier
                .padding(dentro)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
                .padding(top = 4.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = conteudo,
        )
    }
}

@Composable
fun LinhaDeAcoes(conteudo: @Composable RowScope.() -> Unit) =
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), content = conteudo)

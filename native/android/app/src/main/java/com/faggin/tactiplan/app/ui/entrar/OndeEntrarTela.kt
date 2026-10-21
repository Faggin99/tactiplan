package com.faggin.tactiplan.app.ui.entrar

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.Convite
import com.faggin.tactiplan.app.dados.EstadoApp
import com.faggin.tactiplan.app.dados.OpcaoEntrada
import com.faggin.tactiplan.app.dados.TEXTO_SEM_EQUIPE
import com.faggin.tactiplan.app.dados.TEXTO_TROCAR_DEPOIS
import com.faggin.tactiplan.app.dados.TITULO_ONDE_ENTRAR
import com.faggin.tactiplan.app.dados.TITULO_SEM_EQUIPE
import com.faggin.tactiplan.app.dados.coresDoClube
import com.faggin.tactiplan.app.dados.logoDoClube
import com.faggin.tactiplan.app.dados.mensagemDeErro
import com.faggin.tactiplan.app.dados.opcoesDeEntrada
import com.faggin.tactiplan.app.dados.primeiroNome
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.design.cor
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.Divisoria
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaSemConexao
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.ListaAgrupada
import com.faggin.tactiplan.app.ui.comum.LinhaAgrupada
import com.faggin.tactiplan.app.ui.comum.LogoClube
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import kotlinx.coroutines.launch

/**
 * "Onde entrar" (escolha de clube + convites pendentes). Uma linha por clube (conta + clube), com a
 * logo e a cor do clube, o papel e o aviso de só leitura. Convites no topo, aceitos com um toque.
 * Na troca (vindo do Mais), a seta volta ao clube atual. Paridade: Entrar/OndeEntrarTela.swift.
 */
@Composable
fun OndeEntrarTela(
    estado: EstadoApp.OndeEntrar,
    semConexao: Boolean,
    escolher: (OpcaoEntrada) -> Unit,
    aceitar: suspend (Convite) -> Unit,
    voltar: () -> Unit,
    sair: () -> Unit,
) {
    val me = estado.sessao.me
    val opcoes = remember(me) { opcoesDeEntrada(me) }
    val troca = estado.atual != null
    val escopo = rememberCoroutineScope()
    var aceitando by remember { mutableStateOf<String?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    val c = TactiPlan.cores
    if (troca) BackHandler { voltar() }

    TelaRaiz(
        TITULO_ONDE_ENTRAR,
        aoVoltar = if (troca) voltar else null,
        acoes = {
            if (!troca) IconButton(onClick = sair, modifier = Modifier.testTag("onde:sair")) {
                Icon(Icones.sair, contentDescription = "Sair")
            }
        },
    ) {
        val nome = primeiroNome(me.usuario.nome)
        Text(
            if (nome != null) "Olá, $nome. Escolha o clube de hoje." else "Escolha o clube de hoje.",
            style = TactiPlan.tipos.corpo15, color = c.tinta2,
        )
        if (semConexao) FaixaSemConexao(estado.sessao.meEm)
        erro?.let { FaixaTom(it, Tom.ERRO) }

        if (me.convites.isNotEmpty()) {
            RotuloSecao(if (me.convites.size == 1) "Convite pendente" else "Convites pendentes", Modifier.padding(top = 4.dp))
            me.convites.forEach { cv ->
                Cartao {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        LogoClube(null, cv.clubeNome ?: cv.workspaceNome ?: "?", c.heroi, c.sobreHeroi)
                        Column(Modifier.fillMaxWidth()) {
                            Text(cv.clubeNome ?: cv.workspaceNome ?: "Equipe", style = TactiPlan.tipos.corpo15,
                                fontWeight = FontWeight.SemiBold, color = c.tinta)
                            val quem = cv.convidadoPor?.let { "$it convidou você" } ?: "Convidou você"
                            Text("$quem como ${cv.papelRotulo ?: "comissão"}", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                        }
                    }
                    Botao(
                        if (aceitando == cv.token) "Aceitando…" else "Aceitar convite",
                        {
                            aceitando = cv.token
                            erro = null
                            escopo.launch {
                                try { aceitar(cv) } catch (e: Exception) { erro = mensagemDeErro(e) }
                                aceitando = null
                            }
                        },
                        habilitado = aceitando == null,
                        modifier = Modifier.padding(top = 12.dp).testTag("onde:aceitar"),
                    )
                }
            }
        }

        if (opcoes.isEmpty()) {
            if (me.convites.isEmpty()) EstadoVazio(Icones.grupo, TITULO_SEM_EQUIPE, TEXTO_SEM_EQUIPE)
        } else {
            ListaAgrupada("Seus clubes") {
                opcoes.forEachIndexed { i, o ->
                    if (i > 0) Divisoria()
                    val cores = coresDoClube(o.personalizacao, c.escuro)
                    LinhaAgrupada(
                        Icones.escudo, o.titulo, o.subtitulo,
                        aoTocar = { escolher(o) },
                        final = {
                            LogoClube(logoDoClube(o.personalizacao, c.escuro), o.titulo, cores.acao.cor, cores.sobreAcao.cor)
                        },
                        selo = o.papelRotulo,
                    )
                }
            }
            Text(TEXTO_TROCAR_DEPOIS, style = TactiPlan.tipos.corpo13, color = c.tinta2)
        }
        if (troca) Botao("Voltar ao clube atual", voltar, variante = VarianteBotao.NEUTRO)
    }
}

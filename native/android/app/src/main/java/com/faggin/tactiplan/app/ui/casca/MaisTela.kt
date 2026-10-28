package com.faggin.tactiplan.app.ui.casca

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.BuildConfig
import com.faggin.tactiplan.app.dados.ACAO_PADRAO
import com.faggin.tactiplan.app.dados.SUPORTE_TELEFONE
import com.faggin.tactiplan.app.dados.SUPORTE_TELEFONE_ROTULO
import com.faggin.tactiplan.app.dados.TEXTO_CORES_CLUBE
import com.faggin.tactiplan.app.dados.contagem
import com.faggin.tactiplan.app.dados.corDoClube
import com.faggin.tactiplan.app.dados.coresDoClube
import com.faggin.tactiplan.app.dados.logoDoClube
import com.faggin.tactiplan.app.dados.rotuloVersao
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.design.cor
import com.faggin.tactiplan.app.ui.comum.AvatarIniciais
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.Divisoria
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.LinhaAgrupada
import com.faggin.tactiplan.app.ui.comum.ListaAgrupada
import com.faggin.tactiplan.app.ui.comum.LogoClube
import com.faggin.tactiplan.app.ui.comum.MarcaTactiPlan
import com.faggin.tactiplan.app.ui.comum.Pastilha
import com.faggin.tactiplan.app.ui.comum.SecaoSeguranca
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import com.faggin.tactiplan.app.ui.comum.rememberAbrirLink

import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import com.faggin.tactiplan.app.dados.cadastros.corpoRelatorioClube
import com.faggin.tactiplan.app.dados.cadastros.nomePdfRelatorioClube
import com.faggin.tactiplan.app.dados.treino.hojeBrasilia
import com.faggin.tactiplan.app.ui.cadastros.Cadastro
import com.faggin.tactiplan.app.ui.cadastros.CadastroTela
import com.faggin.tactiplan.app.ui.semana.InicioExportar
import com.faggin.tactiplan.app.ui.semana.gerarECompartilhar
import kotlinx.coroutines.launch

const val TAG_SAIR = "mais:sair"
const val TAG_CONFIRMAR_SAIR = "mais:confirmar-sair"

/**
 * Mais (lista agrupada, padrão Gestsport): perfil, clube (trocar + cores e logo), aparência,
 * segurança, conta (privacidade, termos, suporte), Sair e a versão. Não existe "Assinatura",
 * "Plano" nem preço em lugar nenhum.
 */
@Composable
fun MaisTela(amb: AmbienteClube) {
    var vendoCores by rememberSaveable { mutableStateOf(false) }
    if (vendoCores) {
        BackHandler { vendoCores = false }
        CoresDoClubeTela(amb) { vendoCores = false }
        return
    }
    var cadastro by rememberSaveable { mutableStateOf<Cadastro?>(null) }
    val t3 = amb.t3
    cadastro?.let { qual ->
        if (t3 != null) { CadastroTela(amb, t3, qual) { cadastro = null }; return }
    }
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    var gerandoRelatorio by remember { mutableStateOf(false) }
    var avisoRelatorio by remember { mutableStateOf<String?>(null) }
    var confirmarSair by rememberSaveable { mutableStateOf(false) }
    val abrir = rememberAbrirLink()
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val coresClube = coresDoClube(ctx.clube?.personalizacao, c.escuro)

    TelaRaiz("Mais") {
        FaixasDoTopo(amb)
        Cartao {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                AvatarIniciais(amb.nomePessoa, 52.dp)
                Column(Modifier.weight(1f)) {
                    Text(amb.nomePessoa.ifEmpty { "—" }, style = TactiPlan.tipos.corpo17, fontWeight = FontWeight.SemiBold, color = c.tinta)
                    Text(amb.email, style = TactiPlan.tipos.corpo13, color = c.tinta2)
                    Box(Modifier.padding(top = 4.dp)) { Pastilha("${ctx.papelRotulo} · ${ctx.nome}", Tom.INFO) }
                }
            }
        }

        ListaAgrupada("Clube") {
            LinhaAgrupada(
                Icones.escudo, ctx.nome, "Trocar clube",
                selo = if (amb.convitesPendentes > 0) contagem(amb.convitesPendentes, "convite", "convites") else null,
                aoTocar = amb.trocarClube,
                final = {
                    LogoClube(logoDoClube(ctx.clube?.personalizacao, c.escuro), ctx.nome, coresClube.acao.cor, coresClube.sobreAcao.cor, 30.dp)
                },
            )
            if (ctx.clube != null) {
                Divisoria()
                LinhaAgrupada(Icones.paleta, "Cores e logo do clube", "Ver · a edição fica no TactiPlan web", aoTocar = { vendoCores = true })
            }
        }

        if (t3 != null) {
            ListaAgrupada("Cadastros") {
                LinhaAgrupada(Icones.trofeu, "Campeonatos", aoTocar = { cadastro = Cadastro.CAMPEONATOS })
                Divisoria()
                LinhaAgrupada(Icones.camadas, "Categorias", aoTocar = { cadastro = Cadastro.CATEGORIAS })
                Divisoria()
                LinhaAgrupada(Icones.escudo, "Clubes", "Ativos e arquivados", aoTocar = { cadastro = Cadastro.CLUBES })
                Divisoria()
                LinhaAgrupada(Icones.prancheta, "Conteúdos e submomentos", aoTocar = { cadastro = Cadastro.CONTEUDOS })
                Divisoria()
                LinhaAgrupada(Icones.relogio, "Atividades (biblioteca)", aoTocar = { cadastro = Cadastro.ATIVIDADES })
            }
            val clubeId = ctx.clube?.id
            if (clubeId != null && ctx.pode("stats:view") && ctx.conta.somenteLeitura != true && amb.treino != null) {
                ListaAgrupada("Relatórios") {
                    val ano = hojeBrasilia().take(4)
                    LinhaAgrupada(Icones.documento, if (gerandoRelatorio) "Gerando…" else "Relatório do clube (PDF)",
                        "Plantel, treinos e jogos de $ano", aoTocar = {
                            if (!gerandoRelatorio) {
                                gerandoRelatorio = true; avisoRelatorio = null
                                escopo.launch {
                                    val r = gerarECompartilhar(context, amb.treino.api, "clube", corpoRelatorioClube(clubeId, ano),
                                        nomePdfRelatorioClube(ctx.nome, ano), amb.tratarErro)
                                    if (r is InicioExportar.Erro) avisoRelatorio = r.mensagem
                                    gerandoRelatorio = false
                                }
                            }
                        })
                }
                avisoRelatorio?.let { com.faggin.tactiplan.app.ui.comum.FaixaTom(it, Tom.AVISO) }
            }
        }

        ListaAgrupada("Aparência") {
            val escolha = com.faggin.tactiplan.app.ui.LocalEscolhaTema.current
            LinhaAgrupada(Icones.contrasteIcone, "Tema", com.faggin.tactiplan.app.dados.TEXTO_MODO_TEMA)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                val modos = com.faggin.tactiplan.app.dados.ModoTema.entries
                modos.forEachIndexed { i, m ->
                    SegmentedButton(
                        selected = escolha.modo == m, onClick = { escolha.mudar(m) },
                        shape = SegmentedButtonDefaults.itemShape(i, modos.size),
                        colors = SegmentedButtonDefaults.colors(
                            activeContainerColor = TactiPlan.cores.acaoSuave, activeContentColor = TactiPlan.cores.acaoTinta),
                        modifier = Modifier.testTag("mais:tema:${m.chave}"),
                    ) { Text(m.rotulo) }
                }
            }
        }

        SecaoSeguranca()

        ListaAgrupada("Conta") {
            LinhaAgrupada(Icones.documento, "Política de privacidade", aoTocar = { abrir.abrir(amb.privacidadeUrl) })
            Divisoria()
            LinhaAgrupada(Icones.documento, "Termos de uso", aoTocar = { abrir.abrir(amb.termosUrl) })
            Divisoria()
            LinhaAgrupada(Icones.mensagem, "Suporte", "WhatsApp $SUPORTE_TELEFONE_ROTULO",
                aoTocar = { abrir.abrir("https://wa.me/$SUPORTE_TELEFONE") })
        }

        Botao("Sair", { confirmarSair = true }, variante = VarianteBotao.NEUTRO, icone = Icones.sair,
            modifier = Modifier.testTag(TAG_SAIR))

        Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)) {
            MarcaTactiPlan(28.dp, comNome = false)
            Text(rotuloVersao(BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE.toString()),
                style = TactiPlan.tipos.corpo13, color = c.tinta2, textAlign = TextAlign.Center)
        }
    }

    if (confirmarSair) {
        AlertDialog(
            onDismissRequest = { confirmarSair = false },
            title = { Text("Sair do TactiPlan?") },
            text = { Text("Você precisa entrar de novo com o seu e-mail para voltar.") },
            confirmButton = {
                TextButton(onClick = { confirmarSair = false; amb.sair() }, modifier = Modifier.testTag(TAG_CONFIRMAR_SAIR)) {
                    Text("Sair", color = c.erro, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = { TextButton(onClick = { confirmarSair = false }) { Text("Cancelar", color = c.tinta) } },
            containerColor = c.superficie, titleContentColor = c.tinta, textContentColor = c.tinta2,
        )
    }
}

/** Cores e logo do clube (só visualização: a edição é no web). */
@Composable
fun CoresDoClubeTela(amb: AmbienteClube, voltar: () -> Unit) {
    val ctx = amb.contexto
    val p = ctx.clube?.personalizacao
    val c = TactiPlan.cores
    TelaRaiz("Cores e logo", aoVoltar = voltar, pequena = true) {
        Cartao {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                val cl = coresDoClube(p, c.escuro)
                LogoClube(logoDoClube(p, c.escuro), ctx.nome, cl.acao.cor, cl.sobreAcao.cor, 64.dp)
                Column {
                    Text(ctx.nome, style = TactiPlan.tipos.corpo17, fontWeight = FontWeight.SemiBold, color = c.tinta)
                    Text(if (p?.logoUrl.isNullOrEmpty()) "Sem logo cadastrada" else "Logo do clube",
                        style = TactiPlan.tipos.corpo13, color = c.tinta2)
                }
            }
        }
        listOf(false to "Tema claro", true to "Tema escuro").forEach { (escuro, rotulo) ->
            val cl = coresDoClube(p, escuro)
            val hex = corDoClube(p, escuro)
            Cartao {
                Text(rotulo, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
                Text(hex ?: "Cor padrão do TactiPlan ($ACAO_PADRAO)", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                Box(
                    Modifier.padding(top = 12.dp).fillMaxWidth().height(52.dp).clip(RoundedCornerShape(14.dp))
                        .background(cl.acao.cor).border(1.dp, Color.Black.copy(alpha = 0.06f), RoundedCornerShape(14.dp)),
                    contentAlignment = Alignment.Center,
                ) { Text("Salvar", color = cl.sobreAcao.cor, fontWeight = FontWeight.SemiBold, style = TactiPlan.tipos.corpo15) }
            }
        }
        Text(TEXTO_CORES_CLUBE, style = TactiPlan.tipos.corpo13, color = c.tinta2)
    }
}

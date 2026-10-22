package com.faggin.tactiplan.app.ui.elenco

import androidx.compose.foundation.clickable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.elenco.CategoriaCadastro
import com.faggin.tactiplan.app.dados.staff.Equipe
import com.faggin.tactiplan.app.dados.staff.GRUPOS_PERMISSAO_APP
import com.faggin.tactiplan.app.dados.staff.MSG_CATEGORIAS_CONVITE
import com.faggin.tactiplan.app.dados.staff.MSG_EMAIL_CONVITE
import com.faggin.tactiplan.app.dados.staff.MSG_LIMITE_EQUIPE
import com.faggin.tactiplan.app.dados.staff.MSG_SO_DONO_EQUIPE
import com.faggin.tactiplan.app.dados.staff.Membro
import com.faggin.tactiplan.app.dados.staff.PADROES_PAPEL
import com.faggin.tactiplan.app.dados.staff.PAPEIS_CONVITE
import com.faggin.tactiplan.app.dados.staff.ROTULOS_PERMISSAO
import com.faggin.tactiplan.app.dados.staff.corpoConvite
import com.faggin.tactiplan.app.dados.staff.corpoMembro
import com.faggin.tactiplan.app.dados.staff.descricaoPapel
import com.faggin.tactiplan.app.dados.staff.emailValido
import com.faggin.tactiplan.app.dados.staff.escopoDoMembro
import com.faggin.tactiplan.app.dados.staff.mensagemErroStaff
import com.faggin.tactiplan.app.dados.staff.podeConvidar
import com.faggin.tactiplan.app.dados.staff.resumoPermissoes
import com.faggin.tactiplan.app.dados.staff.rotuloPapelStaff
import com.faggin.tactiplan.app.dados.staff.textoConvite
import com.faggin.tactiplan.app.dados.staff.textoLimiteEquipe
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.comum.AvatarIniciais
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Campo
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.CartaoHeroi
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.Pastilha
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import com.faggin.tactiplan.app.ui.t3.Carregavel
import com.faggin.tactiplan.app.ui.t3.Confirmar
import com.faggin.tactiplan.app.ui.t3.LinhaChips
import com.faggin.tactiplan.app.ui.t3.Seletor
import com.faggin.tactiplan.app.ui.t3.ServicosT3
import com.faggin.tactiplan.app.ui.t3.compartilharTexto
import kotlinx.coroutines.launch

/** Staff: comissão do clube (dono, membros, convites pendentes), convidar, editar, remover, reenviar. */
@Composable
fun ColumnScope.StaffConteudo(amb: AmbienteClube, t3: ServicosT3, categorias: List<CategoriaCadastro>) {
    val ctx = amb.contexto
    val c = TactiPlan.cores
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    val clubeId = ctx.clube?.id
    var equipe by remember { mutableStateOf<Equipe?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var versao by remember { mutableIntStateOf(0) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var editando by remember { mutableStateOf<Membro?>(null) }
    var convidando by remember { mutableStateOf(false) }
    var remover by remember { mutableStateOf<Membro?>(null) }

    LaunchedEffect(clubeId, versao) {
        if (clubeId == null) return@LaunchedEffect
        try { equipe = t3.staff.equipe(clubeId); erro = null } catch (e: Exception) {
            if (!amb.tratarErro(e)) erro = mensagemErroStaff(e)
        }
    }
    if (clubeId == null) {
        EstadoVazio(Icones.grupo, "Nenhum clube nesta conta", "A comissão técnica aparece aqui quando houver um clube.")
        return
    }
    val nomesCat = categorias.associate { it.id to it.rotulo }
    aviso?.let { FaixaTom(it, Tom.INFO) }
    Carregavel(equipe == null && erro == null, erro.takeIf { equipe == null }, { versao++ }) {
        val e = equipe ?: return@Carregavel
        val gerencia = e.ehDono && ctx.podeEditar("members:manage")
        if (gerencia) {
            val livre = podeConvidar(e.usados, e.limite)
            CartaoHeroi(
                rotulo = "Comissão · ${ctx.nome}", valor = "Convidar para a comissão",
                frase = textoLimiteEquipe(e.usados, e.limite) ?: "Link por WhatsApp ou e-mail",
                modifier = Modifier.clickable(role = Role.Button) { if (livre) convidando = true else aviso = MSG_LIMITE_EQUIPE }
                    .testTag("staff:convidar"),
            )
        } else {
            FaixaTom(MSG_SO_DONO_EQUIPE, Tom.NEUTRO, Icones.cadeado)
        }
        RotuloSecao("Comissão · ${ctx.nome}")
        Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
            e.owner?.let { o -> LinhaPessoa(o.name ?: o.email ?: "Responsável", "Proprietário · todas as categorias", "Dono", null) }
            e.ativos.forEach { m ->
                HorizontalDivider(color = c.borda)
                LinhaPessoa(m.nomeExibido, "${rotuloPapelStaff(m.role)} · ${escopoDoMembro(m, nomesCat)}", null,
                    aoTocar = if (gerencia) ({ editando = m }) else null,
                    resumo = resumoPermissoes(m.efetivas).joinToString("\n"), tag = "staff:membro:${m.id}")
            }
            if (e.members.isEmpty()) Text("Você ainda não convidou ninguém.", style = TactiPlan.tipos.corpo15, color = c.tinta2,
                modifier = Modifier.padding(vertical = 12.dp))
        }
        if (e.pendentes.isNotEmpty()) {
            RotuloSecao("Convites pendentes")
            Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                e.pendentes.forEachIndexed { i, m ->
                    if (i > 0) HorizontalDivider(color = c.borda)
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).testTag("staff:pendente:${m.id}"), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icones.mensagem, null, tint = c.tinta2, modifier = Modifier.size(18.dp))
                        Column(Modifier.weight(1f)) {
                            Text(m.emailExibido, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
                            Text("${rotuloPapelStaff(m.role)} · convite enviado", style = TactiPlan.tipos.corpo13, color = c.tinta2)
                        }
                        if (gerencia) {
                            IconButton(onClick = {
                                escopo.launch {
                                    try {
                                        val url = t3.staff.reenviar(clubeId, m.id)
                                        aviso = "Convite reenviado para ${m.emailExibido}."
                                        url?.let { compartilharTexto(context, textoConvite(ctx.nome, it))?.let { f -> aviso = f } }
                                    } catch (x: Exception) { if (!amb.tratarErro(x)) aviso = mensagemErroStaff(x) }
                                }
                            }, modifier = Modifier.testTag("staff:reenviar:${m.id}")) { Icon(Icones.compartilhar, contentDescription = "Reenviar convite") }
                            IconButton(onClick = { remover = m }) { Icon(Icones.lixeira, contentDescription = "Cancelar convite", tint = c.tinta2) }
                        }
                    }
                }
            }
        }
    }
    if (convidando) FolhaMembro(null, categorias, fechar = { convidando = false }) { email, papel, cats, perms, _ ->
        try {
            val url = t3.staff.convidar(clubeId, corpoConvite(email, papel, cats, perms))
            convidando = false
            aviso = "Convite enviado para $email."
            url?.let { compartilharTexto(context, textoConvite(ctx.nome, it))?.let { f -> aviso = f } }
            versao++
            null
        } catch (x: Exception) { if (amb.tratarErro(x)) null else mensagemErroStaff(x) }
    }
    editando?.let { m ->
        FolhaMembro(m, categorias, fechar = { editando = null }, remover = { editando = null; remover = m }) { _, papel, cats, perms, mexeu ->
            try {
                t3.staff.atualizar(clubeId, m.id, corpoMembro(papel, cats, perms, mexeu))
                editando = null; aviso = "Permissões de ${m.nomeExibido} salvas."; versao++
                null
            } catch (x: Exception) { if (amb.tratarErro(x)) null else mensagemErroStaff(x) }
        }
    }
    remover?.let { m ->
        Confirmar(if (m.pendente) "Cancelar convite" else "Remover membro",
            if (m.pendente) "Cancelar o convite de ${m.emailExibido}? O link deixa de funcionar." else "Remover ${m.nomeExibido}? Perde acesso imediato.",
            if (m.pendente) "Cancelar convite" else "Remover", aoCancelar = { remover = null }, aoConfirmar = {
                remover = null
                escopo.launch {
                    try { t3.staff.remover(clubeId, m.id); versao++ } catch (x: Exception) { if (!amb.tratarErro(x)) aviso = mensagemErroStaff(x) }
                }
            })
    }
}

@Composable
private fun LinhaPessoa(nome: String, detalhe: String, selo: String?, aoTocar: (() -> Unit)? = null, resumo: String? = null, tag: String = "") {
    val c = TactiPlan.cores
    Row(
        Modifier.fillMaxWidth().heightIn(min = 56.dp).then(if (aoTocar != null) Modifier.clickable(role = Role.Button, onClick = aoTocar) else Modifier)
            .padding(vertical = 8.dp).testTag(tag),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AvatarIniciais(nome, 40.dp)
        Column(Modifier.weight(1f)) {
            Text(nome, style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
            Text(detalhe, style = TactiPlan.tipos.corpo13, color = c.tinta2)
            if (!resumo.isNullOrEmpty()) Text(resumo, style = TactiPlan.tipos.legenda11, color = c.tinta2, modifier = Modifier.padding(top = 2.dp))
        }
        if (selo != null) Pastilha(selo, Tom.INFO)
        if (aoTocar != null) Icon(Icones.direita, null, tint = c.tinta3, modifier = Modifier.size(18.dp))
    }
}

/**
 * Convidar (membro null) ou editar: e-mail, papel, categorias e permissões por área com
 * interruptores. `salvar` devolve a mensagem de erro (null = ok). `mexeu` = tocou nas permissões.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FolhaMembro(
    membro: Membro?, categorias: List<CategoriaCadastro>, fechar: () -> Unit, remover: (() -> Unit)? = null,
    salvar: suspend (email: String, papel: String, cats: List<String>?, perms: List<String>?, mexeu: Boolean) -> String?,
) {
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var papel by remember { mutableStateOf(membro?.role?.takeIf { it in PAPEIS_CONVITE } ?: membro?.role ?: "head_coach") }
    var todas by remember { mutableStateOf(membro?.categorias.isNullOrEmpty()) }
    var cats by remember { mutableStateOf(membro?.categorias.orEmpty().toSet()) }
    var perms by remember { mutableStateOf(membro?.permissions?.toSet()) }
    var mexeu by remember { mutableStateOf(false) }
    var erro by remember { mutableStateOf<String?>(null) }
    var ocupado by remember { mutableStateOf(false) }
    val efetivas = perms ?: PADROES_PAPEL[papel].orEmpty().toSet()
    ModalBottomSheet(onDismissRequest = fechar, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.fundo) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 32.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (membro == null) "Convidar para a comissão" else "Editar permissões", style = TactiPlan.tipos.titulo20, color = c.tinta)
            if (membro != null) Text(membro.emailExibido, style = TactiPlan.tipos.corpo13, color = c.tinta2)
            erro?.let { FaixaTom(it, Tom.AVISO) }
            if (membro == null) Campo(email, { email = it }, "E-mail *", Modifier.testTag("convite:email"), teclado = KeyboardType.Email)
            Seletor("Papel", papel, (PAPEIS_CONVITE + listOfNotNull(membro?.role?.takeIf { it !in PAPEIS_CONVITE })).map { it to rotuloPapelStaff(it) },
                { p -> papel = p ?: papel; if (!mexeu) perms = null }, tag = "convite:papel")
            Text(descricaoPapel(papel), style = TactiPlan.tipos.corpo13, color = c.tinta2)
            if (categorias.isNotEmpty()) {
                Text("Acesso a categorias", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta)
                LinhaChips(listOf("todas" to "Todas as categorias do clube", "algumas" to "Apenas categorias específicas…"),
                    if (todas) "todas" else "algumas", { todas = it == "todas" }, "convite:escopo")
                if (!todas) categorias.forEach { k ->
                    LinhaSwitch(k.rotulo, k.id in cats) { on -> cats = if (on) cats + k.id else cats - k.id }
                }
                Text("Quando limitado, o membro só vê e edita dados das categorias selecionadas.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Permissões", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta, modifier = Modifier.weight(1f))
                if (perms != null) androidx.compose.material3.TextButton(onClick = { perms = null; mexeu = true }) { Text("Voltar ao padrão do papel") }
            }
            GRUPOS_PERMISSAO_APP.forEach { g ->
                Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 6.dp)) {
                    Text(g.rotulo, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta2)
                    g.itens.forEach { p ->
                        LinhaSwitch(ROTULOS_PERMISSAO[p] ?: p, p in efetivas, tag = "convite:perm:$p") { on ->
                            perms = if (on) efetivas + p else efetivas - p
                            mexeu = true
                        }
                    }
                }
            }
            Botao(if (ocupado) "Salvando…" else if (membro == null) "Enviar convite" else "Salvar", {
                val catsFinal = if (todas) null else cats.toList()
                erro = when {
                    membro == null && !emailValido(email) -> MSG_EMAIL_CONVITE
                    !todas && cats.isEmpty() -> MSG_CATEGORIAS_CONVITE
                    else -> null
                }
                if (erro == null) escopo.launch {
                    ocupado = true
                    erro = salvar(email, papel, catsFinal, perms?.toList(), mexeu || membro == null)
                    ocupado = false
                }
            }, Modifier.testTag("convite:salvar"), habilitado = !ocupado)
            if (remover != null) Botao("Remover da comissão", remover, variante = VarianteBotao.PERIGO, icone = Icones.lixeira)
        }
    }
}

@Composable
private fun LinhaSwitch(rotulo: String, ligado: Boolean, tag: String = "", aoMudar: (Boolean) -> Unit) {
    val c = TactiPlan.cores
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(rotulo, style = TactiPlan.tipos.corpo15, color = c.tinta, modifier = Modifier.weight(1f))
        Switch(checked = ligado, onCheckedChange = aoMudar, modifier = Modifier.testTag(tag),
            colors = SwitchDefaults.colors(checkedTrackColor = c.acao, checkedThumbColor = c.sobreAcao))
    }
}

package com.faggin.tactiplan.app.ui.jogos

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.jogo.ApiJogo
import com.faggin.tactiplan.app.dados.jogo.CampoAnalise
import com.faggin.tactiplan.app.dados.jogo.PAPEL_VAGA
import com.faggin.tactiplan.app.dados.jogo.SECOES_ANALISE
import com.faggin.tactiplan.app.dados.jogo.corpoRelatorioJogo
import com.faggin.tactiplan.app.dados.jogo.gravarEm
import com.faggin.tactiplan.app.dados.jogo.jogadorDaVaga
import com.faggin.tactiplan.app.dados.jogo.lerEm
import com.faggin.tactiplan.app.dados.jogo.listaComoTexto
import com.faggin.tactiplan.app.dados.jogo.mensagemErroJogo
import com.faggin.tactiplan.app.dados.jogo.mudarJogadorDaVaga
import com.faggin.tactiplan.app.dados.jogo.nomePdfAnalise
import com.faggin.tactiplan.app.dados.jogo.numeroEm
import com.faggin.tactiplan.app.dados.jogo.secaoPreenchida
import com.faggin.tactiplan.app.dados.jogo.textoComoLista
import com.faggin.tactiplan.app.dados.jogo.textoEm
import com.faggin.tactiplan.app.dados.jogo.vagasLivres
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.casca.AmbienteClube
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Campo
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import com.faggin.tactiplan.app.ui.semana.InicioExportar
import com.faggin.tactiplan.app.ui.semana.gerarECompartilhar
import com.faggin.tactiplan.app.ui.t3.Seletor
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Análise do adversário no app: lista das 13 seções (● = preenchida) → formulário da seção,
 *  gerado pelo esquema (dados/jogo/Analise.kt), o mesmo do web. Salvar = PUT; Gerar PDF salva antes. */
@Composable
fun AnaliseTela(amb: AmbienteClube, api: ApiJogo, sessaoId: String, adversario: String, data: String, editavel: Boolean, voltar: () -> Unit) {
    val c = TactiPlan.cores
    val context = LocalContext.current
    val escopo = rememberCoroutineScope()
    var dados by remember { mutableStateOf<JsonElement?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var secao by remember { mutableStateOf<String?>(null) }
    var sujo by remember { mutableStateOf(false) }
    var salvando by remember { mutableStateOf(false) }
    var gerando by remember { mutableStateOf(false) }
    var aviso by remember { mutableStateOf<String?>(null) }
    var sair by remember { mutableStateOf(false) }

    LaunchedEffect(sessaoId) {
        try { dados = api.analise(sessaoId) } catch (e: Exception) { if (!amb.tratarErro(e)) erro = mensagemErroJogo(e) }
    }

    fun mudar(novo: JsonElement) { dados = novo; sujo = true }
    suspend fun salvar(): Boolean {
        val d = dados ?: return false
        salvando = true
        return try {
            dados = api.salvarAnalise(sessaoId, d); sujo = false; aviso = "Análise salva."; true
        } catch (e: Exception) {
            if (!amb.tratarErro(e)) aviso = mensagemErroJogo(e); false
        } finally { salvando = false }
    }
    fun gerarPdf() {
        if (gerando) return
        escopo.launch {
            if (sujo && editavel && !salvar()) return@launch
            gerando = true
            val r = gerarECompartilhar(context, amb.treino!!.api, "analise", corpoRelatorioJogo(sessaoId), nomePdfAnalise(adversario, data), amb.tratarErro)
            if (r is InicioExportar.Erro) aviso = r.mensagem
            gerando = false
        }
    }
    val tentarVoltar: () -> Unit = { if (secao != null) secao = null else if (sujo && editavel) sair = true else voltar() }
    BackHandler(onBack = tentarVoltar)

    if (sair) AlertDialog(
        onDismissRequest = { sair = false },
        title = { Text("Sair sem salvar?") },
        text = { Text("As alterações da análise ainda não foram salvas.") },
        confirmButton = { TextButton(onClick = { sair = false; voltar() }) { Text("Descartar") } },
        dismissButton = { TextButton(onClick = { sair = false; escopo.launch { if (salvar()) voltar() } }) { Text("Salvar") } },
    )

    val titulo = secao?.let { k -> SECOES_ANALISE.first { it.chave == k }.titulo } ?: "Análise · $adversario"
    TelaRaiz(titulo, aoVoltar = tentarVoltar, pequena = true, acoes = {
        IconButton(onClick = ::gerarPdf, enabled = dados != null && !gerando, modifier = Modifier.testTag("analise:pdf")) {
            if (gerando) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = c.acaoTinta)
            else Icon(Icones.compartilhar, "Gerar PDF da análise")
        }
        if (editavel) TextButton(onClick = { escopo.launch { salvar() } }, enabled = sujo && !salvando, modifier = Modifier.testTag("analise:salvar")) {
            if (salvando) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            else Text("Salvar", fontWeight = FontWeight.Bold, color = if (sujo) c.acaoTinta else c.tinta3)
        }
    }) {
        aviso?.let { FaixaTom(it, Tom.INFO) }
        erro?.let { FaixaTom(it, Tom.ERRO); return@TelaRaiz }
        val d = dados
        if (d == null) { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@TelaRaiz }
        val atual = secao
        if (atual == null) {
            Text("O PDF mostra só o que estiver preenchido.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                SECOES_ANALISE.forEachIndexed { i, s ->
                    if (i > 0) HorizontalDivider(color = c.borda)
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button) { secao = s.chave }.testTag("analise:secao:${s.chave}"),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(if (secaoPreenchida(d, s.chave)) c.acao else c.borda))
                        Text(s.titulo, style = TactiPlan.tipos.corpo15, color = c.tinta, modifier = Modifier.weight(1f))
                        Icon(Icones.direita, null, tint = c.tinta3)
                    }
                }
            }
            Botao("Gerar PDF", ::gerarPdf, Modifier.fillMaxWidth(), VarianteBotao.SECUNDARIO, !gerando, icone = Icones.documento)
        } else {
            val s = SECOES_ANALISE.first { it.chave == atual }
            s.campos.forEach { campo -> CampoDaAnalise(campo, d, emptyList(), editavel, ::mudar) }
        }
    }
}

/** Um campo do esquema. `base` = caminho do item (campos de Repetir são relativos ao item). */
@Composable
private fun CampoDaAnalise(campo: CampoAnalise, d: JsonElement, base: List<String>, editavel: Boolean, mudar: (JsonElement) -> Unit) {
    val c = TactiPlan.cores
    val p = base + campo.caminho
    when (campo) {
        is CampoAnalise.Aviso -> Text(campo.rotulo, style = TactiPlan.tipos.corpo13, color = c.tinta2)
        is CampoAnalise.Texto -> Campo(textoEm(d, p), { mudar(gravarEm(d, p, JsonPrimitive(it.take(campo.max)))) }, campo.rotulo,
            Modifier.fillMaxWidth(), habilitado = editavel)
        is CampoAnalise.Numero -> Campo(numeroEm(d, p)?.toString() ?: "", { s ->
            val v = s.filter(Char::isDigit).take(3).toIntOrNull()?.coerceAtMost(campo.max)
            mudar(gravarEm(d, p, v?.let { JsonPrimitive(it) } ?: JsonNull))
        }, campo.rotulo, Modifier.fillMaxWidth(), teclado = KeyboardType.Number, habilitado = editavel)
        is CampoAnalise.TextoLongo -> Multilinha(campo.rotulo, textoEm(d, p), editavel) { mudar(gravarEm(d, p, JsonPrimitive(it.take(600)))) }
        is CampoAnalise.Lista -> Multilinha(campo.rotulo, listaComoTexto(d, p), editavel, campo.dica) { mudar(gravarEm(d, p, textoComoLista(it))) }
        is CampoAnalise.Escolha -> Seletor(campo.rotulo, textoEm(d, p), campo.opcoes.map { (k, r) -> k to r },
            { mudar(gravarEm(d, p, JsonPrimitive(it ?: ""))) }, habilitado = editavel)
        is CampoAnalise.Repetir -> {
            RotuloSecao(campo.rotulo)
            val lista = (lerEm(d, p) as? JsonArray).orEmpty()
            lista.forEachIndexed { i, _ ->
                Cartao {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("${campo.item} ${i + 1}", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta, modifier = Modifier.weight(1f))
                        if (editavel) IconButton(onClick = { mudar(gravarEm(d, p, JsonArray(lista.filterIndexed { j, _ -> j != i }))) }) {
                            Icon(Icones.lixeira, "Remover ${campo.item.lowercase()} ${i + 1}", tint = c.tinta2)
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        campo.campos.forEach { sub -> CampoDaAnalise(sub, d, p + i.toString(), editavel, mudar) }
                    }
                }
            }
            if (editavel && lista.size < campo.max) Botao("Adicionar ${campo.item.lowercase()}", {
                mudar(gravarEm(d, p, JsonArray(lista + JsonObject(emptyMap()))))
            }, Modifier.fillMaxWidth(), VarianteBotao.SECUNDARIO, icone = Icones.adicionar)
        }
        is CampoAnalise.Escalacao -> {
            val fp = listOf("escalacao", "formacao")
            Campo(textoEm(d, fp), { mudar(gravarEm(d, fp, JsonPrimitive(it.take(12)))) }, "Formação do adversário (ex.: 4-3-3)",
                Modifier.fillMaxWidth(), habilitado = editavel)
            val vagas = vagasLivres(textoEm(d, fp))
            if (vagas.size <= 1) {
                Text("Informe a formação para preencher os titulares no campo.", style = TactiPlan.tipos.corpo13, color = c.tinta2)
            } else {
                RotuloSecao("Titulares (da defesa para o ataque, da esquerda para a direita)")
                vagas.forEach { v ->
                    val j = jogadorDaVaga(d, v.vaga)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(PAPEL_VAGA[v.papel] ?: v.papel, style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.Bold, color = c.tinta2, modifier = Modifier.width(64.dp))
                        Campo(((j?.get("numero") as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content ?: ""), { s ->
                            val n = s.filter(Char::isDigit).take(2).toIntOrNull()
                            mudar(mudarJogadorDaVaga(d, v.vaga, "numero", n?.let { JsonPrimitive(it) } ?: JsonNull))
                        }, "Nº", Modifier.width(76.dp), teclado = KeyboardType.Number, habilitado = editavel)
                        Campo(((j?.get("nome") as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content ?: ""), {
                            mudar(mudarJogadorDaVaga(d, v.vaga, "nome", JsonPrimitive(it.take(80))))
                        }, "Nome", Modifier.weight(1f), habilitado = editavel)
                    }
                }
            }
        }
    }
}

@Composable
private fun Multilinha(rotulo: String, valor: String, editavel: Boolean, dica: String = "", aoMudar: (String) -> Unit) {
    OutlinedTextField(
        value = valor, onValueChange = aoMudar, enabled = editavel, label = { Text(rotulo) },
        placeholder = if (dica.isNotEmpty()) ({ Text(dica) }) else null,
        minLines = 3, modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
        textStyle = TactiPlan.tipos.corpo15.copy(color = TactiPlan.cores.tinta),
    )
}

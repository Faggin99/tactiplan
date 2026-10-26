package com.faggin.tactiplan.app.ui.jogos

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.faggin.tactiplan.app.dados.jogo.AtletaResumo
import com.faggin.tactiplan.app.dados.jogo.DesenhoCampo
import com.faggin.tactiplan.app.dados.jogo.EditorJogo
import com.faggin.tactiplan.app.dados.jogo.JogadorJogo
import com.faggin.tactiplan.app.dados.jogo.PecaCampo
import com.faggin.tactiplan.app.dados.jogo.STATUS_RESERVA
import com.faggin.tactiplan.app.dados.jogo.STATUS_TITULAR
import com.faggin.tactiplan.app.dados.jogo.Vaga
import com.faggin.tactiplan.app.dados.jogo.desenhoDoCampo
import com.faggin.tactiplan.app.dados.jogo.dicaMinutagem
import com.faggin.tactiplan.app.dados.jogo.etiquetaDaVaga
import com.faggin.tactiplan.app.dados.jogo.formacoesDa
import com.faggin.tactiplan.app.dados.jogo.marcadorMinutagem
import com.faggin.tactiplan.app.dados.jogo.nomeCurto
import com.faggin.tactiplan.app.dados.jogo.papelDaVaga
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.Cartao
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.RotuloSecao
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import java.text.Normalizer
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.sqrt

// Escalação: o campo proporcional (medidas oficiais do web/PDF) com as vagas da formação, o
// seletor de atleta da vaga, os relacionados e a lista da convocação.

private val AMARELO = Color(0xFFFACC15)
private val LARANJA = Color(0xFFF59E0B)
private val NAVY = Color(0xFF0F172A)

// ---------------------------------------------------------------- desenho do campo

/** Arco do SVG (`A r r 0 0 varredura`) → centro e ângulos (fórmula da especificação do SVG). */
private fun Path.arcoSvg(x1: Double, y1: Double, x2: Double, y2: Double, r: Double, varredura: Int, sx: Float, sy: Float) {
    val xp = (x1 - x2) / 2
    val yp = (y1 - y2) / 2
    val d2 = xp * xp + yp * yp
    val rr = maxOf(r, sqrt(d2))
    val sinal = if (varredura == 1) 1.0 else -1.0 // large-arc 0: + quando fA != fS
    val coef = sinal * sqrt(maxOf(0.0, (rr * rr - d2) / d2))
    val cx = coef * yp + (x1 + x2) / 2
    val cy = coef * -xp + (y1 + y2) / 2
    val t1 = atan2(y1 - cy, x1 - cx)
    var dt = atan2(y2 - cy, x2 - cx) - t1
    if (varredura == 1 && dt < 0) dt += 2 * PI
    if (varredura == 0 && dt > 0) dt -= 2 * PI
    moveTo((x1 * sx).toFloat(), (y1 * sy).toFloat())
    arcTo(Rect(((cx - rr) * sx).toFloat(), ((cy - rr) * sy).toFloat(), ((cx + rr) * sx).toFloat(), ((cy + rr) * sy).toFloat()),
        Math.toDegrees(t1).toFloat(), Math.toDegrees(dt).toFloat(), false)
}

private fun DrawScope.desenhar(d: DesenhoCampo) {
    val sx = (size.width / d.largura).toFloat()
    val sy = (size.height / d.altura).toFloat()
    if (d.faixas > 0) {
        drawRect(corHex(d.corFundo))
        val h = size.height / d.faixas
        for (i in 0 until d.faixas) drawRect(corHex(if (i % 2 == 0) d.corFaixa else d.corFundo), Offset(0f, i * h), Size(size.width, h))
    } else {
        drawRect(Brush.verticalGradient(listOf(corHex(d.corFundo), corHex(d.corFaixa))))
    }
    val branco = Color.White.copy(alpha = 0.9f)
    val traco = Stroke(width = (d.espessura * sx).toFloat().coerceAtLeast(1f))
    for (p in d.pecas) when (p) {
        is PecaCampo.Retangulo -> drawRect(branco, Offset((p.x * sx).toFloat(), (p.y * sy).toFloat()),
            Size((p.l * sx).toFloat(), (p.a * sy).toFloat()), style = if (p.cheio) Fill else traco)
        is PecaCampo.Linha -> drawLine(branco, Offset((p.x1 * sx).toFloat(), (p.y1 * sy).toFloat()),
            Offset((p.x2 * sx).toFloat(), (p.y2 * sy).toFloat()), strokeWidth = traco.width)
        is PecaCampo.Circulo -> drawOval(branco, Offset(((p.cx - p.r) * sx).toFloat(), ((p.cy - p.r) * sy).toFloat()),
            Size((2 * p.r * sx).toFloat(), (2 * p.r * sy).toFloat()), style = if (p.cheio) Fill else traco)
        is PecaCampo.Arco -> drawPath(Path().apply { arcoSvg(p.x1, p.y1, p.x2, p.y2, p.r, p.varredura, sx, sy) }, branco, style = traco)
    }
}

/** Vaga mais perto do ponto (em % do campo), até `raio` %; null = longe de todas. */
fun vagaMaisPerto(vagas: List<Vaga>, xPct: Double, yPct: Double, raio: Double = 14.0): Int? =
    vagas.map { it.indice to kotlin.math.hypot(it.x - xPct, (it.y - yPct) * 0.75) }
        .filter { it.second <= raio }.minByOrNull { it.second }?.first

/** Campo/quadra proporcional com as vagas. `aoTocarVaga` null = só leitura.
 *  `aoSoltar` liga o ARRASTAR: o atleta do campo vai para outra vaga (troca). */
@Composable
fun CampoEscalacao(ed: EditorJogo, movendo: String?, aoTocarVaga: ((Int) -> Unit)?, modifier: Modifier = Modifier,
                   aoSoltar: ((String, Int) -> Unit)? = null) {
    val d = desenhoDoCampo(ed.modalidade)
    val vagas = ed.vagas
    var tamanho by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    var arrastando by remember { mutableStateOf<String?>(null) }
    var ponto by remember { mutableStateOf(Offset.Zero) }
    val alvoArrasto = if (arrastando != null && tamanho.width > 0)
        vagaMaisPerto(vagas, ponto.x / tamanho.width * 100.0, ponto.y / tamanho.height * 100.0) else null
    Box(
        modifier.widthIn(max = 420.dp).fillMaxWidth().aspectRatio((d.largura / d.altura).toFloat())
            .shadow(6.dp, RoundedCornerShape(10.dp)).clip(RoundedCornerShape(10.dp)).testTag("jogo:campo")
            .onSizeChanged { tamanho = it },
    ) {
        Canvas(Modifier.fillMaxSize()) { desenhar(d) }
        Layout(content = {
            vagas.forEach { v ->
                val ocup = ed.ocupante(v.indice)
                val arrasto = if (aoSoltar != null && ocup != null) Modifier.pointerInput(ocup.atletaId, v.indice, tamanho) {
                    detectDragGestures(
                        onDragStart = { inicio ->
                            arrastando = ocup.atletaId
                            // posição do dedo no campo = canto do slot + toque dentro dele
                            val largura = maxOf(v.espaco / 100 * tamanho.width, 44.dp.toPx().toDouble())
                            ponto = Offset((v.x / 100 * tamanho.width - largura / 2).toFloat() + inicio.x,
                                (v.y / 100 * tamanho.height).toFloat() - size.height / 2f + inicio.y)
                        },
                        onDrag = { change, delta -> change.consume(); ponto += delta },
                        onDragEnd = {
                            val id = arrastando
                            val destino = vagaMaisPerto(vagas, ponto.x / tamanho.width * 100.0, ponto.y / tamanho.height * 100.0)
                            arrastando = null
                            if (id != null && destino != null) aoSoltar(id, destino)
                        },
                        onDragCancel = { arrastando = null },
                    )
                } else Modifier
                Box(arrasto) { SlotVaga(ed, v, movendo ?: arrastando, aoTocarVaga, realce = alvoArrasto == v.indice) }
            }
        }, modifier = Modifier.fillMaxSize()) { med, cons ->
            val w = cons.maxWidth
            val h = cons.maxHeight
            val minimo = 44.dp.roundToPx()
            val ps = med.mapIndexed { i, m ->
                val largura = maxOf((vagas[i].espaco / 100 * w).toInt(), minimo)
                m.measure(Constraints(minWidth = largura, maxWidth = largura))
            }
            layout(w, h) {
                ps.forEachIndexed { i, p ->
                    val v = vagas[i]
                    p.place((v.x / 100 * w - p.width / 2).toInt(), (v.y / 100 * h - p.height / 2).toInt())
                }
            }
        }
        // o atleta arrastado acompanha o dedo
        arrastando?.let { id ->
            val p = ed.jogador(id)
            val dens = androidx.compose.ui.platform.LocalDensity.current
            Box(Modifier.offset { androidx.compose.ui.unit.IntOffset((ponto.x - with(dens) { 20.dp.toPx() }).toInt(), (ponto.y - with(dens) { 48.dp.toPx() }).toInt()) }) {
                AvatarCamisa(p?.let { it.camisa ?: it.atleta?.camisa }, p?.nomeExibido ?: "", 40.dp, destaque = true)
            }
        }
    }
}

@Composable
private fun SlotVaga(ed: EditorJogo, v: Vaga, movendo: String?, aoTocar: ((Int) -> Unit)?, realce: Boolean = false) {
    val p = ed.ocupante(v.indice)
    val nome = p?.nomeExibido ?: "Jogador"
    val camisa = p?.let { it.camisa ?: it.atleta?.camisa }
    val estaMovendo = p != null && movendo == p.atletaId
    val alvo = (movendo != null && !estaMovendo) || realce
    val pos = etiquetaDaVaga(ed.formacao, v.indice, ed.modalidade) ?: v.papel
    val rotulo = if (p != null) "$pos: $nome${camisa?.let { " ($it)" } ?: ""}" else "Vaga ${v.papel} vazia — escolher atleta"
    Column(
        Modifier
            .then(if (aoTocar != null) Modifier.clickable(role = Role.Button) { aoTocar(v.indice) } else Modifier)
            .padding(vertical = 2.dp)
            .semantics(mergeDescendants = true) { contentDescription = rotulo }
            .testTag("jogo:vaga:${v.indice}"),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (p != null) {
            Box(Modifier.then(if (alvo) Modifier.border(2.dp, Color.White.copy(alpha = 0.9f), CircleShape).padding(2.dp) else Modifier)) {
                AvatarCamisa(camisa, nome, 34.dp, destaque = estaMovendo)
            }
        } else {
            val cor = if (alvo) AMARELO else Color.White.copy(alpha = 0.85f)
            Box(
                Modifier.size(34.dp).clip(CircleShape).background(if (alvo) AMARELO.copy(alpha = 0.25f) else Color.White.copy(alpha = 0.12f))
                    .drawBehind {
                        drawCircle(cor, radius = size.minDimension / 2 - 1.dp.toPx(),
                            style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 5f))))
                    },
                contentAlignment = Alignment.Center,
            ) { Text("+", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold) }
        }
        Text(
            if (p != null) nomeCurto(nome) else v.papel,
            color = Color.White.copy(alpha = if (p != null) 1f else 0.85f), fontSize = 10.sp,
            fontWeight = if (p != null) FontWeight.SemiBold else FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 2.dp).clip(RoundedCornerShape(4.dp))
                .background(NAVY.copy(alpha = if (p != null) 0.85f else 0.45f)).padding(horizontal = 5.dp, vertical = 1.dp),
        )
        if (p != null) Text(pos, color = Color.White.copy(alpha = 0.8f), fontSize = 9.sp, fontWeight = FontWeight.Bold)
    }
}

// ---------------------------------------------------------------- aba Escalação

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AbaEscalacao(
    ed: EditorJogo, editavel: Boolean, movendo: String?,
    trocarFormacao: (String) -> Unit, tocarVaga: (Int) -> Unit, mover: (String?) -> Unit, encaixar: () -> Unit,
    soltar: ((String, Int) -> Unit)? = null,
) {
    val c = TactiPlan.cores
    Row(verticalAlignment = Alignment.CenterVertically) {
        var aberto by remember { mutableStateOf(false) }
        Box {
            OutlinedButton(onClick = { aberto = true }, enabled = editavel, modifier = Modifier.heightIn(min = 48.dp).testTag("jogo:formacao")) {
                Text(ed.formacao, color = c.tinta, fontWeight = FontWeight.Bold)
                Icon(Icones.baixo, "Formação tática", Modifier.padding(start = 6.dp).size(16.dp), tint = c.tinta2)
            }
            DropdownMenu(expanded = aberto, onDismissRequest = { aberto = false }) {
                formacoesDa(ed.modalidade).forEach { f ->
                    DropdownMenuItem(text = { Text(f, fontWeight = if (f == ed.formacao) FontWeight.Bold else FontWeight.Normal) },
                        onClick = { aberto = false; trocarFormacao(f) }, modifier = Modifier.testTag("jogo:formacao:$f"))
                }
            }
        }
        Spacer(Modifier.weight(1f))
        Text(if (editavel) "Toque numa vaga para escolher" else "Só visualização", style = TactiPlan.tipos.corpo13, color = c.tinta2)
    }
    movendo?.let { id ->
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(AMARELO.copy(alpha = 0.18f))
                .border(1.dp, AMARELO.copy(alpha = 0.5f), RoundedCornerShape(10.dp)).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Toque na vaga para onde vai ${ed.jogador(id)?.nomeExibido ?: "o atleta"}", style = TactiPlan.tipos.corpo13, color = c.tinta,
                modifier = Modifier.weight(1f))
            TextButton(onClick = { mover(null) }) { Text("Cancelar", color = c.acaoTinta) }
        }
    }
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        CampoEscalacao(ed, movendo, if (editavel) tocarVaga else null, aoSoltar = if (editavel) soltar else null)
    }
    val sem = ed.semVaga
    if (sem.isNotEmpty()) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(LARANJA.copy(alpha = 0.08f))
                .border(1.dp, LARANJA.copy(alpha = 0.6f), RoundedCornerShape(12.dp)).padding(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("TITULARES SEM VAGA (${sem.size})", style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.Bold, color = c.avisoTinta,
                    modifier = Modifier.weight(1f))
                if (editavel && ed.vagasLivres > 0) TextButton(onClick = encaixar, modifier = Modifier.testTag("jogo:encaixar")) {
                    Text("Encaixar sugestão", color = c.acaoTinta)
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                sem.forEach { p ->
                    val ativo = movendo == p.atletaId
                    Text(p.nomeExibido ?: "Atleta", style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta,
                        modifier = Modifier.clip(RoundedCornerShape(50))
                            .background(if (ativo) AMARELO.copy(alpha = 0.3f) else c.superficie)
                            .border(1.dp, if (ativo) AMARELO else LARANJA.copy(alpha = 0.6f), RoundedCornerShape(50))
                            .then(if (editavel) Modifier.clickable(role = Role.Button) { mover(if (ativo) null else p.atletaId) } else Modifier)
                            .heightIn(min = 36.dp).padding(horizontal = 12.dp, vertical = 8.dp))
                }
            }
        }
    }
    if (ed.titulares.isEmpty()) {
        Text(if (editavel) "Toque numa vaga para escolher o atleta." else "Nenhum titular escalado.",
            style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.fillMaxWidth())
    }
}

// ---------------------------------------------------------------- seletor de atleta da vaga

private fun normalizar(s: String?) = Normalizer.normalize(s ?: "", Normalizer.Form.NFD).replace(Regex("[\\u0300-\\u036f]"), "").lowercase()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SeletorVagaFolha(
    ed: EditorJogo, vaga: Int, plantel: List<AtletaResumo>,
    fechar: () -> Unit, escolher: (AtletaResumo) -> Unit, moverOcupante: () -> Unit, tirarOcupante: () -> Unit,
) {
    val c = TactiPlan.cores
    val estado = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val ocup = ed.ocupante(vaga)
    val papel = papelDaVaga(ed.formacao, vaga) ?: ""
    var busca by remember { mutableStateOf("") }
    val porAtleta = ed.jogadores.associateBy { it.atletaId }
    val lista = remember(busca, plantel, ed.jogadores, ocup) {
        val ids = plantel.map { it.id }.toSet()
        val extras = ed.jogadores.filter { it.atletaId !in ids }.map { p ->
            AtletaResumo(p.atletaId, p.nomeExibido ?: "", p.atleta?.camisa, p.atleta?.posicao)
        }
        val q = normalizar(busca.trim())
        val col = java.text.Collator.getInstance(java.util.Locale.forLanguageTag("pt-BR"))
        (plantel + extras).filter { it.id != ocup?.atletaId }
            .filter { q.isEmpty() || normalizar(it.nome).contains(q) || it.camisa?.toString() == busca.trim() }
            .sortedWith { a, b -> col.compare(a.nome, b.nome) }
    }
    ModalBottomSheet(onDismissRequest = fechar, sheetState = estado, containerColor = c.fundo) {
        Column(Modifier.padding(horizontal = 16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(papel, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.ExtraBold, color = c.sobreAcao,
                    modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(c.acao).padding(horizontal = 8.dp, vertical = 3.dp))
                Text(if (ocup != null) "Trocar atleta da vaga" else "Escolher atleta para a vaga", style = TactiPlan.tipos.cabecalho17,
                    color = c.tinta, modifier = Modifier.weight(1f))
                Text(ed.formacao, style = TactiPlan.tipos.corpo13, color = c.tinta2)
            }
            if (ocup != null) {
                Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        AvatarCamisa(ocup.camisa ?: ocup.atleta?.camisa, ocup.nomeExibido, 32.dp)
                        Text(ocup.nomeExibido ?: "", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold, color = c.tinta,
                            modifier = Modifier.weight(1f).padding(start = 10.dp))
                        ocup.atleta?.posicao?.let { ChipPosicao(it) }
                    }
                    Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Botao("Mover para outra vaga", moverOcupante, Modifier.weight(1f), VarianteBotao.NEUTRO, icone = Icones.trocar)
                        Botao("Tirar do campo", tirarOcupante, Modifier.weight(1f), VarianteBotao.PERIGO, icone = Icones.pessoaX)
                    }
                }
            }
            OutlinedTextField(busca, { busca = it }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("jogo:busca"),
                label = { Text(if (ocup != null) "Buscar outro atleta pelo nome" else "Buscar atleta pelo nome") })
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 460.dp)) {
                if (lista.isEmpty()) item {
                    Text(if (plantel.isEmpty()) "Nenhum atleta no plantel." else "Nenhum atleta com esse nome.",
                        style = TactiPlan.tipos.corpo15, color = c.tinta2, modifier = Modifier.padding(24.dp))
                }
                items(lista, key = { it.id }) { a ->
                    val p = porAtleta[a.id]
                    val sit: Pair<String, Color>? = when {
                        p == null -> null
                        p.titular && p.vaga != null -> "Em campo · ${papelDaVaga(ed.formacao, p.vaga)}" to c.okTinta
                        p.titular -> "Titular sem vaga" to c.avisoTinta
                        else -> "Reserva" to c.tinta2
                    }
                    Row(
                        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button) { escolher(a) }
                            .padding(vertical = 6.dp).testTag("jogo:atleta:${a.id}"),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        AvatarCamisa(p?.camisa ?: a.camisa, a.nome, 32.dp)
                        Column(Modifier.weight(1f).padding(start = 10.dp)) {
                            Text(a.nome, style = TactiPlan.tipos.corpo15, color = c.tinta, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            sit?.let { Text(it.first, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.SemiBold, color = it.second) }
                        }
                        a.posicao?.let { ChipPosicao(it) }
                    }
                }
            }
        }
    }
}

/** Posição CADASTRADA: só informação (não decide a vaga). */
@Composable
private fun ChipPosicao(pos: String) {
    val c = TactiPlan.cores
    Text(pos, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.SemiBold, color = c.tinta2,
        modifier = Modifier.semantics { contentDescription = "Posição cadastrada $pos (só informação)" }
            .clip(RoundedCornerShape(5.dp)).border(1.dp, c.borda, RoundedCornerShape(5.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
}

// ---------------------------------------------------------------- relacionados

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RelacionadosFolha(ed: EditorJogo, plantel: List<AtletaResumo>, fechar: () -> Unit, confirmar: (List<Pair<String, String>>) -> Unit) {
    val c = TactiPlan.cores
    val estado = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val sel = remember { mutableStateListOf<Pair<String, String>>().apply { addAll(ed.jogadores.map { it.atletaId to it.status }) } }
    val todos = remember(plantel, ed.jogadores) {
        val ids = plantel.map { it.id }.toSet()
        plantel + ed.jogadores.filter { it.atletaId !in ids }.map { AtletaResumo(it.atletaId, it.nomeExibido ?: "", it.atleta?.camisa, it.atleta?.posicao) }
    }
    ModalBottomSheet(onDismissRequest = fechar, sheetState = estado, containerColor = c.fundo) {
        Column(Modifier.padding(horizontal = 16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = fechar) { Text("Cancelar", color = c.acaoTinta) }
                Text("Relacionados", style = TactiPlan.tipos.cabecalho17, color = c.tinta, modifier = Modifier.weight(1f))
                TextButton(onClick = { confirmar(sel.toList()) }, modifier = Modifier.testTag("jogo:relacionados:ok")) {
                    Text("Confirmar", color = c.acaoTinta, fontWeight = FontWeight.Bold)
                }
            }
            val t = sel.count { it.second == STATUS_TITULAR }
            val r = sel.count { it.second == STATUS_RESERVA }
            Text("Titulares: $t · Reservas: $r · Total: ${sel.size}", style = TactiPlan.tipos.corpo13, fontWeight = FontWeight.SemiBold, color = c.tinta2)
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 520.dp)) {
                if (todos.isEmpty()) item { Text("Nenhum atleta cadastrado", color = c.tinta2, modifier = Modifier.padding(24.dp)) }
                items(todos, key = { it.id }) { a ->
                    val i = sel.indexOfFirst { it.first == a.id }
                    val marcado = i >= 0
                    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(vertical = 4.dp).testTag("jogo:rel:${a.id}"),
                        verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(marcado, onCheckedChange = { if (marcado) sel.removeAt(i) else sel.add(a.id to STATUS_TITULAR) })
                        Column(Modifier.weight(1f)) {
                            Text((a.camisa?.let { "#$it  " } ?: "") + a.nome, style = TactiPlan.tipos.corpo15, color = c.tinta,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            a.posicao?.let { Text(it, style = TactiPlan.tipos.legenda11, color = c.tinta2) }
                        }
                        if (marcado) {
                            SingleChoiceSegmentedButtonRow {
                                listOf(STATUS_TITULAR to "Titular", STATUS_RESERVA to "Reserva").forEachIndexed { k, (st, rot) ->
                                    SegmentedButton(selected = sel[i].second == st, onClick = { sel[i] = a.id to st },
                                        shape = SegmentedButtonDefaults.itemShape(k, 2),
                                        colors = SegmentedButtonDefaults.colors(activeContainerColor = c.acaoSuave, activeContentColor = c.acaoTinta),
                                        icon = {}) { Text(rot, style = TactiPlan.tipos.legenda11) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- aba Convocação (lista)

@Composable
fun AbaConvocacao(
    ed: EditorJogo, editavel: Boolean, exportando: Boolean,
    selecionar: () -> Unit, exportar: () -> Unit, tocarEtiqueta: (JogadorJogo) -> Unit,
    editarCamisa: (JogadorJogo) -> Unit, editarMinutos: (JogadorJogo) -> Unit, voltarAuto: (String) -> Unit, tirar: (String) -> Unit,
) {
    val c = TactiPlan.cores
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (editavel) Botao("Selecionar relacionados", selecionar, Modifier.weight(1f).testTag("jogo:selecionar"), VarianteBotao.SECUNDARIO, icone = Icones.pessoaMais)
        Botao(if (exportando) "Gerando…" else "Convocação (PDF)", exportar, Modifier.weight(1f).testTag("jogo:exportar-convocacao"),
            VarianteBotao.NEUTRO, habilitado = !exportando, icone = Icones.documento)
    }
    if (ed.jogadores.isEmpty()) {
        com.faggin.tactiplan.app.ui.comum.EstadoVazio(Icones.grupo, "Nenhum jogador selecionado",
            "Toque numa vaga do campo para escalar, ou em \"Selecionar relacionados\" para relacionar reservas.")
        return
    }
    val mins = ed.minutagem
    val tit = ed.titulares
    if (tit.isNotEmpty()) {
        RotuloSecao("Titulares (${tit.size})")
        Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
            tit.forEachIndexed { i, p ->
                LinhaJogador(ed, p, etiqueta = true, editavel, mins[p.atletaId], tocarEtiqueta, editarCamisa, editarMinutos, voltarAuto, tirar)
                if (i < tit.lastIndex) HorizontalDivider(color = c.borda)
            }
        }
    }
    val res = ed.reservas
    if (res.isNotEmpty()) {
        RotuloSecao("Reservas (${res.size})")
        Cartao(preenchimento = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
            res.forEachIndexed { i, p ->
                LinhaJogador(ed, p, etiqueta = false, editavel, mins[p.atletaId], tocarEtiqueta, editarCamisa, editarMinutos, voltarAuto, tirar)
                if (i < res.lastIndex) HorizontalDivider(color = c.borda)
            }
        }
    }
}

@Composable
private fun LinhaJogador(
    ed: EditorJogo, p: JogadorJogo, etiqueta: Boolean, editavel: Boolean, m: com.faggin.tactiplan.app.dados.jogo.EstadoMinutagem?,
    tocarEtiqueta: (JogadorJogo) -> Unit, editarCamisa: (JogadorJogo) -> Unit, editarMinutos: (JogadorJogo) -> Unit,
    voltarAuto: (String) -> Unit, tirar: (String) -> Unit,
) {
    val c = TactiPlan.cores
    val repetida = ed.camisaRepetida(p.atletaId)
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(vertical = 4.dp).testTag("jogo:jogador:${p.atletaId}"),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (etiqueta) {
            val et = etiquetaDaVaga(ed.formacao, p.vaga, ed.modalidade)
            Text(et ?: "S/V", style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.ExtraBold,
                color = if (et != null) c.tinta2 else c.avisoTinta,
                modifier = Modifier.widthIn(min = 44.dp).clip(RoundedCornerShape(5.dp))
                    .background(if (et != null) c.fundo else c.avisoFundo)
                    .border(1.dp, if (et != null) c.borda else LARANJA, RoundedCornerShape(5.dp))
                    .then(if (editavel) Modifier.clickable(role = Role.Button) { tocarEtiqueta(p) } else Modifier)
                    .semantics { contentDescription = if (et != null) "Vaga $et no campo" else "Sem vaga no campo — toque e escolha a vaga" }
                    .padding(horizontal = 6.dp, vertical = 6.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        val corCamisa = if (p.titular) c.okTinta else c.avisoTinta
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(corCamisa.copy(alpha = 0.12f))
                .border(if (repetida) 2.dp else 1.dp, if (repetida) c.erro else corCamisa.copy(alpha = 0.4f), CircleShape)
                .then(if (editavel) Modifier.clickable(role = Role.Button) { editarCamisa(p) } else Modifier)
                .semantics { contentDescription = (p.camisa?.let { "Camisa $it neste jogo" } ?: "Sem camisa neste jogo") + if (repetida) ", camisa repetida" else "" },
            contentAlignment = Alignment.Center,
        ) { Text(p.camisa?.toString() ?: "–", color = corCamisa, fontWeight = FontWeight.Bold, style = TactiPlan.tipos.corpo13) }
        Column(Modifier.weight(1f)) {
            Text(p.nomeExibido ?: "Atleta", style = TactiPlan.tipos.corpo15, color = c.tinta, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (repetida) Text("Camisa ${p.camisa} repetida neste jogo", style = TactiPlan.tipos.legenda11, color = c.erroTinta)
        }
        if (ed.config.rastreiaMinutos) {
            val mk = marcadorMinutagem(m)
            mk?.let { (t, tom) ->
                Text(t, style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.Bold,
                    color = when (tom) { "entrou" -> c.okTinta; else -> c.erroTinta })
            }
            if (m?.manual == true) {
                Text("MANUAL ↺", style = TactiPlan.tipos.legenda11, fontWeight = FontWeight.Bold, color = c.avisoTinta,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(c.avisoFundo)
                        .then(if (editavel) Modifier.clickable(role = Role.Button) { voltarAuto(p.atletaId) } else Modifier)
                        .semantics { contentDescription = "Ajuste manual (automático seria ${m.auto} min). Toque para voltar ao automático" }
                        .padding(horizontal = 5.dp, vertical = 4.dp).testTag("jogo:auto:${p.atletaId}"))
            }
            Row(
                Modifier.heightIn(min = 40.dp).then(if (editavel) Modifier.clickable(role = Role.Button) { editarMinutos(p) } else Modifier)
                    .semantics(mergeDescendants = true) {
                        contentDescription = "${m?.minutos ?: 0} minutos. ${dicaMinutagem(m)}" + if (editavel) ". Toque para ajustar" else ""
                    }
                    .padding(horizontal = 4.dp).testTag("jogo:minutos:${p.atletaId}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("${m?.minutos ?: 0}", style = TactiPlan.tipos.corpo15, fontWeight = FontWeight.SemiBold,
                    color = if (m?.manual == true) c.avisoTinta else c.tinta)
                Text(" min", style = TactiPlan.tipos.legenda11, color = c.tinta2)
            }
        }
        if (editavel) androidx.compose.material3.IconButton(onClick = { tirar(p.atletaId) }, modifier = Modifier.size(40.dp)) {
            Icon(Icones.fechar, "Tirar ${p.nomeExibido ?: "atleta"} do jogo", tint = c.tinta2, modifier = Modifier.size(16.dp))
        }
    }
}

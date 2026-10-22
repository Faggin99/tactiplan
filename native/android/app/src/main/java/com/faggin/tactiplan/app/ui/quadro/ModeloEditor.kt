package com.faggin.tactiplan.app.ui.quadro

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.faggin.tactiplan.app.dados.elenco.Atleta
import com.faggin.tactiplan.app.dados.quadro.AlvoFormacao
import com.faggin.tactiplan.app.dados.quadro.ApiQuadro
import com.faggin.tactiplan.app.dados.quadro.DimensoesCanvas
import com.faggin.tactiplan.app.dados.quadro.EditorQuadro
import com.faggin.tactiplan.app.dados.quadro.Formacao
import com.faggin.tactiplan.app.dados.quadro.Jogada
import com.faggin.tactiplan.app.dados.quadro.Peca
import com.faggin.tactiplan.app.dados.quadro.RascunhoDesenho
import com.faggin.tactiplan.app.dados.quadro.Reproducao
import com.faggin.tactiplan.app.dados.quadro.VistaCampo
import com.faggin.tactiplan.app.dados.quadro.aplicacoesDaFormacao
import com.faggin.tactiplan.app.dados.quadro.avisoFormacao
import com.faggin.tactiplan.app.dados.quadro.dadosBola
import com.faggin.tactiplan.app.dados.quadro.dadosGoleiro
import com.faggin.tactiplan.app.dados.quadro.dadosJogadorAtleta
import com.faggin.tactiplan.app.dados.quadro.dadosJogadorGenerico
import com.faggin.tactiplan.app.dados.quadro.dadosObjeto
import com.faggin.tactiplan.app.dados.quadro.dadosTexto
import com.faggin.tactiplan.app.dados.quadro.desenhoArrastavel
import com.faggin.tactiplan.app.dados.quadro.desenhoNoPonto
import com.faggin.tactiplan.app.dados.quadro.dimensoesCanvas
import com.faggin.tactiplan.app.dados.quadro.limitesArrasto
import com.faggin.tactiplan.app.dados.quadro.mensagemErroQuadro
import com.faggin.tactiplan.app.dados.quadro.nomeValidoJogada
import com.faggin.tactiplan.app.dados.quadro.num
import com.faggin.tactiplan.app.dados.quadro.paraPercentual
import com.faggin.tactiplan.app.dados.quadro.pecaNoPonto
import com.faggin.tactiplan.app.dados.quadro.prender
import com.faggin.tactiplan.app.dados.quadro.rotuloTipoCampo
import kotlin.math.hypot
import kotlin.random.Random

// Estado da TELA do editor do quadro (Android). As regras ficam no EditorQuadro (Kotlin puro,
// paridade com o web); aqui só ferramentas, gestos, play e salvar. Paridade: EditorQuadroModelo (iPhone).

sealed class Ferramenta {
    data object Selecionar : Ferramenta()
    data object Borracha : Ferramenta()
    /** Desenho com o dedo (modo do web: arrow_straight, arrow_curved, free_draw, zone_rect, zone_circle, text). */
    data class Traco(val id: String, val modo: String) : Ferramenta()
}

enum class Secao(val titulo: String) {
    PECAS("Peças"), FORMACOES("Formações"), SETAS("Setas"), DESENHO("Desenho"), OBJETOS("Objetos"), VISTA("Vista do campo"), PLANTEL("Plantel")
}

class ModeloEditor(
    jogada: Jogada?,
    tipoInicial: String,
    val api: ApiQuadro?,
    val clubeId: String?,
    val carregarAtletas: suspend () -> List<Atleta>,
    val aoSalvar: (Jogada) -> Unit,
    val tratarErro: (Throwable) -> Boolean,
) {
    var ed by mutableStateOf(EditorQuadro(tipoInicial).let { e -> jogada?.let { e.abrir(it.bruto) } ?: e })
    var jogadaId by mutableStateOf(jogada?.id)
    var nome by mutableStateOf(jogada?.nome.orEmpty())
    var descricao by mutableStateOf(jogada?.descricao.orEmpty())
    var ferramenta by mutableStateOf<Ferramenta>(Ferramenta.Selecionar)
    var cor by mutableStateOf("#ffffff")
    var tracejado by mutableStateOf<List<Double>>(emptyList())
    var secao by mutableStateOf<Secao?>(null)
    var alvo by mutableStateOf(AlvoFormacao.A)
    var arrasto by mutableStateOf<Triple<String, Double, Double>?>(null)
    var arrastoDesenho by mutableStateOf<Triple<String, Double, Double>?>(null)
    var rascunho by mutableStateOf<RascunhoDesenho?>(null)
    var textoNovo by mutableStateOf<Triple<Double, Double, String>?>(null)
    var aviso by mutableStateOf<String?>(null)
    var salvando by mutableStateOf(false)
    var atletas by mutableStateOf<List<Atleta>>(emptyList())
    var atletasCarregados by mutableStateOf(false)
    var reproducao by mutableStateOf<Reproducao?>(null)
    var velocidade by mutableStateOf(1.0)

    val tocando: Boolean get() = reproducao != null

    fun dims(w: Float, h: Float): DimensoesCanvas = dimensoesCanvas(w.toDouble(), h.toDouble(), ed.tipoCampo, ed.vista)

    fun cena(w: Float, h: Float): CenaQuadro {
        val d = dims(w, h)
        val pecas = reproducao?.pecas(ed.quadros) ?: ed.quadroAtual.elementos
        return CenaQuadro(d, ed.tipoCampo, ed.vista, pecas, ed.quadroAtual.desenhos,
            previa = rascunho?.previa(d), proximas = if (tocando) null else ed.proximoQuadro?.elementos,
            corA = ed.corA, corB = ed.corB, pecaSelecionada = ed.pecaSelecionada, desenhoSelecionado = ed.desenhoSelecionado,
            arrasto = arrasto, arrastoDesenho = arrastoDesenho)
    }

    // ---------------------------------------------------------------- gestos (coordenadas lógicas)

    private var inicio: Pair<Double, Double>? = null
    private var pecaInicio: Peca? = null
    private var desenhoInicio: String? = null
    private var inicioPx: Pair<Float, Float> = 0f to 0f

    private fun pct(x: Float, y: Float, d: DimensoesCanvas) = paraPercentual(x - d.campoX, d.largura) to paraPercentual(y - d.campoY, d.altura)

    fun comecar(x: Float, y: Float, w: Float, h: Float) {
        if (tocando) return
        val d = dims(w, h)
        val p = pct(x, y, d)
        inicio = p; inicioPx = x to y
        pecaInicio = null; desenhoInicio = null
        if (ferramenta == Ferramenta.Selecionar) {
            val px = x - d.campoX; val py = y - d.campoY
            pecaInicio = pecaNoPonto(ed.quadroAtual.elementos, px, py, d)
            if (pecaInicio == null) desenhoInicio = desenhoNoPonto(ed.quadroAtual.desenhos, px, py, d)?.takeIf { desenhoArrastavel(it) }?.id
        }
        val f = ferramenta
        if (f is Ferramenta.Traco && f.modo != "text") rascunho = RascunhoDesenho(f.modo, cor, tracejado, inicioX = p.first, inicioY = p.second)
    }

    fun mover(x: Float, y: Float, w: Float, h: Float) {
        val ini = inicio ?: return
        val d = dims(w, h)
        val (px, py) = pct(x, y, d)
        val dist = hypot(x - inicioPx.first, y - inicioPx.second)
        val r = rascunho
        when {
            r != null -> rascunho = r.mover(px, py)
            pecaInicio != null && dist > 3 -> pecaInicio?.let { arrasto = Triple(it.id, it.x + (px - ini.first), it.y + (py - ini.second)) }
            desenhoInicio != null && dist > 3 -> arrastoDesenho = Triple(desenhoInicio!!, px - ini.first, py - ini.second)
        }
    }

    /** true = soltou uma peça (vibrar). */
    fun soltar(x: Float, y: Float, w: Float, h: Float): Boolean {
        val ini = inicio ?: return false
        val d = dims(w, h)
        val (px, py) = pct(x, y, d)
        val dist = hypot(x - inicioPx.first, y - inicioPx.second)
        var vibrar = false
        val r = rascunho
        try {
            if (r != null) {
                r.terminar(px, py, d)?.let { ed = ed.adicionarDesenho(it).first }
            } else if (dist <= 3) {
                tocou(x, y, d)
            } else {
                val a = arrasto; val ad = arrastoDesenho
                if (a != null) {
                    val (bx, by) = prender(a.second, a.third, limitesArrasto(d))
                    ed = ed.moverPeca(a.first, bx, by); vibrar = true
                } else if (ad != null) {
                    ed.desenho(ad.first)?.let { z -> ed = ed.alterarDesenho(ad.first, mapOf("x" to num(z.n("x") + ad.second), "y" to num(z.n("y") + ad.third))); vibrar = true }
                }
            }
        } finally {
            inicio = null; rascunho = null; arrasto = null; arrastoDesenho = null; pecaInicio = null; desenhoInicio = null
        }
        return vibrar
    }

    private fun tocou(x: Float, y: Float, d: DimensoesCanvas) {
        val px = x - d.campoX; val py = y - d.campoY
        val p = pecaNoPonto(ed.quadroAtual.elementos, px.toDouble(), py.toDouble(), d)
        val z = if (p == null) desenhoNoPonto(ed.quadroAtual.desenhos, px.toDouble(), py.toDouble(), d) else null
        when (val f = ferramenta) {
            Ferramenta.Borracha -> { if (p != null) ed = ed.removerPeca(p.id) else if (z != null) ed = ed.removerDesenho(z.id) }
            is Ferramenta.Traco -> if (f.modo == "text") textoNovo = Triple(paraPercentual(px.toDouble(), d.largura), paraPercentual(py.toDouble(), d.altura), "")
            Ferramenta.Selecionar -> when {
                p != null -> selecionarPeca(p.id)
                z != null -> selecionarDesenho(z.id)
                else -> { ed = ed.selecionarPeca(null).selecionarDesenho(null); secao = null }
            }
        }
    }

    // ---------------------------------------------------------------- seleção e ferramentas

    fun selecionarPeca(id: String?) { ed = ed.selecionarPeca(id).let { if (id != null) it.selecionarDesenho(null) else it }; if (id != null) secao = null }
    fun selecionarDesenho(id: String?) { ed = ed.selecionarDesenho(id).let { if (id != null) it.selecionarPeca(null) else it }; if (id != null) secao = null }
    fun limparSelecao() { ed = ed.selecionarPeca(null).selecionarDesenho(null) }

    fun ativar(id: String, modo: String, tr: List<Double> = emptyList(), c: String? = null) {
        val f = ferramenta
        if (f is Ferramenta.Traco && f.id == id) { soSelecionar(); return }
        ferramenta = Ferramenta.Traco(id, modo); tracejado = tr
        if (c != null) cor = c
        limparSelecao()
    }

    fun soSelecionar() { ferramenta = Ferramenta.Selecionar; tracejado = emptyList() }

    fun abrirSecao(s: Secao, carregar: (suspend () -> Unit) -> Unit) {
        secao = if (secao == s) null else s
        soSelecionar(); limparSelecao()
        if (s == Secao.PLANTEL && !atletasCarregados) carregar { atletas = carregarAtletas(); atletasCarregados = true }
    }

    private fun aleatorio() = Random.nextDouble()

    fun addJogador(time: String) { soSelecionar(); ed = ed.adicionarPeca(dadosJogadorGenerico(time, ed.proximaCamisa(time), ::aleatorio)).first }
    fun addGoleiro(time: String) { soSelecionar(); ed = ed.adicionarPeca(dadosGoleiro(time)).first }
    fun addBola() { soSelecionar(); ed = ed.adicionarPeca(dadosBola()).first }
    fun addObjeto(tipo: String) { soSelecionar(); ed = ed.adicionarPeca(dadosObjeto(tipo, ::aleatorio)).first }
    fun addAtleta(a: Atleta, time: String) {
        if (a.id in ed.atletasEmCampo) return
        ed = ed.adicionarPeca(dadosJogadorAtleta(time, a.id, a.nome, a.camisa, ed.proximaCamisa(time), ::aleatorio)).first
    }

    fun removerSelecionado() {
        ed.pecaSelecionada?.let { ed = ed.removerPeca(it) }
        ed.desenhoSelecionado?.let { ed = ed.removerDesenho(it) }
    }

    fun aplicarFormacao(f: Formacao) {
        soSelecionar()
        var extra = ""
        if (ed.vista != VistaCampo.INTEIRO) { ed = ed.definirVista(VistaCampo.INTEIRO); extra = "Vista ajustada para campo inteiro · " }
        val (n, r) = ed.aplicarFormacoes(aplicacoesDaFormacao(f, alvo))
        ed = n
        aviso = extra + avisoFormacao(f, alvo, r)
    }

    fun definirTipo(t: String) {
        if (t == ed.tipoCampo) return
        ed = ed.definirTipoCampo(t)
        if (ed.quadroAtual.elementos.isNotEmpty()) aviso = "Formações disponíveis atualizadas para ${rotuloTipoCampo(t)}"
    }

    fun confirmarTexto() {
        val t = textoNovo ?: return
        dadosTexto(t.third, t.first, t.second, cor)?.let { ed = ed.adicionarDesenho(it).first }
        textoNovo = null
    }

    // ---------------------------------------------------------------- play

    fun tocarOuPausar() {
        if (tocando) { reproducao = null; return }
        val r = Reproducao.iniciar(ed.atual, ed.totalQuadros) ?: return
        ed = ed.irParaQuadro(r.quadro).selecionarPeca(null).selecionarDesenho(null)
        reproducao = r
    }

    /** Um passo do relógio (o LaunchedEffect chama a cada quadro da tela). */
    fun passo(ms: Double) {
        val r = reproducao ?: return
        val n = r.avancar(ms, velocidade)
        if (n.quadro != r.quadro) ed = ed.irParaQuadro(n.quadro)
        reproducao = if (n.terminou) null else n
    }

    fun parar() { reproducao = null }

    // ---------------------------------------------------------------- salvar

    /** Salvar em 1 toque quando a jogada já existe; false = precisa da folha (nome). */
    suspend fun salvarRapido(): Boolean {
        if (jogadaId == null || nomeValidoJogada(nome) == null) return false
        persistir(nome, descricao, false)
        return true
    }

    suspend fun persistir(n: String, dsc: String, comoNova: Boolean) {
        val nomeOk = nomeValidoJogada(n) ?: return
        val api = api ?: return
        if (salvando) return
        salvando = true
        try {
            val corpo = ed.corpoSalvar(nomeOk, dsc.trim(), clubeId)
            val id = jogadaId
            val j = if (id != null && !comoNova) api.atualizar(id, corpo) else api.criar(corpo)
            if (j.id.isNotEmpty()) jogadaId = j.id
            nome = nomeOk; descricao = dsc.trim()
            ed = ed.marcarSalvo()
            aviso = "Jogada salva"
            aoSalvar(j)
        } catch (e: Exception) {
            if (!tratarErro(e)) aviso = mensagemErroQuadro(e)
        } finally {
            salvando = false
        }
    }
}

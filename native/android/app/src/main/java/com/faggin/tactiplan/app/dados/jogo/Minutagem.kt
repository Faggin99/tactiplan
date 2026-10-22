package com.faggin.tactiplan.app.dados.jogo

// Minutagem do jogo pelas substituições (e pela expulsão) + regras da substituição.
// Porte fiel de frontend/src/lib/minutagem.js (= backend-node/src/utils/minutagem.js).
// Substituição: player_id = quem ENTRA, secondary_player_id = quem SAI. Só o nosso time conta.
// Paridade: native/paridade/jogo.json + TactiPlanKit/Minutagem.swift.

data class EstadoMinutagem(
    val minutos: Int,
    val auto: Int,
    val manual: Boolean,
    val titular: Boolean,
    val entrou: Boolean,
    val entrouAos: Int?,
    val saiuAos: Int?,
    val expulsoAos: Int?,
    val jogou: Boolean,
)

/** `Number(v)` limitado a [0, duração]. null (null no banco) vale 0, como no web. */
private fun paraMinuto(v: Int?, duracao: Int): Int = (v ?: 0).coerceIn(0, maxOf(0, duracao))

private fun linhaDoTempo(eventos: List<EventoJogo>): List<EventoJogo> =
    eventos.withIndex()
        .filter { it.value.doNossoTime && (it.value.tipo == EVENTO_SUBSTITUICAO || it.value.tipo == EVENTO_VERMELHO) }
        .sortedWith(compareBy<IndexedValue<EventoJogo>> { it.value.minuto ?: 0 }.thenBy { it.index })
        .map { it.value }

/** computeMinutagem: estado de cada atleta (chave = athlete_id). */
fun calcularMinutagem(jogadores: List<JogadorJogo>, eventos: List<EventoJogo>, duracao: Int): Map<String, EstadoMinutagem> {
    val dur = maxOf(0, duracao)
    val tl = linhaDoTempo(eventos)
    val saida = LinkedHashMap<String, EstadoMinutagem>()
    for (p in jogadores) {
        val id = p.atletaId
        if (id.isEmpty()) continue
        val titular = p.titular
        var entrada: Int? = if (titular) 0 else null
        var saidaMin: Int? = null
        var entrouAos: Int? = null
        var expulsoAos: Int? = null
        for (e in tl) {
            val m = paraMinuto(e.minuto, dur)
            if (e.tipo == EVENTO_SUBSTITUICAO) {
                if (e.jogadorId.isNullOrEmpty() || e.jogador2Id.isNullOrEmpty()) continue
                if (e.jogadorId == id && entrada == null && !titular) { entrada = m; entrouAos = m }
                else if (e.jogador2Id == id && entrada != null && saidaMin == null && m >= entrada) saidaMin = m
            } else if (e.tipo == EVENTO_VERMELHO && e.jogadorId == id && entrada != null && saidaMin == null && m >= entrada) {
                saidaMin = m
                expulsoAos = m
            }
        }
        val auto = entrada?.let { maxOf(0, (saidaMin ?: dur) - it) } ?: 0
        val manual = p.minutosManual
        val minutos = if (manual) maxOf(0, p.minutosJogados) else auto
        saida[id] = EstadoMinutagem(minutos, auto, manual, titular, !titular && entrouAos != null, entrouAos, saidaMin,
            expulsoAos, minutos > 0 || titular || entrouAos != null)
    }
    return saida
}

private fun semEvento(eventos: List<EventoJogo>, ignorar: String?) = if (ignorar == null) eventos else eventos.filter { it.id != ignorar }
private fun semManual(jogadores: List<JogadorJogo>) = jogadores.map { it.copy(minutosManual = false) }

/** emCampo: quem está em campo no minuto (quem saiu nesse minuto já não está). */
fun emCampo(jogadores: List<JogadorJogo>, eventos: List<EventoJogo>, duracao: Int, minuto: Int, ignorar: String? = null): List<JogadorJogo> {
    val st = calcularMinutagem(semManual(jogadores), semEvento(eventos, ignorar), maxOf(duracao, minuto))
    return jogadores.filter { p ->
        val s = st[p.atletaId] ?: return@filter false
        val entrou = s.titular || (s.entrouAos != null && s.entrouAos <= minuto)
        val saiu = s.saiuAos != null && s.saiuAos <= minuto
        entrou && !saiu
    }
}

/** reservasDisponiveis: reservas relacionados que ainda não entraram. */
fun reservasDisponiveis(jogadores: List<JogadorJogo>, eventos: List<EventoJogo>, ignorar: String? = null): List<JogadorJogo> {
    val usados = semEvento(eventos, ignorar)
        .filter { it.doNossoTime && it.tipo == EVENTO_SUBSTITUICAO && !it.jogadorId.isNullOrEmpty() }
        .mapNotNull { it.jogadorId }.toSet()
    return jogadores.filter { it.reserva && it.atletaId !in usados }
}

/** validarSubstituicao: null = ok; senão a frase do web. `entra` = player_id, `sai` = secondary_player_id. */
fun validarSubstituicao(jogadores: List<JogadorJogo>, eventos: List<EventoJogo>, duracao: Int,
                        minuto: Int?, entra: String?, sai: String?, ignorar: String? = null): String? {
    fun nome(id: String?) = jogadores.firstOrNull { it.atletaId == id }?.nomeExibido ?: "O atleta"
    if (sai.isNullOrEmpty()) return "Escolha quem sai."
    if (entra.isNullOrEmpty()) return "Escolha quem entra."
    if (entra == sai) return "Quem sai e quem entra precisam ser atletas diferentes."
    if (minuto == null || minuto < 1) return "Informe o minuto da substituição."
    val outros = semEvento(eventos, ignorar)
    val pIn = jogadores.firstOrNull { it.atletaId == entra }
    val pOut = jogadores.firstOrNull { it.atletaId == sai }
    if (pOut == null) return "${nome(sai)} não está relacionado para o jogo."
    if (pIn == null) return "${nome(entra)} não está relacionado para o jogo."
    if (!pIn.reserva) return "${nome(entra)} é titular: quem entra precisa ser reserva."
    val subs = outros.filter { it.doNossoTime && it.tipo == EVENTO_SUBSTITUICAO }
    if (subs.any { it.jogadorId == entra }) return "${nome(entra)} já entrou no jogo."
    if (subs.any { it.jogador2Id == sai }) return "${nome(sai)} já saiu do jogo."
    val st = calcularMinutagem(semManual(jogadores), outros, maxOf(duracao, minuto))[sai]
    val exp = st?.expulsoAos
    if (exp != null && exp <= minuto) return "${nome(sai)} foi expulso aos $exp'."
    val emCampoAgora = st != null && (st.titular || (st.entrouAos != null && st.entrouAos <= minuto)) &&
        !(st.saiuAos != null && st.saiuAos <= minuto)
    if (!emCampoAgora) {
        val ent = st?.entrouAos
        if (ent != null && ent > minuto) return "${nome(sai)} só entra aos $ent'."
        return "${nome(sai)} não está em campo aos $minuto'."
    }
    return null
}

/** checarSubstituicoes do servidor (o que ele recusa com 400 quando vai `subs_check: true`). null = ok. */
fun checarSubstituicoes(jogadores: List<JogadorJogo>, eventos: List<EventoJogo>): String? {
    val porId = HashMap<String, JogadorJogo>()
    for (p in jogadores) porId[p.atletaId] = p
    fun nome(id: String) = porId[id]?.nome?.takeIf { it.isNotEmpty() } ?: "Atleta"
    val entrou = HashSet<String>()
    for (e in eventos) {
        if (e.tipo != EVENTO_SUBSTITUICAO || !e.doNossoTime) continue
        val entra = e.jogadorId?.takeIf { it.isNotEmpty() } ?: continue
        val sai = e.jogador2Id?.takeIf { it.isNotEmpty() } ?: continue
        val min = e.minuto?.let { " ($it')" } ?: ""
        if (entra == sai) return "Substituição$min: quem saiu e quem entrou são o mesmo atleta."
        val p = porId[entra] ?: return "Substituição$min: quem entrou não está relacionado para o jogo."
        if (p.titular) return "Substituição$min: ${nome(entra)} é titular. Quem entra numa substituição precisa ser reserva."
        if (entra in entrou) return "Substituição$min: ${nome(entra)} já entrou em outra substituição."
        entrou.add(entra)
    }
    return null
}

/** "↑32'", "↓67'", "exp. 55'" (null = nada a marcar); tom = expulso | entrou | saiu. */
fun marcadorMinutagem(s: EstadoMinutagem?): Pair<String, String>? {
    if (s == null || s.manual) return null
    s.expulsoAos?.let { return "exp. $it'" to "expulso" }
    if (s.entrou && s.entrouAos != null) return "↑${s.entrouAos}'" to "entrou"
    if (s.titular && s.saiuAos != null) return "↓${s.saiuAos}'" to "saiu"
    return null
}

fun dicaMinutagem(s: EstadoMinutagem?): String {
    if (s == null) return ""
    val partes = mutableListOf(if (s.titular) "Titular" else if (s.entrou) "Entrou aos ${s.entrouAos ?: 0}'" else "Não entrou")
    if (s.expulsoAos != null) partes.add("expulso aos ${s.expulsoAos}'") else if (s.saiuAos != null) partes.add("saiu aos ${s.saiuAos}'")
    return partes.joinToString(" · ")
}

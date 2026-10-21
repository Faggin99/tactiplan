package com.faggin.tactiplan.app.dados

// "Onde entrar" (escolha de clube) e o CONTEXTO do clube em uso: papel, permissões, categorias,
// só leitura e personalização. A regra continua no servidor — o app só reflete (esconde o que a
// pessoa não pode fazer). Paridade: TactiPlanKit/OndeEntrar.swift.

/** Uma linha da tela "Onde entrar": conta + clube (no padrão "escolha de perfil" do Gestsport). */
data class OpcaoEntrada(
    val escolha: Escolha,
    /** Nome do clube (ou da conta, se ela ainda não tem clube). */
    val titulo: String,
    /** "Futebol 11 · Sub-15, Sub-17" / "Futsal · só leitura" / nome da conta. */
    val subtitulo: String,
    val papelRotulo: String,
    val somenteLeitura: Boolean,
    val arquivado: Boolean,
    val personalizacao: Personalizacao?,
) {
    val id: String get() = escolha.workspaceId + "|" + (escolha.clubeId ?: "")
}

/**
 * As opções de entrada: uma por clube de cada conta (ativos antes dos arquivados); conta sem
 * clube vira UMA linha com o nome da conta. Na ordem em que o servidor mandou as contas.
 */
fun opcoesDeEntrada(me: Me): List<OpcaoEntrada> {
    val saida = mutableListOf<OpcaoEntrada>()
    for (conta in me.workspaces) {
        val papel = conta.papelRotulo ?: rotuloPapel(conta.papel)
        val leitura = conta.somenteLeitura ?: true
        // Ativos antes dos arquivados, sem mudar a ordem do servidor dentro de cada grupo.
        val todos = conta.clubes.orEmpty()
        val clubes = todos.filter { it.arquivado != true } + todos.filter { it.arquivado == true }
        if (clubes.isEmpty()) {
            saida += OpcaoEntrada(
                Escolha(conta.id, null), conta.nome,
                if (leitura) "Sem clube cadastrado · $ROTULO_SO_LEITURA" else "Sem clube cadastrado",
                papel, leitura, false, null,
            )
            continue
        }
        for (c in clubes) {
            val arquivado = c.arquivado ?: false
            val partes = mutableListOf(rotuloModalidade(c.modalidade))
            val cats = c.categorias.orEmpty().map { it.nome }
            if (cats.isNotEmpty()) partes += listaCurta(cats, 3)
            if (arquivado) partes += "arquivado"
            if (leitura || arquivado) partes += ROTULO_SO_LEITURA
            // Quem participa de MAIS de uma conta precisa saber de qual conta é o clube.
            if (me.workspaces.size > 1 && conta.nome != c.nome) partes += conta.nome
            saida += OpcaoEntrada(
                Escolha(conta.id, c.id), c.nome, partes.filter { it.isNotEmpty() }.joinToString(" · "),
                papel, leitura || arquivado, arquivado, c.personalizacao,
            )
        }
    }
    return saida
}

/** A escolha ainda existe neste `me`? */
fun escolhaValida(e: Escolha?, me: Me): Boolean = e != null && opcoesDeEntrada(me).any { it.escolha == e }

/**
 * Qual clube abrir sem perguntar, ou null para mostrar "Onde entrar".
 * - Convite pendente: SEMPRE mostra a tela (o convite fica no topo para aceitar).
 * - A escolha atual (ou a última desta pessoa) ainda vale: entra nela.
 * - Uma opção só (ou uma ativa só): entra nela.
 */
fun escolhaAutomatica(me: Me, atual: Escolha?, ultima: Escolha?): Escolha? {
    if (me.convites.isNotEmpty()) return null
    if (escolhaValida(atual, me)) return atual
    if (escolhaValida(ultima, me)) return ultima
    val opcoes = opcoesDeEntrada(me)
    val ativas = opcoes.filter { !it.arquivado }
    if (ativas.size == 1) return ativas[0].escolha
    if (opcoes.size == 1) return opcoes[0].escolha
    return null
}

// ---------- contexto do clube em uso ----------

/** Tudo que as telas consultam do clube em uso. Montado do `me` + escolha ([contextoDe]). */
data class ContextoClube(
    val conta: Conta,
    val clube: Clube?,
    val permissoes: Set<String>,
    /** Conta sem assinatura OU clube arquivado: lê tudo, não muda nada. */
    val somenteLeitura: Boolean,
    val mensagemSomenteLeitura: String,
) {
    val escolha: Escolha get() = Escolha(conta.id, clube?.id)
    val papelRotulo: String get() = conta.papelRotulo ?: rotuloPapel(conta.papel)
    val categorias: List<Categoria> get() = clube?.categorias.orEmpty()
    val nome: String get() = clube?.nome ?: conta.nome

    /** A pessoa tem a permissão (independe de só leitura — para VER). */
    fun pode(permissao: String): Boolean = permissao in permissoes

    /** Pode MUDAR algo dessa área: tem a permissão e a equipe não está em só leitura. */
    fun podeEditar(permissao: String): Boolean = !somenteLeitura && permissao in permissoes

    /** Há alguma permissão de edição? */
    val editaAlgo: Boolean get() = !somenteLeitura && permissoes.any { it in PERMISSOES_DE_EDICAO }
}

/** As permissões que mudam dados (o resto é ver). */
val PERMISSOES_DE_EDICAO: Set<String> = setOf(
    "training:edit", "training:delete", "games:edit", "athletes:edit", "injuries:manage", "tactical:edit",
    "library:edit", "categories:manage", "members:manage", "club_settings:manage",
)

fun contextoDe(me: Me, escolha: Escolha?): ContextoClube? {
    if (escolha == null) return null
    val conta = me.workspaces.firstOrNull { it.id == escolha.workspaceId } ?: return null
    val clube = escolha.clubeId?.let { id -> conta.clubes?.firstOrNull { it.id == id } }
    if (escolha.clubeId != null && clube == null) return null
    val leitura = (conta.somenteLeitura ?: true) || (clube?.arquivado ?: false)
    return ContextoClube(conta, clube, conta.permissoes.orEmpty().toSet(), leitura, textoSomenteLeitura(me))
}

/**
 * A faixa do topo no modo só leitura. Regra de texto (Apple 3.1.3): sem link, botão, preço,
 * "assine", "plano", "site" ou "upgrade" — vale também para o dono.
 */
fun textoSomenteLeitura(me: Me?): String {
    val m = me?.mensagemSomenteLeitura
    return if (!m.isNullOrEmpty() && textoNeutro(m)) m else TEXTO_SO_LEITURA
}

/** O texto passa na regra 3.1.3 (nada que lembre compra)? */
fun textoNeutro(texto: String): Boolean {
    val t = texto.lowercase()
    return PALAVRAS_DE_COMPRA.none { t.contains(it) }
}

internal val PALAVRAS_DE_COMPRA = listOf("assin", "plano", "preço", "preco", "r$", "site", "upgrade", "compr", "pag", "http", "www")

/** Rótulo do papel quando o servidor não mandou um. */
fun rotuloPapel(papel: String?): String = when (papel) {
    "owner" -> "Dono"
    "manager" -> "Gerente"
    "head_coach" -> "Treinador principal"
    "assistant_coach" -> "Treinador auxiliar"
    "specialist" -> "Especialista"
    "viewer" -> "Observador"
    else -> "Comissão"
}

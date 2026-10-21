package com.faggin.tactiplan.app.dados

// "Exigir biometria ao abrir" (Mais › Segurança), copiado do Gestsport. Desligado por padrão;
// a escolha fica nas prefs do cofre. Regra pura (paridade: TactiPlanKit/TravaApp.swift): abrir o
// app frio com a opção ligada bloqueia; voltar do segundo plano bloqueia só depois da carência
// (1 min) — o próprio pedido de biometria/senha do sistema não conta como "saiu do app".

/** Chave da preferência no cofre ("1" = ligada; ausente = desligada). */
const val CHAVE_BIOMETRIA = "pref:biometria"

/** Voltar do segundo plano antes disso não pede de novo. */
const val CARENCIA_BIOMETRIA_MS = 60_000L

fun biometriaLigada(a: Armazem?): Boolean = a?.ler(CHAVE_BIOMETRIA) == "1"

fun gravarBiometria(a: Armazem?, ligada: Boolean) {
    if (ligada) a?.gravar(CHAVE_BIOMETRIA, "1") else a?.remover(CHAVE_BIOMETRIA)
}

data class TravaApp(val bloqueada: Boolean, val noFundoDesde: Long? = null) {
    /** Foi pro segundo plano (conta a 1ª vez; idas repetidas não empurram o relógio). */
    fun foiProFundo(agora: Long): TravaApp = if (noFundoDesde == null) copy(noFundoDesde = agora) else this

    /** Voltou: com a opção ligada e fora há ≥ carência, bloqueia. */
    fun voltou(agora: Long, ligada: Boolean): TravaApp {
        val desde = noFundoDesde ?: return this
        val bloquear = ligada && agora - desde >= CARENCIA_BIOMETRIA_MS
        return TravaApp(bloqueada || bloquear, null)
    }

    fun desbloqueou(): TravaApp = copy(bloqueada = false)

    /** Desligar a opção nunca deixa o app travado. */
    fun mudouOpcao(ligada: Boolean): TravaApp = if (ligada) this else copy(bloqueada = false)

    companion object {
        /** App aberto do zero: bloqueado se a opção está ligada. */
        fun aoAbrir(ligada: Boolean) = TravaApp(bloqueada = ligada)
    }
}

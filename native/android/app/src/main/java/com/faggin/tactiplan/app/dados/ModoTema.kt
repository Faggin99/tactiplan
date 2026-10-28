package com.faggin.tactiplan.app.dados

// Aparência escolhida na aba Mais (28/10/2026): Automático segue o aparelho; Claro/Escuro fixam,
// para não depender só do modo do sistema (que no iPhone pode mudar com a hora do dia).
// Paridade: TactiPlanKit/ModoTema.swift.

enum class ModoTema(val chave: String, val rotulo: String) {
    AUTOMATICO("automatico", "Automático"),
    CLARO("claro", "Claro"),
    ESCURO("escuro", "Escuro");

    /** null = segue o aparelho. */
    fun escuroFixo(): Boolean? = when (this) { CLARO -> false; ESCURO -> true; AUTOMATICO -> null }

    companion object {
        const val CHAVE_PREFERENCIA = "modo_tema"
        fun de(chave: String?): ModoTema = entries.firstOrNull { it.chave == chave } ?: AUTOMATICO
    }
}

const val TEXTO_MODO_TEMA = "Automático segue o modo claro ou escuro do aparelho."

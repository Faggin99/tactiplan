package com.faggin.tactiplan.app.dados

import android.content.SharedPreferences

/**
 * Chave → texto, síncrono. A lógica (cache, cofre) só conhece esta interface,
 * então roda e é testada na JVM; no aparelho o armazém é um SharedPreferences.
 */
interface Armazem {
    fun ler(chave: String): String?
    fun gravar(chave: String, valor: String)
    fun remover(chave: String)
    fun chaves(): Set<String>

    /**
     * Grava e LANÇA [ErroArmazem] se não ficou gravado. É o caminho da fila da
     * chamada: "salva no aparelho" só pode ser dito se estiver mesmo no disco
     * (o [gravar] do cache pode falhar calado — o cache é descartável).
     */
    fun gravarOuFalhar(chave: String, valor: String) = gravar(chave, valor)
}

/** O armazém não conseguiu gravar (disco cheio, arquivo com problema…). */
class ErroArmazem(mensagem: String) : Exception(mensagem)

/** Armazém em memória (testes). */
class ArmazemMemoria : Armazem {
    val mapa = LinkedHashMap<String, String>()
    @Synchronized override fun ler(chave: String) = mapa[chave]
    @Synchronized override fun gravar(chave: String, valor: String) { mapa[chave] = valor }
    @Synchronized override fun remover(chave: String) { mapa.remove(chave) }
    @Synchronized override fun chaves(): Set<String> = mapa.keys.toSet()
}

/** Armazém do aparelho. `commit()` porque sair/entrar precisa estar gravado na volta. */
class ArmazemPreferencias(private val prefs: SharedPreferences) : Armazem {
    override fun ler(chave: String): String? = prefs.getString(chave, null)
    override fun gravar(chave: String, valor: String) { prefs.edit().putString(chave, valor).commit() }

    /** `commit()` devolve false quando não gravou no disco: aqui isso vira erro. */
    override fun gravarOuFalhar(chave: String, valor: String) {
        if (!prefs.edit().putString(chave, valor).commit()) throw ErroArmazem("não gravou $chave")
    }
    override fun remover(chave: String) { prefs.edit().remove(chave).commit() }
    override fun chaves(): Set<String> = prefs.all.keys.toSet()
}

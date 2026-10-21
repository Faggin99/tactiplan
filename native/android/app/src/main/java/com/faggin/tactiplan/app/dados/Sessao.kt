package com.faggin.tactiplan.app.dados

import android.content.Context
import android.util.Log
import java.util.Base64
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// A sessão do app: o token revogável do BFF + o último /me (abre na hora, mesmo sem sinal)
// + o clube escolhido. Mora no cofre do aparelho (Tink AES-256-GCM com a chave-mestra no
// Android Keystore) — nunca em armazenamento comum. Paridade: TactiPlanKit/Sessao.swift.

/** Onde a pessoa está trabalhando: a conta (workspace) e o clube dela. */
@Serializable
data class Escolha(
    @SerialName("workspace_id") val workspaceId: String,
    /** null = conta ainda sem clube cadastrado. */
    @SerialName("clube_id") val clubeId: String?,
)

@Serializable
data class Sessao(
    val token: String,
    @SerialName("expira_em") val expiraEm: String? = null,
    val me: Me,
    /** Clube em uso. null = ainda não escolheu (tela "Onde entrar"). */
    val escolha: Escolha? = null,
    /** Quando o `me` foi confirmado pelo servidor (ms desde 1970) — o "atualizado há X". */
    @SerialName("me_em") val meEm: Long? = null,
)

/** Cofre da sessão. No aparelho, [CofreSessaoCifrado]; nos testes, a memória. Blob ilegível → null. */
interface CofreSessao {
    fun salvar(sessao: Sessao)
    fun ler(): Sessao?
    fun limpar()
    /** Último clube escolhido por PESSOA (fica fora da sessão: sair e entrar de novo volta nele). */
    fun lerUltimaEscolha(usuarioId: String): Escolha?
    fun guardarUltimaEscolha(usuarioId: String, escolha: Escolha)
}

fun chaveUltimaEscolha(usuarioId: String): String = "ultima_escolha:$usuarioId"

/** Cifra simétrica autenticada (no aparelho: Tink [Aead]). Interface pra testar na JVM. */
interface Cifra {
    fun cifrar(texto: ByteArray, contexto: ByteArray): ByteArray
    fun decifrar(cifrado: ByteArray, contexto: ByteArray): ByteArray
}

class CifraTink(private val aead: Aead) : Cifra {
    override fun cifrar(texto: ByteArray, contexto: ByteArray): ByteArray = aead.encrypt(texto, contexto)
    override fun decifrar(cifrado: ByteArray, contexto: ByteArray): ByteArray = aead.decrypt(cifrado, contexto)
}

/** Sessão em JSON, cifrada e gravada em base64 no [armazem]. Só lógica (roda na JVM). */
class CofreSessaoCifrado(private val armazem: Armazem, private val cifra: Cifra) : CofreSessao {
    override fun salvar(sessao: Sessao) {
        val claro = JsonApp.encodeToString(Sessao.serializer(), sessao).encodeToByteArray()
        armazem.gravar(CHAVE, Base64.getEncoder().encodeToString(cifra.cifrar(claro, CONTEXTO)))
    }

    override fun ler(): Sessao? {
        val raw = armazem.ler(CHAVE) ?: return null
        return try {
            val claro = cifra.decifrar(Base64.getDecoder().decode(raw), CONTEXTO)
            JsonApp.decodeFromString(Sessao.serializer(), claro.decodeToString())
        } catch (e: Exception) {
            null
        }
    }

    override fun limpar() = armazem.remover(CHAVE)

    // A última escolha não é segredo (ids): fica no mesmo armazém, em claro.
    override fun lerUltimaEscolha(usuarioId: String): Escolha? {
        val raw = armazem.ler(chaveUltimaEscolha(usuarioId)) ?: return null
        return try { JsonApp.decodeFromString(Escolha.serializer(), raw) } catch (e: Exception) { null }
    }

    override fun guardarUltimaEscolha(usuarioId: String, escolha: Escolha) =
        armazem.gravar(chaveUltimaEscolha(usuarioId), JsonApp.encodeToString(Escolha.serializer(), escolha))

    companion object {
        const val CHAVE = "sessao"
        // "Associated data" do AEAD: amarra o blob a este uso.
        private val CONTEXTO = "tactiplan:sessao".encodeToByteArray()
    }
}

/** Cofre em memória (testes, prévias e último recurso se o Keystore falhar). */
class CofreSessaoMemoria : CofreSessao {
    @Volatile private var sessao: Sessao? = null
    private val escolhas = java.util.concurrent.ConcurrentHashMap<String, Escolha>()
    override fun salvar(sessao: Sessao) { this.sessao = sessao }
    override fun ler(): Sessao? = sessao
    override fun limpar() { sessao = null }
    override fun lerUltimaEscolha(usuarioId: String): Escolha? = escolhas[usuarioId]
    override fun guardarUltimaEscolha(usuarioId: String, escolha: Escolha) { escolhas[usuarioId] = escolha }
}

/**
 * Monta o cofre cifrado sem nunca derrubar o app (Keystore indisponível, chave-mestra
 * invalidada…): 1ª falha apaga keyset + sessão e tenta de novo; 2ª falha → cofre em memória.
 */
fun montarCofre(
    construirCifra: () -> Cifra,
    apagarCofre: () -> Unit,
    armazem: Armazem,
    aoFalhar: (Throwable) -> Unit = {},
): CofreSessao {
    val cifra = try {
        construirCifra()
    } catch (e: Exception) {
        aoFalhar(e)
        try { apagarCofre() } catch (_: Exception) {}
        try {
            construirCifra()
        } catch (e2: Exception) {
            aoFalhar(e2)
            return CofreSessaoMemoria()
        }
    }
    return CofreSessaoCifrado(armazem, cifra)
}

/**
 * Montagem no aparelho (o mesmo desenho do Gestsport): keyset AES-256-GCM em SharedPreferences,
 * embrulhado por uma chave-mestra do Android Keystore que nunca sai do hardware.
 */
object CofreAndroid {
    private const val ARQ_COFRE = "tactiplan_cofre"
    /** As prefs do cofre (a opção "Exigir biometria ao abrir" mora aqui). */
    const val ARQ_PREFS_COFRE = ARQ_COFRE
    private const val ARQ_KEYSET = "tactiplan_cofre_keyset"
    private const val NOME_KEYSET = "keyset"
    private const val CHAVE_MESTRA = "android-keystore://tactiplan_cofre_mestra"

    @Volatile private var unico: CofreSessao? = null

    /** UM por processo (Activity recriada reaproveita). */
    fun cofre(context: Context): CofreSessao =
        unico ?: synchronized(this) { unico ?: criar(context.applicationContext).also { unico = it } }

    private fun criar(context: Context): CofreSessao {
        val prefs = context.getSharedPreferences(ARQ_COFRE, Context.MODE_PRIVATE)
        return montarCofre(
            construirCifra = { cifraDoKeystore(context) },
            apagarCofre = {
                context.getSharedPreferences(ARQ_KEYSET, Context.MODE_PRIVATE).edit().clear().commit()
                prefs.edit().clear().commit()
            },
            armazem = ArmazemPreferencias(prefs),
            aoFalhar = { e -> Log.w("TactiPlan", "cofre da sessão indisponível", e) },
        )
    }

    private fun cifraDoKeystore(context: Context): Cifra {
        AeadConfig.register()
        val keyset = AndroidKeysetManager.Builder()
            .withSharedPref(context, NOME_KEYSET, ARQ_KEYSET)
            .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
            .withMasterKeyUri(CHAVE_MESTRA)
            .build()
            .keysetHandle
        return CifraTink(keyset.getPrimitive(RegistryConfiguration.get(), Aead::class.java))
    }
}

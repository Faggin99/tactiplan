package com.faggin.tactiplan.app.dados

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

// As chamadas do app ao BFF /api/app (backend-node/src/routes/app*.js), atrás de uma interface:
// o [ControleSessao] e o [EntrarModelo] só conhecem [ApiApp] — nos testes, um falso.
// Paridade: TactiPlanKit/ApiApp.swift.

/** Quem é o aparelho (vai no login). */
data class Aparelho(val plataforma: String, val nome: String? = null, val versaoApp: String? = null) {
    internal val json: JsonObject
        get() = buildJsonObject {
            put("plataforma", plataforma)
            if (nome != null) put("nome", nome)
            if (versaoApp != null) put("versao_app", versaoApp)
        }
}

const val PLATAFORMA_IOS = "ios"
const val PLATAFORMA_ANDROID = "android"

interface ApiApp {
    suspend fun config(): ConfigApp
    suspend fun entrar(email: String, senha: String, aparelho: Aparelho): RespostaLogin
    suspend fun entrarComGoogle(idToken: String, aparelho: Aparelho): RespostaLogin
    suspend fun entrarComApple(identityToken: String, nome: String?, aparelho: Aparelho): RespostaLogin
    suspend fun me(token: String): Me
    suspend fun aceitarConvite(token: String, convite: String): RespostaConvite
    suspend fun sair(token: String)
    suspend fun registrarPush(token: String, tokenPush: String, plataforma: String)
}

/** O de verdade, sobre o [Api] (HTTP). */
class ApiAppHttp(private val api: Api) : ApiApp {
    override suspend fun config(): ConfigApp = api.chamar("/app/auth/config")

    override suspend fun entrar(email: String, senha: String, aparelho: Aparelho): RespostaLogin =
        api.chamar("/app/auth/entrar", "POST", buildJsonObject {
            put("email", email.trim()); put("senha", senha); put("aparelho", aparelho.json)
        })

    override suspend fun entrarComGoogle(idToken: String, aparelho: Aparelho): RespostaLogin =
        api.chamar("/app/auth/google", "POST", buildJsonObject { put("id_token", idToken); put("aparelho", aparelho.json) })

    override suspend fun entrarComApple(identityToken: String, nome: String?, aparelho: Aparelho): RespostaLogin =
        api.chamar("/app/auth/apple", "POST", buildJsonObject {
            put("identity_token", identityToken); put("aparelho", aparelho.json)
            if (!nome.isNullOrEmpty()) put("nome", nome)
        })

    override suspend fun me(token: String): Me = api.chamar("/app/me", token = token)

    override suspend fun aceitarConvite(token: String, convite: String): RespostaConvite =
        api.chamar("/app/convites/${codificarComponente(convite)}/aceitar", "POST", token = token)

    override suspend fun sair(token: String) {
        api.chamarJson("/app/auth/sair", "POST", token = token)
    }

    override suspend fun registrarPush(token: String, tokenPush: String, plataforma: String) {
        api.chamarJson("/app/push/registrar", "POST",
            buildJsonObject { put("token", JsonPrimitive(tokenPush)); put("plataforma", JsonPrimitive(plataforma)) },
            token = token)
    }
}

/** Porte do `encodeURIComponent` do JS (o mesmo do Swift). */
fun codificarComponente(s: String): String {
    val livres = "-_.!~*'()"
    val sb = StringBuilder()
    for (b in s.toByteArray(Charsets.UTF_8)) {
        val c = b.toInt() and 0xFF
        val ch = c.toChar()
        if (ch in 'A'..'Z' || ch in 'a'..'z' || ch in '0'..'9' || (c < 128 && ch in livres)) sb.append(ch)
        else sb.append('%').append("0123456789ABCDEF"[c shr 4]).append("0123456789ABCDEF"[c and 0xF])
    }
    return sb.toString()
}


// ---------- login social ----------

/** "Entrar com a Apple": servidor liga E o build tem a capability (só iPhone; aqui por paridade). */
fun mostrarApple(c: ConfigApp, appleNoBuild: Boolean): Boolean = appleNoBuild && (c.apple?.ativo ?: false)

/** Google no iPhone (paridade): servidor ligado + client iOS + a Apple junto (regra 4.8). */
fun googleIOSClientId(c: ConfigApp, appleNoBuild: Boolean): String? {
    val id = c.google?.iosClientId
    if (c.google?.ativo != true || id.isNullOrEmpty() || !mostrarApple(c, appleNoBuild)) return null
    return id
}

/** Google no Android: servidor ligado + o client WEB (serverClientId do Credential Manager). */
fun googleAndroidServerClientId(c: ConfigApp): String? {
    val id = c.google?.androidServerClientId
    if (c.google?.ativo != true || id.isNullOrEmpty()) return null
    return id
}

package com.faggin.tactiplan.app.ui.comum

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import com.faggin.tactiplan.app.design.TactiPlan

// Links de fora (privacidade, termos, "Esqueci a senha", WhatsApp do suporte), copiado do
// Gestsport: navegador in-app (Custom Tabs), nunca um formulário nosso
// (Apple 3.1.1 / spec §6). Sem navegador com Custom Tabs, cai no ACTION_VIEW.

/** Quem abre um link. Testes trocam por um que só anota a URL. */
fun interface AbrirLink {
    fun abrir(url: String)
}

const val MSG_LINK_INVALIDO = "Não deu para abrir esse link."

/** Só http/https saem do app (paridade: AbrirLink.swift); intent:, file:, javascript:… nunca. */
fun linkSeguro(url: String): Boolean {
    val esquema = url.trim().substringBefore(':', missingDelimiterValue = "").lowercase()
    return (esquema == "http" || esquema == "https") && url.trim().length > esquema.length + 3
}

/**
 * Custom Tabs com a barra na cor de superfície; sem navegador nenhum, não faz
 * nada. Link que não é http/https é ignorado com um aviso breve e calmo.
 */
fun abrirEmCustomTab(context: Context, url: String, corBarra: Int? = null) {
    if (!linkSeguro(url)) {
        Toast.makeText(context, MSG_LINK_INVALIDO, Toast.LENGTH_SHORT).show()
        return
    }
    val uri = Uri.parse(url.trim())
    val intent = CustomTabsIntent.Builder().setShowTitle(true).apply {
        if (corBarra != null) {
            setDefaultColorSchemeParams(CustomTabColorSchemeParams.Builder().setToolbarColor(corBarra).build())
        }
    }.build()
    try {
        intent.launchUrl(context, uri)
    } catch (_: ActivityNotFoundException) {
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            // Aparelho sem navegador: nada a abrir.
        }
    }
}

/** `tel:` só com dígitos (e o + do DDI): nada de `tel:*#...` (códigos de serviço). */
fun linkDeDiscagem(url: String): Boolean = Regex("^tel:\\+?[0-9]{8,15}$").matches(url.trim())

/** Link de conversa do WhatsApp (`https://wa.me/<dígitos>`): abre direto no app. */
fun linkWhatsAppWeb(url: String): Boolean = Regex("^https://wa\\.me/[0-9]{8,15}$").matches(url.trim())

/**
 * O padrão do app: `tel:` abre o DISCADOR (ACTION_DIAL — o professor ainda
 * confirma a ligação, sem permissão de telefone); `wa.me` vai pro app do
 * WhatsApp (ACTION_VIEW; sem ele, o navegador); o resto http/https em Custom
 * Tabs. Qualquer outro esquema é recusado.
 */
fun abrirLinkExterno(context: Context, url: String, corBarra: Int? = null) {
    val u = url.trim()
    if (linkDeDiscagem(u) || linkWhatsAppWeb(u)) {
        val acao = if (u.startsWith("tel:")) Intent.ACTION_DIAL else Intent.ACTION_VIEW
        try {
            context.startActivity(Intent(acao, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        } catch (_: ActivityNotFoundException) {
            if (acao == Intent.ACTION_DIAL) {
                Toast.makeText(context, MSG_LINK_INVALIDO, Toast.LENGTH_SHORT).show()
                return
            }
        }
    }
    abrirEmCustomTab(context, u, corBarra)
}

/** null = o padrão ([abrirLinkExterno] no contexto atual). */
val LocalAbrirLink = staticCompositionLocalOf<AbrirLink?> { null }

@Composable
fun rememberAbrirLink(): AbrirLink {
    LocalAbrirLink.current?.let { return it }
    val context = LocalContext.current
    val cor = TactiPlan.cores.superficie.toArgb()
    return remember(context, cor) { AbrirLink { url -> abrirLinkExterno(context, url, cor) } }
}

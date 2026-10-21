package com.faggin.tactiplan.app.push

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

// Push (FCM): estrutura pronta e DESLIGADA. Sem google-services.json na build o Firebase não
// inicializa e tudo aqui devolve null — nada é pedido ao sistema nem enviado ao servidor.
object PushFirebase {
    fun ativo(context: Context): Boolean = try {
        FirebaseApp.getApps(context).isNotEmpty() || FirebaseApp.initializeApp(context) != null
    } catch (_: Exception) {
        false
    }

    /** Token FCM do aparelho, ou null (sem Firebase, sem rede, demorou mais de 10 s). */
    @Suppress("DEPRECATION")
    suspend fun token(context: Context): String? {
        if (!ativo(context)) return null
        return withTimeoutOrNull(10_000) {
            suspendCancellableCoroutine { cont ->
                FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { if (cont.isActive) cont.resume(it) }
                    .addOnFailureListener { if (cont.isActive) cont.resume(null) }
            }
        }
    }
}

package com.faggin.tactiplan.app.push

import com.faggin.tactiplan.app.Montagem
import com.faggin.tactiplan.app.dados.PLATAFORMA_ANDROID
import com.google.firebase.messaging.FirebaseMessagingService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Serviço do FCM — só existe de fato com google-services.json na build. Token novo → guarda no
 * servidor (POST /api/app/push/registrar). Nenhuma notificação é tratada/mostrada ainda (push DESLIGADO).
 */
class ServicoPush : FirebaseMessagingService() {
    private val escopo = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) {
        val controle = Montagem.controle(applicationContext)
        escopo.launch { controle.registrarPush(token, PLATAFORMA_ANDROID) }
    }
}

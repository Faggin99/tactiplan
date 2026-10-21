package com.faggin.tactiplan.app.ui.entrar

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

// "Continuar com o Google" no Android pelo Credential Manager (copiado do Gestsport). O app só
// obtém o ID token; quem confere é o servidor (POST /api/app/auth/google, audiência = client web).
// O client WEB vem do servidor (GET /api/app/auth/config → google.android_server_client_id).
// O client Android (pacote com.faggin.tactiplan.app + SHA-1) só precisa EXISTIR no Google Cloud.

/** Cancelado pela pessoa (fechou a folha do Google): a tela não mostra erro. */
class GoogleCancelado : Exception()

fun interface LoginGoogle {
    suspend fun idToken(serverClientId: String): String
}

fun loginGoogleAndroid(context: Context): LoginGoogle = LoginGoogle { serverClientId ->
    val opcao = GetSignInWithGoogleOption.Builder(serverClientId).build()
    val pedido = GetCredentialRequest.Builder().addCredentialOption(opcao).build()
    val resposta = try {
        CredentialManager.create(context).getCredential(context, pedido)
    } catch (e: GetCredentialCancellationException) {
        throw GoogleCancelado()
    }
    val c = resposta.credential
    if (c is CustomCredential && c.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
        GoogleIdTokenCredential.createFrom(c.data).idToken
    } else {
        error("Credencial inesperada: ${c.type}")
    }
}

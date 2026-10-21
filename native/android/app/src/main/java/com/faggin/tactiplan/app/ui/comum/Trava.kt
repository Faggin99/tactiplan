package com.faggin.tactiplan.app.ui.comum

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.Armazem
import com.faggin.tactiplan.app.dados.TEXTO_BLOQUEIO
import com.faggin.tactiplan.app.dados.TEXTO_SEM_BLOQUEIO_APARELHO
import com.faggin.tactiplan.app.dados.TITULO_DESBLOQUEIO
import com.faggin.tactiplan.app.dados.TravaApp
import com.faggin.tactiplan.app.dados.biometriaLigada
import com.faggin.tactiplan.app.dados.gravarBiometria
import com.faggin.tactiplan.app.design.TactiPlan

// "Exigir biometria ao abrir" (copiado do Gestsport): o estado (regra pura em dados/TravaApp.kt), a
// tela de bloqueio por cima da casca e o pedido de biometria/senha do aparelho
// (BiometricPrompt do sistema no Android 10+, a tela de confirmação do Keyguard
// antes disso — sem dependência nova). Paridade: Componentes/Trava.swift.

const val TAG_BLOQUEIO = "trava:bloqueio"

/**
 * Dono da trava do app: a opção (no cofre — as prefs do cofre) e o estado. A
 * Activity avisa [foiProFundo]/[voltou]; a casca mostra [TelaBloqueio] quando
 * [bloqueada] e há sessão. [aparelhoProtegido] = o aparelho tem bloqueio de tela.
 */
class TravaDoApp(
    private val armazem: Armazem,
    private val aparelhoProtegido: () -> Boolean,
    private val agora: () -> Long = System::currentTimeMillis,
) {
    var ligada: Boolean by mutableStateOf(biometriaLigada(armazem))
        private set
    private var estado: TravaApp by mutableStateOf(TravaApp.aoAbrir(ligada))

    val bloqueada: Boolean get() = estado.bloqueada
    val disponivel: Boolean get() = aparelhoProtegido()

    fun foiProFundo() { estado = estado.foiProFundo(agora()) }
    fun voltou() { estado = estado.voltou(agora(), ligada) }
    fun desbloqueou() { estado = estado.desbloqueou() }

    fun mudar(ligar: Boolean) {
        gravarBiometria(armazem, ligar)
        ligada = ligar
        estado = estado.mudouOpcao(ligar)
    }
}

/** A trava do app (null = sem trava: testes/prévias — a seção Segurança some). */
val LocalTravaDoApp = staticCompositionLocalOf<TravaDoApp?> { null }

/** O aparelho tem bloqueio de tela (PIN/padrão/senha/biometria)? */
fun aparelhoProtegido(context: Context): Boolean =
    context.getSystemService(KeyguardManager::class.java)?.isDeviceSecure == true

/**
 * Pede a biometria OU a senha do aparelho e devolve o resultado em [aoResultado].
 * Aparelho sem bloqueio de tela: libera (não há o que pedir).
 */
@Composable
fun rememberAutenticar(aoResultado: (Boolean) -> Unit): () -> Unit {
    val ctx = LocalContext.current
    val resultado by rememberUpdatedState(aoResultado)
    val keyguard = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        resultado(it.resultCode == Activity.RESULT_OK)
    }
    return remember(ctx) {
        {
            val km = ctx.getSystemService(KeyguardManager::class.java)
            if (km == null || !km.isDeviceSecure) {
                resultado(true)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val b = BiometricPrompt.Builder(ctx).setTitle(TITULO_DESBLOQUEIO)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    b.setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL,
                    )
                } else {
                    @Suppress("DEPRECATION")
                    b.setDeviceCredentialAllowed(true)
                }
                b.build().authenticate(
                    CancellationSignal(), ctx.mainExecutor,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(r: BiometricPrompt.AuthenticationResult?) = resultado(true)
                        override fun onAuthenticationError(codigo: Int, texto: CharSequence?) = resultado(false)
                    },
                )
            } else {
                @Suppress("DEPRECATION")
                val i = km.createConfirmDeviceCredentialIntent(TITULO_DESBLOQUEIO, null)
                if (i == null) resultado(true) else keyguard.launch(i)
            }
        }
    }
}

/**
 * Tela de bloqueio por cima da casca (a casca fica montada — nada se perde): a
 * marca, o texto e "Desbloquear". Pede a biometria sozinha ao aparecer.
 */
@Composable
fun TelaBloqueio(desbloquear: () -> Unit, modifier: Modifier = Modifier) {
    LaunchedEffect(Unit) { desbloquear() }
    // Surface do Material bloqueia o toque na casca por baixo.
    Surface(modifier.fillMaxSize().testTag(TAG_BLOQUEIO), color = TactiPlan.cores.fundo) {
        Column(
            Modifier.fillMaxSize().padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            MarcaTactiPlan()
            Text(TITULO_DESBLOQUEIO, style = TactiPlan.tipos.titulo20, color = TactiPlan.cores.tinta, textAlign = TextAlign.Center)
            Text(TEXTO_BLOQUEIO, style = TactiPlan.tipos.corpo15, color = TactiPlan.cores.tinta2, textAlign = TextAlign.Center)
            Botao("Desbloquear", desbloquear)
        }
    }
}

/** Seção "Segurança" do Mais. Ligar pede a biometria antes (confirma que funciona); desligar não pede. */
@Composable
fun SecaoSeguranca() {
    val trava = LocalTravaDoApp.current ?: return
    var ligando by remember { mutableStateOf(false) }
    val autenticar = rememberAutenticar { ok ->
        if (ligando && ok) trava.mudar(true)
        ligando = false
    }
    val disponivel = trava.disponivel
    ListaAgrupada("Segurança") {
        LinhaInterruptor(
            Icones.escudo, "Exigir biometria ao abrir", trava.ligada,
            { ligar ->
                if (ligar) {
                    ligando = true
                    autenticar()
                } else {
                    trava.mudar(false)
                }
            },
            detalhe = if (disponivel || trava.ligada) "Pede a biometria ou o código do aparelho ao abrir o app." else TEXTO_SEM_BLOQUEIO_APARELHO,
            habilitado = disponivel || trava.ligada,
        )
    }
}

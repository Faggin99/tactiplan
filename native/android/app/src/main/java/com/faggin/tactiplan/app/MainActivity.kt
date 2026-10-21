package com.faggin.tactiplan.app

import android.content.Context
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.lifecycleScope
import com.faggin.tactiplan.app.dados.Aparelho
import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.ApiAppHttp
import com.faggin.tactiplan.app.dados.ArmazemPreferencias
import com.faggin.tactiplan.app.dados.CofreAndroid
import com.faggin.tactiplan.app.dados.ControleSessao
import com.faggin.tactiplan.app.dados.PLATAFORMA_ANDROID
import com.faggin.tactiplan.app.push.PushFirebase
import com.faggin.tactiplan.app.ui.App
import com.faggin.tactiplan.app.ui.comum.TravaDoApp
import com.faggin.tactiplan.app.ui.comum.aparelhoProtegido
import com.faggin.tactiplan.app.ui.entrar.loginGoogleAndroid
import kotlinx.coroutines.launch

/** Montagem do processo: UMA API, UM [ControleSessao] (e, por ele, um cofre). */
object Montagem {
    val api: ApiAppHttp by lazy { ApiAppHttp(Api(BuildConfig.API_BASE)) }

    @Volatile private var controle: ControleSessao? = null
    @Volatile private var trava: TravaDoApp? = null

    fun controle(context: Context): ControleSessao =
        controle ?: synchronized(this) {
            controle ?: ControleSessao(api, CofreAndroid.cofre(context)).also { controle = it }
        }

    /** "Exigir biometria ao abrir" — a opção mora nas prefs do cofre. */
    fun trava(context: Context): TravaDoApp =
        trava ?: synchronized(this) {
            trava ?: run {
                val app = context.applicationContext
                TravaDoApp(
                    ArmazemPreferencias(app.getSharedPreferences(CofreAndroid.ARQ_PREFS_COFRE, Context.MODE_PRIVATE)),
                    aparelhoProtegido = { aparelhoProtegido(app) },
                )
            }.also { trava = it }
        }

    fun aparelho(): Aparelho = Aparelho(
        PLATAFORMA_ANDROID,
        nome = listOf(Build.MANUFACTURER, Build.MODEL).filter { !it.isNullOrBlank() }.joinToString(" ").take(120),
        versaoApp = BuildConfig.VERSION_NAME,
    )
}

private val SCRIM_CLARO = Color.argb(0xe6, 0xFF, 0xFF, 0xFF)
private val SCRIM_ESCURO = Color.argb(0xe6, 0x0B, 0x11, 0x20)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(SCRIM_CLARO, SCRIM_ESCURO),
        )
        super.onCreate(savedInstanceState)
        val controle = Montagem.controle(applicationContext)
        val trava = Montagem.trava(applicationContext)
        val google = loginGoogleAndroid(this)
        setContent {
            App(controle, Montagem.api, Montagem.aparelho(), google, trava, BuildConfig.VERSION_NAME)
        }
    }

    override fun onStart() {
        super.onStart()
        Montagem.trava(applicationContext).voltou()
        val controle = Montagem.controle(applicationContext)
        lifecycleScope.launch {
            controle.atualizarMe()
            // Push: estrutura pronta e DESLIGADA — só faz algo com google-services.json na build.
            PushFirebase.token(applicationContext)?.let { controle.registrarPush(it, PLATAFORMA_ANDROID) }
        }
    }

    override fun onStop() {
        super.onStop()
        Montagem.trava(applicationContext).foiProFundo()
    }
}

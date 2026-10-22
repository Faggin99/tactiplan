package com.faggin.tactiplan.app.ui.jogos

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.faggin.tactiplan.app.dados.ArmazemPreferencias
import com.faggin.tactiplan.app.dados.Cor
import com.faggin.tactiplan.app.dados.jogo.FilaJogos
import com.faggin.tactiplan.app.dados.jogo.Resultado
import com.faggin.tactiplan.app.dados.jogo.iniciaisDoAtleta
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.design.cor

// Peças da T2 que só existem no Android: fila persistente do aparelho, rede, selos e avatar.

private val filas = HashMap<String, FilaJogos>()

/**
 * A fila do jogo sem internet: um SharedPreferences PRÓPRIO por pessoa (não é o cache descartável;
 * `commit()` + gravarOuFalhar). Fora do backup como o resto do app (regras_backup).
 */
fun filaJogosDoAparelho(context: Context, usuarioId: String): FilaJogos = synchronized(filas) {
    val nome = "tactiplan_fila_jogos_" + usuarioId.filter { it.isLetterOrDigit() || it == '-' }.ifEmpty { "anon" }
    filas.getOrPut(nome) { FilaJogos(ArmazemPreferencias(context.applicationContext.getSharedPreferences(nome, Context.MODE_PRIVATE))) }
}

fun temRedeAgora(context: Context): Boolean {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}

/** Estado da rede enquanto a tela está aberta (NetworkCallback); `aoVoltar` quando a rede volta. */
@Composable
fun rememberRede(aoVoltar: () -> Unit): State<Boolean> {
    val context = LocalContext.current
    val estado = remember { mutableStateOf(runCatching { temRedeAgora(context) }.getOrDefault(true)) }
    DisposableEffect(Unit) {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                val antes = estado.value
                estado.value = true
                if (!antes) android.os.Handler(android.os.Looper.getMainLooper()).post(aoVoltar)
            }
            override fun onLost(network: Network) { estado.value = runCatching { temRedeAgora(context) }.getOrDefault(false) }
        }
        val ok = runCatching { cm?.registerDefaultNetworkCallback(cb) }.isSuccess && cm != null
        onDispose { if (ok) runCatching { cm?.unregisterNetworkCallback(cb) } }
    }
    return estado
}

@Composable
fun coresDoResultado(r: Resultado): Pair<Color, Color> {
    val c = TactiPlan.cores
    return when (r) {
        Resultado.VITORIA -> c.okFundo to c.okTinta
        Resultado.EMPATE -> c.neutroFundo to c.neutroTinta
        Resultado.DERROTA -> c.erroFundo to c.erroTinta
    }
}

fun rotuloResultado(r: Resultado) = when (r) {
    Resultado.VITORIA -> "Vitória"
    Resultado.EMPATE -> "Empate"
    Resultado.DERROTA -> "Derrota"
}

@Composable
fun SeloResultado(r: Resultado, tamanho: Dp = 40.dp) {
    val (fundo, tinta) = coresDoResultado(r)
    Box(Modifier.size(tamanho).clip(RoundedCornerShape(12.dp)).background(fundo), contentAlignment = Alignment.Center) {
        Text(r.letra, color = tinta, fontWeight = FontWeight.Bold, style = TactiPlan.tipos.corpo17)
    }
}

/** Círculo do atleta (como no campo do web): camisa ou iniciais, branco com borda navy. */
@Composable
fun AvatarCamisa(camisa: Int?, nome: String?, tamanho: Dp = 36.dp, borda: Color = Color(0xFF0F172A), destaque: Boolean = false) {
    Box(
        Modifier.size(tamanho).clip(CircleShape).background(Color.White)
            .border(if (destaque) 3.dp else 2.dp, if (destaque) Color(0xFFFACC15) else borda, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(camisa?.toString() ?: iniciaisDoAtleta(nome), color = Color(0xFF0F172A), fontWeight = FontWeight.ExtraBold,
            fontSize = (tamanho.value * (if (camisa != null) 0.38f else 0.32f)).sp, maxLines = 1)
    }
}

fun corHex(hex: String): Color = Cor.de(hex).cor

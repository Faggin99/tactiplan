package com.faggin.tactiplan.app.ui.comum

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

// Imagem do servidor (logo do clube) sem biblioteca nova: OkHttp + BitmapFactory, cache em
// memória por URL. Só https/http; falha = null (a tela mostra as iniciais).

private val cliente by lazy {
    OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).readTimeout(10, TimeUnit.SECONDS).build()
}
private val cache = LruCache<String, ImageBitmap>(24)
private const val MAX_BYTES = 3 * 1024 * 1024

suspend fun baixarImagem(url: String): ImageBitmap? = withContext(Dispatchers.IO) {
    cache.get(url)?.let { return@withContext it }
    if (!linkSeguro(url)) return@withContext null
    try {
        cliente.newCall(Request.Builder().url(url).build()).execute().use { r ->
            val corpo = r.body ?: return@withContext null
            if (!r.isSuccessful || corpo.contentLength() > MAX_BYTES) return@withContext null
            val bytes = corpo.bytes()
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()?.also { cache.put(url, it) }
        }
    } catch (_: Exception) {
        null
    }
}

@Composable
fun imagemRemota(url: String?): ImageBitmap? {
    val img by produceState<ImageBitmap?>(url?.let { cache.get(it) }, url) {
        value = if (url.isNullOrEmpty()) null else baixarImagem(url)
    }
    return img
}

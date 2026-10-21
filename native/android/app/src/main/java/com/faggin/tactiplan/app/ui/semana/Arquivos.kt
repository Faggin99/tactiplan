package com.faggin.tactiplan.app.ui.semana

import android.content.ActivityNotFoundException
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import com.faggin.tactiplan.app.dados.clientePadrao
import com.faggin.tactiplan.app.dados.treino.AnexoNovo
import com.faggin.tactiplan.app.dados.treino.ArquivoUpload
import com.faggin.tactiplan.app.dados.treino.EnvioAnexo
import com.faggin.tactiplan.app.dados.treino.problemaDoArquivo
import java.io.ByteArrayOutputStream
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request

// Anexos no aparelho (padrões do Gestsport): câmera pelo TakePicture gravando num arquivo do
// cache exposto por FileProvider (sem permissão CAMERA), galeria pelo seletor do sistema
// (PickVisualMedia, fotos e vídeos, sem permissão de armazenamento), PDF pelo OpenDocument.
// Foto reduzida no aparelho (≤ 2000 px, JPEG 80, rotação do EXIF aplicada); vídeo e PDF sobem
// direto do content:// em streaming (nada inteiro na memória).

fun autoridadeArquivos(context: Context) = "${context.packageName}.arquivos"

const val PASTA_CAMERA = "fotos-camera"
const val PASTA_ANEXOS = "anexos"
const val PASTA_RELATORIOS = "relatorios"

const val FOTO_LADO_MAX = 2000
const val FOTO_QUALIDADE_JPEG = 80
const val MSG_FOTO_ILEGIVEL = "Não deu para abrir essa imagem. Tente outra foto."
const val MSG_FOTO_MEMORIA = "Essa foto é pesada demais para o aparelho preparar. Tente tirar outra."
const val MSG_SEM_CAMERA = "A câmera não está disponível neste aparelho. Tente escolher da galeria."
const val MSG_SEM_GALERIA = "Não encontramos a galeria neste aparelho."
const val MSG_SEM_VISUALIZADOR = "Nenhum aplicativo deste aparelho abre esse arquivo."
const val MSG_ABRIR_FALHOU = "Não foi possível abrir o anexo agora. Tente de novo."

/** Tamanho final mantendo a proporção: maior lado ≤ [max]. */
fun tamanhoReduzido(largura: Int, altura: Int, max: Int = FOTO_LADO_MAX): Pair<Int, Int> {
    val maior = max(largura, altura)
    if (maior <= max || maior <= 0) return largura to altura
    val f = max.toDouble() / maior
    return (largura * f).roundToInt().coerceAtLeast(1) to (altura * f).roundToInt().coerceAtLeast(1)
}

/** `inSampleSize`: a maior potência de 2 que ainda deixa o maior lado ≥ [max]. */
fun amostragem(largura: Int, altura: Int, max: Int = FOTO_LADO_MAX): Int {
    var s = 1
    val maior = max(largura, altura)
    while (maior / (s * 2) >= max) s *= 2
    return s
}

fun grausDoExif(orientacao: Int): Int = when (orientacao) {
    ExifInterface.ORIENTATION_ROTATE_90, ExifInterface.ORIENTATION_TRANSPOSE -> 90
    ExifInterface.ORIENTATION_ROTATE_180 -> 180
    ExifInterface.ORIENTATION_ROTATE_270, ExifInterface.ORIENTATION_TRANSVERSE -> 270
    else -> 0
}

fun reduzirFoto(resolver: ContentResolver, uri: Uri): ByteArray? {
    val limites = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, limites) } ?: return null
    if (limites.outWidth <= 0 || limites.outHeight <= 0) return null
    val opcoes = BitmapFactory.Options().apply { inSampleSize = amostragem(limites.outWidth, limites.outHeight) }
    val origem = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opcoes) } ?: return null
    val graus = try {
        resolver.openInputStream(uri)?.use {
            grausDoExif(ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL))
        } ?: 0
    } catch (_: Exception) { 0 }
    val (l, a) = tamanhoReduzido(origem.width, origem.height)
    var bmp = if (l != origem.width || a != origem.height) Bitmap.createScaledBitmap(origem, l, a, true) else origem
    if (graus != 0) {
        val girado = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(graus.toFloat()) }, true)
        if (bmp !== origem) bmp.recycle()
        bmp = girado
    }
    val saida = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.JPEG, FOTO_QUALIDADE_JPEG, saida)
    if (bmp !== origem) bmp.recycle()
    origem.recycle()
    return saida.toByteArray()
}

private fun nomeETamanho(resolver: ContentResolver, uri: Uri): Pair<String?, Long> {
    if (uri.scheme == "file") {
        val f = File(uri.path ?: "")
        return f.name to f.length()
    }
    return try {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (!c.moveToFirst()) return null to -1L
            val n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { c.getString(it) }
            val t = c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 }?.let { if (c.isNull(it)) -1L else c.getLong(it) } ?: -1L
            n to t
        } ?: (null to -1L)
    } catch (_: Exception) { null to -1L }
}

sealed interface Preparado {
    data class Ok(val envio: EnvioAnexo) : Preparado
    data class Falhou(val mensagem: String) : Preparado
}

/** Lê o que veio da câmera/galeria/arquivos e deixa pronto para subir (fora da thread principal). */
suspend fun prepararAnexo(context: Context, uri: Uri, tipoSugerido: String? = null): Preparado = withContext(Dispatchers.IO) {
    val r = context.contentResolver
    val tipo = (r.getType(uri) ?: tipoSugerido ?: "application/octet-stream").lowercase()
    val (nome0, tamanho) = nomeETamanho(r, uri)
    val nome = nome0 ?: "anexo"
    if (tipo.startsWith("image/")) {
        val bytes = try { reduzirFoto(r, uri) } catch (_: OutOfMemoryError) {
            return@withContext Preparado.Falhou(MSG_FOTO_MEMORIA)
        } catch (_: Exception) { null } ?: return@withContext Preparado.Falhou(MSG_FOTO_ILEGIVEL)
        val nomeJpg = nome.replace(Regex("""\.[A-Za-z0-9]+$"""), "") + ".jpg"
        problemaDoArquivo("image/jpeg", bytes.size.toLong())?.let { return@withContext Preparado.Falhou(it) }
        return@withContext Preparado.Ok(EnvioAnexo(AnexoNovo.de(nomeJpg, "image/jpeg", bytes.size.toLong()),
            ArquivoUpload.deBytes(nomeJpg, "image/jpeg", bytes)))
    }
    problemaDoArquivo(tipo, tamanho)?.let { return@withContext Preparado.Falhou(it) }
    Preparado.Ok(EnvioAnexo(AnexoNovo.de(nome, tipo, tamanho),
        ArquivoUpload(nome, tipo, tamanho) { r.openInputStream(uri) ?: throw java.io.IOException("sem arquivo") }))
}

class AcoesAnexo(val camera: () -> Unit, val galeria: () -> Unit, val pdf: () -> Unit)

/** Os três seletores do sistema. `aoEscolher(uri, tipoSugerido)`; `aoAviso` quando não há app. */
@Composable
fun rememberAcoesAnexo(aoEscolher: (Uri, String?) -> Unit, aoAviso: (String) -> Unit): AcoesAnexo {
    val context = LocalContext.current
    val escolher by rememberUpdatedState(aoEscolher)
    val aviso by rememberUpdatedState(aoAviso)
    var arquivoCamera by rememberSaveable { mutableStateOf<String?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val f = arquivoCamera?.let(::File)
        arquivoCamera = null
        if (ok && f != null && f.length() > 0) escolher(Uri.fromFile(f), "image/jpeg") else f?.delete()
    }
    val galeria = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) escolher(uri, null)
    }
    val pdf = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) escolher(uri, "application/pdf")
    }
    return remember(context) {
        AcoesAnexo(
            camera = {
                val pasta = File(context.cacheDir, PASTA_CAMERA).apply { mkdirs() }
                pasta.listFiles()?.forEach { it.delete() }
                val f = File(pasta, "foto-${System.currentTimeMillis()}.jpg")
                arquivoCamera = f.absolutePath
                try {
                    camera.launch(FileProvider.getUriForFile(context, autoridadeArquivos(context), f))
                } catch (_: ActivityNotFoundException) {
                    arquivoCamera = null
                    aviso(MSG_SEM_CAMERA)
                } catch (_: IllegalArgumentException) {
                    arquivoCamera = null
                    aviso(MSG_SEM_CAMERA)
                }
            },
            galeria = {
                try {
                    galeria.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                } catch (_: ActivityNotFoundException) { aviso(MSG_SEM_GALERIA) }
            },
            pdf = {
                try { pdf.launch(arrayOf("application/pdf")) } catch (_: ActivityNotFoundException) { aviso(MSG_SEM_GALERIA) }
            },
        )
    }
}

private fun nomeSeguro(nome: String) = nome.replace(Regex("[^A-Za-z0-9._-]+"), "_").trim('_').take(80).ifEmpty { "arquivo" }

/** Baixa o anexo (cache `anexos/`, só o último) e abre no visualizador do aparelho. null = ok. */
suspend fun abrirAnexoNoSistema(context: Context, url: String, nome: String, tipo: String?): String? {
    val arquivo = withContext(Dispatchers.IO) {
        try {
            clientePadrao().newBuilder().readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                .callTimeout(0, java.util.concurrent.TimeUnit.SECONDS).build()
                .newCall(Request.Builder().url(url).build()).execute().use { r ->
                    val corpo = r.body ?: return@withContext null
                    if (!r.isSuccessful) return@withContext null
                    val pasta = File(context.cacheDir, PASTA_ANEXOS).apply { mkdirs() }
                    pasta.listFiles()?.forEach { it.delete() }
                    File(pasta, nomeSeguro(nome)).also { f -> f.outputStream().use { corpo.byteStream().copyTo(it) } }
                }
        } catch (_: Exception) { null }
    } ?: return MSG_ABRIR_FALHOU
    return try {
        val uri = FileProvider.getUriForFile(context, autoridadeArquivos(context), arquivo)
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, tipo ?: "*/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
        null
    } catch (_: ActivityNotFoundException) {
        MSG_SEM_VISUALIZADOR
    } catch (_: Exception) {
        MSG_ABRIR_FALHOU
    }
}

/** PDF do relatório → cache `relatorios/` (só o último) → folha de compartilhar do sistema. */
fun compartilharPdf(context: Context, bytes: ByteArray, nome: String): String? {
    return try {
        val pasta = File(context.cacheDir, PASTA_RELATORIOS).apply { mkdirs() }
        pasta.listFiles()?.forEach { it.delete() }
        val f = File(pasta, nomeSeguro(nome).let { if (it.endsWith(".pdf")) it else "$it.pdf" })
        f.writeBytes(bytes)
        val uri = FileProvider.getUriForFile(context, autoridadeArquivos(context), f)
        val enviar = Intent(Intent.ACTION_SEND).setType("application/pdf").putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_TITLE, f.name)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(enviar, "Compartilhar PDF").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        null
    } catch (_: ActivityNotFoundException) {
        MSG_SEM_VISUALIZADOR
    } catch (_: Exception) {
        "Não foi possível compartilhar o PDF agora."
    }
}

/** Ao sair da conta / do app: nada de foto de atleta fica no cache. */
fun apagarTemporarios(context: Context) {
    listOf(PASTA_CAMERA, PASTA_ANEXOS).forEach { File(context.cacheDir, it).deleteRecursively() }
}

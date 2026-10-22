package com.faggin.tactiplan.app.ui.quadro

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import androidx.core.content.FileProvider
import com.faggin.tactiplan.app.dados.quadro.QuadroJogada
import com.faggin.tactiplan.app.dados.quadro.VIDEO_FPS
import com.faggin.tactiplan.app.dados.quadro.dimensoesCanvas
import com.faggin.tactiplan.app.dados.quadro.imagemDoVideo
import com.faggin.tactiplan.app.dados.quadro.linhaDoVideo
import com.faggin.tactiplan.app.ui.semana.autoridadeArquivos
import java.io.File
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

// Exportar a animação em MP4 no próprio aparelho: MediaCodec (H.264, entrada YUV 4:2:0 pela
// Image API, com o tempo de cada imagem EXATO) + MediaMuxer. Mesmo ritmo e duração do web
// (useVideoExport): 30 fps, 46 imagens por transição e 1 s parado no fim (`linhaDoVideo`).
// Cada imagem = o MESMO desenho da tela (`desenharCena`) num Bitmap, no tamanho lógico do campo
// e escalado para caber em 1920×1080 (1280×720 se o codificador não aceitar), múltiplo de 16.

const val PASTA_VIDEOS = "videos"

data class TamanhoVideo(val w: Int, val h: Int, val escala: Float)

/** Cabe em `maxW`×`maxH` mantendo a proporção; lados múltiplos de 16 (macrobloco H.264). */
fun tamanhoDoVideo(logicoW: Float, logicoH: Float, maxW: Int = 1920, maxH: Int = 1080): TamanhoVideo {
    val escala = minOf(maxW / maxOf(1f, logicoW), maxH / maxOf(1f, logicoH), 3f)
    val w = maxOf(16, ((logicoW * escala).toInt() / 16) * 16)
    val h = maxOf(16, ((logicoH * escala).toInt() / 16) * 16)
    return TamanhoVideo(w, h, minOf(w / logicoW, h / logicoH))
}

/** RGB → Y, U, V (BT.601, faixa limitada 16–235), como os codificadores esperam. */
fun rgbParaYuv(r: Int, g: Int, b: Int): Triple<Int, Int, Int> {
    val y = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
    val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
    val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
    return Triple(y.coerceIn(0, 255), u.coerceIn(0, 255), v.coerceIn(0, 255))
}

private fun aceita(w: Int, h: Int): Boolean = try {
    MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos.any { info ->
        info.isEncoder && info.supportedTypes.any { it.equals(MediaFormat.MIMETYPE_VIDEO_AVC, true) } &&
            info.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC).videoCapabilities.isSizeSupported(w, h)
    }
} catch (_: Exception) { false }

/** Gera o MP4 no cache (`videos/`) e devolve o arquivo. `progresso` 0…1. Cancelável (coroutine). */
suspend fun gerarVideoQuadro(
    context: Context, quadros: List<QuadroJogada>, tipo: String, vista: String, corA: String, corB: String,
    logicoW: Float, logicoH: Float, nomeArquivo: String, progresso: (Float) -> Unit,
): File = withContext(Dispatchers.Default) {
    require(quadros.size > 1) { "Crie um 2º quadro para animar (botão +)." }
    val linha = linhaDoVideo(quadros.size)
    var t = tamanhoDoVideo(logicoW, logicoH)
    if (!aceita(t.w, t.h)) t = tamanhoDoVideo(logicoW, logicoH, 1280, 720)
    val dims = dimensoesCanvas(logicoW.toDouble(), logicoH.toDouble(), tipo, vista)
    val pasta = File(context.cacheDir, PASTA_VIDEOS).apply { deleteRecursively(); mkdirs() }
    val arquivo = File(pasta, nomeArquivo)

    val formato = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, t.w, t.h).apply {
        setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
        setInteger(MediaFormat.KEY_BIT_RATE, if (t.w >= 1900) 8_000_000 else 4_000_000)
        setInteger(MediaFormat.KEY_FRAME_RATE, VIDEO_FPS)
        setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
    }
    val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    codec.configure(formato, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    codec.start()
    val muxer = MediaMuxer(arquivo.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var trilha = -1
    var muxerIniciado = false
    val info = MediaCodec.BufferInfo()
    val bitmap = Bitmap.createBitmap(t.w, t.h, Bitmap.Config.ARGB_8888)
    val tela = Canvas(bitmap)
    val pixels = IntArray(t.w * t.h)

    fun drenar(fim: Boolean) {
        while (true) {
            val i = codec.dequeueOutputBuffer(info, if (fim) 10_000 else 0)
            when {
                i == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!fim) return
                i == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> { trilha = muxer.addTrack(codec.outputFormat); muxer.start(); muxerIniciado = true }
                i >= 0 -> {
                    val buf = codec.getOutputBuffer(i)
                    if ((info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0
                    if (info.size > 0 && buf != null && muxerIniciado) {
                        buf.position(info.offset); buf.limit(info.offset + info.size)
                        muxer.writeSampleData(trilha, buf, info)
                    }
                    codec.releaseOutputBuffer(i, false)
                    if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return
                }
            }
        }
    }

    try {
        linha.forEachIndexed { idx, passo ->
            coroutineContext.ensureActive()
            val final = idx >= linha.size - VIDEO_FPS
            val (pecas, desenhos) = imagemDoVideo(quadros, passo, final)
            tela.save()
            tela.scale(t.escala, t.escala)
            desenharCena(tela, CenaQuadro(dims, tipo, vista, pecas, desenhos, corA = corA, corB = corB))
            tela.restore()
            bitmap.getPixels(pixels, 0, t.w, 0, 0, t.w, t.h)
            var entrada: Int
            do { entrada = codec.dequeueInputBuffer(10_000); if (entrada < 0) drenar(false) } while (entrada < 0)
            val img = codec.getInputImage(entrada) ?: error("sem imagem de entrada")
            val (py, pu, pv) = img.planes
            val yb = py.buffer; val ub = pu.buffer; val vb = pv.buffer
            val psY = py.pixelStride; val psU = pu.pixelStride; val psV = pv.pixelStride
            val rsY = py.rowStride; val rsU = pu.rowStride; val rsV = pv.rowStride
            for (y in 0 until t.h) {
                val base = y * t.w
                val linhaY = y * rsY
                val par = (y and 1) == 0
                for (x in 0 until t.w) {
                    val c = pixels[base + x]
                    val r = (c shr 16) and 0xFF; val g = (c shr 8) and 0xFF; val b = c and 0xFF
                    yb.put(linhaY + x * psY, (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).toByte())
                    if (par && (x and 1) == 0) {
                        val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
                        val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
                        ub.put((y shr 1) * rsU + (x shr 1) * psU, u.coerceIn(0, 255).toByte())
                        vb.put((y shr 1) * rsV + (x shr 1) * psV, v.coerceIn(0, 255).toByte())
                    }
                }
            }
            val pts = idx * 1_000_000L / VIDEO_FPS
            codec.queueInputBuffer(entrada, 0, t.w * t.h * 3 / 2, pts, 0)
            drenar(false)
            if (idx % 6 == 0) withContext(Dispatchers.Main) { progresso((idx + 1f) / linha.size) }
        }
        var fimIdx: Int
        do { fimIdx = codec.dequeueInputBuffer(10_000); if (fimIdx < 0) drenar(false) } while (fimIdx < 0)
        codec.queueInputBuffer(fimIdx, 0, 0, linha.size * 1_000_000L / VIDEO_FPS, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        drenar(true)
        withContext(Dispatchers.Main) { progresso(1f) }
    } finally {
        try { codec.stop() } catch (_: Exception) {}
        codec.release()
        try { if (muxerIniciado) muxer.stop() } catch (_: Exception) {}
        muxer.release()
        bitmap.recycle()
    }
    arquivo
}

/** MP4 → folha de compartilhar do sistema (WhatsApp, Drive, salvar). null = ok. */
fun compartilharVideo(context: Context, arquivo: File): String? = try {
    val uri = FileProvider.getUriForFile(context, autoridadeArquivos(context), arquivo)
    val enviar = Intent(Intent.ACTION_SEND).setType("video/mp4").putExtra(Intent.EXTRA_STREAM, uri)
        .putExtra(Intent.EXTRA_TITLE, arquivo.name).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(Intent.createChooser(enviar, "Compartilhar vídeo da jogada").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    null
} catch (_: ActivityNotFoundException) {
    "Nenhum app para compartilhar o vídeo."
} catch (_: Exception) {
    "Não foi possível compartilhar o vídeo agora."
}

package com.faggin.tactiplan.app.ui.comum

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Ícones de traço (lucide, 24×24, traço 2.1, pontas redondas) — copiados do Gestsport + os do
 * TactiPlan. O preto do traço é só máscara: o `Icon` pinta com a cor do tema.
 */
object Icones {
    private fun traco(nome: String, d: String): ImageVector =
        ImageVector.Builder(nome, 24.dp, 24.dp, 24f, 24f).addPath(
            pathData = addPathNodes(d),
            fill = null,
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 2.1f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        ).build()

    val inicio = traco("inicio", "M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z")
    val pessoa = traco("pessoa", "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8M4 21a8 8 0 0 1 16 0")
    val pagar = traco("pagar", "M2 8a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3zM2 10h20")
    val sino = traco("sino", "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0")
    val perfil = traco("perfil", "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20")
    val calendario = traco("calendario", "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2")
    val grupo = traco("grupo", "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75")
    val grafico = traco("grafico", "M3 3v18h18M7 15l4-4 3 3 5-6")
    val cartao = traco("cartao", "M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20M6 15h4")
    val mais = traco("mais", "M5 12h.01M12 12h.01M19 12h.01")
    /** Nuvem cortada (lucide `cloud-off`): não deu para carregar. */
    val nuvem = traco("nuvem", "M2 2l20 20M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07")
    /** Câmera (lucide `camera`): tirar foto do atestado. */
    val camera = traco("camera", "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3zM12 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6")
    /** Imagem (lucide `image`): escolher da galeria. */
    val imagem = traco("imagem", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 7a2 2 0 1 1 0 4 2 2 0 0 1 0-4M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21")
    /** Círculo com check (lucide `circle-check`): tudo em dia. */
    val ok = traco("ok", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M9 12l2 2 4-4")
    // N6 (lucide): pílulas, KPIs, cartões de navegação, ações rápidas e lista agrupada.
    val predio = traco("predio", "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18ZM6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4")
    val alerta = traco("alerta", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 8v4M12 16h.01")
    val relogio = traco("relogio", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v6l4 2")
    val escudo = traco("escudo", "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z")
    val mensagem = traco("mensagem", "M7.9 20A9 9 0 1 0 4 16.1L2 22Z")
    val copiar = traco("copiar", "M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2zM4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2")
    val documento = traco("documento", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8")
    val sair = traco("sair", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9")
    val lixeira = traco("lixeira", "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")
    val camadas = traco("camadas", "M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5")
    val prancheta = traco("prancheta", "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01")
    val carteira = traco("carteira", "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4")
    val ajuda = traco("ajuda", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01")
    val percentual = traco("percentual", "M19 5 5 19M6.5 4a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5M17.5 15a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5")
    val abrir = traco("abrir", "M6 9l6 6 6-6")
    val direita = traco("direita", "M9 18l6-6-6-6")
    val esquerda = traco("esquerda", "M15 18l-6-6 6-6")
    // Ações compactas (lucide): contato, matrícula, links.
    val telefone = traco("telefone", "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z")
    val trocar = traco("trocar", "M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4")
    val pausar = traco("pausar", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M10 15V9M14 15V9")
    val retomar = traco("retomar", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M10 8l6 4-6 4Z")
    val pessoaMais = traco("pessoaMais", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M19 8v6M22 11h-6")
    val pessoaX = traco("pessoaX", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8M17 8l5 5M22 8l-5 5")
    val refazer = traco("refazer", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5")
    val info = traco("info", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 16v-4M12 8h.01")
    val compartilhar = traco("compartilhar", "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13")
    val link = traco("link", "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71")
    val desligar = traco("desligar", "M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04")
    val xis = traco("xis", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M15 9l-6 6M9 9l6 6")
    val check = traco("check", "M20 6 9 17l-5-5")
    /** Ampulheta (lucide `hourglass`): telas que ainda estão chegando. */
    val ampulheta = traco("ampulheta", "M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2")
    // TactiPlan (lucide): abas e Mais.
    val trofeu = traco("trofeu", "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z")
    val rota = traco("rota", "M3 19a3 3 0 1 0 6 0a3 3 0 1 0-6 0M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15M15 5a3 3 0 1 0 6 0a3 3 0 1 0-6 0")
    val cadeado = traco("cadeado", "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4")
    val paleta = traco("paleta", "M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3c3.1 0 5.7-2.6 5.7-5.7C23 5.5 18.1 2 12 2zM7.5 10.5h.01M12 7.5h.01M16.5 10.5h.01")
    val contrasteIcone = traco("contraste", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 2v20")
    val nuvemSemRede = traco("semRede", "M2 2l20 20M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07")
}

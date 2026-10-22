package com.faggin.tactiplan.app.ui.t3

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.staticCompositionLocalOf
import com.faggin.tactiplan.app.dados.Api
import com.faggin.tactiplan.app.dados.cadastros.ApiCadastros
import com.faggin.tactiplan.app.dados.cadastros.ApiCadastrosHttp
import com.faggin.tactiplan.app.dados.elenco.ApiElenco
import com.faggin.tactiplan.app.dados.elenco.ApiElencoHttp
import com.faggin.tactiplan.app.dados.estatisticas.ApiStats
import com.faggin.tactiplan.app.dados.estatisticas.ApiStatsHttp
import com.faggin.tactiplan.app.dados.staff.ApiStaff
import com.faggin.tactiplan.app.dados.staff.ApiStaffHttp

/** As rotas do web da T3 com o token do app (os testes trocam por falsas). */
class ServicosT3(val elenco: ApiElenco, val staff: ApiStaff, val stats: ApiStats, val cadastros: ApiCadastros) {
    companion object {
        fun http(apiBase: String, token: String, workspaceId: String): ServicosT3 {
            val api = Api(apiBase)
            return ServicosT3(ApiElencoHttp(api, token, workspaceId), ApiStaffHttp(api, token, workspaceId),
                ApiStatsHttp(api, token, workspaceId), ApiCadastrosHttp(api, token, workspaceId))
        }
    }
}

/** Abrir Estatísticas por cima da aba (true = Treino, false = Jogos). A casca fornece. */
val LocalAbrirEstatisticas = staticCompositionLocalOf<((Boolean) -> Unit)?> { null }

/** Folha de compartilhar com um texto (link do convite). null = ok. */
fun compartilharTexto(context: Context, texto: String, titulo: String = "Compartilhar convite"): String? = try {
    val i = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, texto)
    context.startActivity(Intent.createChooser(i, titulo).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    null
} catch (_: Exception) { "Não foi possível abrir o compartilhamento agora." }

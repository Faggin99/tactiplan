package com.faggin.tactiplan.app.ui.casca

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import com.faggin.tactiplan.app.dados.DefAba
import com.faggin.tactiplan.app.dados.TEXTO_ATUALIZAR_APP
import com.faggin.tactiplan.app.dados.dataPorExtenso
import com.faggin.tactiplan.app.dados.listaCurta
import com.faggin.tactiplan.app.dados.rotuloModalidade
import com.faggin.tactiplan.app.ui.comum.CartaoHeroi
import com.faggin.tactiplan.app.ui.comum.EstadoVazio
import com.faggin.tactiplan.app.ui.comum.FaixaSemConexao
import com.faggin.tactiplan.app.ui.comum.FaixaSomenteLeitura
import com.faggin.tactiplan.app.ui.comum.FaixaTom
import com.faggin.tactiplan.app.ui.comum.Icones
import com.faggin.tactiplan.app.ui.comum.TelaRaiz
import com.faggin.tactiplan.app.ui.comum.Tom

/** Faixas fixas do topo de toda aba: só leitura, sem conexão e "atualize o app". */
@Composable
fun ColumnScope.FaixasDoTopo(amb: AmbienteClube) {
    if (amb.contexto.somenteLeitura) FaixaSomenteLeitura(amb.contexto.mensagemSomenteLeitura)
    if (amb.semConexao) FaixaSemConexao(amb.meEm)
    if (amb.precisaAtualizar) FaixaTom(TEXTO_ATUALIZAR_APP, Tom.INFO, Icones.info)
}

/** Aba que chega numa próxima fase: herói com o clube de hoje + "Em breve" com o que ela vai ter. */
@Composable
fun EmBreveTela(aba: DefAba, amb: AmbienteClube) {
    val ctx = amb.contexto
    TelaRaiz(aba.rotulo) {
        FaixasDoTopo(amb)
        val partes = listOfNotNull(
            rotuloModalidade(ctx.clube?.modalidade).takeIf { it.isNotEmpty() },
            ctx.categorias.map { it.nome }.takeIf { it.isNotEmpty() }?.let { listaCurta(it, 3) },
        )
        CartaoHeroi(
            rotulo = "Hoje · ${dataPorExtenso()}",
            valor = ctx.nome,
            frase = (partes + ctx.papelRotulo).joinToString(" · "),
            selo = "Em breve",
        )
        EstadoVazio(iconeDaAba(aba), "Em breve no app", aba.emBreve)
    }
}

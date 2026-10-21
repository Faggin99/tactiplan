package com.faggin.tactiplan.app.ui.comum

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.R
import com.faggin.tactiplan.app.dados.NOME_APP
import com.faggin.tactiplan.app.design.TactiPlan

/** Selo da marca: o tile navy com o T + faísca lime (o mesmo do ícone) e o nome "TactiPlan". */
@Composable
fun MarcaTactiPlan(tamanho: Dp = 44.dp, comNome: Boolean = true) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = NOME_APP },
    ) {
        Box(
            Modifier.size(tamanho).clip(RoundedCornerShape(tamanho * 0.26f)).background(Color(0xFF0F172A)),
            contentAlignment = Alignment.Center,
        ) {
            Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(tamanho * 1.5f))
        }
        if (comNome) Text(NOME_APP, style = TactiPlan.tipos.titulo24, color = TactiPlan.cores.tinta)
    }
}


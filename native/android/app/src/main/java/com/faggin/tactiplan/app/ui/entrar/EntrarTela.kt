package com.faggin.tactiplan.app.ui.entrar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.faggin.tactiplan.app.dados.DICA_CONVITE_ENTRAR
import com.faggin.tactiplan.app.dados.EntrarModelo
import com.faggin.tactiplan.app.dados.MSG_SOCIAL_FALHOU
import com.faggin.tactiplan.app.dados.ROTULO_ESQUECI_SENHA
import com.faggin.tactiplan.app.dados.SUBTITULO_ENTRAR
import com.faggin.tactiplan.app.dados.googleAndroidServerClientId
import com.faggin.tactiplan.app.design.TactiPlan
import com.faggin.tactiplan.app.ui.comum.Botao
import com.faggin.tactiplan.app.ui.comum.BotaoTexto
import com.faggin.tactiplan.app.ui.comum.Campo
import com.faggin.tactiplan.app.ui.comum.MarcaTactiPlan
import com.faggin.tactiplan.app.ui.comum.VarianteBotao
import com.faggin.tactiplan.app.ui.comum.rememberAbrirLink
import kotlinx.coroutines.launch

const val TAG_ENTRAR = "entrar:botao"
const val TAG_GOOGLE = "entrar:google"

/**
 * Entrar (paridade: Entrar/EntrarTela.swift): e-mail e senha da conta Faggin + "Continuar com o
 * Google" quando o servidor liga. Sem botão da Apple no Android e SEM "Criar conta" — o app é só
 * por convite. Toda regra mora no [EntrarModelo].
 */
@Composable
fun EntrarTela(modelo: EntrarModelo, google: LoginGoogle?) {
    val e by modelo.estado.collectAsState()
    val c = TactiPlan.cores
    val escopo = rememberCoroutineScope()
    val abrir = rememberAbrirLink()
    LaunchedEffect(modelo) { modelo.carregarConfig() }
    val googleId = googleAndroidServerClientId(e.config)

    Column(
        Modifier
            .fillMaxSize()
            .background(c.fundo)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.widthIn(max = 480.dp).fillMaxWidth()) {
            Spacer(Modifier.height(24.dp))
            MarcaTactiPlan()
            Text(SUBTITULO_ENTRAR, style = TactiPlan.tipos.corpo15, color = c.tinta2, modifier = Modifier.padding(top = 10.dp))
            Spacer(Modifier.height(36.dp))
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Campo(e.email, modelo::mudarEmail, "E-mail", teclado = KeyboardType.Email, habilitado = e.camposHabilitados)
                Campo(
                    e.senha, modelo::mudarSenha, "Senha", secreto = true, teclado = KeyboardType.Password,
                    acao = ImeAction.Done, aoConfirmar = { escopo.launch { modelo.entrar() } }, habilitado = e.camposHabilitados,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    BotaoTexto(ROTULO_ESQUECI_SENHA, { abrir.abrir(e.esqueciSenhaUrl) }, habilitado = e.camposHabilitados)
                }
                Botao(
                    if (e.carregando) "Entrando…" else "Entrar", { escopo.launch { modelo.entrar() } },
                    habilitado = e.camposHabilitados, modifier = Modifier.testTag(TAG_ENTRAR),
                )
                if (googleId != null && google != null) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                        HorizontalDivider(Modifier.weight(1f), color = c.borda)
                        Text("ou", style = TactiPlan.tipos.corpo13, color = c.tinta2, modifier = Modifier.padding(horizontal = 12.dp))
                        HorizontalDivider(Modifier.weight(1f), color = c.borda)
                    }
                    Botao(
                        "Continuar com o Google",
                        {
                            escopo.launch {
                                try {
                                    modelo.entrarComGoogle(google.idToken(googleId))
                                } catch (_: GoogleCancelado) {
                                    modelo.falhaSocial(null)
                                } catch (_: Exception) {
                                    modelo.falhaSocial(MSG_SOCIAL_FALHOU)
                                }
                            }
                        },
                        variante = VarianteBotao.NEUTRO, habilitado = e.camposHabilitados,
                        modifier = Modifier.testTag(TAG_GOOGLE),
                    )
                }
                val erro = e.erro
                if (erro != null) {
                    Text(erro, style = TactiPlan.tipos.corpo13, color = c.erro, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
                }
            }
            Spacer(Modifier.height(28.dp))
            Text(DICA_CONVITE_ENTRAR, style = TactiPlan.tipos.corpo13, color = c.tinta2, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth())
        }
    }
}

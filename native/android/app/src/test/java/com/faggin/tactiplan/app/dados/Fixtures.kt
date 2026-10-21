package com.faggin.tactiplan.app.dados

// Dados de teste comuns (o /me de exemplo é o da conta de teste em produção, 21/10/2026).

const val ME_REAL = """{"usuario":{"id":"75793062-u","nome":"Teste App T0","email":"teste.app.t0@faggin.com.br","foto_url":null,"tem_senha":true},"workspaces":[{"id":"18c87849-226d-4331-91db-e6c490078260","nome":"Demonstração TactiPlan","dono":false,"papel":"assistant_coach","papel_rotulo":"Treinador auxiliar","permissoes":["training:view","training:edit","games:view","athletes:view","tactical:view","stats:view"],"categorias_restritas":false,"somente_leitura":false,"clubes":[{"id":"844e9f5d-558d-4790-90e8-7f98127cb425","nome":"Esporte Clube Vila Nova","modalidade":"football_11","arquivado":false,"categorias":[{"id":"460badf3-7366-492f-bbf5-dc66f8bef916","nome":"Sub-17"}],"personalizacao":{"cor_primaria":{"claro":"#15803d","escuro":"#15803d"},"branding":null,"logo_url":null,"logo_escura_url":null}}]}],"convites":[],"mensagem_somente_leitura":"Somente leitura. Fale com o responsável pela equipe."}"""

fun meReal(): Me = JsonApp.decodeFromString(Me.serializer(), ME_REAL)

fun clube(id: String, nome: String = "Clube $id", arquivado: Boolean = false, cats: List<String> = emptyList(), cor: String? = null) =
    Clube(id, nome, "football_11", arquivado, cats.mapIndexed { i, n -> Categoria("$id-k$i", n) },
        cor?.let { Personalizacao(CorPrimaria(it, it)) })

fun conta(
    id: String,
    nome: String = "Conta $id",
    clubes: List<Clube> = emptyList(),
    leitura: Boolean = false,
    permissoes: List<String> = listOf("training:view", "training:edit", "tactical:view"),
    papel: String = "owner",
    dono: Boolean = true,
) = Conta(id, nome, dono, papel, rotuloPapel(papel), permissoes, false, leitura, clubes)

fun me(vararg contas: Conta, convites: List<Convite> = emptyList()) =
    Me(Usuario("u1", "Marcos Andrade", "marcos@exemplo.com"), contas.toList(), convites, TEXTO_SO_LEITURA)

/** ApiApp de mentira: respostas configuráveis e o registro do que foi chamado. */
class ApiFalsa : ApiApp {
    val chamadas = mutableListOf<String>()
    var config: ConfigApp = ConfigApp.padrao
    var login: () -> RespostaLogin = { RespostaLogin("tpa_1", "2027-01-01T00:00:00.000Z", me(conta("w1", clubes = listOf(clube("c1"))))) }
    var proximoMe: () -> Me = { me(conta("w1", clubes = listOf(clube("c1")))) }
    var convite: (String) -> RespostaConvite = { RespostaConvite(null, proximoMe()) }

    override suspend fun config(): ConfigApp { chamadas += "config"; return config }
    override suspend fun entrar(email: String, senha: String, aparelho: Aparelho): RespostaLogin { chamadas += "entrar:$email"; return login() }
    override suspend fun entrarComGoogle(idToken: String, aparelho: Aparelho): RespostaLogin { chamadas += "google:$idToken"; return login() }
    override suspend fun entrarComApple(identityToken: String, nome: String?, aparelho: Aparelho): RespostaLogin { chamadas += "apple"; return login() }
    override suspend fun me(token: String): Me { chamadas += "me:$token"; return proximoMe() }
    override suspend fun aceitarConvite(token: String, convite: String): RespostaConvite { chamadas += "convite:$convite"; return convite(convite) }
    var recusar: (String) -> Me = { proximoMe() }
    override suspend fun recusarConvite(token: String, convite: String): Me { chamadas += "recusar:$convite"; return recusar(convite) }
    override suspend fun sair(token: String) { chamadas += "sair:$token" }
    override suspend fun registrarPush(token: String, tokenPush: String, plataforma: String) { chamadas += "push:$tokenPush:$plataforma" }
}

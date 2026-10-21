package com.faggin.tactiplan.app.dados

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Contrato do BFF /api/app (backend-node/src/services/appMe.js e routes/appAuth.js).
// No JSON os campos são snake_case (os do servidor); em Kotlin, camelCase. Campo novo no
// servidor nunca quebra o app (JsonApp ignora o que não conhece; quase tudo é opcional).
// Paridade: TactiPlanKit/Modelos.swift.

@Serializable
data class Usuario(
    val id: String,
    val nome: String? = null,
    val email: String? = null,
    @SerialName("foto_url") val fotoUrl: String? = null,
    @SerialName("tem_senha") val temSenha: Boolean? = null,
)

@Serializable
data class Categoria(val id: String, val nome: String)

/** As duas versões da cor primária do clube (claro/escuro). null = cor padrão do TactiPlan. */
@Serializable
data class CorPrimaria(val claro: String? = null, val escuro: String? = null)

/** Personalização do clube (cores + logo). Só se EDITA no web; o app só exibe. */
@Serializable
data class Personalizacao(
    @SerialName("cor_primaria") val corPrimaria: CorPrimaria? = null,
    @SerialName("logo_url") val logoUrl: String? = null,
    @SerialName("logo_escura_url") val logoEscuraUrl: String? = null,
)

@Serializable
data class Clube(
    val id: String,
    val nome: String,
    /** "football_11" | "football_7" | "futsal" */
    val modalidade: String? = null,
    /** Arquivado no web: só leitura (histórico e relatórios). */
    val arquivado: Boolean? = null,
    val categorias: List<Categoria>? = null,
    val personalizacao: Personalizacao? = null,
)

/** Uma conta (workspace) que a pessoa acessa: a dela ou a de quem a convidou. */
@Serializable
data class Conta(
    val id: String,
    val nome: String,
    val dono: Boolean? = null,
    val papel: String? = null,
    @SerialName("papel_rotulo") val papelRotulo: String? = null,
    /** As 16 permissões do servidor (training:view, games:edit, members:manage…). */
    val permissoes: List<String>? = null,
    @SerialName("categorias_restritas") val categoriasRestritas: Boolean? = null,
    /** Equipe sem assinatura: lê tudo, não muda nada. */
    @SerialName("somente_leitura") val somenteLeitura: Boolean? = null,
    val clubes: List<Clube>? = null,
)

@Serializable
data class Convite(
    val token: String,
    val papel: String? = null,
    @SerialName("papel_rotulo") val papelRotulo: String? = null,
    @SerialName("workspace_nome") val workspaceNome: String? = null,
    @SerialName("clube_nome") val clubeNome: String? = null,
    @SerialName("convidado_por") val convidadoPor: String? = null,
)

/** GET /api/app/me. */
@Serializable
data class Me(
    val usuario: Usuario,
    val workspaces: List<Conta> = emptyList(),
    val convites: List<Convite> = emptyList(),
    @SerialName("mensagem_somente_leitura") val mensagemSomenteLeitura: String? = null,
)

/** Resposta de POST /api/app/auth/entrar | google | apple. */
@Serializable
data class RespostaLogin(
    val token: String,
    @SerialName("expira_em") val expiraEm: String? = null,
    val me: Me,
)

/** Resposta de POST /api/app/convites/:token/aceitar. */
@Serializable
data class RespostaConvite(
    @SerialName("workspace_id") val workspaceId: String? = null,
    val me: Me,
)

/** GET /api/app/auth/config: quais logins o SERVIDOR liga. */
@Serializable
data class ConfigApp(
    val google: Google? = null,
    val apple: Apple? = null,
    @SerialName("versao_minima") val versaoMinima: VersaoMinima? = null,
    @SerialName("privacidade_url") val privacidadeUrl: String? = null,
    @SerialName("termos_url") val termosUrl: String? = null,
    @SerialName("esqueci_senha_url") val esqueciSenhaUrl: String? = null,
) {
    @Serializable
    data class Google(
        val ativo: Boolean? = null,
        @SerialName("ios_client_id") val iosClientId: String? = null,
        @SerialName("android_server_client_id") val androidServerClientId: String? = null,
    )

    @Serializable
    data class Apple(val ativo: Boolean? = null)

    @Serializable
    data class VersaoMinima(val ios: String? = null, val android: String? = null)

    companion object {
        /** Sem resposta do servidor: tudo desligado e os links padrão. */
        val padrao = ConfigApp()
    }
}

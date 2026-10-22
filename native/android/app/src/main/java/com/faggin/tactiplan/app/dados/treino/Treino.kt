package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.JsonApp
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.nullable
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

// Contrato das rotas de TREINO do web, que o app usa com o próprio token (T1: o authMiddleware
// aceita o token do app). Nomes do JSON = os do banco (snake_case). Tolerante: campo novo nunca
// quebra o app; número pode vir como texto (o pg devolve NUMERIC como "5.20").
// Paridade: TactiPlanKit/Treino.swift.

private fun numeroDe(e: JsonElement): Double? {
    val p = e as? JsonPrimitive ?: return null
    if (p is JsonNull) return null
    return p.content.trim().toDoubleOrNull()
}

/** Número como número OU texto; vazio/lixo → null. */
object DoubleFlex : KSerializer<Double?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("DoubleFlex", PrimitiveKind.DOUBLE).nullable
    override fun deserialize(decoder: Decoder): Double? =
        (decoder as? JsonDecoder)?.decodeJsonElement()?.let(::numeroDe)
    override fun serialize(encoder: Encoder, value: Double?) {
        if (value == null) encoder.encodeNull() else encoder.encodeDouble(value)
    }
}

object IntFlex : KSerializer<Int?> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("IntFlex", PrimitiveKind.INT).nullable
    override fun deserialize(decoder: Decoder): Int? =
        (decoder as? JsonDecoder)?.decodeJsonElement()?.let(::numeroDe)?.toInt()
    override fun serialize(encoder: Encoder, value: Int?) {
        if (value == null) encoder.encodeNull() else encoder.encodeInt(value)
    }
}

/** Conteúdo de uma atividade (training_activity_contents + contents). */
@Serializable
data class ConteudoDaAtividade(
    val id: String? = null,
    @SerialName("name") val nome: String? = null,
    @SerialName("abbreviation") val abreviacao: String? = null,
    /** "tatico" | "fisico" | "tecnico" | "mental" */
    @SerialName("dimension") val dimensao: String? = null,
    @SerialName("content_id") val conteudoId: String? = null,
)

/** Submomento marcado numa atividade (training_activity_stages). */
@Serializable
data class EtapaDaAtividade(
    val id: String? = null,
    @SerialName("stage_id") val stageId: String? = null,
    @SerialName("stage_name") val nome: String? = null,
    @Serializable(with = IntFlex::class) @SerialName("order") val ordem: Int? = null,
)

/** A atividade de um bloco (no web, UMA por bloco). */
@Serializable
data class Atividade(
    val id: String,
    @SerialName("block_id") val blocoId: String? = null,
    @SerialName("title_id") val tituloId: String? = null,
    @SerialName("title_name") val tituloNome: String? = null,
    @SerialName("description") val descricao: String? = null,
    @SerialName("groups") val grupos: List<String>? = null,
    @Serializable(with = IntFlex::class) @SerialName("duration_minutes") val minutos: Int? = null,
    @Serializable(with = IntFlex::class) @SerialName("files_count") val anexos: Int? = null,
    @SerialName("contents") val conteudos: List<ConteudoDaAtividade>? = null,
    @SerialName("stages") val etapas: List<EtapaDaAtividade>? = null,
) {
    /** Pilar da atividade (dimensão do 1º conteúdo). */
    val pilar: String? get() = conteudos?.mapNotNull { it.dimensao }?.firstOrNull()
}

/** Bloco do dia. `id` null = ainda não existe no banco. */
@Serializable
data class Bloco(
    val id: String? = null,
    @SerialName("name") val nome: String = "",
    @Serializable(with = IntFlex::class) @SerialName("order") val ordemBruta: Int? = null,
    @SerialName("activity") val atividade: Atividade? = null,
) {
    val ordem: Int get() = ordemBruta ?: 0

    companion object {
        fun de(id: String?, nome: String, ordem: Int, atividade: Atividade? = null) = Bloco(id, nome, ordem, atividade)
    }
}

/** Tipo do dia (training_sessions.session_type). null no banco = treino. */
enum class TipoDia(val bruto: String, val rotulo: String) {
    TREINO("training", "Treino"), JOGO("match", "Jogo"), DESCANSO("rest", "Descanso"),
    /** Período de avaliação (migration 059): sem blocos; só o tipo de avaliação. Não soma minutos. */
    AVALIACAO("assessment", "Avaliação");

    companion object {
        fun de(s: String?): TipoDia = entries.firstOrNull { it.bruto == s } ?: TREINO
    }
}

/** Um dia (sessão de treino). `id` null = dia ainda não criado no banco. */
@Serializable
data class Dia(
    val id: String? = null,
    /** "YYYY-MM-DD" */
    @SerialName("date") val data: String = "",
    @SerialName("day_name") val nomeDia: String? = null,
    @Serializable(with = IntFlex::class) @SerialName("day_of_week") val diaDaSemanaBruto: Int? = null,
    @SerialName("session_type") val tipoBruto: String? = null,
    @SerialName("opponent_name") val adversario: String? = null,
    @Serializable(with = DoubleFlex::class) @SerialName("avg_distance_km") val distanciaKm: Double? = null,
    @SerialName("blocks") val blocos: List<Bloco> = emptyList(),
    /** "manha" | "tarde" | "noite"; null = dia de período único (o normal). */
    val periodo: String? = null,
    /** Dia com 2+ períodos: TODOS (o 1º é este), ordem Manhã → Noite. null no dia de 1 período. */
    val periodos: List<Dia>? = null,
    /** Período de avaliação: os tipos ("fisica", "tecnica"…, "outra") e o texto da "Outra". */
    @SerialName("assessment_types") val tiposAvaliacao: List<String>? = null,
    @SerialName("assessment_other") val outraAvaliacao: String? = null,
) {
    val diaDaSemana: Int get() = diaDaSemanaBruto ?: 0
    val tipo: TipoDia get() = TipoDia.de(tipoBruto)

    /** Data cortada em 10 e blocos em ordem (o pg sem parser de DATE manda "…T00:00:00.000Z"). */
    fun normalizado(): Dia {
        val ps = periodos.orEmpty().map { it.normalizado() }.sortedBy { ordemDoPeriodo(it.periodo) }
        return copy(
            data = data.take(10), blocos = blocos.sortedBy { it.ordem },
            periodo = Periodo.de(periodo)?.bruto,
            periodos = if (ps.size > 1) ps else null,
        )
    }

    companion object {
        fun de(id: String?, data: String, nomeDia: String?, diaDaSemana: Int, tipoBruto: String? = null,
               adversario: String? = null, distanciaKm: Double? = null, blocos: List<Bloco> = emptyList()) =
            Dia(id, data, nomeDia, diaDaSemana, tipoBruto, adversario, distanciaKm, blocos)
    }
}

/** Microciclo (a semana) de um clube. GET /api/microcycles devolve null quando nunca foi aberta. */
@Serializable
data class Microciclo(
    val id: String,
    @SerialName("week_identifier") val semana: String? = null,
    @SerialName("start_date") val inicio: String? = null,
    @SerialName("end_date") val fim: String? = null,
    @SerialName("sessions") val dias: List<Dia> = emptyList(),
) {
    fun normalizado(): Microciclo = copy(
        inicio = inicio?.take(10), fim = fim?.take(10),
        dias = dias.map { it.normalizado() }.sortedBy { it.data },
    )
}

fun lerMicrociclo(texto: String): Microciclo = JsonApp.decodeFromString(Microciclo.serializer(), texto).normalizado()

// ---------- cadastros (biblioteca da conta) ----------

@Serializable
data class ConteudoCadastro(
    val id: String,
    @SerialName("name") val nome: String = "",
    @SerialName("abbreviation") val abreviacao: String? = null,
    @SerialName("dimension") val dimensao: String? = null,
    @SerialName("active") val ativo: Boolean? = true,
)

@Serializable
data class EtapaCadastro(
    val id: String,
    @SerialName("name") val nome: String = "",
    @SerialName("content_id") val conteudoId: String? = null,
    @SerialName("content_name") val conteudoNome: String? = null,
    @Serializable(with = IntFlex::class) @SerialName("display_order") val ordem: Int? = null,
    @SerialName("active") val ativo: Boolean? = true,
)

@Serializable
data class TituloCadastro(
    val id: String,
    @SerialName("title") val titulo: String = "",
    @SerialName("content_id") val conteudoId: String? = null,
    @SerialName("description") val descricao: String? = null,
    @SerialName("is_archived") val arquivado: Boolean? = false,
)

/** Os cadastros que o formulário usa (inativos/arquivados ficam de fora, como no web). */
class CadastrosTreino(
    conteudos: List<ConteudoCadastro> = emptyList(),
    etapas: List<EtapaCadastro> = emptyList(),
    titulos: List<TituloCadastro> = emptyList(),
) {
    val conteudos: List<ConteudoCadastro> = conteudos.filter { it.ativo != false }
    val etapas: List<EtapaCadastro> = etapas.filter { it.ativo != false }
    val titulos: List<TituloCadastro> = titulos.filter { it.arquivado != true }

    fun comTitulo(t: TituloCadastro) = CadastrosTreino(conteudos, etapas, titulos + t)
}

// ---------- anexos ----------

@Serializable
data class Anexo(
    val id: String,
    @SerialName("activity_id") val atividadeId: String? = null,
    @SerialName("block_id") val blocoId: String? = null,
    @SerialName("title") val titulo: String? = null,
    @SerialName("file_name") val nomeArquivo: String? = null,
    @SerialName("url") val url: String? = null,
    @SerialName("file_path") val caminhoArquivo: String? = null,
    @SerialName("mime_type") val tipo: String? = null,
    @Serializable(with = IntFlex::class) @SerialName("file_size") val tamanho: Int? = null,
) {
    val caminho: String? get() = url ?: caminhoArquivo
    val especie: EspecieAnexo get() = especieDoAnexo(tipo, nomeArquivo ?: caminho)
    /** Título para a tela (o do usuário; sem título, o nome do arquivo). */
    val rotulo: String get() = titulo?.trim()?.takeIf { it.isNotEmpty() } ?: (nomeArquivo ?: "Anexo")
}

enum class EspecieAnexo { FOTO, VIDEO, PDF, OUTRO }

fun especieDoAnexo(tipo: String?, nome: String?): EspecieAnexo {
    val t = (tipo ?: "").lowercase()
    if (t.startsWith("image/")) return EspecieAnexo.FOTO
    if (t.startsWith("video/")) return EspecieAnexo.VIDEO
    if (t == "application/pdf") return EspecieAnexo.PDF
    val n = (nome ?: "").lowercase()
    if (listOf(".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic").any { n.endsWith(it) }) return EspecieAnexo.FOTO
    if (listOf(".mp4", ".mov", ".webm", ".mpeg", ".m4v").any { n.endsWith(it) }) return EspecieAnexo.VIDEO
    if (n.endsWith(".pdf")) return EspecieAnexo.PDF
    return EspecieAnexo.OUTRO
}

/** Tema do mês (GET /api/themes/adherence). */
@Serializable
data class TemaDoMes(
    val hasTheme: Boolean? = null,
    val theme: Conteudo? = null,
    @Serializable(with = IntFlex::class) val adherencePercent: Int? = null,
) {
    @Serializable
    data class Conteudo(val name: String? = null)

    /** "Tema do mês: Saída de pressão · 62%" (null sem tema). */
    val frase: String?
        get() {
            val nome = theme?.name
            if (hasTheme != true || nome.isNullOrEmpty()) return null
            return adherencePercent?.let { "Tema do mês: $nome · $it%" } ?: "Tema do mês: $nome"
        }
}

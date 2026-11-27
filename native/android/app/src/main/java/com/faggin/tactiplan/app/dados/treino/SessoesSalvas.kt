package com.faggin.tactiplan.app.dados.treino

import com.faggin.tactiplan.app.dados.ErroApi
import com.faggin.tactiplan.app.dados.JsonApp
import com.faggin.tactiplan.app.dados.contagem
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement

// SESSÕES SALVAS (web: /sessoes-salvas, rotas /api/treinos-modelo): o treino de um período guardado com nome
// (atividades + mídias copiadas) para usar em outro dia. ARQUIVOS DA SEMANA (/api/arquivos-semana): material da
// comissão ligado à semana, fora de estatísticas e relatórios. Spec: native/PARIDADE-27-11.md.
// Paridade: TactiPlanKit/SessoesSalvas.swift.

@Serializable
data class MidiaSessaoSalva(
    val url: String? = null,
    /** "image" | "video" | "application" */
    val tipo: String? = null,
    val nome: String? = null,
)

@Serializable
data class BlocoSessaoSalva(
    @Serializable(with = IntFlex::class) val ordem: Int? = null,
    val nome: String = "",
    val titulo: String? = null,
    val conteudo: String? = null,
    val pilar: String? = null,
    @Serializable(with = IntFlex::class) val minutos: Int? = null,
    val descricao: String? = null,
    val midias: List<MidiaSessaoSalva> = emptyList(),
) {
    val preenchido: Boolean get() = !titulo.isNullOrBlank() || !conteudo.isNullOrBlank() || (minutos ?: 0) > 0 || !descricao.isNullOrBlank()
    /** O que a atividade é: o título; sem título, o conteúdo. */
    val rotulo: String? get() = titulo?.takeIf { it.isNotBlank() } ?: conteudo?.takeIf { it.isNotBlank() }
}

@Serializable
data class SessaoSalva(
    val id: String,
    val nome: String = "",
    val descricao: String? = null,
    @SerialName("criado_por") val criadoPor: String? = null,
    @SerialName("created_at") val criadaEm: String? = null,
    @SerialName("origem_data") val origemData: String? = null,
    @SerialName("origem_periodo") val origemPeriodo: String? = null,
    @Serializable(with = IntFlex::class) val atividades: Int? = null,
    @Serializable(with = IntFlex::class) val minutos: Int? = null,
    @Serializable(with = IntFlex::class) val goleiro: Int? = null,
    @Serializable(with = IntFlex::class) val midias: Int? = null,
    val blocos: List<BlocoSessaoSalva> = emptyList(),
) {
    val blocosEmOrdem: List<BlocoSessaoSalva> get() = blocos.sortedBy { it.ordem ?: 99 }
}

fun lerSessoesSalvas(j: JsonElement): List<SessaoSalva> =
    JsonApp.decodeFromJsonElement(ListSerializer(SessaoSalva.serializer()), listaOuData(j))

/** "Treino de sexta, 20/11 · Manhã" (null sem origem — sessões antigas). */
fun origemDaSessao(s: SessaoSalva): String? {
    val data = s.origemData?.take(10)?.takeIf { lerData(it) != null } ?: return null
    val d = lerData(data)!!
    val dia = NOMES_DIAS[diaDaSemanaISO(data) - 1].lowercase()
    val base = "Treino de $dia, %02d/%02d".format(d.dia, d.mes)
    return rotuloDoPeriodo(s.origemPeriodo)?.let { "$base · $it" } ?: base
}

/** "3 atividades · 95 min · +20′ gol · 2 mídias" */
fun resumoDaSessaoSalva(s: SessaoSalva): String {
    val p = mutableListOf(contagem(s.atividades ?: 0, "atividade", "atividades"))
    if ((s.minutos ?: 0) > 0) p += "${s.minutos} min"
    if ((s.goleiro ?: 0) > 0) p += "+${s.goleiro}′ gol"
    if ((s.midias ?: 0) > 0) p += contagem(s.midias ?: 0, "mídia", "mídias")
    return p.joinToString(" · ")
}

/** Barra dos pilares: minutos por pilar (blocos sem minutos pesam 1), sem o treino de goleiro, na ordem fixa. */
fun pilaresDaSessaoSalva(s: SessaoSalva): List<Pair<String, Int>> {
    val por = linkedMapOf<String, Int>()
    for (b in s.blocos) {
        val p = b.pilar ?: continue
        if (ehBlocoGoleiro(b.nome) || !b.preenchido) continue
        por[p] = (por[p] ?: 0) + maxOf(1, b.minutos ?: 0)
    }
    val ordem = PILARES.map { it.id }
    return por.entries.sortedBy { ordem.indexOf(it.key).let { i -> if (i < 0) 99 else i } }.map { it.key to it.value }
}

/** Nome sugerido ao salvar: "Treino de sexta, 20/11 · Manhã" (o período só no dia com 2+). */
fun nomeSugeridoSessao(dia: Dia, comPeriodo: Boolean): String {
    val d = lerData(dia.data) ?: return "Treino"
    val base = "Treino de ${NOMES_DIAS[diaDaSemanaISO(dia.data) - 1].lowercase()}, %02d/%02d".format(d.dia, d.mes)
    return if (comPeriodo) rotuloDoPeriodo(dia.periodo)?.let { "$base · $it" } ?: base else base
}

const val MAX_NOME_SESSAO = 80

/** O treino já tinha atividades: o servidor pede confirmação (409 TEM_ATIVIDADES, `atividades` = quantas). */
fun atividadesQueSeraoSubstituidas(e: Throwable): Int? {
    val erro = e as? ErroApi ?: return null
    if (erro.codigo != "TEM_ATIVIDADES") return null
    // o número não vai para os extras (só texto): lê da mensagem "Esse treino já tem 3 atividades."
    return erro.extras["atividades"]?.toDoubleOrNull()?.toInt() ?: Regex("""\d+""").find(erro.mensagem)?.value?.toIntOrNull() ?: 1
}

fun textoSubstituir(n: Int): String =
    "Esse treino já tem ${contagem(n, "atividade", "atividades")}. Substituir pelas da sessão salva?"

/** Períodos do dia que podem receber uma sessão salva (só treino). */
fun periodosDeTreino(d: Dia): List<Dia> = d.listaPeriodos.filter { it.tipo == TipoDia.TREINO }

// ---------- arquivos da semana ----------

@Serializable
data class ArquivoSemana(
    val id: String,
    val title: String? = null,
    val url: String? = null,
    @SerialName("file_name") val nomeArquivo: String? = null,
    @Serializable(with = IntFlex::class) @SerialName("file_size") val tamanho: Int? = null,
    @SerialName("mime_type") val tipo: String? = null,
    @SerialName("created_at") val criadoEm: String? = null,
    @SerialName("enviado_por") val enviadoPor: String? = null,
) {
    val rotulo: String get() = title?.trim()?.takeIf { it.isNotEmpty() } ?: (nomeArquivo ?: "Arquivo")
    val especie: EspecieAnexo get() = especieDoAnexo(tipo, nomeArquivo ?: url)
    /** Como anexo (para reusar abrir/compartilhar). */
    fun comoAnexo() = Anexo(id = id, titulo = title, nomeArquivo = nomeArquivo, url = url, tipo = tipo, tamanho = tamanho)
}

fun lerArquivosSemana(j: JsonElement): List<ArquivoSemana> =
    JsonApp.decodeFromJsonElement(ListSerializer(ArquivoSemana.serializer()), listaOuData(j))

/** "1,2 MB" · "340 KB" (vazio sem tamanho). */
fun tamanhoLegivel(b: Int?): String {
    if (b == null || b <= 0) return ""
    if (b >= 1048576) return "%.1f MB".format(b / 1048576.0).replace('.', ',')
    return "${maxOf(1, Math.round(b / 1024.0).toInt())} KB"
}

/** "1,2 MB · Lauro · 26/11" */
fun detalheArquivoSemana(a: ArquivoSemana): String {
    val quando = a.criadoEm?.take(10)?.let { lerData(it) }?.let { "%02d/%02d".format(it.dia, it.mes) }
    return listOfNotNull(tamanhoLegivel(a.tamanho).ifEmpty { null }, a.enviadoPor?.takeIf { it.isNotBlank() }, quando).joinToString(" · ")
}

const val MAX_ARQUIVOS_SEMANA = 30
const val MAX_ANEXOS_SESSAO = 15
const val TEXTO_ARQUIVOS_SEMANA = "Material da comissão para esta semana. Não entra nas estatísticas nem nos relatórios."
const val TEXTO_ANEXOS_SESSAO = "Material extra do treino, fora das atividades. Não entra nas estatísticas; as fotos saem no fim da ficha."
const val TEXTO_TRANSICAO = "Treino de quem volta do DM. Fica fora do total do dia e das estatísticas."

// ---------- jogo na Semana: escudos e horário ----------

/** Mando "away": o adversário é o mandante e vem primeiro (web: LogosDoJogo). */
fun adversarioPrimeiro(d: Dia): Boolean = d.mando == "away"

/** "19:30" → "19h30" (null sem horário). */
fun horarioDoJogo(d: Dia): String? {
    val h = d.horarioJogo?.trim()?.takeIf { Regex("""^\d{1,2}:\d{2}""").containsMatchIn(it) } ?: return null
    val (hh, mm) = h.take(5).split(":")
    return "${hh.padStart(2, '0')}h$mm"
}

// ---------- arquivos aceitos (anexos da sessão / arquivos da semana) ----------

val TIPOS_DOCUMENTO = setOf(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.ms-powerpoint",
)
val TIPOS_ARQUIVO_ACEITOS = TIPOS_ANEXO_ACEITOS + TIPOS_DOCUMENTO
const val MSG_ARQUIVO_TIPO = "Esse tipo de arquivo não pode ser enviado. Use foto, vídeo, PDF, planilha, Word ou PowerPoint."

/** Tipo pelo nome quando o aparelho não diz (planilha baixada vem como octet-stream). */
fun tipoPeloNome(nome: String, tipo: String): String {
    if (tipo != "application/octet-stream" && tipo.isNotEmpty()) return tipo
    val n = nome.lowercase()
    return when {
        n.endsWith(".xlsx") -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        n.endsWith(".xls") -> "application/vnd.ms-excel"
        n.endsWith(".csv") -> "text/csv"
        n.endsWith(".docx") -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        n.endsWith(".doc") -> "application/msword"
        n.endsWith(".pptx") -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        n.endsWith(".ppt") -> "application/vnd.ms-powerpoint"
        n.endsWith(".pdf") -> "application/pdf"
        else -> tipo
    }
}

fun problemaDoArquivoExtra(tipo: String, tamanho: Long): String? {
    if (tipo.lowercase() !in TIPOS_ARQUIVO_ACEITOS) return MSG_ARQUIVO_TIPO
    if (tamanho > MAX_BYTES_ANEXO) return MSG_ANEXO_GRANDE
    return null
}

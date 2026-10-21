package com.faggin.tactiplan.app.dados.treino

import java.util.UUID
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// Editar a atividade de UM bloco (a folha que sobe de baixo). As MESMAS regras do
// UnifiedTrainingModal do web. Paridade: TactiPlanKit/EditarAtividade.swift.

val GRUPOS_ATIVIDADE: List<Pair<String, String>> = listOf(
    "G1" to "Grupo 1", "G2" to "Grupo 2", "G3" to "Grupo 3", "Transição" to "Transição",
)

const val MAX_ANEXOS_POR_ATIVIDADE = 5
const val MAX_BYTES_ANEXO = 50 * 1024 * 1024
val TIPOS_ANEXO_ACEITOS = setOf(
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/mpeg", "video/webm", "video/quicktime", "application/pdf",
)

const val MSG_PREENCHA_ANTES = "Preencha a atividade deste bloco antes de anexar arquivos."
const val MSG_MAX_ANEXOS = "Máximo de 5 anexos por atividade."
const val MSG_ANEXO_ORFAO = "Este bloco tem anexo(s) mas está sem atividade. Preencha a atividade ou remova os anexos."
const val MSG_ANEXO_GRANDE = "Esse arquivo passa de 50 MB. Escolha um menor."
const val MSG_ANEXO_TIPO = "Esse tipo de arquivo não pode ser anexado. Use foto, vídeo ou PDF."
const val MSG_DATA_PASSADA = "Você está alterando um treino de uma data passada. Esta alteração pode indicar que o treino foi realizado de forma diferente do planejado. Deseja continuar?"

data class FormAtividade(
    val pilar: String? = null,
    val conteudoId: String? = null,
    val etapas: List<String> = emptyList(),
    val tituloId: String? = null,
    val descricao: String = "",
    val grupos: List<String> = emptyList(),
    val minutos: String = "",
) {
    val preenchido: Boolean
        get() = !tituloId.isNullOrEmpty() || descricao.isNotBlank() || !conteudoId.isNullOrEmpty() ||
            etapas.isNotEmpty() || minutos.isNotBlank()

    fun tocarPilar(id: String, cadastros: CadastrosTreino): FormAtividade =
        copy(pilar = if (pilar == id) null else id).escolherConteudo(null, cadastros)

    fun escolherConteudo(id: String?, cadastros: CadastrosTreino): FormAtividade {
        val novo = id?.takeIf { it.isNotEmpty() }
        var titulo = tituloId
        if (titulo != null) {
            val t = cadastros.titulos.firstOrNull { it.id == titulo }
            if (t?.conteudoId != null && t.conteudoId != novo) titulo = null
        }
        val et = etapas.filter { sid ->
            val e = cadastros.etapas.firstOrNull { it.id == sid } ?: return@filter false
            e.conteudoId != null && e.conteudoId == novo
        }
        return copy(conteudoId = novo, tituloId = titulo, etapas = et)
    }

    fun alternarEtapa(id: String) = copy(etapas = if (id in etapas) etapas - id else etapas + id)
    fun alternarGrupo(g: String) = copy(grupos = if (g in grupos) grupos - g else grupos + g)

    val todosOsGrupos: Boolean get() = GRUPOS_ATIVIDADE.all { it.first in grupos }
    fun alternarTodosOsGrupos() = copy(grupos = if (todosOsGrupos) emptyList() else GRUPOS_ATIVIDADE.map { it.first })

    fun somarMinutos(delta: Int): FormAtividade {
        val atual = minutos.trim().toIntOrNull() ?: 0
        val novo = maxOf(0, atual + delta)
        return copy(minutos = if (novo == 0) "" else novo.toString())
    }

    val mostraEtapas: Boolean get() = pilar == "tatico"
    val rotuloConteudo: String get() = if (pilar == "tatico") "Momento do Jogo" else "Conteúdo"

    fun conteudosDoPilar(c: CadastrosTreino) = if (pilar == null) emptyList() else c.conteudos.filter { it.dimensao == pilar }
    fun etapasDisponiveis(c: CadastrosTreino) = if (conteudoId == null) emptyList() else c.etapas.filter { it.conteudoId == conteudoId }
    fun titulosDisponiveis(c: CadastrosTreino) = if (conteudoId == null) emptyList() else c.titulos.filter { it.conteudoId == conteudoId }

    /** Corpo do POST /api/activities e do PUT /api/activities/:id. */
    fun corpo(blocoId: String? = null): JsonObject {
        val m = minutos.trim()
        val o = linkedMapOf(
            "title_id" to (tituloId?.let { JsonPrimitive(it) } ?: JsonNull),
            "description" to (if (descricao.isEmpty()) JsonNull else JsonPrimitive(descricao)),
            "duration_minutes" to (if (m.isEmpty()) JsonNull else JsonPrimitive(m)),
            "groups" to JsonArray(grupos.map { JsonPrimitive(it) }),
            "is_rest" to JsonPrimitive(false),
            "selectedContents" to JsonArray(listOfNotNull(conteudoId).map { JsonPrimitive(it) }),
            "selectedStages" to JsonArray(etapas.map { JsonPrimitive(it) }),
        )
        if (blocoId != null) o["block_id"] = JsonPrimitive(blocoId)
        return JsonObject(o)
    }

    companion object {
        /** A partir da atividade salva (o `loadData` do web). */
        fun de(a: Atividade?, cadastros: CadastrosTreino): FormAtividade {
            if (a == null) return FormAtividade()
            val ids = a.conteudos.orEmpty().mapNotNull { it.id ?: it.conteudoId }
            val primeiro = ids.firstOrNull()
            val dim = primeiro?.let { id -> cadastros.conteudos.firstOrNull { it.id == id }?.dimensao }
                ?: a.conteudos?.firstOrNull()?.dimensao
            val etapas = a.etapas.orEmpty().mapNotNull { e ->
                val sid = e.stageId
                if (sid != null && cadastros.etapas.any { it.id == sid }) sid
                else cadastros.etapas.firstOrNull { it.nome == e.nome }?.id
            }
            return FormAtividade(dim, primeiro, etapas, a.tituloId, a.descricao ?: "", a.grupos.orEmpty(),
                a.minutos?.toString() ?: "")
        }
    }
}

fun limparMinutos(s: String): String = s.filter { it.isDigit() }.take(4)

fun tituloDoArquivo(nome: String): String = nome.replace(Regex("""\.[A-Za-z0-9]+$"""), "").take(120)

/** Anexo escolhido no aparelho, ainda não enviado. */
data class AnexoNovo(
    val id: String = UUID.randomUUID().toString(),
    val titulo: String,
    val nome: String,
    val tipo: String,
    val tamanho: Long,
) {
    val especie: EspecieAnexo get() = especieDoAnexo(tipo, nome)
    val tituloFinal: String get() = titulo.trim().ifEmpty { tituloDoArquivo(nome) }.take(255)

    companion object {
        fun de(nome: String, tipo: String, tamanho: Long, titulo: String? = null) =
            AnexoNovo(titulo = titulo ?: tituloDoArquivo(nome), nome = nome, tipo = tipo, tamanho = tamanho)
    }
}

fun motivoParaNaoAnexar(form: FormAtividade, existentes: Int, novos: Int): String? {
    if (!form.preenchido) return MSG_PREENCHA_ANTES
    if (existentes + novos >= MAX_ANEXOS_POR_ATIVIDADE) return MSG_MAX_ANEXOS
    return null
}

fun problemaDoArquivo(tipo: String, tamanho: Long): String? {
    if (tipo.lowercase() !in TIPOS_ANEXO_ACEITOS) return MSG_ANEXO_TIPO
    if (tamanho > MAX_BYTES_ANEXO) return MSG_ANEXO_GRANDE
    return null
}

fun validarSalvar(form: FormAtividade, anexosExistentes: Int, anexosNovos: Int, distanciaTexto: String?): String? {
    if (!form.preenchido && anexosExistentes + anexosNovos > 0) return MSG_ANEXO_ORFAO
    if (distanciaTexto != null) (lerKm(distanciaTexto) as? ResultadoKm.Erro)?.let { return it.mensagem }
    return null
}

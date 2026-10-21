import Foundation

// Editar a atividade de UM bloco (a folha que sobe de baixo). As MESMAS regras do
// UnifiedTrainingModal do web (frontend/src/components/training/UnifiedTrainingModal.jsx):
// - Pilar (chips) → Conteúdo daquele pilar ("Momento do Jogo" no tático) → Submomentos (só no
//   tático, dos conteúdos escolhidos) → Atividade (título da biblioteca daquele conteúdo).
// - Trocar o pilar limpa o conteúdo; trocar o conteúdo limpa a atividade que não é dele e os
//   submomentos que não são dele.
// - Bloco "vazio" (sem título, descrição, conteúdo, submomento e tempo) não vira atividade: salvar
//   vazio APAGA a atividade que existia.
// - Anexo precisa de atividade: até 5 POR ATIVIDADE; bloco esvaziado com anexo não salva.
// Paridade: dados/treino/EditarAtividade.kt (Android).

/// Grupos que se marcam numa atividade (o DM não aparece, como no web).
public let GRUPOS_ATIVIDADE: [(valor: String, rotulo: String)] = [
    ("G1", "Grupo 1"), ("G2", "Grupo 2"), ("G3", "Grupo 3"), ("Transição", "Transição"),
]

/// Rótulo curto do grupo para os chips do Dia ("G1", "Transição").
public func rotuloCurtoGrupo(_ g: String) -> String { g }

public let MAX_ANEXOS_POR_ATIVIDADE = 5
/// Limite do servidor (multer, 50 MB).
public let MAX_BYTES_ANEXO = 50 * 1024 * 1024
/// Tipos que o servidor aceita (middleware/upload.js).
public let TIPOS_ANEXO_ACEITOS: Set<String> = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/mpeg", "video/webm", "video/quicktime", "application/pdf",
]

public let MSG_PREENCHA_ANTES = "Preencha a atividade deste bloco antes de anexar arquivos."
public let MSG_MAX_ANEXOS = "Máximo de 5 anexos por atividade."
public let MSG_ANEXO_ORFAO = "Este bloco tem anexo(s) mas está sem atividade. Preencha a atividade ou remova os anexos."
public let MSG_ANEXO_GRANDE = "Esse arquivo passa de 50 MB. Escolha um menor."
public let MSG_ANEXO_TIPO = "Esse tipo de arquivo não pode ser anexado. Use foto, vídeo ou PDF."
public let MSG_DATA_PASSADA = "Você está alterando um treino de uma data passada. Esta alteração pode indicar que o treino foi realizado de forma diferente do planejado. Deseja continuar?"

/// O formulário de um bloco.
public struct FormAtividade: Equatable, Sendable {
    public var pilar: String?
    /// No web é uma lista, mas a escolha é de UM conteúdo.
    public var conteudoId: String?
    public var etapas: [String]
    public var tituloId: String?
    public var descricao: String
    public var grupos: [String]
    /// Texto do campo (como no web, vai como veio; vazio = sem tempo).
    public var minutos: String

    public init(pilar: String? = nil, conteudoId: String? = nil, etapas: [String] = [], tituloId: String? = nil,
                descricao: String = "", grupos: [String] = [], minutos: String = "") {
        self.pilar = pilar; self.conteudoId = conteudoId; self.etapas = etapas; self.tituloId = tituloId
        self.descricao = descricao; self.grupos = grupos; self.minutos = minutos
    }

    /// A partir da atividade salva (o `loadData` do web): submomento pelo stage_id, ou pelo nome
    /// (legado); conteúdo pelo id; pilar pela dimensão do conteúdo.
    public init(de a: Atividade?, cadastros: CadastrosTreino) {
        guard let a else { self.init(); return }
        let ids = (a.conteudos ?? []).compactMap { $0.id ?? $0.conteudoId }
        let primeiro = ids.first
        let dim = primeiro.flatMap { id in cadastros.conteudos.first { $0.id == id }?.dimensao }
            ?? a.conteudos?.first?.dimensao
        let etapas: [String] = (a.etapas ?? []).compactMap { e in
            if let sid = e.stageId, cadastros.etapas.contains(where: { $0.id == sid }) { return sid }
            return cadastros.etapas.first { $0.nome == e.nome }?.id
        }
        self.init(pilar: dim, conteudoId: primeiro, etapas: etapas, tituloId: a.tituloId,
                  descricao: a.descricao ?? "", grupos: a.grupos ?? [],
                  minutos: a.minutos.map(String.init) ?? "")
    }

    /// Bloco preenchido = vira atividade (mesmo critério do salvar do web).
    public var preenchido: Bool {
        tituloId?.isEmpty == false || !descricao.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || conteudoId?.isEmpty == false || !etapas.isEmpty || !minutos.trimmingCharacters(in: .whitespaces).isEmpty
    }

    /// Tocar num pilar: o mesmo desmarca; outro troca. Nos dois casos o conteúdo sai.
    public mutating func tocarPilar(_ id: String, cadastros: CadastrosTreino) {
        pilar = (pilar == id) ? nil : id
        escolherConteudo(nil, cadastros: cadastros)
    }

    /// Escolher o conteúdo: a atividade que não é dele sai; os submomentos que não são dele saem.
    public mutating func escolherConteudo(_ id: String?, cadastros: CadastrosTreino) {
        conteudoId = (id?.isEmpty == false) ? id : nil
        if let t = tituloId, let titulo = cadastros.titulos.first(where: { $0.id == t }),
           let c = titulo.conteudoId, c != conteudoId {
            tituloId = nil
        }
        etapas = etapas.filter { sid in
            guard let e = cadastros.etapas.first(where: { $0.id == sid }) else { return false }
            return e.conteudoId != nil && e.conteudoId == conteudoId
        }
    }

    public mutating func alternarEtapa(_ id: String) {
        if let i = etapas.firstIndex(of: id) { etapas.remove(at: i) } else { etapas.append(id) }
    }

    public mutating func alternarGrupo(_ g: String) {
        if let i = grupos.firstIndex(of: g) { grupos.remove(at: i) } else { grupos.append(g) }
    }

    /// "Todos" marca os 4; com os 4 marcados, "Limpar".
    public var todosOsGrupos: Bool { GRUPOS_ATIVIDADE.allSatisfy { grupos.contains($0.valor) } }
    public mutating func alternarTodosOsGrupos() { grupos = todosOsGrupos ? [] : GRUPOS_ATIVIDADE.map(\.valor) }

    /// −/+ de 5 em 5 (nunca abaixo de 0; vazio conta como 0).
    public mutating func somarMinutos(_ delta: Int) {
        let atual = Int(minutos.trimmingCharacters(in: .whitespaces)) ?? 0
        let novo = max(0, atual + delta)
        minutos = novo == 0 ? "" : String(novo)
    }

    /// Submomentos só aparecem no pilar Tático.
    public var mostraEtapas: Bool { pilar == "tatico" }
    /// "Momento do Jogo" no tático; "Conteúdo" nos outros.
    public var rotuloConteudo: String { pilar == "tatico" ? "Momento do Jogo" : "Conteúdo" }

    public func conteudosDoPilar(_ c: CadastrosTreino) -> [ConteudoCadastro] {
        guard let pilar else { return [] }
        return c.conteudos.filter { $0.dimensao == pilar }
    }

    public func etapasDisponiveis(_ c: CadastrosTreino) -> [EtapaCadastro] {
        guard let conteudoId else { return [] }
        return c.etapas.filter { $0.conteudoId == conteudoId }
    }

    public func titulosDisponiveis(_ c: CadastrosTreino) -> [TituloCadastro] {
        guard let conteudoId else { return [] }
        return c.titulos.filter { $0.conteudoId == conteudoId }
    }

    /// Corpo do POST /api/activities e do PUT /api/activities/:id (o trainingService do web).
    public func corpo(blocoId: String? = nil) -> Json {
        var o: [String: Json] = [
            "title_id": tituloId.map { .texto($0) } ?? .nulo,
            "description": descricao.isEmpty ? .nulo : .texto(descricao),
            "duration_minutes": minutos.trimmingCharacters(in: .whitespaces).isEmpty
                ? .nulo : .texto(minutos.trimmingCharacters(in: .whitespaces)),
            "groups": .lista(grupos.map { .texto($0) }),
            "is_rest": false,
            "selectedContents": .lista(conteudoId.map { [.texto($0)] } ?? []),
            "selectedStages": .lista(etapas.map { .texto($0) }),
        ]
        if let blocoId { o["block_id"] = .texto(blocoId) }
        return .objeto(o)
    }
}

/// Texto do campo de tempo: só dígitos (o teclado numérico ainda deixa colar).
public func limparMinutos(_ s: String) -> String { String(s.filter(\.isNumber).prefix(4)) }

/// Título sugerido para um anexo novo: o nome do arquivo sem extensão (até 120).
public func tituloDoArquivo(_ nome: String) -> String {
    var s = nome
    if let r = s.range(of: #"\.[A-Za-z0-9]+$"#, options: .regularExpression) { s.removeSubrange(r) }
    return String(s.prefix(120))
}

/// Anexo escolhido no aparelho, ainda não enviado.
public struct AnexoNovo: Equatable, Sendable, Identifiable {
    public let id: String
    public var titulo: String
    public let nome: String
    public let tipo: String
    public let tamanho: Int

    public init(id: String = UUID().uuidString, titulo: String? = nil, nome: String, tipo: String, tamanho: Int) {
        self.id = id; self.nome = nome; self.tipo = tipo; self.tamanho = tamanho
        self.titulo = titulo ?? tituloDoArquivo(nome)
    }

    public var especie: EspecieAnexo { especieDoAnexo(tipo: tipo, nome: nome) }
    /// Título que vai no envio (vazio → nome do arquivo sem extensão).
    public var tituloFinal: String {
        let t = titulo.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? tituloDoArquivo(nome) : String(t.prefix(255))
    }
}

/// Pode anexar mais um? nil = pode; senão a frase do web.
public func motivoParaNaoAnexar(_ form: FormAtividade, existentes: Int, novos: Int) -> String? {
    if !form.preenchido { return MSG_PREENCHA_ANTES }
    if existentes + novos >= MAX_ANEXOS_POR_ATIVIDADE { return MSG_MAX_ANEXOS }
    return nil
}

/// O arquivo escolhido serve? nil = serve.
public func problemaDoArquivo(tipo: String, tamanho: Int) -> String? {
    if !TIPOS_ANEXO_ACEITOS.contains(tipo.lowercased()) { return MSG_ANEXO_TIPO }
    if tamanho > MAX_BYTES_ANEXO { return MSG_ANEXO_GRANDE }
    return nil
}

/// Validação do salvar (antes de qualquer chamada): anexo órfão e distância.
public func validarSalvar(_ form: FormAtividade, anexosExistentes: Int, anexosNovos: Int, distanciaTexto: String?) -> String? {
    if !form.preenchido && (anexosExistentes + anexosNovos) > 0 { return MSG_ANEXO_ORFAO }
    if let t = distanciaTexto, case .erro(let m) = lerKm(t) { return m }
    return nil
}

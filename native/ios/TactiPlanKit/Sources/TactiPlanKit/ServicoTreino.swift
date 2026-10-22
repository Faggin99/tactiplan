import Foundation

// A SEQUÊNCIA de salvar um bloco, igual ao onSave da TrainingPage do web:
//   1. dia ainda sem id → POST /microcycles/ensure (cria semana, dias e os 6 blocos) e pega o dia
//      real pelo dia da semana;
//   2. bloco vazio → apaga a atividade que existia; preenchido → PUT (existe) ou POST (nova);
//   3. distância ideal do dia, se mudou (com o id REAL do dia);
//   4. SÓ ENTÃO os anexos novos, cada um com o activity_id real (upload com progresso).
// Falha num anexo não desfaz o resto (como no web): volta a lista dos que não subiram.
// Paridade: dados/treino/ServicoTreino.kt (Android).

/// Um anexo novo com os bytes já prontos (foto reduzida, vídeo/PDF como vieram).
public struct EnvioAnexo: Sendable {
    public let anexo: AnexoNovo
    public let arquivo: ArquivoUpload
    public init(anexo: AnexoNovo, arquivo: ArquivoUpload) { self.anexo = anexo; self.arquivo = arquivo }
}

public struct PedidoSalvar: Sendable {
    public let semana: SemanaISO
    public let clubeId: String
    public let dia: Dia
    public let ordemDoBloco: Int
    public let form: FormAtividade
    /// nil = não mexe na distância.
    public let distancia: Double??
    public let anexos: [EnvioAnexo]

    public init(semana: SemanaISO, clubeId: String, dia: Dia, ordemDoBloco: Int, form: FormAtividade,
                distancia: Double?? = nil, anexos: [EnvioAnexo] = []) {
        self.semana = semana; self.clubeId = clubeId; self.dia = dia; self.ordemDoBloco = ordemDoBloco
        self.form = form; self.distancia = distancia; self.anexos = anexos
    }
}

public struct ResultadoSalvar: Equatable, Sendable {
    /// O dia com ids reais (depois do ensure).
    public let diaId: String
    /// A atividade salva (nil = bloco ficou vazio).
    public let atividadeId: String?
    public let anexosEnviados: [Anexo]
    /// Anexos que não subiram (id do AnexoNovo → mensagem).
    public let anexosComFalha: [String: String]

    public var mensagemFalhas: String? {
        guard !anexosComFalha.isEmpty else { return nil }
        let n = anexosComFalha.count
        return n == 1 ? "1 anexo não foi enviado. Abra a atividade e tente de novo."
            : "\(n) anexos não foram enviados. Abra a atividade e tente de novo."
    }
}

public enum Etapa: Equatable, Sendable {
    case preparando
    case salvando
    case enviando(indice: Int, total: Int, progresso: Double)
}

public struct ServicoTreino: Sendable {
    public let api: ApiTreino
    public init(api: ApiTreino) { self.api = api }

    /// O dia com ids reais: o próprio, ou o do ensure (pelo dia da semana).
    public func diaReal(_ dia: Dia, semana: SemanaISO, clubeId: String) async throws -> Dia {
        if dia.id != nil, dia.blocos.allSatisfy({ $0.id != nil }) { return dia }
        let m = try await api.garantirMicrociclo(semana: semana.identificador, clubeId: clubeId)
        guard let real = m.dias.first(where: { $0.diaDaSemana == dia.diaDaSemana }) ?? m.dias.first(where: { $0.data == dia.data }),
              real.id != nil
        else { throw ErroApi(status: 0, codigo: nil, mensagem: "Não foi possível preparar o dia. Tente de novo.") }
        return real
    }

    public func salvar(_ p: PedidoSalvar, etapa: @escaping @Sendable (Etapa) -> Void = { _ in }) async throws -> ResultadoSalvar {
        etapa(.preparando)
        let dia = try await diaReal(p.dia, semana: p.semana, clubeId: p.clubeId)
        guard let diaId = dia.id else { throw ErroApi(status: 0, codigo: nil, mensagem: ErroApi.MSG_FALHA) }
        guard let bloco = dia.blocos.first(where: { $0.ordem == p.ordemDoBloco }), let blocoId = bloco.id else {
            throw ErroApi(status: 0, codigo: nil, mensagem: "Não foi possível achar o bloco. Atualize a semana e tente de novo.")
        }
        etapa(.salvando)
        var atividadeId: String?
        if !p.form.preenchido {
            if bloco.atividade != nil { try await api.apagarAtividadeDoBloco(blocoId) }
        } else if let existente = bloco.atividade?.id {
            try await api.atualizarAtividade(existente, p.form.corpo())
            atividadeId = existente
        } else {
            atividadeId = try await api.criarAtividade(p.form.corpo(blocoId: blocoId))
        }
        if let km = p.distancia { try await api.mudarDistancia(diaId, km: km) }

        var enviados: [Anexo] = []
        var falhas: [String: String] = [:]
        if let atividadeId {
            for (i, envio) in p.anexos.enumerated() {
                etapa(.enviando(indice: i, total: p.anexos.count, progresso: 0))
                do {
                    let a = try await api.enviarAnexo(atividadeId: atividadeId, arquivo: envio.arquivo,
                                                      titulo: envio.anexo.tituloFinal) { pr in
                        etapa(.enviando(indice: i, total: p.anexos.count, progresso: pr))
                    }
                    enviados.append(a)
                } catch is CancellationError {
                    throw CancellationError()
                } catch {
                    // 401 não é "falha de anexo": a sessão acabou.
                    if sessaoEncerrada(error) { throw error }
                    falhas[envio.anexo.id] = mensagemDeErro(error)
                }
            }
        } else {
            for envio in p.anexos { falhas[envio.anexo.id] = MSG_ANEXO_ORFAO }
        }
        return ResultadoSalvar(diaId: diaId, atividadeId: atividadeId, anexosEnviados: enviados, anexosComFalha: falhas)
    }

    /// Trocar o tipo do dia (cria o dia antes, se preciso). Devolve o id real.
    @discardableResult
    public func mudarTipo(_ dia: Dia, para tipo: TipoDia, adversario: String?, semana: SemanaISO, clubeId: String) async throws -> String {
        let real = try await diaReal(dia, semana: semana, clubeId: clubeId)
        guard let id = real.id else { throw ErroApi(status: 0, codigo: nil, mensagem: ErroApi.MSG_FALHA) }
        try await api.mudarTipo(id, tipo: tipo, adversario: adversario)
        return id
    }

    /// Adiciona um período ao dia (cria o dia antes, se preciso). Devolve o id do período novo.
    @discardableResult
    public func adicionarPeriodo(_ dia: Dia, novo: Periodo, atual: Periodo?, semana: SemanaISO, clubeId: String) async throws -> String {
        if let erro = erroNovoPeriodo(dia, atual: atual, novo: novo) { throw ErroApi(status: 0, codigo: "PERIODO_INVALIDO", mensagem: erro) }
        let real = try await diaReal(dia, semana: semana, clubeId: clubeId)
        guard let id = real.id else { throw ErroApi(status: 0, codigo: nil, mensagem: ErroApi.MSG_FALHA) }
        return try await api.adicionarPeriodo(id, novo: novo, atual: dia.temPeriodos ? nil : atual)
    }

    /// Remove um período (só no dia com 2+). Devolve os anexos apagados.
    @discardableResult
    public func removerPeriodo(_ periodo: Dia) async throws -> Int {
        guard let id = periodo.id, periodo.periodo != nil else {
            throw ErroApi(status: 0, codigo: "PERIODO_INVALIDO", mensagem: "O dia tem um período só: não há o que remover.")
        }
        return try await api.removerPeriodo(id)
    }

    /// Troca o horário de um período (dia com 2+). A ordem do dia muda junto (sai do nome).
    public func trocarPeriodo(_ periodo: Dia, noDia dia: Dia, para: Periodo) async throws {
        if let erro = erroTrocarPeriodo(dia, periodo, para: para) { throw ErroApi(status: 0, codigo: "PERIODO_INVALIDO", mensagem: erro) }
        guard let id = periodo.id else { throw ErroApi(status: 0, codigo: nil, mensagem: ErroApi.MSG_FALHA) }
        try await api.trocarPeriodo(id, para: para)
    }

    /// Só a distância ideal (o lápis do topo do Dia).
    @discardableResult
    public func mudarDistancia(_ dia: Dia, km: Double?, semana: SemanaISO, clubeId: String) async throws -> String {
        let real = try await diaReal(dia, semana: semana, clubeId: clubeId)
        guard let id = real.id else { throw ErroApi(status: 0, codigo: nil, mensagem: ErroApi.MSG_FALHA) }
        try await api.mudarDistancia(id, km: km)
        return id
    }
}

// MARK: mensagens amigáveis

public let MSG_SEM_PERMISSAO_TREINO = "Você não tem permissão para editar treinos. Peça ao responsável pela equipe."
public let MSG_SEM_PERMISSAO_APAGAR = "Você não tem permissão para apagar treinos. Peça ao responsável pela equipe."
public let MSG_SEM_PERMISSAO_BIBLIOTECA = "Você não tem permissão para cadastrar atividades na biblioteca. Peça ao responsável pela equipe."
/// Exportar em conta sem o recurso (402 PLAN_REQUIRED): frase neutra (Apple 3.1.3).
public let MSG_NAO_EXPORTA = "Não é possível exportar agora. Fale com o responsável pela equipe."

/// Texto de erro de uma ESCRITA de treino: 403 vira o aviso de permissão; só leitura, clube
/// arquivado e o resto seguem `mensagemDeErro` (frases neutras).
public func mensagemErroTreino(_ e: Error, permissao: String = MSG_SEM_PERMISSAO_TREINO) -> String {
    if let erro = e as? ErroApi {
        if erro.status == 403 && !ehSomenteLeitura(e) { return permissao }
        if erro.codigo == "PLAN_REQUIRED" { return MSG_NAO_EXPORTA }
    }
    return mensagemDeErro(e)
}

// MARK: relatórios do dia e da semana

/// Corpo da ficha do dia (POST /api/reports/sessao). Dia com 2+ períodos: sai o dia inteiro, com
/// os períodos em sequência; `soPeriodo` = só o período de `diaId`.
public func corpoFichaDoDia(_ diaId: String, soPeriodo: Bool = false) -> [String: Json] {
    var c: [String: Json] = ["session_id": .texto(diaId)]
    if soPeriodo { c["so_periodo"] = .booleano(true) }
    return c
}

/// Corpo do relatório da semana (o "Exportar semana" do web: treino com filtro 1 microciclo).
public func corpoRelatorioSemana(_ s: SemanaISO, clubeId: String) -> [String: Json] {
    ["club_id": .texto(clubeId), "start_date": .texto(s.segunda), "end_date": .texto(s.domingo), "filter_type": "1-micro"]
}

/// Nome do PDF da ficha do dia (o do web: "treino-Quarta-21-10-2026.pdf").
/// Só um período: "treino-Quarta-21-10-2026-Tarde.pdf".
public func nomePdfDoDia(_ d: Dia, periodo: String? = nil) -> String {
    let nome = d.nomeDia ?? NOMES_DIAS[max(0, min(6, d.diaDaSemana - 1))]
    let sufixo = rotuloDoPeriodo(periodo).map { "-\($0)" } ?? ""
    return nomeArquivoSeguro("treino-\(nome)-\(dataBR(d.data).replacingOccurrences(of: "/", with: "-"))\(sufixo)") + ".pdf"
}

/// Nome do PDF da semana (o do web: "Estatisticas_Treino_<clube>_Semana_43_2026.pdf").
public func nomePdfDaSemana(_ s: SemanaISO, clube: String) -> String {
    "Estatisticas_Treino_\(nomeArquivoSeguro(clube))_Semana_\(s.numero)_\(s.ano).pdf"
}

/// O `safeFileName` do web: tira acentos, espaço vira "_", sobra só [A-Za-z0-9_-].
/// "Esporte Clube Vila Nova" → "Esporte_Clube_Vila_Nova"; "Terça" → "Terca".
public func nomeArquivoSeguro(_ s: String) -> String {
    let semAcento = s.decomposedStringWithCanonicalMapping.unicodeScalars.filter { !(0x300...0x36F).contains($0.value) }
    var saida = ""
    var emEspaco = false
    for u in semAcento {
        if CharacterSet.whitespacesAndNewlines.contains(u) {
            if !emEspaco { saida.append("_") }
            emEspaco = true
            continue
        }
        emEspaco = false
        let v = u.value
        let ok = (0x30...0x39).contains(v) || (0x41...0x5A).contains(v) || (0x61...0x7A).contains(v) || v == 0x5F || v == 0x2D
        if ok { saida.unicodeScalars.append(u) }
    }
    return saida.isEmpty ? "relatorio" : String(saida.prefix(80))
}

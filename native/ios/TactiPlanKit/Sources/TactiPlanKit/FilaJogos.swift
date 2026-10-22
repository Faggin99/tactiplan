import Foundation

// Jogo SEM INTERNET (decisão do dono, 21/10): a tela do Jogo grava escalação e eventos sem sinal
// e envia depois. Só nesta tela.
//
// Como o POST /api/games/:id regrava o jogo inteiro (dados, escalação e eventos), a fila de um jogo
// é UMA pendência: o retrato mais recente do editor (o corpo do POST) + quantas alterações ele
// junta + a assinatura do servidor de quando o jogo foi aberto ("base").
//
// Conflito (o jogo mudou no servidor enquanto o aparelho estava sem sinal): PREVALECE O LOCAL e a
// pessoa é avisada. Por quê: quem está na beira do campo registrando o jogo ao vivo é a fonte mais
// confiável do que aconteceu; o servidor não junta pedaços (regrava tudo), então "o servidor
// vence" jogaria fora gols e substituições lançados sem sinal, e juntar à mão no celular, no meio
// do jogo, não é viável. O aviso diz que a versão do servidor foi substituída para que a pessoa
// confira (e, se for o caso, combine com quem mexeu pelo web).
// Paridade: dados/jogo/FilaJogos.kt (Android).

public struct PendenciaJogo: Codable, Equatable, Sendable {
    public var sessaoId: String
    /// O editor inteiro (reabre a tela igual, sem sinal).
    public var editor: EditorJogo
    /// Assinatura do servidor quando o jogo foi aberto/salvo pela última vez (nil = desconhecida).
    public var base: String?
    public var alteracoes: Int
    public var atualizadoEm: Int64
    /// Último erro que NÃO é falta de rede (ex.: 400 substituição inválida, 402, 403, 409).
    public var erro: String?

    public init(sessaoId: String, editor: EditorJogo, base: String?, alteracoes: Int, atualizadoEm: Int64, erro: String? = nil) {
        self.sessaoId = sessaoId; self.editor = editor; self.base = base; self.alteracoes = alteracoes
        self.atualizadoEm = atualizadoEm; self.erro = erro
    }
}

/// "Sem conexão · 3 alterações para enviar" / "Enviando 1 alteração…".
public func textoFila(alteracoes n: Int, semConexao: Bool) -> String {
    let qtd = n == 1 ? "1 alteração" : "\(n) alterações"
    return semConexao ? "Sem conexão · \(qtd) para enviar" : "\(qtd) para enviar"
}

public let MSG_CONFLITO = "Este jogo tinha sido alterado no servidor (por outra pessoa ou outro aparelho) enquanto você estava sem conexão. Valeram as alterações deste aparelho: confira a escalação e os eventos."
public let MSG_GUARDADO = "Sem conexão: as alterações ficaram guardadas no aparelho e serão enviadas quando a internet voltar."

/// A fila persistente (uma pendência por jogo), sobre um `Armazem` (arquivo no aparelho).
public final class FilaJogos: @unchecked Sendable {
    private let armazem: Armazem
    private let trava = NSLock()
    static let PREFIXO = "fila-jogo:"
    static let PREFIXO_CACHE = "cache-jogo:"

    public init(armazem: Armazem) { self.armazem = armazem }

    public func pendencia(_ sessaoId: String) -> PendenciaJogo? {
        trava.withLock {
            guard let s = armazem.ler(Self.PREFIXO + sessaoId) else { return nil }
            return try? JSONDecoder().decode(PendenciaJogo.self, from: Data(s.utf8))
        }
    }

    public func todas() -> [PendenciaJogo] {
        let chaves = trava.withLock { armazem.chaves().filter { $0.hasPrefix(Self.PREFIXO) } }
        return chaves.compactMap { pendencia(String($0.dropFirst(Self.PREFIXO.count))) }.sorted { $0.atualizadoEm < $1.atualizadoEm }
    }

    /// Guarda (ou junta à pendência que já existe) o editor atual. LANÇA se não ficou no disco:
    /// "guardado no aparelho" só pode ser dito se estiver mesmo gravado.
    @discardableResult
    public func guardar(_ editor: EditorJogo, base: String?, alteracoes: Int, agora: Int64 = agoraMs()) throws -> PendenciaJogo {
        try trava.withLock {
            let anterior = armazem.ler(Self.PREFIXO + editor.sessaoId)
                .flatMap { try? JSONDecoder().decode(PendenciaJogo.self, from: Data($0.utf8)) }
            let p = PendenciaJogo(sessaoId: editor.sessaoId, editor: editor,
                                  base: anterior != nil ? anterior!.base : base,
                                  alteracoes: (anterior?.alteracoes ?? 0) + max(1, alteracoes), atualizadoEm: agora)
            try armazem.gravarOuFalhar(Self.PREFIXO + editor.sessaoId, try texto(p))
            return p
        }
    }

    public func marcarErro(_ sessaoId: String, _ erro: String?) {
        trava.withLock {
            guard let s = armazem.ler(Self.PREFIXO + sessaoId),
                  var p = try? JSONDecoder().decode(PendenciaJogo.self, from: Data(s.utf8)) else { return }
            p.erro = erro
            if let t = try? texto(p) { armazem.gravar(Self.PREFIXO + sessaoId, t) }
        }
    }

    public func remover(_ sessaoId: String) { trava.withLock { armazem.remover(Self.PREFIXO + sessaoId) } }

    // MARK: cache do último carregamento (para abrir o jogo sem sinal)

    public func guardarCache(_ p: PacoteJogo) {
        trava.withLock { if let t = try? texto(p) { armazem.gravar(Self.PREFIXO_CACHE + p.dia.id, t) } }
    }

    public func cache(_ sessaoId: String) -> PacoteJogo? {
        trava.withLock {
            armazem.ler(Self.PREFIXO_CACHE + sessaoId).flatMap { try? JSONDecoder().decode(PacoteJogo.self, from: Data($0.utf8)) }
        }
    }

    private func texto<T: Encodable>(_ v: T) throws -> String {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return String(decoding: try e.encode(v), as: UTF8.self)
    }
}

public enum ResultadoEnvio: Equatable, Sendable {
    /// Foi. `conflito` = o servidor tinha mudado desde a base (valeu o local; avisar).
    case enviado(conflito: Bool)
    /// Continua sem rede: segue na fila.
    case semRede
    /// O servidor recusou (fica na fila com o erro, para corrigir ou descartar).
    case recusado(String)
    /// A sessão do app acabou (401): quem chama sai da conta.
    case sessaoEncerrada(ErroApi)
    case nadaAEnviar
}

/// Envia a pendência de um jogo: confere a versão do servidor (conflito → vale o local, avisa),
/// manda o POST e tira da fila. Falta de rede deixa na fila; recusa do servidor fica marcada.
public struct SincronizadorJogos: Sendable {
    public let servico: ServicoJogo
    public let fila: FilaJogos

    public init(servico: ServicoJogo, fila: FilaJogos) { self.servico = servico; self.fila = fila }

    public func enviar(_ sessaoId: String) async -> ResultadoEnvio {
        guard let p = fila.pendencia(sessaoId) else { return .nadaAEnviar }
        do {
            var conflito = false
            if let base = p.base {
                let agora = try await servico.assinaturaNoServidor(sessaoId)
                conflito = agora != base
            }
            if let erro = p.editor.conferirAntesDeSalvar() {
                fila.marcarErro(sessaoId, erro)
                return .recusado(erro)
            }
            try await servico.api.salvar(sessaoId, corpo: p.editor.corpoSalvar())
            fila.remover(sessaoId)
            return .enviado(conflito: conflito)
        } catch {
            if sessaoEncerrada(error), let e = error as? ErroApi { return .sessaoEncerrada(e) }
            if semRede(error) { return .semRede }
            let msg = mensagemErroJogo(error)
            fila.marcarErro(sessaoId, msg)
            return .recusado(msg)
        }
    }

    /// Envia todas as pendências (ao abrir a aba Jogos ou quando a rede volta).
    public func enviarTodas() async -> [String: ResultadoEnvio] {
        var r: [String: ResultadoEnvio] = [:]
        for p in fila.todas() { r[p.sessaoId] = await enviar(p.sessaoId) }
        return r
    }
}

import Foundation

// A sessão do app: o token revogável do BFF + o último /me (abre na hora, mesmo sem sinal)
// + o clube escolhido. Mora no cofre do aparelho (Keychain no iPhone, Tink/Keystore no
// Android) — nunca em armazenamento comum. Paridade: dados/Sessao.kt (Android).

/// Onde a pessoa está trabalhando: a conta (workspace) e o clube dela.
public struct Escolha: Codable, Equatable, Hashable, Sendable {
    public var workspaceId: String
    /// nil = conta ainda sem clube cadastrado.
    public var clubeId: String?
    public init(workspaceId: String, clubeId: String?) { self.workspaceId = workspaceId; self.clubeId = clubeId }

    enum CodingKeys: String, CodingKey { case workspaceId = "workspace_id", clubeId = "clube_id" }
}

public struct Sessao: Codable, Equatable, Sendable {
    public var token: String
    public var expiraEm: String?
    public var me: Me
    /// Clube em uso. nil = ainda não escolheu (tela "Onde entrar").
    public var escolha: Escolha?
    /// Quando o `me` foi confirmado pelo servidor (ms desde 1970) — o "atualizado há X".
    public var meEm: Int64?

    public init(token: String, expiraEm: String? = nil, me: Me, escolha: Escolha? = nil, meEm: Int64? = nil) {
        self.token = token; self.expiraEm = expiraEm; self.me = me; self.escolha = escolha; self.meEm = meEm
    }

    enum CodingKeys: String, CodingKey { case token, me, escolha, expiraEm = "expira_em", meEm = "me_em" }
}

/// Cofre da sessão. No iPhone, o Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`);
/// nos testes, a memória. Blob ilegível → `ler()` devolve nil (pede login de novo, não quebra).
public protocol CofreSessao: AnyObject, Sendable {
    func salvar(_ sessao: Sessao)
    func ler() -> Sessao?
    func limpar()
    /// Último clube escolhido por PESSOA (fica fora da sessão: sair e entrar de novo volta nele).
    func lerUltimaEscolha(_ usuarioId: String) -> Escolha?
    func guardarUltimaEscolha(_ usuarioId: String, _ escolha: Escolha)
}

public func chaveUltimaEscolha(_ usuarioId: String) -> String { "ultima_escolha:" + usuarioId }

/// Sessão em JSON dentro de um [Armazem] seguro.
public final class CofreSessaoArmazem: CofreSessao, @unchecked Sendable {
    public static let CHAVE = "sessao"
    private let armazem: Armazem

    public init(armazem: Armazem) { self.armazem = armazem }

    public func salvar(_ sessao: Sessao) {
        guard let d = try? JSONEncoder().encode(sessao), let s = String(data: d, encoding: .utf8) else { return }
        armazem.gravar(Self.CHAVE, s)
    }

    public func ler() -> Sessao? {
        guard let raw = armazem.ler(Self.CHAVE) else { return nil }
        return try? JSONDecoder().decode(Sessao.self, from: Data(raw.utf8))
    }

    public func limpar() { armazem.remover(Self.CHAVE) }

    public func lerUltimaEscolha(_ usuarioId: String) -> Escolha? {
        guard let raw = armazem.ler(chaveUltimaEscolha(usuarioId)) else { return nil }
        return try? JSONDecoder().decode(Escolha.self, from: Data(raw.utf8))
    }

    public func guardarUltimaEscolha(_ usuarioId: String, _ escolha: Escolha) {
        guard let d = try? JSONEncoder().encode(escolha), let s = String(data: d, encoding: .utf8) else { return }
        armazem.gravar(chaveUltimaEscolha(usuarioId), s)
    }
}

/// Cofre em memória (testes, previews e último recurso se o Keychain falhar).
public final class CofreSessaoMemoria: CofreSessao, @unchecked Sendable {
    private let trava = NSLock()
    private var sessao: Sessao?
    private var escolhas: [String: Escolha] = [:]

    public init() {}
    public func salvar(_ sessao: Sessao) { trava.withLock { self.sessao = sessao } }
    public func ler() -> Sessao? { trava.withLock { sessao } }
    public func limpar() { trava.withLock { sessao = nil } }
    public func lerUltimaEscolha(_ usuarioId: String) -> Escolha? { trava.withLock { escolhas[usuarioId] } }
    public func guardarUltimaEscolha(_ usuarioId: String, _ escolha: Escolha) { trava.withLock { escolhas[usuarioId] = escolha } }
}

/// Monta o cofre sem nunca derrubar o app: armazém seguro que falha na abertura → apaga e tenta
/// de novo 1×; falhou de novo → cofre em memória (o app funciona, a sessão só não sobrevive).
public func montarCofre(
    abrirArmazem: () throws -> Armazem,
    apagarCofre: () throws -> Void,
    aoFalhar: (Error) -> Void = { _ in }
) -> CofreSessao {
    do {
        return CofreSessaoArmazem(armazem: try abrirArmazem())
    } catch {
        aoFalhar(error)
        try? apagarCofre()
        do {
            return CofreSessaoArmazem(armazem: try abrirArmazem())
        } catch {
            aoFalhar(error)
            return CofreSessaoMemoria()
        }
    }
}

/// O Keychain sobrevive a desinstalar o app: reinstalação começa SEM sessão. O marcador fica
/// num armazém comum (UserDefaults), que some com o app.
public let CHAVE_INSTALADO = "instalado"

public func limparSeReinstalado(marcador: Armazem, cofre: CofreSessao) {
    guard marcador.ler(CHAVE_INSTALADO) == nil else { return }
    cofre.limpar()
    marcador.gravar(CHAVE_INSTALADO, "1")
}

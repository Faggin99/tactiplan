import Foundation

/// Chave → texto, síncrono. A lógica (cache, cofre) só conhece este protocolo,
/// então roda e é testada no Linux; no aparelho o cache usa [ArmazemArquivo]
/// e a sessão, o Keychain (alvo do app). Paridade: dados/Armazem.kt.
public protocol Armazem: AnyObject, Sendable {
    func ler(_ chave: String) -> String?
    func gravar(_ chave: String, _ valor: String)
    func remover(_ chave: String)
    func chaves() -> Set<String>
    /// Grava e LANÇA `ErroArmazem` se não ficou gravado. É o caminho da fila da
    /// chamada: "salva no aparelho" só pode ser dito se estiver mesmo no disco (o
    /// `gravar` do cache pode falhar calado — o cache é descartável).
    /// Paridade: `Armazem.gravarOuFalhar` do Android.
    func gravarOuFalhar(_ chave: String, _ valor: String) throws
}

extension Armazem {
    /// Padrão: quem não sabe dizer se falhou (memória, Keychain) só grava.
    public func gravarOuFalhar(_ chave: String, _ valor: String) throws { gravar(chave, valor) }
}

/// O armazém não conseguiu gravar (disco cheio, arquivo com problema…).
public struct ErroArmazem: Error, Equatable, Sendable {
    public let mensagem: String
    public init(_ mensagem: String) { self.mensagem = mensagem }
}

/// Armazém em memória (testes e previews).
public final class ArmazemMemoria: Armazem, @unchecked Sendable {
    private let trava = NSLock()
    private var mapa: [String: String] = [:]
    public init() {}
    public var valores: [String] { trava.withLock { Array(mapa.values) } }
    public func ler(_ chave: String) -> String? { trava.withLock { mapa[chave] } }
    public func gravar(_ chave: String, _ valor: String) { trava.withLock { mapa[chave] = valor } }
    public func remover(_ chave: String) { trava.withLock { _ = mapa.removeValue(forKey: chave) } }
    public func chaves() -> Set<String> { trava.withLock { Set(mapa.keys) } }
}

/// Armazém do aparelho pro CACHE de telas (nunca pra sessão): um arquivo JSON
/// atômico em Application Support, com proteção de arquivo do iOS
/// (`completeUntilFirstUserAuthentication`) e fora do backup.
public final class ArmazemArquivo: Armazem, @unchecked Sendable {
    private let trava = NSLock()
    private let arquivo: URL
    private var mapa: [String: String]

    public init(arquivo: URL) {
        self.arquivo = arquivo
        if let d = try? Data(contentsOf: arquivo), let m = try? JSONDecoder().decode([String: String].self, from: d) {
            mapa = m
        } else {
            mapa = [:]
        }
    }

    public func ler(_ chave: String) -> String? { trava.withLock { mapa[chave] } }
    public func gravar(_ chave: String, _ valor: String) { trava.withLock { mapa[chave] = valor; try? persistir() } }

    /// Grava e lança se o arquivo não foi escrito — a memória volta ao que era
    /// (nunca "fica" em memória um valor que não está no disco).
    public func gravarOuFalhar(_ chave: String, _ valor: String) throws {
        try trava.withLock {
            let antes = mapa[chave]
            mapa[chave] = valor
            do {
                try persistir()
            } catch {
                mapa[chave] = antes
                throw ErroArmazem("não gravou \(chave): \(error)")
            }
        }
    }
    public func remover(_ chave: String) { trava.withLock { if mapa.removeValue(forKey: chave) != nil { try? persistir() } } }
    public func chaves() -> Set<String> { trava.withLock { Set(mapa.keys) } }

    // Chamado com a trava. Gravação atômica: nunca fica meio-arquivo.
    private func persistir() throws {
        try FileManager.default.createDirectory(
            at: arquivo.deletingLastPathComponent(), withIntermediateDirectories: true)
        let d = try JSONEncoder().encode(mapa)
        #if os(iOS)
        try d.write(to: arquivo, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        var u = arquivo
        var v = URLResourceValues()
        v.isExcludedFromBackup = true
        try? u.setResourceValues(v)
        #else
        try d.write(to: arquivo, options: [.atomic])
        #endif
    }
}

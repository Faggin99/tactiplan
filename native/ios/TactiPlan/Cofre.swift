import Foundation
import Security
import os
import TactiPlanKit

// Copiado do Gestsport. Paridade: CofreAndroid (Tink + Keystore). A sessão mora no Keychain,
// acessível só depois do 1º desbloqueio e SÓ neste aparelho (não vai pra backup nem pra outro
// iPhone).

private let log = Logger(subsystem: "com.faggin.tactiplan.app", category: "cofre")

enum ErroKeychain: Error {
    case status(OSStatus)
}

/// [Armazem] sobre o Keychain: um item `kSecClassGenericPassword` por chave,
/// todos no mesmo serviço. Nunca lança: falha vira log.
final class ArmazemKeychain: Armazem, @unchecked Sendable {
    static let SERVICO = "com.faggin.tactiplan.app.cofre"

    private let servico: String
    private let trava = NSLock()

    init(servico: String = ArmazemKeychain.SERVICO) {
        self.servico = servico
    }

    /// Abre o cofre conferindo que o Keychain responde. Status inesperado
    /// (ex.: -34018, item corrompido) lança — o `montarCofre` apaga e tenta de novo.
    /// "Aparelho ainda travado desde o boot" (errSecInteractionNotAllowed) NÃO é
    /// defeito: não lança, pra ninguém apagar a sessão por causa disso.
    static func abrir(servico: String = ArmazemKeychain.SERVICO) throws -> ArmazemKeychain {
        let a = ArmazemKeychain(servico: servico)
        var q = a.consulta()
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        q[kSecReturnAttributes as String] = true
        let s = SecItemCopyMatching(q as CFDictionary, nil)
        switch s {
        case errSecSuccess, errSecItemNotFound, errSecInteractionNotAllowed:
            return a
        default:
            throw ErroKeychain.status(s)
        }
    }

    /// Apaga TODOS os itens do serviço (recuperação do cofre).
    static func apagarTudo(servico: String = ArmazemKeychain.SERVICO) throws {
        let s = SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servico,
        ] as CFDictionary)
        guard s == errSecSuccess || s == errSecItemNotFound else { throw ErroKeychain.status(s) }
    }

    private func consulta(_ chave: String? = nil) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servico,
        ]
        if let chave { q[kSecAttrAccount as String] = chave }
        return q
    }

    func ler(_ chave: String) -> String? {
        trava.lock(); defer { trava.unlock() }
        var q = consulta(chave)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var saida: CFTypeRef?
        let s = SecItemCopyMatching(q as CFDictionary, &saida)
        guard s == errSecSuccess, let dados = saida as? Data else {
            if s != errSecItemNotFound { log.error("keychain ler: \(s, privacy: .public)") }
            return nil
        }
        return String(data: dados, encoding: .utf8)
    }

    func gravar(_ chave: String, _ valor: String) {
        trava.lock(); defer { trava.unlock() }
        let dados = Data(valor.utf8)
        let mudar: [String: Any] = [
            kSecValueData as String: dados,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var s = SecItemUpdate(consulta(chave) as CFDictionary, mudar as CFDictionary)
        if s == errSecItemNotFound {
            var novo = consulta(chave)
            novo[kSecValueData as String] = dados
            novo[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            s = SecItemAdd(novo as CFDictionary, nil)
        }
        if s != errSecSuccess { log.error("keychain gravar: \(s, privacy: .public)") }
    }

    func remover(_ chave: String) {
        trava.lock(); defer { trava.unlock() }
        let s = SecItemDelete(consulta(chave) as CFDictionary)
        if s != errSecSuccess && s != errSecItemNotFound { log.error("keychain remover: \(s, privacy: .public)") }
    }

    func chaves() -> Set<String> {
        trava.lock(); defer { trava.unlock() }
        var q = consulta()
        q[kSecReturnAttributes as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitAll
        var saida: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &saida) == errSecSuccess,
              let itens = saida as? [[String: Any]]
        else { return [] }
        return Set(itens.compactMap { $0[kSecAttrAccount as String] as? String })
    }
}

/// Armazém comum (UserDefaults) — SÓ pro marcador "instalado", nunca pra sessão.
final class ArmazemPreferencias: Armazem, @unchecked Sendable {
    private let prefixo = "tactiplan."
    private let padroes: UserDefaults

    init(_ padroes: UserDefaults = .standard) { self.padroes = padroes }

    func ler(_ chave: String) -> String? { padroes.string(forKey: prefixo + chave) }
    func gravar(_ chave: String, _ valor: String) { padroes.set(valor, forKey: prefixo + chave) }
    func remover(_ chave: String) { padroes.removeObject(forKey: prefixo + chave) }
    func chaves() -> Set<String> {
        Set(padroes.dictionaryRepresentation().keys.filter { $0.hasPrefix(prefixo) }.map { String($0.dropFirst(prefixo.count)) })
    }
}

/// Montagem no aparelho: cofre no Keychain com a política de recuperação do Kit (apaga + tenta
/// de novo 1× + cai em memória). UM por processo.
enum Cofre {
    static let sessao: CofreSessao = montar()
    /// Preferências do aparelho que não são segredo, mas ficam no Keychain (opção do Face ID).
    static let preferencias: Armazem? = try? ArmazemKeychain.abrir(servico: "com.faggin.tactiplan.app.preferencias")

    private static func montar() -> CofreSessao {
        let cofre = montarCofre(
            abrirArmazem: { try ArmazemKeychain.abrir() },
            apagarCofre: { try ArmazemKeychain.apagarTudo() },
            aoFalhar: { e in log.error("cofre da sessão indisponível: \(String(describing: e), privacy: .public)") }
        )
        // O Keychain sobrevive a desinstalar: reinstalação começa deslogada.
        limparSeReinstalado(marcador: ArmazemPreferencias(), cofre: cofre)
        return cofre
    }
}

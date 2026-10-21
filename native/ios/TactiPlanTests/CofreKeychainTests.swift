import XCTest
import Security
@testable import TactiPlan

// Roda no simulador (xcodebuild test no Codemagic). A lógica do cofre/casca/entrar
// já é testada no Linux pelo TactiPlanKit; aqui só o que depende do iOS de verdade:
// o Keychain e o Info.plist do app.
final class CofreKeychainTests: XCTestCase {
    private let servico = "com.faggin.tactiplan.app.testes"

    override func setUp() {
        super.setUp()
        try? ArmazemKeychain.apagarTudo(servico: servico)
    }

    override func tearDown() {
        try? ArmazemKeychain.apagarTudo(servico: servico)
        super.tearDown()
    }

    func testGravaLeAtualizaERemove() throws {
        let a = try ArmazemKeychain.abrir(servico: servico)
        XCTAssertNil(a.ler("sessao"))
        a.gravar("sessao", #"{"token":"t1"}"#)
        XCTAssertEqual(a.ler("sessao"), #"{"token":"t1"}"#)
        a.gravar("sessao", #"{"token":"t2"}"#) // 2ª gravação = update, não duplica
        XCTAssertEqual(a.ler("sessao"), #"{"token":"t2"}"#)
        a.gravar("outra", "x")
        XCTAssertEqual(a.chaves(), ["sessao", "outra"])
        a.remover("sessao")
        XCTAssertNil(a.ler("sessao"))
        XCTAssertEqual(a.chaves(), ["outra"])
    }

    func testItemSoDepoisDoPrimeiroDesbloqueioESoNesteAparelho() throws {
        let a = try ArmazemKeychain.abrir(servico: servico)
        a.gravar("sessao", "x")
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servico,
            kSecAttrAccount as String: "sessao",
            kSecReturnAttributes as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var saida: CFTypeRef?
        XCTAssertEqual(SecItemCopyMatching(q as CFDictionary, &saida), errSecSuccess)
        let atributos = try XCTUnwrap(saida as? [String: Any])
        XCTAssertEqual(
            atributos[kSecAttrAccessible as String] as? String,
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String
        )
    }

    func testApagarTudoLimpaOServico() throws {
        let a = try ArmazemKeychain.abrir(servico: servico)
        a.gravar("sessao", "x")
        a.gravar("y", "z")
        try ArmazemKeychain.apagarTudo(servico: servico)
        XCTAssertTrue(a.chaves().isEmpty)
    }

    func testInfoPlistTemApiBaseExpandida() throws {
        let v = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "API_BASE") as? String)
        XCTAssertFalse(v.isEmpty)
        XCTAssertFalse(v.contains("$("), "API_BASE não foi expandida pelo build")
        XCTAssertTrue(v.hasPrefix("http"))
    }

    /// Um cofre só no processo (o `AppEstado` usa o MESMO `Cofre.sessao`).
    func testUmSoCofreNoProcesso() {
        XCTAssertTrue(Cofre.sessao === Cofre.sessao)
    }

    /// Bundle e nome do app novo (o antigo com.faggin.tactiplan vai ser excluído na Apple).
    func testBundleDoAppNovo() {
        XCTAssertEqual(Bundle.main.bundleIdentifier, "com.faggin.tactiplan.app")
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String, "TactiPlan")
    }
}

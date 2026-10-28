import Foundation
import UIKit
import Darwin

// Registro de falhas PRÓPRIO (28/10/2026): o app fechava ao abrir a aba Mais e a ficha do atleta e
// o relatório da Apple não chegava. Aqui, sem depender da Apple:
//   • a saída de erro (stderr) vai para um arquivo — é onde o Swift escreve "Fatal error: …";
//   • exceção Objective-C e sinais de falha (SIGTRAP/SIGABRT/SIGSEGV…) gravam a pilha de chamadas;
//   • `marcar(_:)` guarda as últimas telas/peças desenhadas (a última antes da queda aponta o culpado).
// Na próxima abertura, `enviarPendente` manda tudo para POST /api/app/falhas e apaga o arquivo.

enum RegistroDeFalhas {
    private static let pasta: URL = {
        let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("falhas", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()
    private static var arquivoFalha: URL { pasta.appendingPathComponent("falha.txt") }
    private static var arquivoStderr: URL { pasta.appendingPathComponent("stderr.txt") }
    private static var arquivoStderrAnterior: URL { pasta.appendingPathComponent("stderr-anterior.txt") }

    // Rastro das últimas peças desenhadas (o handler de sinal lê sem trava: é só diagnóstico).
    nonisolated(unsafe) private static var rastro: [String] = []
    nonisolated(unsafe) private static var caminhoFalha: [CChar] = []
    nonisolated(unsafe) private static var cabecalho = ""
    private static let trava = NSLock()

    /// Chamar UMA vez, o mais cedo possível (init do App).
    @MainActor static func instalar() {
        cabecalho = """
        Versão: \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") ?? "?") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? "?"))
        Aparelho: \(UIDevice.current.model) iOS \(UIDevice.current.systemVersion)
        """
        // stderr da execução anterior: guarda antes de abrir o novo (tem o "Fatal error" se caiu)
        let fm = FileManager.default
        try? fm.removeItem(at: arquivoStderrAnterior)
        if fm.fileExists(atPath: arquivoStderr.path) { try? fm.moveItem(at: arquivoStderr, to: arquivoStderrAnterior) }
        freopen(arquivoStderr.path, "w", stderr)
        setvbuf(stderr, nil, _IONBF, 0)
        caminhoFalha = Array(arquivoFalha.path.utf8CString)

        NSSetUncaughtExceptionHandler { e in
            RegistroDeFalhas.gravar("Exceção \(e.name.rawValue): \(e.reason ?? "")", pilha: e.callStackSymbols)
        }
        for s in [SIGTRAP, SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGFPE] {
            signal(s) { sinal in
                RegistroDeFalhas.gravar("Sinal \(sinal)", pilha: Thread.callStackSymbols)
                signal(sinal, SIG_DFL)
                raise(sinal)
            }
        }
    }

    /// Marca a tela/peça que está sendo desenhada (guarda as 40 últimas).
    static func marcar(_ onde: String) {
        trava.lock()
        rastro.append(onde)
        if rastro.count > 40 { rastro.removeFirst(rastro.count - 40) }
        trava.unlock()
    }

    private static func gravar(_ titulo: String, pilha: [String]) {
        let texto = """
        \(titulo)
        \(cabecalho)
        Últimas peças desenhadas: \(rastro.suffix(25).joined(separator: " > "))
        Pilha:
        \(pilha.joined(separator: "\n"))
        """
        caminhoFalha.withUnsafeBufferPointer { p in
            guard let f = fopen(p.baseAddress, "w") else { return }
            fputs(texto, f)
            fclose(f)
        }
    }

    /// Na abertura: se a execução anterior caiu, manda o relatório (com o fim do stderr) e apaga.
    static func enviarPendente(base: String, token: String?) async {
        guard let falha = try? String(contentsOf: arquivoFalha, encoding: .utf8) else { return }
        var erro = ""
        if let d = try? Data(contentsOf: arquivoStderrAnterior) { erro = String(decoding: d.suffix(6000), as: UTF8.self) }
        guard let url = URL(string: base + "/app/falhas") else { return }
        var r = URLRequest(url: url)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let corpo: [String: String] = ["plataforma": "ios", "falha": String(falha.prefix(30000)), "stderr": erro]
        r.httpBody = try? JSONSerialization.data(withJSONObject: corpo)
        if let (_, resp) = try? await URLSession.shared.data(for: r), (resp as? HTTPURLResponse)?.statusCode ?? 0 < 300 {
            try? FileManager.default.removeItem(at: arquivoFalha)
        }
    }
}

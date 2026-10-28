import Foundation
import Testing
@testable import TactiPlanKit

// Análise do adversário no app. Paridade com o servidor: native/paridade/analise.json (gerado de
// backend-node/src/services/analiseAdversario.js e src/reports/formacaoLivre.js). Android: AnaliseTest.kt.

private let RAIZ_AN = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

private func par() throws -> Json {
    try Json.ler(Data(contentsOf: RAIZ_AN.appendingPathComponent("native/paridade/analise.json")))
}

struct AnaliseTests {
    @Test func `todo campo do esquema aponta para uma chave do formato do servidor`() throws {
        let p = try par()
        let vazio = p["vazio"], exemplo = p["exemplo"]
        for c in caminhosDoEsquema() {
            let existe: Bool
            if c.contains("0") { existe = lerEm(exemplo, c) != nil }
            else if c.first == "fontes" { existe = lerEm(vazio, ["fontes"])?.objeto != nil && c.count == 2 }
            else { existe = lerEm(vazio, c) != nil }
            #expect(existe, "caminho do esquema sem chave no servidor: \(c)")
        }
        #expect(SECOES_ANALISE.count == 13)
        if case .lista(let ks)? = p["secoesExemplo"] {
            for k in ks.compactMap(\.texto) { #expect(secaoPreenchida(exemplo, k), "\(k)") }
        }
        #expect(!secaoPreenchida(vazio, "sistema"))
        // mesma ordem do relatório; ataque/defesa com os nomes novos (28/10)
        if case .lista(let ordem)? = p["ordem"] { #expect(ordem.compactMap(\.texto) == SECOES_ANALISE.map(\.chave)) }
        else { Issue.record("ordem") }
        for k in ["sistema", "individuais", "ataque", "defesa"] {
            #expect(p["titulos"]?[k]?.texto == SECOES_ANALISE.first { $0.chave == k }?.titulo, "\(k)")
        }
    }

    @Test func `escudo e videos - o que o servidor recusaria`() throws {
        #expect(problemaMidiaAnalise(tipo: "escudo", mime: "image/png", tamanho: 2_000) == nil)
        #expect(problemaMidiaAnalise(tipo: "escudo", mime: "video/mp4", tamanho: 2_000)?.contains("imagem") == true)
        #expect(problemaMidiaAnalise(tipo: "escudo", mime: "image/png", tamanho: MAX_BYTES_ESCUDO + 1)?.contains("3 MB") == true)
        #expect(problemaMidiaAnalise(tipo: "video", mime: "video/quicktime", tamanho: 10_000_000) == nil)
        #expect(problemaMidiaAnalise(tipo: "video", mime: "video/mp4", tamanho: MAX_BYTES_VIDEO_ANALISE + 1)?.contains("50 MB") == true)
        #expect(problemaMidiaAnalise(tipo: "video", mime: "video/mp4", tamanho: 1, videosNaAnalise: 12)?.contains("Limite") == true)
        #expect(tituloDoVideo("saida-curta.mp4") == "saida-curta")
        let m = try Json.ler(Data(#"{"id":"m1","tipo":"video","secao":"ataque","titulo":"Saída","url":"/uploads/analise/x.mp4","size_bytes":"2003"}"#.utf8))
            .decodificar(MidiaAnalise.self)
        #expect(m.secao == "ataque" && m.url == "/uploads/analise/x.mp4")
    }

    @Test func `vagas da formacao livre iguais as do servidor`() throws {
        let vagas = try #require(try par()["vagas"]?.objeto)
        for (f, lista) in vagas {
            guard case .lista(let srv) = lista else { Issue.record("vagas \(f)"); continue }
            let app = vagasLivres(f)
            #expect(app.count == srv.count, "\(f)")
            for (i, o) in srv.enumerated() where i < app.count {
                #expect(o["vaga"]?.numero.map { Int($0) } == app[i].vaga, "\(f)")
                #expect(o["papel"]?.texto == app[i].papel, "\(f)")
                #expect(abs((o["x"]?.numero ?? -1) - app[i].x) < 0.0001, "\(f) x")
                #expect(abs((o["y"]?.numero ?? -1) - app[i].y) < 0.0001, "\(f) y")
            }
        }
    }

    @Test func `ler e gravar por caminho, listas e escalacao`() {
        var d: Json = .objeto([:])
        d = gravarEm(d, ["sistema", "ofensivo", "formacao"], "4-3-3")
        #expect(textoEm(d, ["sistema", "ofensivo", "formacao"]) == "4-3-3")
        d = gravarEm(d, ["sistema", "defensivo", "itens"], textoComoLista("a\n\nb"))
        #expect(listaComoTexto(d, ["sistema", "defensivo", "itens"]) == "a\n\nb")
        d = gravarEm(d, ["variacoes"], .lista([.objeto([:])]))
        d = gravarEm(d, ["variacoes", "0", "formacao"], "2-3-5")
        #expect(textoEm(d, ["variacoes", "0", "formacao"]) == "2-3-5")
        d = mudarJogadorDaVaga(d, 3, "nome", "Léo Ortiz")
        d = mudarJogadorDaVaga(d, 0, "numero", 1)
        d = mudarJogadorDaVaga(d, 3, "numero", 3)
        if case .lista(let js)? = lerEm(d, ["escalacao", "jogadores"]) {
            #expect(js.compactMap { $0["vaga"]?.numero.map { Int($0) } } == [0, 3])
        } else { Issue.record("jogadores") }
        #expect(jogadorDaVaga(d, 3)?["nome"]?.texto == "Léo Ortiz")
        #expect(jogadorDaVaga(d, 3)?["numero"]?.numero == 3)
        #expect(secaoPreenchida(d, "sistema") && secaoPreenchida(d, "escalacao") && !secaoPreenchida(d, "final"))
    }
}

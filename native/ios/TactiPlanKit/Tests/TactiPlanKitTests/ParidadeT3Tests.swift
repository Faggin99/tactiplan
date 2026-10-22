import Foundation
import Testing
@testable import TactiPlanKit

// PARIDADE T3 com o web: native/paridade/t3.json é gerado do código do web
// (node native/paridade/gerar-t3.mjs; o npm test do backend falha se ficar desatualizado).
// O Android lê o mesmo arquivo.

private let RAIZ_T3 = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

private func t3() throws -> Json {
    try Json.ler(Data(contentsOf: RAIZ_T3.appendingPathComponent("native/paridade/t3.json")))
}
private func lista(_ j: Json?) -> [Json] { if case .lista(let l)? = j { return l }; return [] }
private func strs(_ j: Json?) -> [String] { lista(j).compactMap(\.texto) }
private func int(_ j: Json?) -> Int { Int(j?.numero ?? 0) }

@Suite struct ParidadeT3Tests {
    @Test func `formatarNome igual ao web`() throws {
        for c in lista(try t3()["elenco"]?["formatarNome"]) {
            #expect(formatarNome(c["entrada"]?.texto ?? "") == c["saida"]?.texto, "\(c["entrada"]?.texto ?? "")")
        }
    }

    @Test func `posicoes e modalidades iguais ao sportConfig`() throws {
        let e = try t3()["elenco"]!
        for (mod, ps) in e["posicoes"]!.objeto! {
            let web = lista(ps).map { Posicao($0["code"]!.texto!, $0["name"]!.texto!) }
            #expect(posicoesDaModalidade(mod) == web, "\(mod)")
        }
        for (id, rot) in e["modalidades"]!.objeto! {
            #expect(rotuloModalidade(id) == rot.texto)
            #expect(MODALIDADES.first { $0.0 == id }?.1 == rot.texto)
        }
        for (cod, n) in e["ordemPosicao"]!.objeto! { #expect(ORDEM_POSICAO[cod] == int(n), "\(cod)") }
        #expect(ORDEM_POSICAO.count == e["ordemPosicao"]!.objeto!.count)
    }

    @Test func `ordenar atletas por posicao e por nome`() throws {
        let e = try t3()["elenco"]!
        let atletas = lista(e["atletas"]).enumerated().map { i, a in
            Atleta(id: "a\(i)", nome: a["name"]!.texto!, posicao: a["position"]?.texto)
        }
        #expect(ordenarAtletas(atletas, porPosicao: true).map(\.nome) == strs(e["porPosicao"]))
        #expect(ordenarAtletas(atletas, porPosicao: false).map(\.nome) == strs(e["porNome"]))
    }

    @Test func `papeis permissoes e padroes iguais ao memberPermissions`() throws {
        let s = try t3()["staff"]!
        #expect(PERMISSOES == strs(s["permissoes"]))
        for (k, v) in s["rotulos"]!.objeto! { #expect(ROTULOS_PERMISSAO[k] == v.texto, "\(k)") }
        let grupos = lista(s["grupos"])
        #expect(GRUPOS_PERMISSAO.map(\.rotulo) == grupos.map { $0["label"]?.texto ?? "" })
        #expect(GRUPOS_PERMISSAO.map(\.permissoes) == grupos.map { strs($0["items"]) })
        for (k, v) in s["rotulosPapel"]!.objeto! { #expect(ROTULOS_PAPEL[k] == v.texto, "\(k)") }
        for (k, v) in s["descricoesPapel"]!.objeto! { #expect(DESCRICOES_PAPEL[k] == v.texto, "\(k)") }
        for (k, v) in s["padroes"]!.objeto! { #expect(Set(PADROES_PAPEL[k] ?? []) == Set(strs(v)), "\(k)") }
        #expect(Set(PAPEIS_CONVITE + ["owner"]) == Set(strs(s["papeis"])))
        for c in lista(s["efetivas"]) {
            let perms: [String]? = c["permissions"].flatMap { if case .lista = $0 { return strs($0) } else { return nil } }
            #expect(permissoesEfetivas(c["role"]?.texto, perms).sorted() == strs(c["efetivas"]), "\(c["role"]?.texto ?? "")")
        }
    }

    @Test func `periodos dos filtros iguais ao TrainingStatsPage`() throws {
        let e = try t3()["estatisticas"]!
        for c in lista(e["periodos"]) {
            let f = FiltroPeriodo(rawValue: c["filtro"]!.texto!)!
            let hoje = c["hoje"]!.texto!
            let p = periodoDoFiltro(f, referencia: hoje)
            #expect(p?.inicio == c["inicio"]?.texto, "\(hoje) \(f)")
            #expect(p?.fim == c["fim"]?.texto, "\(hoje) \(f)")
            if let sem = c["semana"]?.texto { #expect(SemanaISO(data: hoje).identificador == sem, "\(hoje)") }
        }
        for c in lista(e["ajustes"]) {
            let ini = c["inicio"]!.texto!
            #expect(fimAoMudarInicio(.semestre, inicio: ini) == c["semestre"]?.texto)
            #expect(fimAoMudarInicio(.ano, inicio: ini) == c["ano"]?.texto)
        }
        for c in lista(e["navegacao"]) {
            let s = SemanaISO(data: c["segunda"]!.texto!)
            #expect(s.identificador == c["semana"]?.texto)
            #expect(s.somando(semanas: -1).identificador == c["anterior"]?.texto)
            #expect(s.somando(semanas: 1).identificador == c["seguinte"]?.texto)
        }
    }

    @Test func `formatMinutes igual ao web`() throws {
        for c in lista(try t3()["estatisticas"]?["formatMinutes"]) {
            #expect(formatarMinutos(int(c["min"])) == c["texto"]?.texto)
        }
    }

    @Test func `cards de jogos iguais ao GameSummaryCards`() throws {
        for c in lista(try t3()["estatisticas"]?["cards"]) {
            let st = try c["entrada"]!.decodificar(StatsJogos.self)
            let r = cardsJogos(st)
            let s = c["saida"]!
            #expect(r.pct == int(s["pct"])); #expect(r.pts == int(s["pts"])); #expect(r.ptsMax == int(s["ptsMax"]))
            #expect(r.sequencia == s["sequencia"]?.texto); #expect(r.vedText == s["vedText"]?.texto)
            #expect(r.saldo == s["saldo"]?.texto); #expect(r.media == s["media"]?.texto)
            #expect(r.maiorVitoria == s["maiorVitoria"]?.texto); #expect(r.pontosTexto == s["pontosTexto"]?.texto)
        }
    }

    @Test func `minutagem completa ordenada como o AllMinutesModal`() throws {
        let m = try t3()["estatisticas"]!["minutagem"]!
        let jogadores = try m["jogadores"]!.decodificar([JogadorStats].self)
        let possiveis = int(m["minutesPossible"])
        for o in lista(m["ordens"]) {
            let chave = ChaveMinutagem(rawValue: o["key"]!.texto!)!
            let r = ordenarMinutagem(jogadores, minutosPossiveis: possiveis, ordem: OrdemMinutagem(chave: chave, crescente: o["dir"]?.texto == "asc"))
            #expect(r.map(\.id) == lista(o["ordem"]).compactMap { $0["id"]?.texto }, "\(chave) \(o["dir"]?.texto ?? "")")
            #expect(r.map(\.pct) == lista(o["ordem"]).map { int($0["pct"]) })
        }
    }
}

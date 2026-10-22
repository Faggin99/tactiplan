import Foundation
import Testing
@testable import TactiPlanKit

// Período de AVALIAÇÃO (session_type "assessment"). Paridade com o web: native/paridade/avaliacao.json
// (gerado de frontend/src/lib/periodos.js por native/paridade/gerar-avaliacao.mjs). Android: AvaliacaoTest.kt.

private let RAIZ_AV = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

private func av() throws -> Json {
    try Json.ler(Data(contentsOf: RAIZ_AV.appendingPathComponent("native/paridade/avaliacao.json")))
}
private func lista(_ j: Json?) -> [Json] { if case .lista(let l)? = j { return l }; return [] }
private func strs(_ j: Json?) -> [String] { lista(j).compactMap(\.texto) }

let JSON_MICRO_AVALIACAO = """
{"id":"m","week_identifier":"2026-43","start_date":"2026-10-19","end_date":"2026-10-25","sessions":[
 {"id":"s1","date":"2026-10-19","day_name":"Segunda","day_of_week":1,"session_type":"assessment","periodo":"manha",
  "assessment_types":["fisica","tecnica"],"assessment_other":null,
  "blocks":[{"id":"b0","name":"Aquecimento","order":1,"activity":{"id":"a0","duration_minutes":40,
   "contents":[{"name":"Resistência","dimension":"fisico"}]}}],
  "periodos":[
   {"id":"s1","date":"2026-10-19","day_of_week":1,"session_type":"assessment","periodo":"manha",
    "assessment_types":["fisica","tecnica"],
    "blocks":[{"id":"b0","name":"Aquecimento","order":1,"activity":{"id":"a0","duration_minutes":40,
     "contents":[{"name":"Resistência","dimension":"fisico"}]}}]},
   {"id":"s2","date":"2026-10-19","day_of_week":1,"session_type":"training","periodo":"tarde","avg_distance_km":6,
    "blocks":[{"id":"b1","name":"Aquecimento","order":1,"activity":{"id":"a1","duration_minutes":125,
     "contents":[{"name":"Organização Ofensiva","dimension":"tatico"}]}}]}
  ]},
 {"id":"s3","date":"2026-10-20","day_name":"Terça","day_of_week":2,"session_type":"assessment","periodo":null,
  "assessment_types":["outra"],"assessment_other":"Yo-Yo","blocks":[]},
 {"id":"s4","date":"2026-10-21","day_name":"Quarta","day_of_week":3,"session_type":"training","periodo":null,"blocks":[]}
]}
"""

@Suite struct AvaliacaoTests {
    func micro() throws -> Microciclo { try JSONDecoder().decode(Microciclo.self, from: Data(JSON_MICRO_AVALIACAO.utf8)) }

    @Test func `lista fixa igual ao web`() throws {
        let d = try av()
        #expect(lista(d["tipos"]).map { $0["tipo"]?.texto ?? "" } == TipoAvaliacao.allCases.map(\.rawValue))
        #expect(lista(d["tipos"]).map { $0["rotulo"]?.texto ?? "" } == TipoAvaliacao.allCases.map(\.rotulo))
        #expect(Int(d["maxOutra"]?.numero ?? 0) == MAX_OUTRA_AVALIACAO)
    }

    @Test func `normalizarAvaliacao igual ao web`() throws {
        for c in lista(try av()["normalizar"]) {
            let e = c["entrada"]
            let r = normalizarAvaliacao(tipos: e?["tipos"].map(strs), outra: e?["outra"]?.texto)
            let s = c["saida"]
            #expect(r.ok == (s?["ok"] == .booleano(true)), "\(String(describing: e))")
            if r.ok {
                #expect(r.tipos == strs(s?["tipos"]))
                #expect(r.outra == s?["outra"]?.texto)
            } else {
                #expect(r.erro == s?["erro"]?.texto)
            }
        }
    }

    @Test func `rotulos, linha, divisao e minutos iguais ao web`() throws {
        let d = try av()
        for c in lista(d["rotulos"]) {
            let dia = try c["sessao"]!.decodificar(Dia.self)
            #expect(rotulosAvaliacao(dia) == strs(c["rotulos"]))
            #expect(textoAvaliacao(dia) == c["texto"]?.texto)
        }
        for c in lista(d["linha"]) {
            let dia = try c["sessao"]!.decodificar(Dia.self)
            #expect(rotuloLinhaPeriodo(dia, pilares: strs(c["pilares"])) == c["texto"]?.texto)
        }
        for c in lista(d["divisao"]) {
            let ps = lista(c["periodos"])
            guard case .objeto(var o)? = ps.first else { Issue.record("sem períodos"); continue }
            o["periodos"] = .lista(ps)
            let dia = try Json.objeto(o).decodificar(Dia.self)
            #expect(divisaoMinutos(dia) == c["divisao"]?.texto)
        }
        for c in lista(d["minutos"]) {
            let dia = try c["sessao"]!.decodificar(Dia.self)
            #expect(minutosDoPeriodo(dia) == Int(c["minutos"]?.numero ?? -1))
        }
    }

    @Test func `semana: manha de avaliacao e tarde de treino`() throws {
        let m = try micro()
        let seg = m.dias[0]
        #expect(seg.tipo == .avaliacao)
        #expect(seg.tiposAvaliacao == ["fisica", "tecnica"])
        #expect(tituloDaLinhaDoDia(seg) == "Manhã · Avaliação + Tarde · Tático")
        let r = resumoDoDiaInteiro(seg)
        #expect(r.tipo == .treino)
        #expect(r.minutos == 125, "a atividade antiga do período de avaliação não soma")
        #expect(r.avaliacao == "Física, Técnica")
        #expect(divisaoMinutos(seg) == nil, "nunca 125+0")
        #expect(detalheDaLinha(r) == "125 min · 6 km · Avaliação: Física, Técnica")
        // só avaliação no dia
        let ter = m.dias[1]
        #expect(tituloDaLinhaDoDia(ter) == "Manhã · Avaliação")
        let rt = resumoDoDiaInteiro(ter)
        #expect(rt.tipo == .avaliacao)
        #expect(rt.minutos == 0)
        #expect(detalheDaLinha(rt) == "Yo-Yo")
        #expect(fraseDoHeroi(rt) == "Dia de avaliação")
        // trocar horário vale no período único de avaliação
        #expect(periodosParaTrocar(ter, ter) == [.tarde, .noite])
    }

    @Test func `servico manda os tipos ao trocar e ao adicionar periodo`() async throws {
        let m = try micro()
        let api = ApiTreinoFalsa()
        let s = ServicoTreino(api: api)
        let semana = SemanaISO(data: "2026-10-19")
        let esc = normalizarAvaliacao(tipos: ["tecnica", "fisica"], outra: nil)
        _ = try await s.mudarTipo(m.dias[2], para: .avaliacao, adversario: nil, avaliacao: esc, semana: semana, clubeId: "c")
        _ = try await s.adicionarPeriodo(m.dias[2], novo: .tarde, atual: .manha, avaliacao: esc, semana: semana, clubeId: "c")
        let ruim = normalizarAvaliacao(tipos: ["outra"], outra: nil)
        await #expect(throws: ErroApi.self) {
            try await s.mudarTipo(m.dias[2], para: .avaliacao, adversario: nil, avaliacao: ruim, semana: semana, clubeId: "c")
        }
        let log = api.chamadas
        #expect(log.contains("tipo:s4:assessment::fisica,tecnica"))
        #expect(log.contains("periodo+:s4:tarde:manha:av=fisica,tecnica"))
    }
}

import Foundation
import Testing
@testable import TactiPlanKit

// Períodos do dia (Manhã · Tarde · Noite). JSON no formato do servidor (GET /api/microcycles):
// `sessions` 1 por dia; o dia com 2+ períodos traz `periodos`. Paridade: PeriodosTest.kt.

let JSON_MICRO_PERIODOS = """
{"id":"m","week_identifier":"2031-11","start_date":"2031-03-10","end_date":"2031-03-16","sessions":[
 {"id":"seg","date":"2031-03-10","day_name":"Segunda","day_of_week":1,"session_type":null,"periodo":null,
  "blocks":[{"id":"b1","name":"Aquecimento","order":1,"activity":{"id":"a0","duration_minutes":30,
   "contents":[{"name":"Resistência","dimension":"fisico"}]}}]},
 {"id":"t1","date":"2031-03-11","day_name":"Terça","day_of_week":2,"session_type":"training","periodo":"manha",
  "avg_distance_km":"5.00",
  "blocks":[{"id":"m1","name":"Aquecimento","order":1,"activity":{"id":"a1","duration_minutes":90,"files_count":1,
   "contents":[{"name":"Organização Ofensiva","dimension":"tatico"}]}}],
  "periodos":[
   {"id":"t2","date":"2031-03-11","day_of_week":2,"session_type":"training","periodo":"tarde","avg_distance_km":3.5,
    "blocks":[{"id":"x1","name":"Aquecimento","order":1,"activity":{"id":"a2","duration_minutes":60,
     "contents":[{"name":"Resistência","dimension":"fisico"}]}}]},
   {"id":"t1","date":"2031-03-11","day_of_week":2,"session_type":"training","periodo":"manha","avg_distance_km":"5.00",
    "blocks":[{"id":"m1","name":"Aquecimento","order":1,"activity":{"id":"a1","duration_minutes":90,"files_count":1,
     "contents":[{"name":"Organização Ofensiva","dimension":"tatico"}]}}]}
  ]}
]}
"""

@Suite struct PeriodosTests {
    func micro() throws -> Microciclo { try JSONDecoder().decode(Microciclo.self, from: Data(JSON_MICRO_PERIODOS.utf8)) }

    @Test func `dia de 2 periodos decodifica; sessions segue 1 por dia`() throws {
        let m = try micro()
        #expect(m.dias.count == 2)
        let seg = m.dias[0]
        #expect(seg.periodo == nil)
        #expect(seg.periodos == nil)
        #expect(!seg.temPeriodos)
        #expect(seg.listaPeriodos.map { $0.id } == ["seg"])
        let ter = m.dias[1]
        #expect(ter.id == "t1")
        #expect(ter.periodo == "manha")
        #expect(ter.temPeriodos)
        #expect(ter.listaPeriodos.map { $0.id } == ["t1", "t2"], "ordem Manhã → Tarde")
        // o app antigo lia só `blocos` do 1º período: continua igual
        #expect(resumoDoDia(ter).minutos == 90)
    }

    @Test func `selo, divisao e resumo do dia inteiro somam os periodos`() throws {
        let ter = try micro().dias[1]
        #expect(seloPeriodos(ter) == "2 períodos")
        #expect(seloPeriodos(try micro().dias[0]) == nil)
        #expect(divisaoMinutos(ter) == "90+60")
        let r = resumoDoDiaInteiro(ter)
        #expect(r.minutos == 150)
        #expect(r.pilares == ["tatico"])
        #expect(r.anexos == 1)
        #expect(r.distanciaKm == 8.5)
        #expect(r.tipo == .treino)
        #expect(detalheDaLinha(r) == "150 min · 8,5 km")
        #expect(resumoDoDiaInteiro(try micro().dias[0]) == resumoDoDia(try micro().dias[0]))
    }

    @Test func `regras de adicionar periodo iguais ao servidor`() throws {
        let m = try micro()
        let seg = m.dias[0], ter = m.dias[1]
        #expect(periodosDisponiveis(seg) == Periodo.allCases)
        #expect(sugestaoNovoPeriodo(seg)!.atual == .manha)
        #expect(sugestaoNovoPeriodo(seg)!.novo == .tarde)
        #expect(periodosDisponiveis(ter) == [.noite])
        #expect(sugestaoNovoPeriodo(ter)!.novo == .noite)
        #expect(sugestaoNovoPeriodo(ter)!.atual == nil)
        #expect(erroNovoPeriodo(seg, atual: .manha, novo: .manha) == MSG_PERIODO_IGUAL)
        #expect(erroNovoPeriodo(seg, atual: nil, novo: .tarde) != nil)
        #expect(erroNovoPeriodo(seg, atual: .manha, novo: .tarde) == nil)
        #expect(erroNovoPeriodo(ter, atual: nil, novo: .tarde) == "O dia já tem o período Tarde.")
        var descanso = seg
        descanso.tipoBruto = "rest"
        #expect(periodosDisponiveis(descanso).isEmpty)
        #expect(erroNovoPeriodo(descanso, atual: .manha, novo: .tarde) == MSG_PERIODO_DESCANSO)
        var cheio = ter
        cheio.periodos = ter.listaPeriodos + [Dia(id: "t3", data: ter.data, diaDaSemana: 2, periodo: "noite")]
        #expect(periodosDisponiveis(cheio).isEmpty)
        #expect(erroNovoPeriodo(cheio, atual: nil, novo: .noite) == MSG_PERIODO_MAXIMO)
    }

    @Test func `jogo + periodo de treino: o dia aparece como jogo e soma o treino`() throws {
        var ter = try micro().dias[1]
        ter.periodos![1].tipoBruto = "match"
        ter.periodos![1].adversario = "Rival FC"
        let r = resumoDoDiaInteiro(ter)
        #expect(r.tipo == .jogo)
        #expect(tituloDaLinha(r) == "Jogo vs Rival FC")
        #expect(r.distanciaKm == 5, "só os períodos de treino somam distância")
        #expect(textoRemoverPeriodo(ter.periodos![1]).contains("O jogo deste período"))
    }

    @Test func `adicionar e remover periodo pelo servico`() async throws {
        let api = ApiTreinoFalsa()
        let s = ServicoTreino(api: api)
        let semana = SemanaISO(data: "2031-03-11")
        let seg = try micro().dias[0]
        _ = try await s.adicionarPeriodo(seg, novo: .tarde, atual: .manha, semana: semana, clubeId: "c")
        let ter = try micro().dias[1]
        _ = try await s.adicionarPeriodo(ter, novo: .noite, atual: .manha, semana: semana, clubeId: "c")
        #expect(try await s.removerPeriodo(ter.listaPeriodos[1]) == 2)
        #expect(api.chamadas == ["periodo+:seg:tarde:manha", "periodo+:t1:noite:", "periodo-:t2"])
        await #expect(throws: ErroApi.self) { try await s.removerPeriodo(seg) }
        await #expect(throws: ErroApi.self) { try await s.adicionarPeriodo(ter, novo: .tarde, atual: nil, semana: semana, clubeId: "c") }
    }

    @Test func `trocar horario: so os nomes livres, regras do servidor`() async throws {
        let ter = try micro().dias[1]   // Manhã (t1) + Tarde (t2)
        let manha = ter.listaPeriodos[0]
        #expect(periodosParaTrocar(ter, manha) == [.noite])
        #expect(periodosParaTrocar(ter, ter.listaPeriodos[1]) == [.noite])
        #expect(periodosParaTrocar(try micro().dias[0], try micro().dias[0]).isEmpty, "dia de 1 período não troca")
        #expect(erroTrocarPeriodo(ter, manha, para: .tarde) == "O dia já tem o período Tarde.")
        #expect(erroTrocarPeriodo(ter, manha, para: .manha) == "O período já é Manhã.")
        #expect(erroTrocarPeriodo(ter, manha, para: .noite) == nil)
        let api = ApiTreinoFalsa()
        let s = ServicoTreino(api: api)
        try await s.trocarPeriodo(manha, noDia: ter, para: .noite)
        #expect(api.chamadas == ["periodo~:t1:noite"])
        await #expect(throws: ErroApi.self) { try await s.trocarPeriodo(manha, noDia: ter, para: .tarde) }
        #expect(api.chamadas.count == 1, "não chama o servidor com troca inválida")
    }

    @Test func `ficha: dia inteiro ou so o periodo, nome do PDF`() throws {
        let ter = try micro().dias[1]
        #expect(corpoFichaDoDia("t2") == ["session_id": .texto("t2")])
        #expect(corpoFichaDoDia("t2", soPeriodo: true) == ["session_id": .texto("t2"), "so_periodo": .booleano(true)])
        #expect(nomePdfDoDia(ter) == "treino-Terca-11-03-2031.pdf")
        #expect(nomePdfDoDia(ter, periodo: "tarde") == "treino-Terca-11-03-2031-Tarde.pdf")
        #expect(CaminhosTreino.periodos("t1") == "/sessions/t1/periodos")
        #expect(CaminhosTreino.periodo("t2") == "/sessions/t2/periodo")
    }

    @Test func `fotos agrupadas por periodo na ficha e por dia · periodo na semana`() {
        let fotos = [
            FotoRelatorio(id: "1", data: "2031-03-11", dia: "Terça-feira", dd: "11/03", periodo: "tarde", periodoRotulo: "Tarde"),
            FotoRelatorio(id: "2", data: "2031-03-11", dia: "Terça-feira", dd: "11/03", periodo: "manha", periodoRotulo: "Manhã"),
            FotoRelatorio(id: "3", data: "2031-03-10", dia: "Segunda-feira", dd: "10/03"),
        ]
        let ficha = EscolhaFotos(lista: ListaFotosRelatorio(fotos: Array(fotos.prefix(2)), semana: false))
        #expect(ficha.grupos.map { $0.rotulo } == ["Manhã", "Tarde"])
        #expect(ficha.ordemExibida == ["2", "1"])
        let semana = EscolhaFotos(lista: ListaFotosRelatorio(fotos: fotos, semana: true))
        #expect(semana.grupos.map { $0.rotulo } == ["Segunda-feira · 10/03", "Terça-feira · 11/03 · Manhã", "Terça-feira · 11/03 · Tarde"])
        let simples = EscolhaFotos(lista: ListaFotosRelatorio(fotos: [fotos[2]], semana: false))
        #expect(simples.grupos.map { $0.rotulo } == [nil])
        let foto = try? JSONDecoder().decode(FotoRelatorio.self, from: Data(#"{"id":"9","periodo":"noite","periodoRotulo":"Noite"}"#.utf8))
        #expect(foto?.periodoRotulo == "Noite")
    }
}

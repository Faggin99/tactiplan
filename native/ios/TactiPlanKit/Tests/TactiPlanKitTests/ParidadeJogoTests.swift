import Foundation
import Testing
@testable import TactiPlanKit

// PARIDADE com o web: native/paridade/jogo.json é gerado pelo código do web
// (node native/paridade/gerar-jogo.js; o npm test do backend falha se ficar desatualizado).
// O Android lê o mesmo arquivo (dados/jogo/ParidadeJogoTest.kt).

private let RAIZ_REPO = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent() // Tests/…/X.swift → TactiPlanKit
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent() // ios → native → repo

func paridade() throws -> Json {
    try Json.ler(Data(contentsOf: RAIZ_REPO.appendingPathComponent("native/paridade/jogo.json")))
}

private func lista(_ j: Json?) -> [Json] { if case .lista(let l)? = j { return l }; return [] }
private func int(_ j: Json?) -> Int? { j?.numero.map { Int($0) } }
private func txt(_ j: Json?) -> String? { j?.texto }

private func jogadores(_ j: Json?) -> [JogadorJogo] {
    lista(j).map { p in
        JogadorJogo(atletaId: txt(p["athlete_id"]) ?? "", status: txt(p["status"]) ?? STATUS_TITULAR, vaga: int(p["slot"]),
                    minutosJogados: int(p["minutes_played"]) ?? 0, minutosManual: p["minutes_manual"]?.booleano ?? false,
                    atleta: AtletaResumo(id: txt(p["athlete_id"]) ?? "", nome: txt(p["name"]) ?? "", posicao: txt(p["posicao"])),
                    nome: txt(p["name"]))
    }
}

private func eventos(_ j: Json?) -> [EventoJogo] {
    lista(j).map { e in
        EventoJogo(id: txt(e["id"]) ?? "?", tipo: txt(e["event_type"]) ?? "", time: txt(e["team"]), minuto: int(e["minute"]),
                   jogadorId: txt(e["player_id"]), jogador2Id: txt(e["secondary_player_id"]))
    }
}

@Suite struct ParidadeJogoTests {
    @Test func `formacoes iguais ao shared formacoes json`() throws {
        let web = try Json.ler(Data(contentsOf: RAIZ_REPO.appendingPathComponent("shared/formacoes.json")))
        #expect(Set(web.objeto!.keys) == Set(FORMACOES.keys))
        for (m, cfg) in FORMACOES {
            #expect(txt(web[m]?["padrao"]) == cfg.padrao)
            #expect(lista(web[m]?["opcoes"]).compactMap(\.texto) == cfg.opcoes)
        }
    }

    @Test func `vagas e posicao em campo de todas as formacoes`() throws {
        let p = try paridade()
        for caso in lista(p["vagas"]) {
            let f = txt(caso["formacao"])!, m = txt(caso["modalidade"])!
            let vs = vagasDa(f)
            #expect(totalVagas(f) == int(caso["total"]))
            let esperadas = lista(caso["vagas"])
            #expect(vs.count == esperadas.count, "\(f)")
            for (v, e) in zip(vs, esperadas) {
                #expect(v.indice == int(e["indice"]))
                #expect(v.papel == txt(e["papel"]))
                #expect(v.linha == int(e["linha"]))
                #expect(abs(v.x - e["x"]!.numero!) < 1e-9, "\(f) x")
                #expect(abs(v.y - e["y"]!.numero!) < 1e-9, "\(f) y")
                #expect(abs(v.espaco - e["espaco"]!.numero!) < 1e-9, "\(f) espaco")
            }
            let pos = lista(caso["posicoes"]).map(\.texto)
            #expect(vs.map { posicaoEmCampo(f, $0.indice, m) } == pos, "\(m) \(f)")
        }
        for caso in lista(p["posicao_extra"]) {
            #expect(posicaoEmCampo(txt(caso["formacao"]), int(caso["vaga"]), txt(caso["modalidade"])) == txt(caso["posicao"]))
        }
        for caso in lista(p["resolver"]) {
            #expect(resolverFormacao(txt(caso["modalidade"]), txt(caso["formacao"])) == txt(caso["resultado"]))
        }
    }

    @Test func `remapear formacao e encaixar sugestao`() throws {
        let p = try paridade()
        for caso in lista(p["remapear"]) {
            let r = remapearFormacao(jogadores(caso["entrada"]), de: txt(caso["de"])!, para: txt(caso["para"])!)
            let esperado = lista(caso["saida"]).map { (txt($0["athlete_id"])!, int($0["slot"])) }
            #expect(r.jogadores.map(\.atletaId) == esperado.map(\.0))
            #expect(r.jogadores.map(\.vaga) == esperado.map(\.1), "\(txt(caso["de"])!)→\(txt(caso["para"])!)")
            #expect(r.deslocados.map(\.atletaId) == lista(caso["deslocados"]).compactMap(\.texto))
        }
        for caso in lista(p["sugerir"]) {
            let r = sugerirVagas(jogadores(caso["entrada"]), formacao: txt(caso["formacao"])!)
            #expect(r.map(\.vaga) == lista(caso["saida"]).map { int($0["slot"]) }, "\(txt(caso["formacao"])!)")
        }
        for caso in lista(p["nomes"]) {
            #expect(iniciaisDoAtleta(txt(caso["nome"])) == txt(caso["iniciais"]))
            #expect(nomeCurto(txt(caso["nome"])) == txt(caso["curto"]))
        }
    }

    @Test func `minutagem em campo reservas e checagem do servidor`() throws {
        let p = try paridade()
        for caso in lista(p["minutagem"]) {
            let nome = txt(caso["nome"])!
            let ps = jogadores(caso["players"]), es = eventos(caso["events"]), dur = int(caso["duration"])!
            let r = calcularMinutagem(jogadores: ps, eventos: es, duracao: dur)
            for (id, e) in caso["resultado"]!.objeto! {
                let s = try #require(r[id], "\(nome) \(id)")
                #expect(s.minutos == int(e["minutes"]), "\(nome) \(id) minutes")
                #expect(s.auto == int(e["auto"]), "\(nome) \(id) auto")
                #expect(s.manual == e["manual"]?.booleano)
                #expect(s.titular == e["started"]?.booleano)
                #expect(s.entrou == e["entered"]?.booleano, "\(nome) \(id) entered")
                #expect(s.entrouAos == int(e["enteredAt"]), "\(nome) \(id) enteredAt")
                #expect(s.saiuAos == int(e["leftAt"]), "\(nome) \(id) leftAt")
                #expect(s.expulsoAos == int(e["sentOffAt"]), "\(nome) \(id) sentOffAt")
                #expect(s.jogou == e["played"]?.booleano, "\(nome) \(id) played")
            }
            for ec in lista(caso["em_campo"]) {
                let ids = emCampo(jogadores: ps, eventos: es, duracao: dur, minuto: int(ec["minuto"])!).map(\.atletaId)
                #expect(ids == lista(ec["ids"]).compactMap(\.texto), "\(nome) em campo aos \(int(ec["minuto"])!)")
            }
            if let ign = caso["em_campo_ignorando"], ign != .nulo {
                let ids = emCampo(jogadores: ps, eventos: es, duracao: dur, minuto: int(ign["minuto"])!, ignorar: txt(ign["ignorar"])).map(\.atletaId)
                #expect(ids == lista(ign["ids"]).compactMap(\.texto), "\(nome) em campo ignorando")
            }
            #expect(reservasDisponiveis(jogadores: ps, eventos: es).map(\.atletaId) == lista(caso["reservas"]).compactMap(\.texto), "\(nome) reservas")
            if let ign = caso["reservas_ignorando"], ign != .nulo {
                #expect(reservasDisponiveis(jogadores: ps, eventos: es, ignorar: txt(ign["ignorar"])).map(\.atletaId)
                        == lista(ign["ids"]).compactMap(\.texto), "\(nome) reservas ignorando")
            }
            let chk = caso["checar"]!
            #expect(checarSubstituicoes(jogadores: ps, eventos: es) == (chk["ok"]?.booleano == true ? nil : txt(chk["error"])), "\(nome) checar")
        }
    }

    @Test func `validar substituicao com as frases do web`() throws {
        let p = try paridade()
        let ps = jogadores(p["validar_jogadores"]), es = eventos(p["validar_eventos"])
        for caso in lista(p["validar"]) {
            let erro = validarSubstituicao(jogadores: ps, eventos: es, duracao: 90, minuto: int(caso["minuto"]),
                                           entra: txt(caso["entra"]), sai: txt(caso["sai"]), ignorar: txt(caso["ignorar"]))
            #expect(erro == txt(caso["erro"]), "\(caso.textoJson())")
        }
        let ps2 = jogadores(p["validar_jogadores"])
        for caso in lista(p["checar"]) {
            #expect(checarSubstituicoes(jogadores: ps2, eventos: eventos(caso["events"])) == txt(caso["erro"]), "\(caso.textoJson())")
        }
    }

    @Test func `tipo de gol e minuto do evento`() throws {
        let p = try paridade()
        for caso in lista(p["tipo_gol"]) {
            let v = txt(caso["valor"])
            let l = lerTipoGol(v)
            #expect(l.momento == txt(caso["lido"]?["moment"]), "\(v ?? "nil")")
            #expect(l.subtipoBP == txt(caso["lido"]?["bpSubtype"]), "\(v ?? "nil")")
            #expect(rotuloTipoGol(v) == txt(caso["rotulo"]), "\(v ?? "nil")")
        }
        for caso in lista(p["gravar_tipo_gol"]) {
            #expect(gravarTipoGol(momento: txt(caso["momento"])!, subtipoBP: txt(caso["subtipo"]), tipoEvento: txt(caso["evento"])!)
                    == txt(caso["resultado"]))
        }
        for caso in lista(p["minutos"]) {
            let dur = int(caso["duracao"])!, total = int(caso["total"])!
            let m = lerMinuto(total, duracao: dur)
            #expect(m.tempo == int(caso["lido"]?["half"]), "\(dur) \(total)")
            #expect(m.minutoNoTempo == int(caso["lido"]?["minuteInHalf"]), "\(dur) \(total)")
            #expect(m.acrescimo == int(caso["lido"]?["stoppageTime"]), "\(dur) \(total)")
            #expect(minutoTotal(m, duracao: dur) == int(caso["de_volta"]), "\(dur) \(total)")
            #expect(textoMinuto(m, duracao: dur) == txt(caso["texto"]), "\(dur) \(total)")
        }
    }
}

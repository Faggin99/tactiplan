import Foundation
import Testing
@testable import TactiPlanKit

@Suite struct ModelosTreinoTests {
    @Test func `microciclo real decodifica com numero em texto e dias em ordem`() throws {
        let m = try microcicloReal()
        #expect(m.semana == "2026-40")
        #expect(m.inicio == "2026-09-28")
        #expect(m.dias.count == 2)
        let seg = m.dias[0]
        #expect(seg.data == "2026-09-28")
        #expect(seg.diaDaSemana == 1)
        #expect(seg.tipo == .treino)
        #expect(seg.distanciaKm == 5.2)
        #expect(seg.blocos.map(\.ordem) == [1, 2, 3])
        let a = try #require(seg.blocos[0].atividade)
        #expect(a.minutos == 25)
        #expect(a.anexos == 2)
        #expect(a.tituloNome == "Regenerativo + alongamento")
        #expect(a.pilar == "fisico")
        #expect(a.conteudos?.first?.nome == "Aeróbio")
        let jogo = m.dias[1]
        #expect(jogo.tipo == .jogo)
        #expect(jogo.adversario == "Atlético Serrano")
    }

    @Test func `campos estranhos nao derrubam`() throws {
        let j = #"{"id":"d","date":"2026-10-21T00:00:00.000Z","day_of_week":"3","session_type":"outro","avg_distance_km":"abc","blocks":[{"name":"X","order":"2","activity":{"id":"a","duration_minutes":"15","files_count":null}}]}"#
        let d = try JSONDecoder().decode(Dia.self, from: Data(j.utf8))
        #expect(d.data == "2026-10-21")
        #expect(d.diaDaSemana == 3)
        #expect(d.tipo == .treino)
        #expect(d.distanciaKm == nil)
        #expect(d.blocos[0].ordem == 2)
        #expect(d.blocos[0].atividade?.minutos == 15)
        #expect(d.blocos[0].atividade?.anexos == nil)
    }

    @Test func `anexo real do upload`() throws {
        let j = #"{"id":"0d5e","session_id":"s","activity_id":"a1","title":"Foto renomeada","file_name":"foto-teste.jpg","file_path":"/uploads/session-files/x.jpg","mime_type":"image/jpeg","file_size":"8229","url":"/uploads/session-files/x.jpg"}"#
        let a = try JSONDecoder().decode(Anexo.self, from: Data(j.utf8))
        #expect(a.tamanho == 8229)
        #expect(a.caminho == "/uploads/session-files/x.jpg")
        #expect(a.especie == .foto)
        #expect(a.rotulo == "Foto renomeada")
        #expect(especieDoAnexo(tipo: nil, nome: "treino.MOV") == .video)
        #expect(especieDoAnexo(tipo: "application/pdf", nome: nil) == .pdf)
        #expect(Anexo(id: "x", atividadeId: nil, titulo: "  ", nomeArquivo: "a.pdf", caminho: nil, tipo: nil).rotulo == "a.pdf")
    }

    @Test func `cadastros filtram inativos e arquivados`() {
        let c = CadastrosTreino(
            conteudos: [ConteudoCadastro(id: "c1", nome: "A", dimensao: "fisico"), ConteudoCadastro(id: "c2", nome: "B", dimensao: "fisico", ativo: false)],
            etapas: [EtapaCadastro(id: "e1", nome: "E", conteudoId: "c1", ativo: false)],
            titulos: [TituloCadastro(id: "t1", titulo: "T", conteudoId: "c1", arquivado: true), TituloCadastro(id: "t2", titulo: "U", conteudoId: "c1")])
        #expect(c.conteudos.map(\.id) == ["c1"])
        #expect(c.etapas.isEmpty)
        #expect(c.titulos.map(\.id) == ["t2"])
    }

    @Test func `tema do mes`() {
        #expect(TemaDoMes(hasTheme: false).frase == nil)
        #expect(TemaDoMes(hasTheme: true, theme: .init(name: "Saída de pressão"), adherencePercent: 62).frase == "Tema do mês: Saída de pressão · 62%")
    }
}

@Suite struct SemanaTests {
    @Test func `semana ISO igual ao web`() {
        #expect(SemanaISO(data: "2026-10-21").identificador == "2026-43")
        #expect(SemanaISO(data: "2026-10-21").segunda == "2026-10-19")
        #expect(SemanaISO(data: "2026-10-25").identificador == "2026-43") // domingo
        #expect(SemanaISO(data: "2026-10-26").identificador == "2026-44")
        #expect(SemanaISO(data: "2026-01-01").identificador == "2026-01") // quinta
        #expect(SemanaISO(data: "2027-01-01").identificador == "2026-53") // sexta → semana 53 de 2026
        #expect(SemanaISO(data: "2024-12-30").identificador == "2025-01")
        #expect(SemanaISO(data: "2026-10-21").somando(semanas: -1).identificador == "2026-42")
        #expect(SemanaISO(data: "2026-12-31").somando(semanas: 1).identificador == "2027-01")
    }

    @Test func `rotulos de periodo e dia`() {
        #expect(rotuloPeriodo(SemanaISO(data: "2026-10-21")) == "19–25 out")
        #expect(rotuloPeriodo(SemanaISO(data: "2026-09-30")) == "28 set – 4 out")
        #expect(rotuloDiaCurto("2026-10-21") == "Quarta, 21/10")
        #expect(rotuloDiaMinusculo("2026-10-21") == "quarta, 21/10")
        #expect(siglaEDia("2026-10-24").sigla == "SÁB")
        #expect(siglaEDia("2026-10-24").dia == "24")
        #expect(dataBR("2026-10-21") == "21/10/2026")
        #expect(dataPassada("2026-10-20", hoje: "2026-10-21"))
        #expect(!dataPassada("2026-10-21", hoje: "2026-10-21"))
    }

    @Test func `hoje no fuso de Brasilia`() {
        // 21/10/2026 02:00 UTC = 20/10 23:00 em Brasília
        let ms: Int64 = 1_792_548_000_000
        #expect(hojeBrasilia(ms) == "2026-10-20")
        #expect(hojeBrasilia(ms + 4 * 3_600_000) == "2026-10-21")
    }

    @Test func `sete dias com vazios onde falta`() throws {
        let m = try microcicloReal()
        let dias = diasDaSemana(m, SemanaISO(data: "2026-09-28"))
        #expect(dias.count == 7)
        #expect(dias[0].id != nil)
        #expect(dias[1].id == nil)
        #expect(dias[1].nomeDia == "Terça")
        #expect(dias[1].diaDaSemana == 2)
        #expect(dias[1].blocos.map(\.nome) == NOMES_BLOCOS)
        #expect(dias[1].blocos.map(\.ordem) == [1, 2, 3, 4, 5, 6])
        #expect(dias[5].tipo == .jogo)
        let semNada = diasDaSemana(nil, SemanaISO(data: "2026-10-21"))
        #expect(semNada.map(\.data).first == "2026-10-19")
        #expect(semNada.allSatisfy { $0.id == nil })
    }

    func atv(_ min: Int?, _ dims: [String], anexos: Int = 0) -> Atividade {
        Atividade(id: UUID().uuidString, minutos: min, anexos: anexos,
                  conteudos: dims.map { ConteudoDaAtividade(id: $0, nome: $0, dimensao: $0) })
    }

    func dia(_ atividades: [Atividade?], tipo: String? = nil, km: Double? = nil) -> Dia {
        Dia(id: "d", data: "2026-10-21", diaDaSemana: 3, tipoBruto: tipo, distanciaKm: km,
            blocos: atividades.enumerated().map { Bloco(id: "b\($0.offset)", nome: "B", ordem: $0.offset + 1, atividade: $0.element) })
    }

    @Test func `pilar predominante POR TEMPO`() {
        // 2 atividades táticas curtas × 1 física longa: ganha o físico (por tempo, não por contagem)
        let r = resumoDoDia(dia([atv(10, ["tatico"]), atv(10, ["tatico"]), atv(30, ["fisico"], anexos: 2), nil]))
        #expect(r.pilares == ["fisico"])
        #expect(r.minutos == 50)
        #expect(r.atividades == 3)
        #expect(r.anexos == 2)
        #expect(r.minutosPorPilar.map(\.pilar) == ["tatico", "fisico"])
        #expect(r.minutosPorPilar.map(\.minutos) == [20, 30])
        #expect(tituloDaLinha(r) == "Treino · Físico")
        #expect(fraseDoHeroi(r) == "Pilar predominante Físico · 3 atividades · 2 anexos")
    }

    @Test func `empate mostra os dois e sem tempo conta atividades`() {
        let empate = resumoDoDia(dia([atv(20, ["fisico"]), atv(20, ["tatico"])]))
        #expect(empate.pilares == ["tatico", "fisico"])
        #expect(empate.rotuloPilares == "Tático e Físico")
        let semTempo = resumoDoDia(dia([atv(nil, ["tecnico"]), atv(nil, ["tecnico"]), atv(nil, ["mental"])]))
        #expect(semTempo.pilares == ["tecnico"])
        #expect(semTempo.minutos == 0)
    }

    @Test func `linha do dia para jogo descanso e vazio`() {
        #expect(tituloDaLinha(resumoDoDia(dia([nil], tipo: "match"))) == "Jogo")
        var j = dia([nil], tipo: "match"); j.adversario = "Rival FC"
        #expect(tituloDaLinha(resumoDoDia(j)) == "Jogo vs Rival FC")
        #expect(tituloDaLinha(resumoDoDia(dia([], tipo: "rest"))) == "Descanso")
        let vazio = resumoDoDia(dia([nil, nil], km: 6.2))
        #expect(tituloDaLinha(vazio) == "Treino")
        #expect(detalheDaLinha(vazio) == "6,2 km · Sem atividades")
        #expect(fraseDoHeroi(vazio) == "Nenhuma atividade planejada")
        // distância só vale em dia de treino
        #expect(resumoDoDia(dia([nil], tipo: "match", km: 5)).distanciaKm == nil)
        #expect(detalheDaLinha(resumoDoDia(dia([atv(88, ["tatico"])], km: 5.8))) == "88 min · 5,8 km")
    }

    @Test func `distancia igual ao utils do web`() {
        #expect(formatarKm(5.2) == "5,2")
        #expect(formatarKm(5.25) == "5,25")
        #expect(formatarKm(5) == "5")
        #expect(formatarKm(5.05) == "5,05")
        #expect(formatarKm(nil) == "")
        #expect(lerKm("5,2") == .ok(5.2))
        #expect(lerKm(" 5.25 ") == .ok(5.25))
        #expect(lerKm("") == .ok(nil))
        #expect(lerKm("5,255") == .erro(MSG_KM_INVALIDO))
        #expect(lerKm("abc") == .erro(MSG_KM_INVALIDO))
        #expect(lerKm("100") == .erro(MSG_KM_GRANDE))
    }
}

@Suite struct EditarAtividadeTests {
    let cad = CadastrosTreino(
        conteudos: [
            ConteudoCadastro(id: "to", nome: "Transição Ofensiva", dimensao: "tatico"),
            ConteudoCadastro(id: "oo", nome: "Org. Ofensiva", dimensao: "tatico"),
            ConteudoCadastro(id: "aer", nome: "Aeróbio", dimensao: "fisico"),
        ],
        etapas: [
            EtapaCadastro(id: "ca", nome: "Contra-ataque", conteudoId: "to"),
            EtapaCadastro(id: "ar", nome: "Ataque rápido", conteudoId: "to"),
            EtapaCadastro(id: "sa", nome: "Saída de bola", conteudoId: "oo"),
        ],
        titulos: [
            TituloCadastro(id: "t-to", titulo: "Saída de pressão", conteudoId: "to"),
            TituloCadastro(id: "t-oo", titulo: "8v8", conteudoId: "oo"),
            TituloCadastro(id: "t-aer", titulo: "Corrida", conteudoId: "aer"),
        ])

    @Test func `carrega da atividade salva como o web (stage_id e nome legado)`() {
        let a = Atividade(id: "a", tituloId: "t-to", descricao: "Desc", grupos: ["G1"], minutos: 20,
                          conteudos: [ConteudoDaAtividade(id: "to", nome: "Transição Ofensiva", dimensao: "tatico")],
                          etapas: [EtapaDaAtividade(stageId: "ca", nome: "Contra-ataque"), EtapaDaAtividade(stageId: nil, nome: "Ataque rápido"),
                                   EtapaDaAtividade(stageId: "sumiu", nome: "Nada")])
        let f = FormAtividade(de: a, cadastros: cad)
        #expect(f.pilar == "tatico")
        #expect(f.conteudoId == "to")
        #expect(f.etapas == ["ca", "ar"])
        #expect(f.minutos == "20")
        #expect(f.preenchido)
        #expect(f.mostraEtapas)
        #expect(f.rotuloConteudo == "Momento do Jogo")
        #expect(f.titulosDisponiveis(cad).map(\.id) == ["t-to"])
        #expect(f.etapasDisponiveis(cad).map(\.id) == ["ca", "ar"])
        #expect(!FormAtividade(de: nil, cadastros: cad).preenchido)
    }

    @Test func `trocar conteudo limpa atividade e submomentos que nao sao dele`() {
        var f = FormAtividade(pilar: "tatico", conteudoId: "to", etapas: ["ca"], tituloId: "t-to")
        f.escolherConteudo("oo", cadastros: cad)
        #expect(f.tituloId == nil)
        #expect(f.etapas.isEmpty)
        f.tituloId = "t-oo"
        f.alternarEtapa("sa")
        f.escolherConteudo("oo", cadastros: cad)
        #expect(f.tituloId == "t-oo")
        #expect(f.etapas == ["sa"])
    }

    @Test func `tocar pilar troca ou desmarca e sempre limpa o conteudo`() {
        var f = FormAtividade(pilar: "tatico", conteudoId: "to", etapas: ["ca"], tituloId: "t-to")
        f.tocarPilar("fisico", cadastros: cad)
        #expect(f.pilar == "fisico")
        #expect(f.conteudoId == nil)
        #expect(f.tituloId == nil)
        #expect(f.etapas.isEmpty)
        #expect(!f.mostraEtapas)
        #expect(f.conteudosDoPilar(cad).map(\.id) == ["aer"])
        f.tocarPilar("fisico", cadastros: cad)
        #expect(f.pilar == nil)
        #expect(f.conteudosDoPilar(cad).isEmpty)
    }

    @Test func `grupos tempo e corpo do POST`() throws {
        var f = FormAtividade(pilar: "tatico", conteudoId: "to", etapas: ["ca"], tituloId: "t-to", descricao: "D")
        f.alternarTodosOsGrupos()
        #expect(f.grupos == ["G1", "G2", "G3", "Transição"])
        #expect(f.todosOsGrupos)
        f.alternarTodosOsGrupos()
        #expect(f.grupos.isEmpty)
        f.alternarGrupo("G2"); f.alternarGrupo("G1"); f.alternarGrupo("G2")
        #expect(f.grupos == ["G1"])
        f.somarMinutos(5); f.somarMinutos(5)
        #expect(f.minutos == "10")
        f.somarMinutos(-20)
        #expect(f.minutos == "")
        f.minutos = "20"
        let corpo = f.corpo(blocoId: "b1")
        #expect(corpo["block_id"]?.texto == "b1")
        #expect(corpo["title_id"]?.texto == "t-to")
        #expect(corpo["duration_minutes"]?.texto == "20")
        #expect(corpo["selectedContents"] == .lista(["to"]))
        #expect(corpo["selectedStages"] == .lista(["ca"]))
        #expect(corpo["groups"] == .lista(["G1"]))
        #expect(corpo["is_rest"] == .booleano(false))
        let vazio = FormAtividade().corpo()
        #expect(vazio["title_id"] == .nulo)
        #expect(vazio["description"] == .nulo)
        #expect(vazio["duration_minutes"] == .nulo)
        #expect(vazio["block_id"] == nil)
        #expect(limparMinutos("2a0 min") == "20")
    }

    @Test func `regras de anexo`() {
        let vazio = FormAtividade()
        let cheio = FormAtividade(descricao: "x")
        #expect(motivoParaNaoAnexar(vazio, existentes: 0, novos: 0) == MSG_PREENCHA_ANTES)
        #expect(motivoParaNaoAnexar(cheio, existentes: 3, novos: 1) == nil)
        #expect(motivoParaNaoAnexar(cheio, existentes: 3, novos: 2) == MSG_MAX_ANEXOS)
        #expect(problemaDoArquivo(tipo: "image/heic", tamanho: 10) == MSG_ANEXO_TIPO)
        #expect(problemaDoArquivo(tipo: "video/quicktime", tamanho: MAX_BYTES_ANEXO + 1) == MSG_ANEXO_GRANDE)
        #expect(problemaDoArquivo(tipo: "application/pdf", tamanho: 100) == nil)
        #expect(validarSalvar(vazio, anexosExistentes: 1, anexosNovos: 0, distanciaTexto: nil) == MSG_ANEXO_ORFAO)
        #expect(validarSalvar(cheio, anexosExistentes: 1, anexosNovos: 0, distanciaTexto: "abc") == MSG_KM_INVALIDO)
        #expect(validarSalvar(vazio, anexosExistentes: 0, anexosNovos: 0, distanciaTexto: "5,2") == nil)
        #expect(tituloDoArquivo("IMG_2231.HEIC") == "IMG_2231")
        #expect(AnexoNovo(titulo: "  ", nome: "saida.pdf", tipo: "application/pdf", tamanho: 1).tituloFinal == "saida")
    }
}

// MARK: ServicoTreino (a sequência do salvar)

final class ApiTreinoFalsa: ApiTreino, @unchecked Sendable {
    private let trava = NSLock()
    private var _chamadas: [String] = []
    var chamadas: [String] { trava.withLock { _chamadas } }
    func anotar(_ s: String) { trava.withLock { _chamadas.append(s) } }

    var garantido: Microciclo?
    var erroAnexo: [String: Error] = [:]
    var erroCriar: Error?

    func microciclo(semana: String, clubeId: String) async throws -> Microciclo? { anotar("microciclo:\(semana)"); return garantido }
    func garantirMicrociclo(semana: String, clubeId: String) async throws -> Microciclo {
        anotar("ensure:\(semana):\(clubeId)")
        guard let garantido else { throw ErroApi.offline() }
        return garantido
    }
    func cadastros(modalidade: String?) async throws -> CadastrosTreino { anotar("cadastros"); return CadastrosTreino() }
    func criarTitulo(titulo: String, conteudoId: String, descricao: String?) async throws -> TituloCadastro {
        anotar("titulo:\(titulo)"); return TituloCadastro(id: "t-novo", titulo: titulo, conteudoId: conteudoId)
    }
    func anexosDoDia(_ diaId: String) async throws -> [Anexo] { anotar("anexos:\(diaId)"); return [] }
    func criarAtividade(_ corpo: Json) async throws -> String {
        anotar("criar:\(corpo["block_id"]?.texto ?? "")")
        if let erroCriar { throw erroCriar }
        return "a-nova"
    }
    func atualizarAtividade(_ id: String, _ corpo: Json) async throws { anotar("atualizar:\(id)") }
    func apagarAtividadeDoBloco(_ blocoId: String) async throws { anotar("apagar:\(blocoId)") }
    func mudarTipo(_ diaId: String, tipo: TipoDia, adversario: String?, avaliacao: EscolhaAvaliacao?) async throws {
        anotar("tipo:\(diaId):\(tipo.rawValue):\(adversario ?? "")" + (avaliacao.map { ":\($0.tipos.joined(separator: ","))" } ?? ""))
    }
    func mudarDistancia(_ diaId: String, km: Double?) async throws { anotar("km:\(diaId):\(km.map { String($0) } ?? "nil")") }
    func adicionarPeriodo(_ diaId: String, novo: Periodo, atual: Periodo?, avaliacao: EscolhaAvaliacao?) async throws -> String {
        anotar("periodo+:\(diaId):\(novo.rawValue):\(atual?.rawValue ?? "")" + (avaliacao.map { ":av=\($0.tipos.joined(separator: ","))" } ?? "")); return "p-novo"
    }
    func removerPeriodo(_ periodoId: String) async throws -> Int { anotar("periodo-:\(periodoId)"); return 2 }
    func trocarPeriodo(_ periodoId: String, para: Periodo) async throws { anotar("periodo~:\(periodoId):\(para.rawValue)") }
    func enviarAnexo(atividadeId: String, arquivo: ArquivoUpload, titulo: String,
                     progresso: @escaping @Sendable (Double) -> Void) async throws -> Anexo {
        anotar("anexo:\(atividadeId):\(titulo)")
        if let e = erroAnexo[titulo] { throw e }
        progresso(0.5); progresso(1)
        return Anexo(id: "f-\(titulo)", atividadeId: atividadeId, titulo: titulo, caminho: "/uploads/x", tipo: arquivo.tipo)
    }
    func renomearAnexo(_ id: String, titulo: String) async throws -> Anexo {
        anotar("renomear:\(id):\(titulo)"); return Anexo(id: id, atividadeId: nil, titulo: titulo, caminho: nil, tipo: nil)
    }
    func apagarAnexo(_ id: String) async throws { anotar("apagarAnexo:\(id)") }
    func temaDoMes(mes: String, clubeId: String) async throws -> TemaDoMes { TemaDoMes(hasTheme: false) }
    func fotosDoRelatorio(_ tipo: String, corpo: [String: Json]) async throws -> ListaFotosRelatorio { ListaFotosRelatorio(fotos: []) }
    func htmlDoRelatorio(_ tipo: String, corpo: [String: Json]) async throws -> String { "" }
    func pdfDoRelatorio(_ tipo: String, corpo: [String: Json]) async throws -> Data { Data("%PDF".utf8) }
}

final class Etapas: @unchecked Sendable {
    private let trava = NSLock()
    private var _lista: [Etapa] = []
    var lista: [Etapa] { trava.withLock { _lista } }
    func add(_ e: Etapa) { trava.withLock { _lista.append(e) } }
}

@Suite struct ServicoTreinoTests {
    let semana = SemanaISO(data: "2026-10-21")

    func envio(_ titulo: String) -> EnvioAnexo {
        EnvioAnexo(anexo: AnexoNovo(titulo: titulo, nome: "\(titulo).jpg", tipo: "image/jpeg", tamanho: 3),
                   arquivo: ArquivoUpload(nome: "\(titulo).jpg", tipo: "image/jpeg", dados: Data([1, 2, 3])))
    }

    func microcicloGarantido() -> Microciclo {
        Microciclo(id: "m", semana: "2026-43", dias: (1...7).map { i in
            Dia(id: "d\(i)", data: somarDias("2026-10-19", i - 1), diaDaSemana: i,
                blocos: (1...6).map { Bloco(id: "b\(i)-\($0)", nome: NOMES_BLOCOS[$0 - 1], ordem: $0) })
        })
    }

    @Test func `dia novo: ensure, depois cria a atividade, distancia e SO ENTAO os anexos`() async throws {
        let api = ApiTreinoFalsa()
        api.garantido = microcicloGarantido()
        let etapas = Etapas()
        let r = try await ServicoTreino(api: api).salvar(PedidoSalvar(
            semana: semana, clubeId: "c1", dia: diaVazio("2026-10-21"), ordemDoBloco: 3,
            form: FormAtividade(descricao: "x"), distancia: .some(5.2), anexos: [envio("um"), envio("dois")])) { etapas.add($0) }
        #expect(api.chamadas == ["ensure:2026-43:c1", "criar:b3-3", "km:d3:5.2", "anexo:a-nova:um", "anexo:a-nova:dois"])
        #expect(r.diaId == "d3")
        #expect(r.atividadeId == "a-nova")
        #expect(r.anexosEnviados.map(\.id) == ["f-um", "f-dois"])
        #expect(r.mensagemFalhas == nil)
        #expect(etapas.lista.first == .preparando)
        #expect(etapas.lista.contains(.enviando(indice: 1, total: 2, progresso: 1)))
    }

    @Test func `dia existente com atividade: atualiza sem ensure e sem mexer na distancia`() async throws {
        let api = ApiTreinoFalsa()
        var d = microcicloGarantido().dias[2]
        d.blocos[0].atividade = Atividade(id: "a-velha")
        _ = try await ServicoTreino(api: api).salvar(PedidoSalvar(
            semana: semana, clubeId: "c1", dia: d, ordemDoBloco: 1, form: FormAtividade(minutos: "20")))
        #expect(api.chamadas == ["atualizar:a-velha"])
    }

    @Test func `bloco esvaziado apaga a atividade; bloco vazio sem atividade nao chama nada`() async throws {
        let api = ApiTreinoFalsa()
        var d = microcicloGarantido().dias[2]
        d.blocos[1].atividade = Atividade(id: "a-velha")
        let r = try await ServicoTreino(api: api).salvar(PedidoSalvar(semana: semana, clubeId: "c1", dia: d, ordemDoBloco: 2, form: FormAtividade()))
        #expect(api.chamadas == ["apagar:b3-2"])
        #expect(r.atividadeId == nil)
        let api2 = ApiTreinoFalsa()
        _ = try await ServicoTreino(api: api2).salvar(PedidoSalvar(semana: semana, clubeId: "c1", dia: d, ordemDoBloco: 3, form: FormAtividade()))
        #expect(api2.chamadas.isEmpty)
    }

    @Test func `anexo que falha nao desfaz o resto; 401 sobe`() async throws {
        let api = ApiTreinoFalsa()
        api.erroAnexo["dois"] = erro(409, nil, "Máximo de 5 anexos por atividade")
        let d = microcicloGarantido().dias[0]
        let r = try await ServicoTreino(api: api).salvar(PedidoSalvar(
            semana: semana, clubeId: "c1", dia: d, ordemDoBloco: 1, form: FormAtividade(descricao: "x"),
            anexos: [envio("um"), envio("dois"), envio("tres")]))
        #expect(r.anexosEnviados.count == 2)
        #expect(r.anexosComFalha.count == 1)
        #expect(r.mensagemFalhas == "1 anexo não foi enviado. Abra a atividade e tente de novo.")
        api.erroAnexo["um"] = erro(401, "SESSAO_INVALIDA")
        await #expect(throws: ErroApi.self) {
            _ = try await ServicoTreino(api: api).salvar(PedidoSalvar(
                semana: semana, clubeId: "c1", dia: d, ordemDoBloco: 1, form: FormAtividade(descricao: "x"), anexos: [envio("um")]))
        }
    }

    @Test func `erro ao criar para tudo antes dos anexos`() async {
        let api = ApiTreinoFalsa()
        api.erroCriar = erro(402, "READ_ONLY")
        let d = microcicloGarantido().dias[0]
        await #expect(throws: ErroApi.self) {
            _ = try await ServicoTreino(api: api).salvar(PedidoSalvar(
                semana: semana, clubeId: "c1", dia: d, ordemDoBloco: 1, form: FormAtividade(descricao: "x"), anexos: [envio("um")]))
        }
        #expect(!api.chamadas.contains { $0.hasPrefix("anexo") })
    }

    @Test func `tipo e distancia criam o dia antes`() async throws {
        let api = ApiTreinoFalsa()
        api.garantido = microcicloGarantido()
        let s = ServicoTreino(api: api)
        let id = try await s.mudarTipo(diaVazio("2026-10-24"), para: .jogo, adversario: " Rival ", semana: semana, clubeId: "c1")
        #expect(id == "d6")
        _ = try await s.mudarDistancia(microcicloGarantido().dias[0], km: nil, semana: semana, clubeId: "c1")
        #expect(api.chamadas == ["ensure:2026-43:c1", "tipo:d6:match: Rival ", "km:d1:nil"])
    }

    @Test func `mensagens amigaveis`() {
        #expect(mensagemErroTreino(erro(403, nil, "Sem permissão pra editar treinos")) == MSG_SEM_PERMISSAO_TREINO)
        #expect(mensagemErroTreino(erro(403, nil), permissao: MSG_SEM_PERMISSAO_APAGAR) == MSG_SEM_PERMISSAO_APAGAR)
        #expect(mensagemErroTreino(erro(402, "READ_ONLY", "Esta conta está em modo só leitura (sem assinatura ativa)")) == TEXTO_NAO_EDITA)
        #expect(mensagemErroTreino(erro(409, "CLUB_ARCHIVED")) == TEXTO_CLUBE_ARQUIVADO)
        #expect(mensagemErroTreino(erro(402, "PLAN_REQUIRED", "As exportações não estão incluídas no seu plano atual.")) == MSG_NAO_EXPORTA)
        #expect(mensagemErroTreino(erro(409, nil, "Máximo de 5 anexos por atividade")) == "Máximo de 5 anexos por atividade")
    }

    @Test func `corpos e nomes dos relatorios`() {
        #expect(corpoRelatorioSemana(semana, clubeId: "c1") == [
            "club_id": "c1", "start_date": "2026-10-19", "end_date": "2026-10-25", "filter_type": "1-micro"])
        #expect(corpoFichaDoDia("d1") == ["session_id": "d1"])
        #expect(nomePdfDoDia(Dia(data: "2026-10-20", nomeDia: "Terça", diaDaSemana: 2)) == "treino-Terca-20-10-2026.pdf")
        #expect(nomePdfDaSemana(semana, clube: "Esporte Clube Vila Nova") == "Estatisticas_Treino_Esporte_Clube_Vila_Nova_Semana_43_2026.pdf")
        #expect(nomeArquivoSeguro("São  Paulo/FC") == "Sao_PauloFC")
    }
}

// MARK: ApiTreinoHttp (caminhos, cabeçalhos, multipart)

final class TransporteFalso: Transporte, TransporteUpload, @unchecked Sendable {
    private let trava = NSLock()
    private var _pedidos: [Requisicao] = []
    var pedidos: [Requisicao] { trava.withLock { _pedidos } }
    var respostas: [Resposta] = []

    func enviar(_ r: Requisicao) async throws -> Resposta {
        trava.withLock { _pedidos.append(r) }
        return trava.withLock { respostas.isEmpty ? Resposta(status: 200, corpo: Data("{}".utf8)) : respostas.removeFirst() }
    }

    func enviar(_ r: Requisicao, progresso: @escaping @Sendable (Double) -> Void) async throws -> Resposta {
        progresso(1)
        return try await enviar(r)
    }
}

@Suite struct ApiTreinoHttpTests {
    func api(_ t: TransporteFalso) -> ApiTreinoHttp {
        ApiTreinoHttp(api: Api(base: "https://x.test/api", transporte: t), upload: t, token: "tpa_abc", workspaceId: "ws-1",
                      fronteira: { "FRONTEIRA" })
    }

    @Test func `toda chamada leva token e X-Workspace-Id`() async throws {
        let t = TransporteFalso()
        t.respostas = [Resposta(status: 200, corpo: Data("null".utf8))]
        let m = try await api(t).microciclo(semana: "2026-43", clubeId: "c 1")
        #expect(m == nil)
        let r = try #require(t.pedidos.first)
        #expect(r.url.absoluteString == "https://x.test/api/microcycles?week=2026-43&club_id=c%201")
        #expect(r.cabecalho("authorization") == "Bearer tpa_abc")
        #expect(r.cabecalho("x-workspace-id") == "ws-1")
    }

    @Test func `cadastros aceitam lista ou data`() async throws {
        let t = TransporteFalso()
        t.respostas = [
            Resposta(status: 200, corpo: Data(#"[{"id":"c1","name":"Aeróbio","dimension":"fisico","active":true}]"#.utf8)),
            Resposta(status: 200, corpo: Data(#"{"data":[{"id":"e1","name":"Contra-ataque","content_id":"to","display_order":"2"}]}"#.utf8)),
            Resposta(status: 200, corpo: Data(#"[{"id":"t1","title":"Rondo","content_id":"c1","is_archived":false}]"#.utf8)),
        ]
        let c = try await api(t).cadastros(modalidade: "football_11")
        #expect(c.conteudos.map(\.nome) == ["Aeróbio"])
        #expect(t.pedidos.map(\.url.absoluteString).contains("https://x.test/api/stages?modality=football_11"))
        #expect(c.etapas.count + c.titulos.count >= 1)
    }

    @Test func `upload multipart com activity_id e title antes do arquivo`() async throws {
        let t = TransporteFalso()
        t.respostas = [Resposta(status: 201, corpo: Data(#"{"id":"f1","activity_id":"a1","title":"Foto","mime_type":"image/jpeg","file_size":"3"}"#.utf8))]
        let a = try await api(t).enviarAnexo(atividadeId: "a1", arquivo: ArquivoUpload(nome: "f\"oto.jpg", tipo: "image/jpeg", dados: Data([1, 2, 3])),
                                             titulo: "Foto") { _ in }
        #expect(a.id == "f1")
        let r = try #require(t.pedidos.first)
        #expect(r.url.absoluteString == "https://x.test/api/files/upload")
        #expect(r.cabecalho("content-type") == "multipart/form-data; boundary=FRONTEIRA")
        #expect(r.cabecalho("x-workspace-id") == "ws-1")
        let corpo = String(decoding: try #require(r.corpo), as: UTF8.self)
        let iA = try #require(corpo.range(of: "name=\"activity_id\"\r\n\r\na1\r\n"))
        let iT = try #require(corpo.range(of: "name=\"title\"\r\n\r\nFoto\r\n"))
        let iF = try #require(corpo.range(of: "name=\"file\"; filename=\"f%22oto.jpg\"\r\nContent-Type: image/jpeg"))
        #expect(iA.lowerBound < iT.lowerBound && iT.lowerBound < iF.lowerBound)
        #expect(corpo.hasSuffix("\r\n--FRONTEIRA--\r\n"))
    }

    @Test func `upload recusado vira ErroApi com a mensagem do servidor`() async {
        let t = TransporteFalso()
        t.respostas = [Resposta(status: 409, corpo: Data(#"{"error":"Máximo de 5 anexos por atividade"}"#.utf8))]
        await #expect(throws: ErroApi(status: 409, codigo: nil, mensagem: "Máximo de 5 anexos por atividade")) {
            _ = try await api(t).enviarAnexo(atividadeId: "a1", arquivo: ArquivoUpload(nome: "a.jpg", tipo: "image/jpeg", dados: Data()), titulo: "a") { _ in }
        }
    }

    @Test func `pdf exige bytes de PDF e manda sem formato`() async throws {
        let t = TransporteFalso()
        t.respostas = [Resposta(status: 200, corpo: Data("%PDF-1.4 xxx".utf8)), Resposta(status: 200, corpo: Data("{}".utf8)),
                       Resposta(status: 402, corpo: Data(#"{"error":"As exportações não estão incluídas no seu plano atual.","code":"PLAN_REQUIRED"}"#.utf8))]
        let d = try await api(t).pdfDoRelatorio("sessao", corpo: ["session_id": "d1", "formato": "html"])
        #expect(d.count == 12)
        let corpo = try Json.ler(try #require(t.pedidos[0].corpo))
        #expect(corpo["formato"] == nil)
        #expect(corpo["session_id"]?.texto == "d1")
        await #expect(throws: ErroApi.self) { _ = try await api(t).pdfDoRelatorio("sessao", corpo: [:]) }
        do {
            _ = try await api(t).pdfDoRelatorio("sessao", corpo: [:])
            Issue.record("esperava erro")
        } catch {
            #expect(mensagemErroTreino(error) == MSG_NAO_EXPORTA)
        }
    }

    @Test func `fotos pede formato fotos; tipo do dia e distancia`() async throws {
        let t = TransporteFalso()
        t.respostas = [Resposta(status: 200, corpo: Data(#"{"fotos":[{"id":"f1","date":"2026-10-21","dia":"Quarta-feira","dd":"21/10","titulo":"Foto","thumb":"data:image/jpeg;base64,AQID"}],"total":1,"semana":false,"limite":24,"padrao":{"ids":["f1"],"layout":"medio","proporcao":"4:3"}}"#.utf8))]
        let l = try await api(t).fotosDoRelatorio("sessao", corpo: ["session_id": "d1"])
        #expect(l.fotos.first?.dia == "Quarta-feira")
        #expect(try Json.ler(try #require(t.pedidos[0].corpo))["formato"]?.texto == "fotos")
        try await api(t).mudarTipo("d1", tipo: .treino, adversario: "Rival")
        let tipo = try Json.ler(try #require(t.pedidos[1].corpo))
        #expect(tipo["session_type"]?.texto == "training")
        #expect(tipo["opponent_name"] == .nulo)
        try await api(t).mudarDistancia("d1", km: 5.2)
        #expect(try Json.ler(try #require(t.pedidos[2].corpo))["avg_distance_km"] == .numero(5.2))
        #expect(t.pedidos[2].metodo == "PUT")
        #expect(t.pedidos[2].url.absoluteString == "https://x.test/api/sessions/d1/distance")
    }
}

// MARK: Fotos do relatório

@Suite struct FotosRelatorioTests {
    func lista(semana: Bool) -> ListaFotosRelatorio {
        ListaFotosRelatorio(fotos: [
            FotoRelatorio(id: "a", data: "2026-10-22", dia: "Quinta-feira", dd: "22/10", titulo: "A"),
            FotoRelatorio(id: "b", data: "2026-10-21", dia: "Quarta-feira", dd: "21/10", titulo: "B"),
            FotoRelatorio(id: "c", data: "2026-10-22", dia: "Quinta-feira", dd: "22/10", titulo: "C"),
        ], total: 3, semana: semana, limite: 2, padrao: .init(ids: ["a", "x"], layout: "grande", proporcao: "1:1"))
    }

    @Test func `padrao do servidor e preferencias lembradas`() {
        let e = EscolhaFotos(lista: lista(semana: false))
        #expect(e.layout == "grande")
        #expect(e.proporcao == "1:1")
        #expect(e.marcada("a") && !e.marcada("b"))
        #expect(e.tamanho == 100)
        #expect(e.posicao == "fim")
        let p = EscolhaFotos(lista: lista(semana: false), preferencias: PreferenciasFotos(layout: "mosaico", proporcao: "zzz", posicao: "blocos", tamanho: 30))
        #expect(p.layout == "mosaico")
        #expect(p.proporcao == "1:1")
        #expect(p.posicao == "blocos")
        #expect(p.tamanho == 50)
        #expect(p.rotuloPrevia == "Ficha")
    }

    @Test func `agrupa por dia so na semana e move dentro do dia`() {
        var e = EscolhaFotos(lista: lista(semana: true))
        #expect(e.grupos.map(\.rotulo) == ["Quarta-feira · 21/10", "Quinta-feira · 22/10"])
        #expect(e.ordemExibida == ["b", "a", "c"])
        #expect(!e.podeMover("b", 1)) // não pula para outro dia
        e.mover("a", 1)
        #expect(e.ordemExibida == ["b", "c", "a"])
        e.agrupar = false
        #expect(e.grupos.count == 1)
        #expect(e.podeMover("b", 1))
        let ficha = EscolhaFotos(lista: lista(semana: false))
        #expect(ficha.grupos.count == 1)
    }

    @Test func `limite de selecao e legendas`() {
        var e = EscolhaFotos(lista: lista(semana: false))
        #expect(e.alternar("b") == nil)
        #expect(e.alternar("c") == "No máximo 2 fotos por relatório.")
        #expect(e.quantasSelecionadas == 2)
        e.nenhuma()
        #expect(e.selecionarTodas() == "Selecionadas as primeiras 2 (máximo por relatório).")
        #expect(e.quantasSelecionadas == 2)
        e.editarLegenda("a", "A")
        #expect(!e.legendaEditada("a"))
        e.editarLegenda("a", String(repeating: "x", count: 200))
        #expect(e.legenda("a").count == MAX_LEGENDA_FOTO)
        e.restaurarLegenda("a")
        #expect(e.legenda("a") == "A")
    }

    @Test func `configuracao igual ao modal do web`() {
        var e = EscolhaFotos(lista: lista(semana: false))
        e.alternar("b")
        e.editarLegenda("b", "Rondo")
        e.mudarTamanho(74)
        e.posicao = "blocos"
        let c = e.configuracao
        #expect(c["ids"] == .lista(["a", "b"]))
        #expect(c["legendasCustom"] == .objeto(["b": "Rondo"]))
        #expect(c["tamanho"] == .numero(70))
        #expect(c["posicao"]?.texto == "blocos")
        #expect(c["layout"]?.texto == "grande")
        let semana = EscolhaFotos(lista: lista(semana: true)).configuracao
        #expect(semana["posicao"] == nil)
        let base: [String: Json] = ["session_id": "d1"]
        #expect(corpoComFotos(base, e, modo: .automatico) == base)
        #expect(corpoComFotos(base, e, modo: .semFotos)["fotos"] == ["ids": .lista([])])
        var nenhuma = e
        nenhuma.nenhuma()
        #expect(corpoComFotos(base, nenhuma, modo: .escolhidas)["fotos"] == ["ids": .lista([])])
        #expect(corpoComFotos(base, e, modo: .escolhidas)["fotos"] == c)
    }

    @Test func `html para o WebView e miniatura`() {
        #expect(htmlParaWebView("<html><head><style></style>").hasPrefix("<html><head><meta name=\"viewport\" content=\"width=820\">"))
        #expect(htmlParaWebView("<p>x</p>").hasPrefix("<meta name=\"viewport\""))
        #expect(bytesDaMiniatura("data:image/jpeg;base64,AQID") == Data([1, 2, 3]))
        #expect(bytesDaMiniatura("https://x/y.jpg") == nil)
    }
}

// MARK: recusar convite (ControleSessao)

@MainActor
@Suite struct RecusarConviteTests {
    @Test func `recusar o unico convite com um clube so entra direto`() async throws {
        let api = ApiFalsa()
        let comConvite = me([conta("w1", "Demo FC", clubes: [clube("c1", "Demo FC")])], convites: [Convite(token: "ab")])
        let semConvite = me([conta("w1", "Demo FC", clubes: [clube("c1", "Demo FC")])])
        api.respostaRecusar = .success(semConvite)
        let c = ControleSessao(api: api, cofre: CofreSessaoMemoria(), relogio: { 5 })
        c.entrou(RespostaLogin(token: "tpa_1", me: comConvite))
        guard case .ondeEntrar = c.estado else { Issue.record("esperava ondeEntrar"); return }
        try await c.recusarConvite("ab")
        #expect(api.chamadas == ["recusar:ab"])
        guard case .noClube(let s, _) = c.estado else { Issue.record("esperava noClube"); return }
        #expect(s.me.convites.isEmpty)
    }

    @Test func `erro ao recusar sobe e 401 sai da conta`() async {
        let api = ApiFalsa()
        api.respostaRecusar = .failure(erro(403, "CONVITE_OUTRO_EMAIL"))
        let c = ControleSessao(api: api, cofre: CofreSessaoMemoria())
        c.entrou(RespostaLogin(token: "tpa_1", me: me([], convites: [Convite(token: "ab")])))
        await #expect(throws: ErroApi.self) { try await c.recusarConvite("ab") }
        api.respostaRecusar = .failure(erro(401, nil))
        try? await c.recusarConvite("ab")
        #expect(c.estado == .entrar)
    }
}

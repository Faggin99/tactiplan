import SwiftUI
import TactiPlanKit

// Estatísticas (T3), como o TrainingStatsPage do web, em coluna: Treino | Jogos, filtros de período
// (1 microciclo, 4 microciclos, semestre, ano e personalizado), cards, distribuição por pilar em
// barras horizontais, conteúdos/submomentos, distância ideal e top atividades; nos jogos os 4 cards
// (Pontuação com anel, Momento, Gols, Jogo a jogo), rankings e a minutagem completa ordenável.
// Mesmas rotas /api/stats do web. Exportar = PDF do servidor pela folha de compartilhar.

@MainActor
final class EstatisticasModelo: ObservableObject {
    enum Estado: Equatable { case carregando, pronto, erro(String) }

    @Published var filtro: FiltroPeriodo = .umMicro
    @Published var referencia: String
    @Published var inicio: String
    @Published var fim: String
    @Published private(set) var treino: StatsTreino?
    @Published private(set) var jogos: StatsJogos?
    @Published private(set) var estadoTreino: Estado = .carregando
    @Published private(set) var estadoJogos: Estado = .carregando
    @Published var modo: ModoPilar = .sessoes
    @Published var pilarSel: String?
    @Published var conteudoSel: String?
    /// Filtro de campeonato (só Jogos): nil = todos, CAMPEONATO_SEM = amistosos.
    @Published var campeonato: String?
    @Published private(set) var campeonatos: [CampeonatoCadastro] = []
    /// Filtro de jogo (depois do campeonato): nil = todos; a lista vem dos jogos do período/campeonato.
    @Published var jogo: String?
    @Published private(set) var listaJogos: [JogoDoPeriodo] = []

    let api: ApiEstatisticas
    let clubeId: String
    let aoSessaoAcabar: (Error) -> Bool

    init(api: ApiEstatisticas, clubeId: String, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.api = api
        self.clubeId = clubeId
        self.aoSessaoAcabar = aoSessaoAcabar
        let hoje = hojeBrasilia()
        referencia = hoje
        let p = periodoDoFiltro(.umMicro, referencia: hoje)!
        inicio = p.inicio
        fim = p.fim
    }

    var intervalo: Intervalo { Intervalo(inicio: inicio, fim: fim) }

    func escolher(_ f: FiltroPeriodo) {
        filtro = f
        if let p = periodoDoFiltro(f, referencia: f.porSemana ? referencia : hojeBrasilia()) {
            inicio = p.inicio; fim = p.fim
        }
    }

    /// Setas da semana (±7 dias).
    func andar(_ semanas: Int) {
        let s = SemanaISO(data: inicio).somando(semanas: semanas)
        referencia = s.segunda
        if let p = periodoDoFiltro(filtro, referencia: s.segunda) { inicio = p.inicio; fim = p.fim }
    }

    func mudarInicio(_ d: String) {
        inicio = d
        if let f = fimAoMudarInicio(filtro, inicio: d) { fim = f }
        if fim < inicio { fim = inicio }
    }

    func carregarCampeonatos() async {
        campeonatos = (try? await api.campeonatos(clubeId: clubeId)) ?? []
    }

    func carregar(jogos ehJogos: Bool) async {
        let i = intervalo
        if ehJogos {
            if jogos == nil { estadoJogos = .carregando }
            let camp = campeonato
            do {
                let todos = try await api.jogos(clubeId: clubeId, i, campeonato: camp)
                guard i == intervalo, camp == campeonato else { return }
                listaJogos = todos.historico
                let sel = jogo.flatMap { id in todos.historico.contains { $0.id == id } ? id : nil }
                if sel != jogo { jogo = sel }
                var j = todos
                if let sel { j = try await api.jogos(clubeId: clubeId, i, campeonato: camp, jogo: sel) }
                guard i == intervalo, camp == campeonato, sel == jogo else { return }
                jogos = j
                estadoJogos = .pronto
            } catch is CancellationError { return } catch {
                if aoSessaoAcabar(error) { return }
                estadoJogos = .erro(mensagemDeErro(error))
            }
        } else {
            if treino == nil { estadoTreino = .carregando }
            do {
                let t = try await api.treino(clubeId: clubeId, i)
                guard i == intervalo else { return }
                treino = t
                estadoTreino = .pronto
            } catch is CancellationError { return } catch {
                if aoSessaoAcabar(error) { return }
                estadoTreino = .erro(mensagemDeErro(error))
            }
        }
    }
}

struct EstatisticasTela: View {
    let sessao: Sessao
    let contexto: ContextoClube
    @StateObject private var modelo: EstatisticasModelo
    @StateObject private var exportar: ExportadorRelatorio
    @Environment(\.tema) private var tema
    @State var aba: Int
    @State var verMinutagem = false

    init(sessao: Sessao, contexto: ContextoClube, api: ApiEstatisticas, treino: ServicoTreino, jogos: Bool,
         aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessao = sessao
        self.contexto = contexto
        _aba = State(initialValue: jogos ? 1 : 0)
        _modelo = StateObject(wrappedValue: EstatisticasModelo(api: api, clubeId: contexto.clube?.id ?? "", aoSessaoAcabar: aoSessaoAcabar))
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: treino, aoSessaoAcabar: aoSessaoAcabar))
    }

    private var podeExportar: Bool { !(contexto.conta.somenteLeitura ?? false) }
    private var chave: String { "\(aba)|\(modelo.inicio)|\(modelo.fim)|\(modelo.campeonato ?? "")|\(modelo.jogo ?? "")" }

    var body: some View {
        TelaGrande("Estatísticas", empilhada: true, aoAtualizar: { await modelo.carregar(jogos: aba == 1) }) {
            Picker("Estatísticas de", selection: $aba) {
                Text("Treino").tag(0)
                Text("Jogos").tag(1)
            }
            .pickerStyle(.segmented)
            FiltrosPeriodo(modelo: modelo)
            if aba == 1 {
                filtro("Campeonato", opcoesCampeonato(modelo.campeonatos), $modelo.campeonato)
                if !modelo.listaJogos.isEmpty { filtro("Jogo", opcoesJogo(modelo.listaJogos), $modelo.jogo) }
            }
            if aba == 0 { treino } else { jogos }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if podeExportar && temDadosParaExportar {
                    Button { exportarPdf() } label: {
                        if exportar.ocupado { ProgressView() } else { Image(systemName: "square.and.arrow.up") }
                    }
                    .accessibilityLabel(aba == 1 ? "Exportar o desempenho dos jogos em PDF" : "Exportar as estatísticas de treino em PDF")
                    .disabled(exportar.ocupado)
                }
            }
        }
        .task(id: chave) { await modelo.carregar(jogos: aba == 1) }
        .task { await modelo.carregarCampeonatos() }
        .sheet(isPresented: $verMinutagem) {
            if let j = modelo.jogos {
                MinutagemCompletaTela(stats: j).environment(\.tema, tema)
            }
        }
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }

    private var temDadosParaExportar: Bool {
        aba == 1 ? (modelo.jogos?.jogos ?? 0) > 0 : (modelo.treino?.temDados ?? false)
    }

    private func exportarPdf() {
        guard let clube = contexto.clube else { return }
        let ehJogos = aba == 1
        // um jogo escolhido: o relatório daquele jogo (o mesmo da tela do jogo)
        if ehJogos, let id = modelo.jogo, let j = modelo.listaJogos.first(where: { $0.id == id }) {
            exportar.iniciar(tipo: "jogo", corpo: corpoRelatorioJogo(id),
                             nome: nomePdfRelatorioJogo(adversario: j.adversario, data: String((j.data ?? "").prefix(10))),
                             usuarioId: sessao.me.usuario.id)
            return
        }
        exportar.iniciar(tipo: ehJogos ? "jogos" : "treino",
                         corpo: corpoPdfEstatisticas(clubeId: clube.id, modelo.intervalo, filtro: modelo.filtro,
                                                     campeonato: ehJogos ? modelo.campeonato : nil),
                         nome: nomePdfEstatisticas(jogos: ehJogos, clube: clube.nome, filtro: modelo.filtro),
                         usuarioId: sessao.me.usuario.id)
    }

    // MARK: filtro de campeonato (Jogos)

    private func filtro(_ rotulo: String, _ opcoes: [OpcaoCampeonato], _ valor: Binding<String?>) -> some View {
        let c = tema.cores
        let atual = opcoes.first { $0.valor == valor.wrappedValue }?.rotulo ?? opcoes.first?.rotulo ?? ""
        return Menu {
            ForEach(opcoes) { o in
                Button { valor.wrappedValue = o.valor } label: {
                    if o.valor == valor.wrappedValue { Label(o.rotulo, systemImage: "checkmark") } else { Text(o.rotulo) }
                }
            }
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(rotulo).tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
                    Text(atual).tipo(Tipos.corpo15).foregroundColor(c.tinta.color).lineLimit(1)
                }
                Spacer()
                Image(systemName: "chevron.down").foregroundColor(c.tinta2.color)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12).fill(c.superficie.color))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(c.borda.color, lineWidth: 1))
        }
        .accessibilityLabel("\(rotulo): \(atual)")
    }

    // MARK: treino

    @ViewBuilder
    private var treino: some View {
        switch modelo.estadoTreino {
        case .carregando:
            ForEach(0..<3, id: \.self) { _ in EsqueletoLinha() }
        case .erro(let msg):
            Cartao { EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível carregar", texto: msg,
                                 acao: ("Tentar de novo", { Task { await modelo.carregar(jogos: false) } })) }
        case .pronto:
            if let s = modelo.treino {
                if s.vazio {
                    Cartao { EstadoVazio(icone: "chart.bar", titulo: TITULO_SEM_TREINO_STATS, texto: TEXTO_SEM_TREINO_STATS) }
                    if s.distancia.diasComDado > 0 { CartaoDistancia(d: s.distancia) }
                } else {
                    CardsTreino(s: s)
                    DistribuicaoPilares(s: s, modo: $modelo.modo, pilarSel: $modelo.pilarSel, conteudoSel: $modelo.conteudoSel)
                    if s.distancia.diasComDado > 0 { CartaoDistancia(d: s.distancia) }
                    TopAtividades(s: s, modo: modelo.modo)
                }
            }
        }
    }

    // MARK: jogos

    @ViewBuilder
    private var jogos: some View {
        switch modelo.estadoJogos {
        case .carregando:
            ForEach(0..<3, id: \.self) { _ in EsqueletoLinha() }
        case .erro(let msg):
            Cartao { EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível carregar", texto: msg,
                                 acao: ("Tentar de novo", { Task { await modelo.carregar(jogos: true) } })) }
        case .pronto:
            if let j = modelo.jogos {
                if j.jogos == 0 {
                    Cartao { EstadoVazio(icone: "trophy", titulo: TITULO_SEM_JOGO_STATS, texto: TEXTO_SEM_JOGO_STATS) }
                } else {
                    CardsJogosVista(s: j)
                    RankingJogadores(titulo: "Artilheiros", icone: "soccerball", cor: "#22c55e", itens: j.artilheiros,
                                     valor: { $0.gols }, texto: { contagem($0.gols, "gol", "gols") }, vazio: "Sem gols no período")
                    RankingJogadores(titulo: "Assistências", icone: "hand.point.right", cor: "#3b82f6", itens: j.assistentes,
                                     valor: { $0.assistencias }, texto: { $0.assistencias == 1 ? "1 assist." : "\($0.assistencias) assists." },
                                     vazio: "Sem assistências no período")
                    RankingJogadores(titulo: "Minutagem", icone: "timer", cor: "#a855f7", itens: j.minutagem,
                                     valor: { $0.minutos }, texto: textoMinutagem,
                                     vazio: "Registre escalações e substituições pra calcular minutagem",
                                     verTodas: j.jogadores.isEmpty ? nil : { verMinutagem = true })
                    if !j.banco.isEmpty {
                        RankingJogadores(titulo: "Mais acionados do banco", icone: "arrow.up.arrow.down", cor: "#0ea5e9", itens: j.banco,
                                         valor: { $0.entradas }, texto: { contagem($0.entradas, "entrada", "entradas") }, vazio: "")
                    }
                }
            }
        }
    }
}

// MARK: filtros

struct FiltrosPeriodo: View {
    @ObservedObject var modelo: EstatisticasModelo
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(FiltroPeriodo.allCases, id: \.self) { f in
                        let sel = modelo.filtro == f
                        Button { modelo.escolher(f) } label: {
                            Text(f.rotulo)
                                .font(Tipos.corpo13.comPeso(.seminegrito).font)
                                .foregroundColor(sel ? c.sobreAcao.color : c.tinta.color)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 36)
                                .background(Capsule().fill(sel ? c.acao.color : c.superficie.color))
                                .overlay(Capsule().stroke(sel ? Color.clear : c.borda.color, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(sel ? .isSelected : [])
                    }
                }
                .padding(.vertical, 2)
            }
            if modelo.filtro.porSemana {
                HStack(spacing: 0) {
                    Button { modelo.andar(-1) } label: { Image(systemName: "chevron.left").frame(width: ALVO_TOQUE, height: ALVO_TOQUE) }
                        .accessibilityLabel("Semana anterior")
                    Text("\(modelo.filtro == .umMicro ? "Semana" : "Primeira semana") \(SemanaISO(data: modelo.inicio).numero) · \(rotuloIntervalo(modelo.intervalo))")
                        .tipo(Tipos.corpo13.comPeso(.seminegrito))
                        .foregroundColor(c.tinta.color)
                        .frame(maxWidth: .infinity)
                    Button { modelo.andar(1) } label: { Image(systemName: "chevron.right").frame(width: ALVO_TOQUE, height: ALVO_TOQUE) }
                        .accessibilityLabel("Próxima semana")
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(c.acaoTinta.color)
                .background(Capsule().fill(c.superficie.color))
                .overlay(Capsule().stroke(c.borda.color, lineWidth: 1))
            } else {
                Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                    DatePicker("Data inicial", selection: Binding(get: { dataDoTexto(modelo.inicio) ?? Date() },
                                                                 set: { modelo.mudarInicio(textoDaData($0)) }),
                               displayedComponents: .date)
                        .frame(minHeight: 48)
                    Divisoria()
                    if modelo.filtro == .personalizado {
                        DatePicker("Até", selection: Binding(get: { dataDoTexto(modelo.fim) ?? Date() },
                                                             set: { modelo.fim = max(textoDaData($0), modelo.inicio) }),
                                   in: (dataDoTexto(modelo.inicio) ?? Date())..., displayedComponents: .date)
                            .frame(minHeight: 48)
                    } else {
                        LinhaInfo(rotulo: "Até", valor: dataCurtaBR(modelo.fim) ?? modelo.fim)
                    }
                }
            }
        }
    }
}

// MARK: treino — cards

struct CardsTreino: View {
    let s: StatsTreino
    @Environment(\.tema) private var tema

    var body: some View {
        let mais = maisUsadoPorPilar(s)
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            CardKpi(icone: "figure.run", cor: "#3b82f6", rotulo: "Atividades", valor: "\(s.atividades)", sub: nil)
            CardKpi(icone: "clock", cor: "#a855f7", rotulo: "Tempo total", valor: formatarMinutos(s.minutos),
                    sub: s.sessoes > 0 ? "média \(s.minutos / max(1, s.sessoes)) min/sessão" : nil)
            CardKpi(icone: "calendar", cor: "#10b981", rotulo: "Sessões", valor: "\(s.sessoes)", sub: nil)
            if let m = mais.first {
                CardKpi(icone: "star", cor: "#f59e0b", rotulo: "Mais usado · \(m.pilar.rotulo)", valor: m.conteudo.nome,
                        sub: "\(contagem(m.conteudo.quantidade, "atividade", "atividades")) · \(formatarMinutos(m.conteudo.minutos))")
            } else {
                CardKpi(icone: "star", cor: "#f59e0b", rotulo: "Conteúdo mais usado", valor: "—", sub: nil)
            }
        }
        if mais.count > 1 {
            Cartao {
                Text("Conteúdo mais usado por pilar").tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(tema.cores.tinta2.color)
                ForEach(mais, id: \.pilar.id) { m in
                    HStack {
                        Circle().fill(corHex(m.pilar.cor)).frame(width: 8, height: 8)
                        Text(m.pilar.rotulo).tipo(Tipos.corpo13).foregroundColor(tema.cores.tinta2.color).frame(width: 64, alignment: .leading)
                        Text(m.conteudo.nome).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(tema.cores.tinta.color).lineLimit(1)
                        Spacer(minLength: 0)
                        Text("\(m.conteudo.quantidade)×").tipo(Tipos.corpo13).foregroundColor(tema.cores.tinta2.color)
                    }
                    .padding(.top, 8)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

struct CardKpi: View {
    let icone: String
    let cor: String
    let rotulo: String
    let valor: String
    let sub: String?
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        Cartao {
            HStack(spacing: 6) {
                Image(systemName: icone).font(.system(size: 13, weight: .semibold)).foregroundColor(corHex(cor)).accessibilityHidden(true)
                Text(rotulo).tipo(Tipos.legenda11).foregroundColor(c.tinta2.color).lineLimit(1)
            }
            Text(valor).font(Tipos.titulo20.font).foregroundColor(c.tinta.color).lineLimit(2).minimumScaleFactor(0.7)
                .padding(.top, 6)
            if let sub { Text(sub).tipo(Tipos.legenda11).foregroundColor(c.tinta2.color).lineLimit(2).padding(.top, 2) }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: treino — pilares

/// Barra horizontal com rótulo e valor (no celular tudo vira barra: nada de pizza pequena).
struct BarraValor: View {
    let rotulo: String
    let valor: String
    let fracao: Double
    let cor: Color
    var selecionada = false
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(rotulo).font(Tipos.corpo13.comPeso(selecionada ? .seminegrito : .medio).font).foregroundColor(c.tinta.color).lineLimit(1)
                Spacer(minLength: 8)
                Text(valor).tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.tinta2.color)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(c.skeleton.color)
                    Capsule().fill(cor).frame(width: max(4, g.size.width * CGFloat(min(1, max(0, fracao)))))
                }
            }
            .frame(height: 8)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

struct DistribuicaoPilares: View {
    let s: StatsTreino
    @Binding var modo: ModoPilar
    @Binding var pilarSel: String?
    @Binding var conteudoSel: String?
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        let fatias = distribuicaoPilares(s, modo: modo)
        let ativo = pilarSel.flatMap { p in fatias.first { $0.pilar.id == p } } ?? fatias.first
        Cartao {
            Text("Distribuição por pilar").font(Tipos.cabecalho17.font).foregroundColor(c.tinta.color)
            Picker("Modo", selection: $modo) {
                ForEach(ModoPilar.allCases, id: \.self) { m in Text(m.rotulo).tag(m) }
            }
            .pickerStyle(.segmented)
            .padding(.top, 8)
            Text(modo.descricao).tipo(Tipos.legenda11).foregroundColor(c.tinta2.color).padding(.top, 6)
                .fixedSize(horizontal: false, vertical: true)
            if fatias.isEmpty {
                Text("Sem dados").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.top, 8)
            }
            ForEach(fatias) { f in
                Button { pilarSel = f.pilar.id; conteudoSel = nil } label: {
                    BarraValor(rotulo: f.pilar.rotulo, valor: "\(textoValorPilar(f.valor, modo: modo)) · \(f.pct)%",
                               fracao: Double(f.pct) / 100, cor: corHex(f.pilar.cor), selecionada: ativo?.pilar.id == f.pilar.id)
                }
                .buttonStyle(.plain)
                .accessibilityHint("Mostra os conteúdos de \(f.pilar.rotulo)")
            }
            .padding(.top, 6)
        }
        if let a = ativo {
            let lista = conteudosDoPilar(s, pilar: a.pilar.id, modo: modo)
            let maximo = Double(lista.first?.valor ?? 1)
            Cartao {
                Text(a.pilar.id == "tatico" ? "Momentos do jogo · Tático" : "Conteúdos · \(a.pilar.rotulo)")
                    .font(Tipos.cabecalho17.font).foregroundColor(c.tinta.color)
                if lista.isEmpty {
                    Text("Nenhum conteúdo registrado em \(a.pilar.rotulo) no período.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.top, 8)
                }
                ForEach(lista, id: \.item.id) { item in
                    Button {
                        if a.pilar.id == "tatico" { conteudoSel = conteudoSel == item.item.conteudoId ? nil : item.item.conteudoId }
                    } label: {
                        BarraValor(rotulo: item.item.nome, valor: textoValorPilar(item.valor, modo: modo),
                                   fracao: Double(item.valor) / max(1, maximo), cor: corHex(a.pilar.cor),
                                   selecionada: conteudoSel != nil && conteudoSel == item.item.conteudoId)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, 6)
            }
            if a.pilar.id == "tatico" && modo != .tempo {
                let subs = submomentosTaticos(s, conteudoId: conteudoSel)
                let total = Double(max(1, subs.reduce(0) { $0 + $1.quantidade }))
                Cartao {
                    HStack {
                        Text("Submomentos\(conteudoSel.flatMap { id in lista.first { $0.item.conteudoId == id }?.item.nome }.map { " · \($0)" } ?? "")")
                            .font(Tipos.cabecalho17.font).foregroundColor(c.tinta.color)
                        Spacer()
                        if conteudoSel != nil {
                            Button("Limpar filtro") { conteudoSel = nil }.font(Tipos.corpo13.comPeso(.seminegrito).font)
                        }
                    }
                    if subs.isEmpty {
                        Text("Nenhum submomento marcado nas atividades táticas.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.top, 8)
                    }
                    ForEach(subs) { sm in
                        BarraValor(rotulo: sm.nome, valor: "\(sm.quantidade) · \(Int((Double(sm.quantidade) / total * 100).rounded()))%",
                                   fracao: Double(sm.quantidade) / total, cor: corHex("#3b82f6"))
                    }
                    .padding(.top, 6)
                }
            }
        }
    }
}

struct CartaoDistancia: View {
    let d: DistanciaStats
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        let maximo = max(d.serie.compactMap(\.km).max() ?? 0, d.mediaKm ?? 0, 0.01)
        Cartao {
            HStack {
                Label("Distância ideal", systemImage: "mappin.and.ellipse").font(Tipos.cabecalho17.font).foregroundColor(c.tinta.color)
                Spacer()
                Text(d.granularidade == "week" ? "média por semana · km" : "por dia de treino · km").tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
            }
            HStack(spacing: 10) {
                tile("Média", "\(kmTexto(d.mediaKm)) km", contagem(d.diasComDado, "dia com registro", "dias com registro"))
                tile("Acumulado", "\(kmTexto(d.totalKm)) km", "por jogador no período")
                tile("Maior dia", "\(kmTexto(d.maiorKm)) km", nil)
            }
            .padding(.top, 8)
            ForEach(Array(d.serie.suffix(12).enumerated()), id: \.offset) { _, p in
                BarraValor(rotulo: d.granularidade == "week" ? "Semana de \(p.rotulo)" : p.rotulo, valor: "\(kmTexto(p.km)) km",
                           fracao: (p.km ?? 0) / maximo, cor: corHex("#f59e0b"))
            }
            .padding(.top, 4)
        }
    }

    private func tile(_ r: String, _ v: String, _ s: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(r).tipo(Tipos.legenda11).foregroundColor(tema.cores.tinta2.color)
            Text(v).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(tema.cores.tinta.color).lineLimit(1).minimumScaleFactor(0.7)
            if let s { Text(s).tipo(Tipos.legenda11).foregroundColor(tema.cores.tinta2.color).lineLimit(2) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct TopAtividades: View {
    let s: StatsTreino
    let modo: ModoPilar
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        Cartao {
            Text("Top atividades").font(Tipos.cabecalho17.font).foregroundColor(c.tinta.color)
            if modo == .sessoes {
                Text("Atividades não se contam por sessão. Troque pra Nº atividades ou Tempo pra ver o ranking.")
                    .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.top, 6).fixedSize(horizontal: false, vertical: true)
            } else if s.topAtividades.isEmpty {
                Text("Sem atividades no período.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.top, 6)
            } else {
                let lista = s.topAtividades.sorted { modo == .tempo ? $0.minutos > $1.minutos : $0.quantidade > $1.quantidade }
                ForEach(Array(lista.enumerated()), id: \.element.id) { i, t in
                    HStack(spacing: 8) {
                        Text("\(i + 1).").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).frame(width: 24, alignment: .leading)
                        Circle().fill(corHex(pilarStats(t.dimensao)?.cor ?? "#94a3b8")).frame(width: 8, height: 8)
                        VStack(alignment: .leading, spacing: 0) {
                            Text(t.titulo).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color).lineLimit(1)
                            Text(t.conteudo ?? pilarStats(t.dimensao)?.rotulo ?? "").tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
                        }
                        Spacer(minLength: 0)
                        Text(modo == .tempo ? formatarMinutos(t.minutos) : "\(t.quantidade)x").tipo(Tipos.corpo13.comPeso(.seminegrito))
                            .foregroundColor(c.tinta2.color)
                    }
                    .padding(.top, 8)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

// MARK: jogos — cards e rankings

struct CardsJogosVista: View {
    let s: StatsJogos
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        let k = cardsJogos(s)
        // Pontuação
        Cartao {
            Text("Pontuação").tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.tinta2.color)
            HStack(spacing: 16) {
                ZStack {
                    Circle().stroke(c.acao.color.opacity(0.16), lineWidth: 8)
                    Circle().trim(from: 0, to: CGFloat(k.pct) / 100)
                        .stroke(c.acao.color, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: 0) {
                        Text("\(k.pct)%").font(Tipos.cabecalho17.font).foregroundColor(c.tinta.color)
                        Text("APROV.").tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
                    }
                }
                .frame(width: 84, height: 84)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Aproveitamento de \(k.pct) por cento")
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(k.pts)/\(k.ptsMax)").font(Tipos.titulo24.font).foregroundColor(c.tinta.color)
                    Text(k.pontosTexto).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    GeometryReader { g in
                        let total = CGFloat(max(1, s.vitorias + s.empates + s.derrotas))
                        HStack(spacing: 2) {
                            Rectangle().fill(corHex("#22c55e")).frame(width: g.size.width * CGFloat(s.vitorias) / total)
                            Rectangle().fill(corHex("#f59e0b")).frame(width: g.size.width * CGFloat(s.empates) / total)
                            Rectangle().fill(corHex("#ef4444")).frame(width: g.size.width * CGFloat(s.derrotas) / total)
                        }
                        .clipShape(Capsule())
                    }
                    .frame(height: 8)
                    Text(k.vedText).tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
                }
            }
            .padding(.top, 8)
        }
        // Momento
        Cartao {
            Text("Momento").tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.tinta2.color)
            HStack(spacing: 6) {
                Text("Últimos jogos").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                Spacer(minLength: 0)
                if s.forma.isEmpty { Text("—").foregroundColor(c.tinta2.color) }
                ForEach(Array(s.forma.prefix(5).enumerated()), id: \.offset) { _, f in
                    Text(f.letra)
                        .font(Tipo.corpo(11, peso: .bold))
                        .foregroundColor(.white)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(corHex(f.resultado == "win" ? "#22c55e" : f.resultado == "loss" ? "#ef4444" : "#f59e0b")))
                        .accessibilityLabel("\(f.letra == "V" ? "Vitória" : f.letra == "D" ? "Derrota" : "Empate") \(f.golsFeitos) a \(f.golsSofridos) \(f.adversario.map { "contra \($0)" } ?? "")")
                }
            }
            .padding(.top, 8)
            LinhaInfo(rotulo: "Sequência", valor: k.sequencia)
            LinhaInfo(rotulo: "Maior vitória", valor: k.maiorVitoria)
            LinhaInfo(rotulo: "Maior derrota", valor: k.maiorDerrota)
        }
        // Gols
        Cartao {
            Text("Gols").tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.tinta2.color)
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(s.golsFeitos) × \(s.golsSofridos)").font(Tipos.titulo24.font).foregroundColor(c.tinta.color)
                    Text("feitos × sofridos").tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    Text(k.saldo).font(Tipos.titulo20.font)
                        .foregroundColor(s.saldo > 0 ? c.okTinta.color : s.saldo < 0 ? c.erroTinta.color : c.tinta.color)
                    Text("saldo").tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
                }
            }
            .padding(.top, 6)
            LinhaInfo(rotulo: "Média por jogo", valor: k.media)
            LinhaInfo(rotulo: "Jogos sem sofrer", valor: "\(s.semSofrer)")
        }
        // Jogo a jogo
        Cartao {
            Text("Jogo a jogo").tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.tinta2.color)
            if !s.futsal {
                LinhaInfo(rotulo: "Substituições", valor: s.substituicoes > 0 ? "\(s.substituicoes) · \(decimalWeb(s.substituicoesPorJogo))/jogo" : "0")
                if let m = s.minutoMedioTroca { LinhaInfo(rotulo: "Minuto médio da troca", valor: "\(m)'") }
            }
            LinhaInfo(rotulo: "Cartões", valor: "\(s.amarelos) amarelo(s) · \(s.vermelhos) vermelho(s)")
            if s.futsal {
                LinhaInfo(rotulo: "Faltas acumuladas", valor: "\(s.faltasAcumuladas)")
                LinhaInfo(rotulo: "6ª falta", valor: "\(s.sextaFalta)")
            }
            if s.assistencias > 0 { LinhaInfo(rotulo: "Assistências", valor: "\(s.assistencias)") }
        }
    }
}

struct RankingJogadores: View {
    let titulo: String
    let icone: String
    let cor: String
    let itens: [JogadorStats]
    let valor: (JogadorStats) -> Int
    let texto: (JogadorStats) -> String
    let vazio: String
    var verTodas: (() -> Void)?
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        let lista = Array(itens.prefix(8))
        let maximo = Double(max(1, lista.first.map(valor) ?? 1))
        Cartao {
            HStack {
                Label(titulo, systemImage: icone).font(Tipos.cabecalho17.font).foregroundColor(c.tinta.color)
                Spacer()
                if let verTodas {
                    Button("Ver todas", action: verTodas).font(Tipos.corpo13.comPeso(.seminegrito).font).foregroundColor(c.acaoTinta.color)
                        .frame(minHeight: ALVO_TOQUE)
                }
            }
            if lista.isEmpty {
                Text(vazio).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.top, 6)
            }
            ForEach(Array(lista.enumerated()), id: \.element.id) { i, j in
                HStack(spacing: 10) {
                    Text("\(i + 1)").tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.tinta2.color).frame(width: 18)
                    Text(j.camisa.map(String.init) ?? "—")
                        .font(Tipo.corpo(12, peso: .bold))
                        .foregroundColor(i == 0 ? .white : c.tinta.color)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(i == 0 ? corHex(cor) : c.skeleton.color))
                    BarraValor(rotulo: j.nome, valor: texto(j), fracao: Double(valor(j)) / maximo, cor: corHex(cor), selecionada: i == 0)
                }
                .padding(.top, 4)
            }
        }
    }
}

// MARK: minutagem completa

struct MinutagemCompletaTela: View {
    let stats: StatsJogos
    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State var ordem = OrdemMinutagem()

    var body: some View {
        let c = tema.cores
        let linhas = ordenarMinutagem(stats.jogadores, minutosPossiveis: stats.minutosPossiveis, ordem: ordem)
        let maximo = Double(max(1, linhas.map(\.jogador.minutos).max() ?? 1))
        NavigationStack {
            List {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(ChaveMinutagem.allCases, id: \.self) { k in
                                let ativa = ordem.chave == k
                                Button { ordem = alternarOrdem(ordem, k) } label: {
                                    HStack(spacing: 3) {
                                        Text(k.rotulo)
                                        if ativa { Image(systemName: ordem.crescente ? "chevron.up" : "chevron.down") }
                                    }
                                    .font(Tipos.corpo13.comPeso(.seminegrito).font)
                                    .foregroundColor(ativa ? c.sobreAcao.color : c.tinta.color)
                                    .padding(.horizontal, 12).frame(minHeight: 34)
                                    .background(Capsule().fill(ativa ? c.acao.color : c.superficie.color))
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Ordenar por \(k.rotulo)")
                            }
                        }
                    }
                } footer: {
                    Text("\(contagem(linhas.count, "atleta", "atletas")) · \(contagem(stats.jogos, "jogo", "jogos")) · \(stats.minutosPossiveis) min possíveis")
                }
                if linhas.isEmpty {
                    Text("Sem escalações registradas no período.").foregroundColor(c.tinta2.color)
                }
                Section {
                    ForEach(Array(linhas.enumerated()), id: \.element.id) { i, l in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("\(i + 1).").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).frame(width: 26, alignment: .leading)
                                Text(l.jogador.nome).font(Tipos.corpo15.comPeso(.seminegrito).font).lineLimit(1)
                                Spacer()
                                Text("\(l.jogador.minutos)'").font(Tipos.corpo15.comPeso(.seminegrito).font)
                            }
                            GeometryReader { g in
                                Capsule().fill(corHex("#a855f7")).frame(width: max(3, g.size.width * CGFloat(Double(l.jogador.minutos) / maximo)))
                            }
                            .frame(height: 5)
                            Text("Jogos \(l.jogador.jogos)/\(l.jogador.relacionado) · \(l.pct)% poss. · Tit. \(l.jogador.titular) · Entrou \(l.jogador.entradas)")
                                .tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .combine)
                    }
                } footer: { Text(TEXTO_RODAPE_MINUTAGEM) }
            }
            .navigationTitle("Minutagem completa")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Fechar") { fechar() } } }
        }
    }
}

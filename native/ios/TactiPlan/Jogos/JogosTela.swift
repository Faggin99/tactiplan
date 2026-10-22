import SwiftUI
import TactiPlanKit

// Aba Jogos (T2): herói do próximo jogo, V/E/D do período, próximos e resultados com placar e selo,
// filtro por período e por campeonato, "+" para criar um jogo (no servidor continua sendo um dia
// do tipo jogo, como no web) e o PDF "Exportar jogos" do período. Tocar abre o Jogo.
// Ao abrir (e ao voltar a rede) envia o que ficou guardado sem sinal na tela do Jogo.

@MainActor
final class JogosModelo: ObservableObject {
    enum Estado: Equatable { case carregando, pronto, erro(String) }

    @Published var periodo: PeriodoJogos = .tresMeses { didSet { Task { await carregar() } } }
    @Published var campeonatoId: String?
    @Published private(set) var jogos: [JogoDaLista] = []
    @Published private(set) var campeonatos: [Campeonato] = []
    @Published private(set) var estado: Estado = .carregando
    @Published private(set) var pendencias = 0
    @Published var aviso: String?
    @Published var alerta: String?

    let servico: ServicoJogo
    let fila: FilaJogos
    let aoSessaoAcabar: (Error) -> Bool

    init(servico: ServicoJogo, fila: FilaJogos, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.servico = servico
        self.fila = fila
        self.aoSessaoAcabar = aoSessaoAcabar
    }

    var hoje: String { hojeBrasilia() }
    var lista: ListaDeJogos { organizarJogos(jogos, hoje: hoje, campeonatoId: campeonatoId) }
    var intervalo: (inicio: String, fim: String) { periodo.intervalo(hoje: hoje) }

    func nomeCampeonato(_ id: String?) -> String? { campeonatos.first { $0.id == id }?.nome }

    func carregar(silencioso: Bool = false) async {
        await enviarPendencias()
        if jogos.isEmpty && !silencioso { estado = .carregando }
        let p = periodo
        let iv = intervalo
        do {
            async let c: [Campeonato] = (try? await servico.api.campeonatos(clubeId: servico.clubeId)) ?? []
            let l = try await servico.api.listarJogos(clubeId: servico.clubeId, inicio: iv.inicio, fim: iv.fim)
            guard p == periodo else { return }
            jogos = l
            campeonatos = await c
            estado = .pronto
        } catch is CancellationError {
            return
        } catch {
            if aoSessaoAcabar(error) { return }
            if jogos.isEmpty { estado = .erro(mensagemDeErro(error)) } else { aviso = mensagemDeErro(error) }
        }
    }

    func enviarPendencias() async {
        let sinc = SincronizadorJogos(servico: servico, fila: fila)
        if !fila.todas().isEmpty {
            let r = await sinc.enviarTodas()
            if r.values.contains(where: { if case .enviado(conflito: true) = $0 { return true }; return false }) { alerta = MSG_CONFLITO }
            for v in r.values { if case .sessaoEncerrada(let e) = v { _ = aoSessaoAcabar(e) } }
        }
        pendencias = fila.todas().count
    }
}

struct JogosTela: View {
    @EnvironmentObject private var app: AppEstado
    let sessao: Sessao
    let contexto: ContextoClube
    @StateObject private var modelo: JogosModelo
    @StateObject private var exportar: ExportadorRelatorio
    @StateObject private var rede = MonitorRede()
    @Environment(\.tema) private var tema
    @State private var novoJogo = false
    @State private var abrir: String?
    @State private var abrirAtivo = false

    init(sessao: Sessao, contexto: ContextoClube, servico: ServicoJogo, treino: ServicoTreino, fila: FilaJogos,
         aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessao = sessao
        self.contexto = contexto
        _modelo = StateObject(wrappedValue: JogosModelo(servico: servico, fila: fila, aoSessaoAcabar: aoSessaoAcabar))
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: treino, aoSessaoAcabar: aoSessaoAcabar))
    }

    private var podeCriar: Bool {
        contexto.clube != nil && contexto.podeEditar("games:edit") && contexto.podeEditar("training:edit")
    }
    private var podeExportar: Bool {
        contexto.clube != nil && contexto.pode("stats:view") && !(contexto.conta.somenteLeitura ?? false)
    }

    var body: some View {
        TelaGrande(ABA_JOGOS.rotulo, aoAtualizar: { await modelo.carregar() }) {
            HStack(spacing: 4) {
                if podeExportar {
                    Button { exportarJogos() } label: {
                        Image(systemName: "doc.richtext").font(.system(size: 18, weight: .semibold))
                            .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                    }
                    .accessibilityLabel("Exportar jogos do período em PDF")
                    .disabled(exportar.ocupado)
                }
                if podeCriar {
                    Button { novoJogo = true } label: {
                        Image(systemName: "plus").font(.system(size: 18, weight: .semibold))
                            .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                    }
                    .accessibilityLabel("Novo jogo")
                }
                LogoClube(personalizacao: contexto.clube?.personalizacao, tamanho: 36)
            }
        } conteudo: {
            FaixasDoTopo(contexto: contexto, sessao: sessao)
            if contexto.clube == nil {
                Cartao { EstadoVazio(icone: "sportscourt", titulo: "Nenhum clube ainda",
                                     texto: "Quando o clube for cadastrado, os jogos aparecem aqui.") }
            } else if !contexto.pode("games:view") {
                Cartao { EstadoVazio(icone: "lock", titulo: "Sem acesso aos jogos",
                                     texto: "Peça ao responsável pela equipe a permissão de ver jogos.") }
            } else {
                if modelo.pendencias > 0 {
                    FaixaTom(icone: "icloud.and.arrow.up",
                             texto: modelo.pendencias == 1 ? "1 jogo com alterações para enviar"
                                 : "\(modelo.pendencias) jogos com alterações para enviar",
                             tom: .aviso)
                }
                filtros
                conteudo
            }
        }
        .task { await modelo.carregar() }
        .onAppear { if modelo.estado == .pronto { Task { await modelo.carregar(silencioso: true) } } }
        .onChange(of: rede.online) { on in if on { Task { await modelo.carregar(silencioso: true) } } }
        .sheet(isPresented: $novoJogo) {
            NovoJogoFolha(servicoTreino: app.servicoTreino(sessao, contexto), clubeId: contexto.clube?.id ?? "",
                          online: rede.online, aoSessaoAcabar: modelo.aoSessaoAcabar) { id, msg in
                novoJogo = false
                modelo.aviso = msg
                abrir = id
                Task {
                    try? await Task.sleep(nanoseconds: 450_000_000)
                    abrirAtivo = true
                }
            }
            .environment(\.tema, tema)
        }
        .navigationDestination(isPresented: $abrirAtivo) {
            if let id = abrir { destino(id) }
        }
        .alert("Jogo alterado no servidor", isPresented: Binding(get: { modelo.alerta != nil }, set: { if !$0 { modelo.alerta = nil } })) {
            Button("Entendi", role: .cancel) {}
        } message: { Text(modelo.alerta ?? "") }
        .avisoTemporario($modelo.aviso)
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }

    private func destino(_ id: String) -> some View {
        JogoTela(sessaoId: id, sessao: sessao, contexto: contexto,
                 servico: app.servicoJogo(sessao, contexto), treino: app.servicoTreino(sessao, contexto),
                 fila: app.filaJogos(sessao.me.usuario.id),
                 aoSessaoAcabar: { [token = sessao.token] e in app.controle.tratarErro(e, token: token) })
    }

    private func exportarJogos() {
        guard let clube = contexto.clube else { return }
        let iv = modelo.intervalo
        // O PDF de desempenho é do período até hoje (os jogos por jogar não têm resultado).
        let fim = min(iv.fim, modelo.hoje)
        exportar.iniciar(tipo: "jogos", corpo: corpoRelatorioJogos(clubeId: clube.id, inicio: iv.inicio, fim: fim,
                                                                   rotulo: modelo.periodo.rotulo),
                         nome: nomePdfJogos(clube: clube.nome, rotulo: modelo.periodo.rotulo), usuarioId: sessao.me.usuario.id)
    }

    // MARK: filtros

    private var filtros: some View {
        let c = tema.cores
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(PeriodoJogos.allCases) { p in
                    let on = modelo.periodo == p
                    Button(p.rotulo) { modelo.periodo = p }
                        .font(Tipos.corpo13.comPeso(.seminegrito).font)
                        .padding(.horizontal, 14).frame(minHeight: 36)
                        .foregroundColor(on ? c.sobreAcao.color : c.tinta.color)
                        .background(Capsule().fill(on ? c.acao.color : c.superficie.color))
                        .overlay(Capsule().stroke(on ? Color.clear : c.borda.color, lineWidth: 1))
                        .accessibilityAddTraits(on ? .isSelected : [])
                }
                if !modelo.campeonatos.isEmpty {
                    Menu {
                        Button("Todos os campeonatos") { modelo.campeonatoId = nil }
                        ForEach(modelo.campeonatos) { cp in Button(cp.rotulo) { modelo.campeonatoId = cp.id } }
                    } label: {
                        HStack(spacing: 4) {
                            Text(modelo.nomeCampeonato(modelo.campeonatoId) ?? "Todos os campeonatos").lineLimit(1)
                            Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
                        }
                        .font(Tipos.corpo13.comPeso(.seminegrito).font)
                        .padding(.horizontal, 14).frame(minHeight: 36)
                        .foregroundColor(modelo.campeonatoId == nil ? c.tinta.color : c.sobreAcao.color)
                        .background(Capsule().fill(modelo.campeonatoId == nil ? c.superficie.color : c.acao.color))
                        .overlay(Capsule().stroke(c.borda.color, lineWidth: modelo.campeonatoId == nil ? 1 : 0))
                    }
                    .accessibilityLabel("Campeonato: \(modelo.nomeCampeonato(modelo.campeonatoId) ?? "todos")")
                }
            }
            .padding(.vertical, 2)
        }
    }

    // MARK: conteúdo

    @ViewBuilder
    private var conteudo: some View {
        switch modelo.estado {
        case .carregando where modelo.jogos.isEmpty:
            ForEach(0..<4, id: \.self) { _ in EsqueletoLinha() }
        case .erro(let msg):
            Cartao {
                EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível carregar os jogos", texto: msg,
                            acao: ("Tentar de novo", { Task { await modelo.carregar() } }))
            }
        default:
            let l = modelo.lista
            if l.proximo == nil && l.passados.isEmpty {
                Cartao {
                    EstadoVazio(icone: "trophy", titulo: "Nenhum jogo no período",
                                texto: podeCriar ? "Toque em + para marcar um jogo, ou escolha um período maior."
                                    : "Escolha um período maior para ver mais jogos.",
                                acao: podeCriar ? ("Novo jogo", { novoJogo = true }) : nil)
                }
            } else {
                if let p = l.proximo {
                    NavigationLink { destino(p.sessaoId) } label: { HeroiProximoJogo(jogo: p, hoje: modelo.hoje,
                                                                                    campeonato: modelo.nomeCampeonato(p.campeonatoId)) }
                        .buttonStyle(.plain)
                }
                kpis(l)
                if !l.proximos.isEmpty {
                    RotuloSecao("Próximos").padding(.horizontal, 4).padding(.top, 4)
                    Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                        ForEach(Array(l.proximos.enumerated()), id: \.element.id) { i, j in
                            if i > 0 { Divisoria() }
                            NavigationLink { destino(j.sessaoId) } label: { linhaProximo(j) }.buttonStyle(.plain)
                        }
                    }
                }
                RotuloSecao("Resultados").padding(.horizontal, 4).padding(.top, 4)
                if l.passados.isEmpty {
                    Cartao { Text("Nenhum jogo realizado no período.").tipo(Tipos.corpo15).foregroundColor(tema.cores.tinta2.color) }
                } else {
                    Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                        ForEach(Array(l.passados.enumerated()), id: \.element.id) { i, j in
                            if i > 0 { Divisoria() }
                            NavigationLink { destino(j.sessaoId) } label: { linhaResultado(j) }.buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func kpis(_ l: ListaDeJogos) -> some View {
        let c = tema.cores
        return HStack(spacing: 8) {
            kpi("Vitórias", l.vitorias, c.okTinta.color)
            kpi("Empates", l.empates, c.tinta.color)
            kpi("Derrotas", l.derrotas, c.erroTinta.color)
        }
    }

    private func kpi(_ rotulo: String, _ n: Int, _ cor: Color) -> some View {
        Cartao(preenchimento: EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12)) {
            Text(rotulo).tipo(Tipos.legenda11).foregroundColor(tema.cores.tinta2.color)
            Text("\(n)").font(Tipos.valor.comTamanho(24).font).foregroundColor(cor)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(rotulo): \(n)")
    }

    private func linhaResultado(_ j: JogoDaLista) -> some View {
        let c = tema.cores
        let r = resultadoDo(feitos: j.golsFeitos, sofridos: j.golsSofridos)
        let clube = contexto.clube?.nome ?? "Nós"
        return HStack(spacing: 12) {
            SeloResultado(resultado: r)
            VStack(alignment: .leading, spacing: 2) {
                Text(placarDaLinha(j, clube: clube)).font(Tipos.corpo15.comPeso(.seminegrito).font)
                    .foregroundColor(c.tinta.color).linhasAcessiveis(2)
                Text(detalheDaLinha(j, campeonato: modelo.nomeCampeonato(j.campeonatoId)))
                    .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).linhasAcessiveis(2)
            }
            Spacer(minLength: 0)
            Seta()
        }
        .padding(.vertical, 10)
        .frame(minHeight: 62)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(rotuloResultado(r)). \(placarDaLinha(j, clube: clube)). \(detalheDaLinha(j, campeonato: modelo.nomeCampeonato(j.campeonatoId)))")
        .accessibilityAddTraits(.isButton)
    }

    private func linhaProximo(_ j: JogoDaLista) -> some View {
        let c = tema.cores
        let sd = siglaEDia(j.data)
        return HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(sd.sigla).font(Tipos.legenda11.comPeso(.seminegrito).font)
                Text(sd.dia).font(Tipos.titulo20.font)
            }
            .foregroundColor(c.tinta.color)
            .frame(width: 48, height: 52)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(c.neutroFundo.color))
            VStack(alignment: .leading, spacing: 2) {
                Text("vs \((j.adversario ?? "").isEmpty ? "Adversário" : j.adversario!)")
                    .font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color).linhasAcessiveis(2)
                Text([emQuantosDias(j.data, hoje: modelo.hoje), detalheDaLinha(j, campeonato: modelo.nomeCampeonato(j.campeonatoId))]
                        .filter { !$0.isEmpty }.joined(separator: " · "))
                    .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).linhasAcessiveis(2)
            }
            Spacer(minLength: 0)
            Seta()
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}

/// Herói do próximo jogo: "Próximo · sábado, 24/10", "em 3 dias", "vs Rival FC", local/campeonato/rodada.
struct HeroiProximoJogo: View {
    let jogo: JogoDaLista
    let hoje: String
    let campeonato: String?

    var body: some View {
        var partes: [String] = []
        if let l = rotuloLocal(jogo.local) { partes.append(l) }
        if let c = campeonato, !c.isEmpty { partes.append(c) }
        if let r = jogo.rodada, !r.isEmpty { partes.append("Rodada \(r)") }
        partes.append("Escalação, eventos e convocação")
        return CartaoHeroi(rotulo: "Próximo · \(rotuloDiaMinusculo(jogo.data))", selo: emQuantosDias(jogo.data, hoje: hoje),
                           valor: "vs \((jogo.adversario ?? "").isEmpty ? "Adversário" : jogo.adversario!)",
                           frase: partes.joined(separator: " · "))
            .accessibilityHint("Abre o jogo")
    }
}

// MARK: novo jogo

/// Criar jogo = escolher o dia e o adversário: o dia vira "Jogo" (PUT /sessions/:id/type, como o
/// "Tipo de sessão" do web), criando a semana antes se preciso.
struct NovoJogoFolha: View {
    let servicoTreino: ServicoTreino
    let clubeId: String
    let online: Bool
    let aoSessaoAcabar: (Error) -> Bool
    let aoCriar: (String, String?) -> Void

    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State private var data = Date()
    @State private var adversario = ""
    @State private var ocupado = false
    @State private var erro: String?

    var body: some View {
        let c = tema.cores
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Cartao {
                        DatePicker("Dia do jogo", selection: $data, displayedComponents: .date)
                            .environment(\.locale, Locale(identifier: "pt_BR"))
                            .font(Tipos.corpo15.comPeso(.seminegrito).font)
                            .tint(c.acao.color)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        RotuloSecao("Adversário").padding(.horizontal, 4)
                        Campo(dica: "Nome do adversário", valor: $adversario, envio: .done)
                            .textInputAutocapitalization(.words)
                    }
                    Text("O jogo fica no dia escolhido da programação (o dia vira \"Jogo\"). Escalação, eventos e convocação ficam na tela do jogo.")
                        .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    if let erro { FaixaTom(icone: "exclamationmark.triangle", texto: erro, tom: .erro) }
                    Botao(texto: ocupado ? "Criando…" : "Criar jogo", habilitado: !ocupado) { criar() }
                }
                .padding(16)
            }
            .background(c.fundo.color.ignoresSafeArea())
            .navigationTitle("Novo jogo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func textoData(_ d: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/Sao_Paulo") ?? .current
        let k = cal.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", k.year ?? 0, k.month ?? 0, k.day ?? 0)
    }

    private func criar() {
        guard online else { erro = MSG_CRIAR_SEM_REDE; return }
        let dia = textoData(data)
        ocupado = true
        erro = nil
        Task {
            defer { ocupado = false }
            do {
                let semana = SemanaISO(data: dia)
                let real = try await servicoTreino.diaReal(diaVazio(dia), semana: semana, clubeId: clubeId)
                guard let id = real.id else { throw ErroApi(status: 0, codigo: nil, mensagem: ErroApi.MSG_FALHA) }
                if real.tipo == .jogo {
                    aoCriar(id, "Já havia um jogo nesse dia")
                    return
                }
                try await servicoTreino.api.mudarTipo(id, tipo: .jogo, adversario: adversario)
                vibrarSucesso()
                aoCriar(id, nil)
            } catch {
                if aoSessaoAcabar(error) { return }
                erro = semRede(error) ? MSG_CRIAR_SEM_REDE : mensagemErroJogo(error)
            }
        }
    }
}

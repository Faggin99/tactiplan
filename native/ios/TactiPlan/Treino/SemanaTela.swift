import SwiftUI
import TactiPlanKit

// Aba Semana (T1): a grade 7 × 6 do web vira lista de 7 dias. Pílulas da semana (‹ 19–25 out ›,
// "Hoje"), herói do dia de hoje (tempo, pilar predominante POR TEMPO, tema do mês), uma linha por
// dia (tipo, pilar, barra dos pilares, minutos, distância ideal, 📎) e o PDF da semana.
// Puxar para atualizar. A regra toda vem do Kit (Semana.swift).
//
// Categoria: o planejamento do web é POR CLUBE (microciclo sem categoria — 0 de 22 em produção
// têm categoria, e o ensure nem grava). Um seletor de categoria aqui esconderia a semana inteira,
// então ele NÃO entra enquanto o web não separar treino por categoria.

@MainActor
final class SemanaModelo: ObservableObject {
    enum Estado: Equatable { case carregando, pronto, erro(String) }

    @Published private(set) var semana: SemanaISO
    @Published private(set) var dias: [Dia] = []
    @Published private(set) var estado: Estado = .carregando
    @Published private(set) var tema: TemaDoMes?

    let servico: ServicoTreino
    let clubeId: String
    let aoSessaoAcabar: (Error) -> Bool
    private var cache: [String: Microciclo?] = [:]

    init(servico: ServicoTreino, clubeId: String, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.servico = servico
        self.clubeId = clubeId
        self.aoSessaoAcabar = aoSessaoAcabar
        semana = SemanaISO(data: hojeBrasilia())
        dias = diasDaSemana(nil, semana)
    }

    var hoje: String { hojeBrasilia() }
    var ehSemanaAtual: Bool { semana.contem(hoje) }

    func carregar(forcar: Bool = false) async {
        let s = semana
        if !forcar, let m = cache[s.identificador] {
            dias = diasDaSemana(m, s)
            estado = .pronto
            return
        }
        if dias.allSatisfy({ $0.id == nil }) || !forcar { estado = .carregando }
        do {
            let m = try await servico.api.microciclo(semana: s.identificador, clubeId: clubeId)
            guard s == semana else { return }
            cache[s.identificador] = .some(m)
            dias = diasDaSemana(m, s)
            estado = .pronto
        } catch is CancellationError {
            return
        } catch {
            if aoSessaoAcabar(error) { return }
            guard s == semana else { return }
            estado = .erro(mensagemDeErro(error))
        }
        // Tema do mês: melhor esforço (some se falhar).
        let mes = String(s.segunda.prefix(7))
        tema = try? await servico.api.temaDoMes(mes: mes, clubeId: clubeId)
    }

    func ir(_ n: Int) {
        semana = n == 0 ? SemanaISO(data: hoje) : semana.somando(semanas: n)
        dias = diasDaSemana(cache[semana.identificador] ?? nil, semana)
        Task { await carregar() }
    }

    /// Depois de salvar no Dia: esquece a semana em cache e recarrega.
    func invalidar() async {
        cache.removeValue(forKey: semana.identificador)
        await carregar(forcar: true)
    }

    func dia(_ data: String) -> Dia? { dias.first { $0.data == data } }
}

struct SemanaTela: View {
    @EnvironmentObject private var app: AppEstado
    let sessao: Sessao
    let contexto: ContextoClube
    @StateObject private var modelo: SemanaModelo
    @StateObject private var exportar: ExportadorRelatorio
    @Environment(\.tema) private var tema

    init(sessao: Sessao, contexto: ContextoClube, servico: ServicoTreino, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessao = sessao
        self.contexto = contexto
        _modelo = StateObject(wrappedValue: SemanaModelo(servico: servico, clubeId: contexto.clube?.id ?? "",
                                                         aoSessaoAcabar: aoSessaoAcabar))
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: servico, aoSessaoAcabar: aoSessaoAcabar))
    }

    var body: some View {
        TelaGrande(ABA_SEMANA.rotulo, aoAtualizar: { await modelo.carregar(forcar: true) }) {
            HStack(spacing: 4) {
                if contexto.clube != nil && contexto.pode("stats:view") {
                    NavigationLink {
                        EstatisticasTela(sessao: sessao, contexto: contexto, api: app.apiEstatisticas(sessao, contexto),
                                         treino: app.servicoTreino(sessao, contexto), jogos: false,
                                         aoSessaoAcabar: { [token = sessao.token] e in app.controle.tratarErro(e, token: token) })
                    } label: {
                        Image(systemName: "chart.bar.xaxis").font(.system(size: 18, weight: .semibold))
                            .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                    }
                    .accessibilityLabel("Estatísticas de treino")
                }
                if podeExportarSemana {
                    Button { exportarSemana() } label: {
                        Image(systemName: "doc.richtext").font(.system(size: 18, weight: .semibold))
                            .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                    }
                    .accessibilityLabel("Exportar a semana em PDF")
                    .disabled(exportar.ocupado)
                }
                LogoClube(personalizacao: contexto.clube?.personalizacao, tamanho: 36)
            }
        } conteudo: {
            FaixasDoTopo(contexto: contexto, sessao: sessao)
            if contexto.clube == nil {
                Cartao { EstadoVazio(icone: "sportscourt", titulo: "Nenhum clube ainda",
                                     texto: "Quando o clube for cadastrado, a semana de treinos aparece aqui.") }
            } else if !contexto.pode("training:view") {
                Cartao { EstadoVazio(icone: "lock", titulo: "Sem acesso aos treinos",
                                     texto: "Peça ao responsável pela equipe a permissão de ver treinos.") }
            } else {
                navegacao
                conteudo
            }
        }
        .task { await modelo.carregar() }
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }

    private var podeExportarSemana: Bool {
        contexto.clube != nil && contexto.pode("stats:view") && !(contexto.conta.somenteLeitura ?? false)
    }

    private func exportarSemana() {
        guard let clube = contexto.clube else { return }
        exportar.iniciar(tipo: "treino", corpo: corpoRelatorioSemana(modelo.semana, clubeId: clube.id),
                         nome: nomePdfDaSemana(modelo.semana, clube: clube.nome), usuarioId: sessao.me.usuario.id)
    }

    // ‹ 19–25 out ›  [Hoje]
    private var navegacao: some View {
        let c = tema.cores
        return HStack(spacing: 8) {
            HStack(spacing: 0) {
                Button { modelo.ir(-1) } label: {
                    Image(systemName: "chevron.left").frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                }
                .accessibilityLabel("Semana anterior")
                Text(rotuloPeriodo(modelo.semana))
                    .tipo(Tipos.corpo15.comPeso(.seminegrito))
                    .foregroundColor(c.tinta.color)
                    .frame(minWidth: 110)
                    .accessibilityLabel("Semana de \(rotuloPeriodo(modelo.semana))")
                Button { modelo.ir(1) } label: {
                    Image(systemName: "chevron.right").frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                }
                .accessibilityLabel("Próxima semana")
            }
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(c.acaoTinta.color)
            .background(Capsule().fill(c.superficie.color))
            .overlay(Capsule().stroke(c.borda.color, lineWidth: 1))
            if !modelo.ehSemanaAtual {
                Button("Hoje") { modelo.ir(0) }
                    .font(Tipos.corpo13.comPeso(.seminegrito).font)
                    .padding(.horizontal, 14).frame(minHeight: ALVO_TOQUE)
                    .foregroundColor(c.acaoTinta.color)
                    .background(Capsule().fill(c.acaoSuave.color))
            }
            Spacer(minLength: 0)
            if exportar.ocupado { ProgressView().accessibilityLabel("Gerando o PDF") }
        }
        .gesture(DragGesture(minimumDistance: 30).onEnded { g in
            if g.translation.width < -60 { modelo.ir(1) } else if g.translation.width > 60 { modelo.ir(-1) }
        })
    }

    @ViewBuilder
    private var conteudo: some View {
        switch modelo.estado {
        case .carregando where modelo.dias.allSatisfy({ $0.id == nil }):
            ForEach(0..<4, id: \.self) { _ in EsqueletoLinha() }
        case .erro(let msg):
            Cartao {
                EstadoVazio(icone: "exclamationmark.triangle", titulo: TITULO_ERRO_SEMANA, texto: msg,
                            acao: ("Tentar de novo", { Task { await modelo.carregar(forcar: true) } }))
            }
        default:
            if modelo.ehSemanaAtual, let d = modelo.dia(modelo.hoje) {
                NavigationLink { destino(d) } label: { HeroiDoDia(dia: d, tema: modelo.tema) }
                    .buttonStyle(.plain)
            }
            RotuloSecao("Dias").padding(.horizontal, 4).padding(.top, 4)
            Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                ForEach(Array(modelo.dias.enumerated()), id: \.element.data) { i, d in
                    if i > 0 { Divisoria() }
                    NavigationLink { destino(d) } label: {
                        LinhaDoDia(dia: d, hoje: d.data == modelo.hoje)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func destino(_ d: Dia) -> some View {
        DiaTela(data: d.data, modelo: modelo, sessao: sessao, contexto: contexto)
    }
}

/// Herói de hoje: "Hoje · quarta, 21/10", tipo, minutos, pilar e tema do mês.
struct HeroiDoDia: View {
    let dia: Dia
    let tema: TemaDoMes?

    var body: some View {
        let r = resumoDoDiaInteiro(dia)
        let frase = [fraseDoHeroi(r), seloPeriodos(dia).map { "\($0) · \(divisaoMinutos(dia) ?? "")" }, tema?.frase].compactMap { $0 }.joined(separator: "\n")
        CartaoHeroi(rotulo: "Hoje · \(rotuloDiaMinusculo(dia.data))", selo: r.tipo.rotulo,
                    valor: r.tipo == .treino ? (r.minutos > 0 ? "\(r.minutos) min" : "Sem atividades")
                        : tituloDaLinha(r),
                    frase: frase)
            .accessibilityHint("Abre o dia")
    }
}

/// Uma linha da lista de dias.
struct LinhaDoDia: View {
    let dia: Dia
    let hoje: Bool
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        let r = resumoDoDiaInteiro(dia)
        let sd = siglaEDia(dia.data)
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(sd.sigla).font(Tipos.legenda11.comPeso(.seminegrito).font)
                Text(sd.dia).font(Tipos.titulo20.font)
            }
            .foregroundColor(hoje ? c.sobreAcao.color : c.tinta.color)
            .frame(width: 48, height: 52)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(hoje ? c.acao.color : c.neutroFundo.color))
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if r.tipo == .jogo { Image(systemName: "trophy.fill").foregroundColor(c.avisoTinta.color) }
                    if r.tipo == .descanso { Image(systemName: "moon.fill").foregroundColor(c.tinta2.color) }
                    Text(tituloDaLinhaDoDia(dia))
                        .font(Tipos.corpo15.comPeso(.seminegrito).font)
                        .foregroundColor(c.tinta.color)
                        .linhasAcessiveis(2)
                    if let selo = seloPeriodos(dia) { Pastilha(texto: selo, tom: .neutro) }
                }
                if !r.minutosPorPilar.isEmpty { BarraPilares(r: r) }
                let det = detalheDaLinha(r)
                if !det.isEmpty || r.anexos > 0 {
                    HStack(spacing: 6) {
                        if !det.isEmpty { Text(det) }
                        if r.anexos > 0 {
                            Label("\(r.anexos)", systemImage: "paperclip")
                                .accessibilityLabel(contagem(r.anexos, "anexo", "anexos"))
                        }
                    }
                    .tipo(Tipos.corpo13)
                    .foregroundColor(c.tinta2.color)
                }
            }
            Spacer(minLength: 0)
            Seta()
        }
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(rotuloAcessivel(r))
        .accessibilityAddTraits(.isButton)
    }

    private func rotuloAcessivel(_ r: ResumoDia) -> String {
        var p = [rotuloDiaCurto(dia.data) + (hoje ? ", hoje" : ""), tituloDaLinhaDoDia(dia)]
        if let selo = seloPeriodos(dia) { p.append("\(selo): \(divisaoMinutos(dia) ?? "") minutos") }
        let d = detalheDaLinha(r)
        if !d.isEmpty { p.append(d) }
        if r.anexos > 0 { p.append(contagem(r.anexos, "anexo", "anexos")) }
        return p.joined(separator: ". ")
    }
}

/// Barra fina com a fatia de cada pilar (por minutos; sem minutos, partes iguais).
struct BarraPilares: View {
    let r: ResumoDia

    var body: some View {
        let total = r.minutosPorPilar.map(\.minutos).reduce(0, +)
        GeometryReader { g in
            HStack(spacing: 2) {
                ForEach(r.minutosPorPilar, id: \.pilar) { p in
                    let f = total > 0 ? Double(p.minutos) / Double(total) : 1 / Double(r.minutosPorPilar.count)
                    Capsule().fill(corDoPilar(p.pilar))
                        .frame(width: max(4, (g.size.width - CGFloat(r.minutosPorPilar.count - 1) * 2) * f))
                }
            }
        }
        .frame(height: 5)
        .frame(maxWidth: 180)
        .accessibilityHidden(true)
    }
}

/// Esqueleto de carregando (linha cinza).
struct EsqueletoLinha: View {
    @Environment(\.tema) private var tema
    var body: some View {
        RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCard), style: .continuous)
            .fill(tema.cores.skeleton.color)
            .frame(height: 72)
            .redacted(reason: .placeholder)
            .accessibilityLabel("Carregando")
    }
}

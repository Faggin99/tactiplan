import SwiftUI
import UIKit
import Combine
import TactiPlanKit

// Editor do quadro tático (T5), DEITADO (gira sozinho ao abrir). Desenho aprovado (tela 13):
// barra de cima (voltar, nome + "Futebol 11 · campo inteiro · quadro 2 de 3", desfazer, refazer,
// vídeo, Salvar), ferramentas numa coluna à esquerda, campo proporcional no meio, propriedades do
// item tocado à direita e a barra de play/quadros numa linha embaixo. Regras = web (Kit).

enum FerramentaQuadro: Equatable {
    case selecionar, borracha
    /// Desenho com o dedo: modo do web (arrow_straight, arrow_curved, free_draw, zone_rect, zone_circle, text).
    case desenho(id: String, modo: String)

    var modo: String? { if case .desenho(_, let m) = self { return m }; return nil }
    var id: String? { if case .desenho(let i, _) = self { return i }; return nil }
}

enum SecaoQuadro: String, Identifiable {
    case pecas, formacoes, setas, desenho, objetos, vista, plantel
    var id: String { rawValue }
    var titulo: String {
        switch self {
        case .pecas: return "Peças"
        case .formacoes: return "Formações"
        case .setas: return "Setas"
        case .desenho: return "Desenho"
        case .objetos: return "Objetos"
        case .vista: return "Vista do campo"
        case .plantel: return "Plantel"
        }
    }
}

@MainActor
final class EditorQuadroModelo: ObservableObject {
    @Published var ed: EditorQuadro
    @Published var jogadaId: String?
    @Published var nome: String
    @Published var descricao: String
    @Published var ferramenta: FerramentaQuadro = .selecionar
    @Published var cor = "#ffffff"
    @Published var tracejado: [Double] = []
    @Published var secao: SecaoQuadro?
    @Published var alvo: AlvoFormacao = .a
    @Published var arrasto: (id: String, x: Double, y: Double)?
    @Published var arrastoDesenho: (id: String, dx: Double, dy: Double)?
    @Published var rascunho: RascunhoDesenho?
    @Published var textoNovo: (x: Double, y: Double, valor: String)?
    @Published var aviso: String?
    @Published var salvando = false
    @Published var atletas: [Atleta] = []
    @Published var atletasCarregados = false
    let reprodutor = ReprodutorQuadro()
    private var assinatura: AnyCancellable?

    let api: ApiQuadro
    let clubeId: String?
    let carregarAtletas: () async -> [Atleta]
    let aoSalvar: (Jogada) -> Void
    let aoSessaoAcabar: (Error) -> Bool

    init(jogada: Jogada?, tipoInicial: String, api: ApiQuadro, clubeId: String?,
         carregarAtletas: @escaping () async -> [Atleta], aoSalvar: @escaping (Jogada) -> Void,
         aoSessaoAcabar: @escaping (Error) -> Bool) {
        var e = EditorQuadro(tipoInicial: tipoInicial)
        if let jogada { e.abrir(jogada.bruto) }
        ed = e
        jogadaId = jogada?.id
        nome = jogada?.nome ?? ""
        descricao = jogada?.descricao ?? ""
        self.api = api; self.clubeId = clubeId; self.carregarAtletas = carregarAtletas
        self.aoSalvar = aoSalvar; self.aoSessaoAcabar = aoSessaoAcabar
        // O play publica no reprodutor; a tela observa o modelo.
        assinatura = reprodutor.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
    }

    var tocando: Bool { reprodutor.tocando }

    // MARK: o que aparece

    func cena(_ tamanho: CGSize) -> CenaQuadro {
        let d = dims(tamanho)
        let pecas = reprodutor.pecas(ed.quadros) ?? ed.quadroAtual.elementos
        return CenaQuadro(dims: d, tipo: ed.tipoCampo, vista: ed.vista, pecas: pecas, desenhos: ed.quadroAtual.desenhos,
                          previa: rascunho.flatMap { previaComDims($0, dims: d) },
                          proximas: tocando ? nil : ed.proximoQuadro?.elementos,
                          corA: ed.corA, corB: ed.corB, pecaSelecionada: ed.pecaSelecionada, desenhoSelecionado: ed.desenhoSelecionado,
                          arrasto: arrasto, arrastoDesenho: arrastoDesenho)
    }

    func dims(_ t: CGSize) -> DimensoesCanvas { dimensoesCanvas(Double(t.width), Double(t.height), tipo: ed.tipoCampo, vista: ed.vista) }

    // MARK: gestos no campo

    private var inicio: (x: Double, y: Double, peca: Peca?, desenho: Desenho?)?

    /// Ponto do dedo (px na tela do canvas) → % do campo.
    private func pct(_ p: CGPoint, _ d: DimensoesCanvas) -> (Double, Double) {
        (paraPercentual(Double(p.x) - d.campoX, d.largura), paraPercentual(Double(p.y) - d.campoY, d.altura))
    }

    func arrastou(_ v: DragGesture.Value, tamanho: CGSize) {
        guard !tocando else { return }
        let d = dims(tamanho)
        let (sx, sy) = pct(v.startLocation, d)
        let (x, y) = pct(v.location, d)
        if inicio == nil {
            var p: Peca?, z: Desenho?
            if ferramenta == .selecionar {
                let px = Double(v.startLocation.x) - d.campoX, py = Double(v.startLocation.y) - d.campoY
                p = pecaNoPonto(ed.quadroAtual.elementos, px, py, d)
                if p == nil { z = desenhoNoPonto(ed.quadroAtual.desenhos, px, py, d).flatMap { desenhoArrastavel($0) ? $0 : nil } }
            }
            inicio = (sx, sy, p, z)
            if let m = ferramenta.modo, m != "text" {
                rascunho = RascunhoDesenho(modo: m, cor: cor, tracejado: tracejado, x: sx, y: sy)
            }
        }
        guard let ini = inicio else { return }
        let distancia = hypot(v.translation.width, v.translation.height)
        if var r = rascunho {
            r.mover(x, y)
            rascunho = r
        } else if let p = ini.peca, distancia > 3 {
            arrasto = (p.id, p.x + (x - ini.x), p.y + (y - ini.y))
        } else if let z = ini.desenho, distancia > 3 {
            arrastoDesenho = (z.id, x - ini.x, y - ini.y)
        }
    }

    func soltou(_ v: DragGesture.Value, tamanho: CGSize) {
        defer { inicio = nil; arrasto = nil; arrastoDesenho = nil; rascunho = nil }
        guard !tocando else { return }
        let d = dims(tamanho)
        let (x, y) = pct(v.location, d)
        let distancia = hypot(v.translation.width, v.translation.height)
        if let r = rascunho {
            if let novo = r.terminar(x, y, dims: d) { ed.adicionarDesenho(novo) }
            return
        }
        if distancia <= 3 { tocou(v.location, d); return }
        if let a = arrasto {
            let b = prender(a.x, a.y, limitesArrasto(d))
            ed.moverPeca(a.id, x: b.x, y: b.y)
            vibrarLeve()
        } else if let a = arrastoDesenho, let z = ed.desenho(a.id) {
            ed.alterarDesenho(a.id, ["x": .numero(z.n("x") + a.dx), "y": .numero(z.n("y") + a.dy)])
            vibrarLeve()
        }
    }

    private func tocou(_ ponto: CGPoint, _ d: DimensoesCanvas) {
        let px = Double(ponto.x) - d.campoX, py = Double(ponto.y) - d.campoY
        let p = pecaNoPonto(ed.quadroAtual.elementos, px, py, d)
        let z = p == nil ? desenhoNoPonto(ed.quadroAtual.desenhos, px, py, d) : nil
        switch ferramenta {
        case .borracha:
            if let p { ed.removerPeca(p.id) } else if let z { ed.removerDesenho(z.id) }
        case .desenho(_, "text"):
            textoNovo = (paraPercentual(px, d.largura), paraPercentual(py, d.altura), "")
        case .desenho:
            break
        case .selecionar:
            if let p { selecionarPeca(p.id) } else if let z { selecionarDesenho(z.id) } else {
                ed.pecaSelecionada = nil; ed.desenhoSelecionado = nil; secao = nil
            }
        }
    }

    // MARK: seleção e ferramentas

    func selecionarPeca(_ id: String?) { ed.pecaSelecionada = id; if id != nil { ed.desenhoSelecionado = nil; secao = nil } }
    func selecionarDesenho(_ id: String?) { ed.desenhoSelecionado = id; if id != nil { ed.pecaSelecionada = nil; secao = nil } }

    /// activateDrawingTool: tocar de novo na mesma ferramenta desliga.
    func ativar(_ id: String, modo: String, tracejado tr: [Double] = [], cor c: String? = nil) {
        if ferramenta.id == id { ferramenta = .selecionar; tracejado = []; return }
        ferramenta = .desenho(id: id, modo: modo)
        tracejado = tr
        if let c { cor = c }
        ed.pecaSelecionada = nil; ed.desenhoSelecionado = nil
    }

    func soSelecionar() { ferramenta = .selecionar; tracejado = [] }

    func abrirSecao(_ s: SecaoQuadro) {
        secao = secao == s ? nil : s
        soSelecionar()
        ed.pecaSelecionada = nil; ed.desenhoSelecionado = nil
        if s == .plantel, !atletasCarregados {
            Task { atletas = await carregarAtletas(); atletasCarregados = true }
        }
    }

    // MARK: peças (TacticalBoardPage)

    func addJogador(_ time: String) {
        soSelecionar()
        ed.adicionarPeca(dadosJogadorGenerico(time, camisa: ed.proximaCamisa(time), aleatorio: { Double.random(in: 0..<1) }))
    }
    func addGoleiro(_ time: String) { soSelecionar(); ed.adicionarPeca(dadosGoleiro(time)) }
    func addBola() { soSelecionar(); ed.adicionarPeca(dadosBola()) }
    func addObjeto(_ tipo: String) { soSelecionar(); ed.adicionarPeca(dadosObjeto(tipo, aleatorio: { Double.random(in: 0..<1) })) }
    func addAtleta(_ a: Atleta, time: String) {
        guard !ed.atletasEmCampo.contains(a.id) else { return }
        ed.adicionarPeca(dadosJogadorAtleta(time, atletaId: a.id, nome: a.nome, camisa: a.camisa, proxima: ed.proximaCamisa(time),
                                            aleatorio: { Double.random(in: 0..<1) }))
    }

    func removerSelecionado() {
        if let p = ed.pecaSelecionada { ed.removerPeca(p) }
        if let z = ed.desenhoSelecionado { ed.removerDesenho(z) }
    }

    func aplicarFormacao(_ f: Formacao) {
        soSelecionar()
        var extra = ""
        if ed.vista != VistaCampo.inteiro { ed.definirVista(VistaCampo.inteiro); extra = "Vista ajustada para campo inteiro · " }
        let r = ed.aplicarFormacoes(aplicacoesDaFormacao(f, alvo: alvo))
        aviso = extra + avisoFormacao(f, alvo: alvo, r)
    }

    func definirTipo(_ t: String) {
        guard t != ed.tipoCampo else { return }
        ed.definirTipoCampo(t)
        if !ed.quadroAtual.elementos.isEmpty { aviso = "Formações disponíveis atualizadas para \(rotuloTipoCampo(t))" }
    }

    func confirmarTexto() {
        guard let t = textoNovo else { return }
        if let novo = dadosTexto(t.valor, x: t.x, y: t.y, cor: cor) { ed.adicionarDesenho(novo) }
        textoNovo = nil
    }

    // MARK: play

    func tocar() {
        reprodutor.alternar(atual: ed.atual, total: ed.totalQuadros) { [weak self] i in self?.ed.irParaQuadro(i) }
        if tocando { ed.pecaSelecionada = nil; ed.desenhoSelecionado = nil }
    }

    func voltarInicio() { reprodutor.parar(); ed.irParaQuadro(0) }

    // MARK: salvar

    /// Salvar em 1 toque quando a jogada já existe; senão abre a folha (nome).
    func salvarRapido() async -> Bool {
        guard jogadaId != nil, nomeValidoJogada(nome) != nil else { return false }
        await persistir(nome: nome, descricao: descricao, comoNova: false)
        return true
    }

    func persistir(nome n: String, descricao dsc: String, comoNova: Bool) async {
        guard let nomeOk = nomeValidoJogada(n), !salvando else { return }
        salvando = true
        defer { salvando = false }
        let corpo = ed.corpoSalvar(nome: nomeOk, descricao: dsc.trimmingCharacters(in: .whitespacesAndNewlines), clubeId: clubeId)
        do {
            let j: Jogada
            if let id = jogadaId, !comoNova { j = try await api.atualizar(id, corpo) } else { j = try await api.criar(corpo) }
            jogadaId = j.id.isEmpty ? jogadaId : j.id
            nome = nomeOk
            descricao = dsc.trimmingCharacters(in: .whitespacesAndNewlines)
            ed.marcarSalvo()
            aviso = "Jogada salva"
            aoSalvar(j)
        } catch {
            if aoSessaoAcabar(error) { return }
            aviso = mensagemErroQuadro(error)
        }
    }
}

// MARK: tela

struct EditorQuadroTela: View {
    @StateObject private var m: EditorQuadroModelo
    @StateObject private var video = ExportadorVideoQuadro()
    @Environment(\.dismiss) private var fechar
    @State private var folhaSalvar = false
    @State private var perguntarSair = false
    @State private var perguntarLimpar = false
    @State private var perguntarExcluirQuadro = false
    @State private var tamanhoCampo = CGSize(width: 600, height: 300)

    init(modelo: @autoclosure @escaping () -> EditorQuadroModelo) { _m = StateObject(wrappedValue: modelo()) }

    var body: some View {
        ZStack {
            FUNDO_QUADRO.ignoresSafeArea()
            VStack(spacing: 6) {
                barraTopo
                HStack(spacing: 8) {
                    ferramentas
                    campo
                }
                BarraQuadros(atual: m.ed.atual, total: m.ed.totalQuadros, tocando: m.tocando, velocidade: Binding(get: { m.reprodutor.velocidade }, set: { m.reprodutor.velocidade = $0 }),
                             editar: true, aoVoltarInicio: { m.voltarInicio() }, aoTocar: { m.tocar() },
                             aoIr: { i in m.reprodutor.parar(); m.ed.irParaQuadro(i) },
                             aoAdicionar: { m.reprodutor.parar(); m.ed.adicionarQuadro() },
                             aoExcluir: { perguntarExcluirQuadro = true })
            }
            .padding(.horizontal, 8).padding(.vertical, 6)
        }
        .preferredColorScheme(.dark)
        .statusBarHidden(true)
        .onAppear { forcarOrientacao(.landscape) }
        .onDisappear { m.reprodutor.parar(); forcarOrientacao(.portrait) }
        .avisoTemporario($m.aviso)
        .sheet(isPresented: $folhaSalvar) {
            SalvarJogadaFolha(nomeInicial: m.nome, descricaoInicial: m.descricao, existente: m.jogadaId != nil) { n, d, nova in
                Task { await m.persistir(nome: n, descricao: d, comoNova: nova) }
            }
        }
        .sheet(item: $video.arquivo) { a in FolhaCompartilhar(itens: [a.url]) }
        .confirmationDialog("Há alterações não salvas", isPresented: $perguntarSair, titleVisibility: .visible) {
            Button("Salvar e sair") {
                Task {
                    if await m.salvarRapido() { fechar() } else { folhaSalvar = true }
                }
            }
            Button("Sair sem salvar", role: .destructive) { fechar() }
            Button("Continuar editando", role: .cancel) {}
        }
        .confirmationDialog("Limpar todo o quadro tático?", isPresented: $perguntarLimpar, titleVisibility: .visible) {
            Button("Limpar", role: .destructive) { m.ed.limpar(); m.soSelecionar() }
            Button("Cancelar", role: .cancel) {}
        }
        .confirmationDialog("Excluir o quadro \(m.ed.atual + 1)?", isPresented: $perguntarExcluirQuadro, titleVisibility: .visible) {
            Button("Excluir", role: .destructive) { m.reprodutor.parar(); m.ed.excluirQuadro() }
            Button("Cancelar", role: .cancel) {}
        }
        .alert("Vídeo", isPresented: Binding(get: { video.erro != nil }, set: { if !$0 { video.erro = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(video.erro ?? "") }
    }

    // MARK: barra de cima

    private var barraTopo: some View {
        HStack(spacing: 8) {
            botaoBarra("chevron.left", "Voltar") { if m.ed.alterado { perguntarSair = true } else { fechar() } }
            Button { folhaSalvar = true } label: {
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 6) {
                        Text(m.nome.isEmpty ? "Sem nome" : m.nome).font(.system(size: 15, weight: .semibold)).foregroundColor(.white).lineLimit(1)
                        if m.ed.alterado { Circle().fill(Color(red: 251 / 255, green: 191 / 255, blue: 36 / 255)).frame(width: 7, height: 7).accessibilityLabel("Alterações não salvas") }
                    }
                    Text(subtituloEditor(tipo: m.ed.tipoCampo, vista: m.ed.vista, atual: m.ed.atual, total: m.ed.totalQuadros))
                        .font(.system(size: 11.5)).foregroundColor(.white.opacity(0.6)).lineLimit(1)
                }
            }
            .buttonStyle(.plain)
            .accessibilityHint("Renomear ou salvar como nova jogada")
            Spacer(minLength: 4)
            if video.gerando {
                HStack(spacing: 6) {
                    ProgressView(value: video.progresso).frame(width: 70).tint(LIMA_QUADRO)
                    Button("Cancelar") { video.parar() }.font(.system(size: 12, weight: .semibold)).foregroundColor(.red.opacity(0.85))
                }
            }
            botaoBarra("arrow.uturn.backward", "Desfazer", desabilitado: !m.ed.podeDesfazer) { m.ed.desfazer() }
            botaoBarra("arrow.uturn.forward", "Refazer", desabilitado: !m.ed.podeRefazer) { m.ed.refazer() }
            botaoBarra("film", m.ed.totalQuadros > 1 ? "Exportar vídeo" : "Crie um 2º quadro para animar", desabilitado: m.ed.totalQuadros <= 1 || video.gerando) {
                m.reprodutor.parar()
                video.gerar(nome: m.nome, quadros: m.ed.quadros, tipo: m.ed.tipoCampo, vista: m.ed.vista, corA: m.ed.corA, corB: m.ed.corB,
                            tamanho: tamanhoCampo)
            }
            botaoBarra("trash.slash", "Limpar tudo") { perguntarLimpar = true }
            Button {
                Task { if !(await m.salvarRapido()) { folhaSalvar = true } }
            } label: {
                Text(m.salvando ? "Salvando…" : "Salvar").font(.system(size: 14.5, weight: .semibold)).foregroundColor(NAVY_QUADRO)
                    .padding(.horizontal, 16).frame(height: 38)
                    .background(RoundedRectangle(cornerRadius: 12).fill(LIMA_QUADRO))
            }
            .disabled(m.salvando)
        }
        .frame(height: 44)
    }

    private func botaoBarra(_ icone: String, _ rotulo: String, desabilitado: Bool = false, acao: @escaping () -> Void) -> some View {
        Button(action: acao) {
            Image(systemName: icone).font(.system(size: 16, weight: .semibold)).foregroundColor(.white.opacity(desabilitado ? 0.3 : 1))
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 10).fill(.white.opacity(0.1)))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(.white.opacity(0.12), lineWidth: 1))
        }
        .disabled(desabilitado)
        .accessibilityLabel(rotulo)
    }

    // MARK: coluna de ferramentas

    private var ferramentas: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 4) {
                ferramenta("cursorarrow", "Selecionar e mover", ativo: m.ferramenta == .selecionar && m.secao == nil) { m.soSelecionar(); m.secao = nil }
                bolinha(uiCorSwift(m.ed.corA), "Jogador do Time A") { m.addJogador("A") }
                bolinha(uiCorSwift(m.ed.corB), "Jogador do Time B") { m.addJogador("B") }
                ferramenta("soccerball", "Bola", ativo: false) { m.addBola() }
                ferramenta("person.badge.plus", "Peças: goleiros, plantel e cores", ativo: m.secao == .pecas) { m.abrirSecao(.pecas) }
                ferramenta("square.grid.3x3.topleft.filled", "Formações", ativo: m.secao == .formacoes) { m.abrirSecao(.formacoes) }
                ferramenta("arrow.up.right", "Setas", ativo: m.secao == .setas || ["arrow_run", "arrow_pass", "arrow_dribble", "arrow_curved"].contains(m.ferramenta.id ?? "")) { m.abrirSecao(.setas) }
                ferramenta("pencil.tip", "Desenho: livre, zonas e texto", ativo: m.secao == .desenho || ["free_draw", "zone_rect", "zone_circle", "text"].contains(m.ferramenta.id ?? "")) { m.abrirSecao(.desenho) }
                ferramenta("cone", "Objetos (cones, barreiras, mini gol…)", ativo: m.secao == .objetos) { m.abrirSecao(.objetos) }
                ferramenta("eraser", "Borracha: toque para apagar", ativo: m.ferramenta == .borracha) {
                    m.secao = nil
                    m.ferramenta = m.ferramenta == .borracha ? .selecionar : .borracha
                    m.ed.pecaSelecionada = nil; m.ed.desenhoSelecionado = nil
                }
                ferramenta("eye", "Vista e tipo de campo", ativo: m.secao == .vista) { m.abrirSecao(.vista) }
            }
            .padding(.vertical, 6)
        }
        .frame(width: 52)
        .background(RoundedRectangle(cornerRadius: 16).fill(.white.opacity(0.07)))
    }

    private func ferramenta(_ icone: String, _ rotulo: String, ativo: Bool, acao: @escaping () -> Void) -> some View {
        Button(action: acao) {
            Image(systemName: icone).font(.system(size: 17, weight: .semibold)).foregroundColor(.white)
                .frame(width: 40, height: 36)
                .background(RoundedRectangle(cornerRadius: 10).fill(ativo ? Color.accentColor : .clear))
        }
        .accessibilityLabel(rotulo)
        .accessibilityAddTraits(ativo ? .isSelected : [])
    }

    private func bolinha(_ cor: Color, _ rotulo: String, acao: @escaping () -> Void) -> some View {
        Button(action: acao) {
            Circle().fill(cor).frame(width: 22, height: 22).overlay(Circle().stroke(.white, lineWidth: 2))
                .overlay(Image(systemName: "plus").font(.system(size: 9, weight: .heavy)).foregroundColor(.white))
                .frame(width: 40, height: 36)
        }
        .accessibilityLabel(rotulo)
    }

    // MARK: campo + painel da direita

    private var campo: some View {
        GeometryReader { geo in
            ZStack(alignment: .topTrailing) {
                CampoQuadro { t in m.cena(t) }
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0)
                        .onChanged { m.arrastou($0, tamanho: geo.size) }
                        .onEnded { m.soltou($0, tamanho: geo.size) })
                    .accessibilityLabel("Campo \(rotuloMedidas(m.ed.tipoCampo))")
                if let modo = m.ferramenta.modo {
                    HStack(spacing: 8) {
                        Image(systemName: "pencil.line").font(.system(size: 12))
                        Text(rotuloModo(modo)).font(.system(size: 12, weight: .semibold))
                        Button("Sair") { m.soSelecionar() }.font(.system(size: 11, weight: .semibold)).foregroundColor(.red.opacity(0.85))
                    }
                    .foregroundColor(.white).padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Capsule().fill(.black.opacity(0.7)))
                    .frame(maxWidth: .infinity, alignment: .center).padding(.top, 6)
                }
                if let t = m.textoNovo { editorTexto(t) }
                painelDireito.padding(6)
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .onAppear { tamanhoCampo = geo.size }
            .onChange(of: geo.size) { tamanhoCampo = $0 }
        }
    }

    @ViewBuilder private var painelDireito: some View {
        if !m.tocando, let p = m.ed.peca(m.ed.pecaSelecionada) {
            PainelQuadro(titulo: p.tipo == "player" ? "Jogador" : (p.tipo == "ball" ? "Bola" : "Objeto"), fechar: { m.selecionarPeca(nil) }) {
                PainelPeca(peca: p, corA: uiCorSwift(m.ed.corA), corB: uiCorSwift(m.ed.corB),
                           alterar: { m.ed.alterarPeca(p.id, $0) }, remover: { m.removerSelecionado() })
            }
        } else if !m.tocando, let z = m.ed.desenho(m.ed.desenhoSelecionado) {
            PainelQuadro(titulo: "Desenho", fechar: { m.selecionarDesenho(nil) }) {
                PainelDesenho(desenho: z, alterar: { m.ed.alterarDesenho(z.id, $0) }, remover: { m.removerSelecionado() })
            }
        } else if let s = m.secao {
            PainelQuadro(titulo: s.titulo, fechar: { m.secao = nil }) { conteudoSecao(s) }
        }
    }

    @ViewBuilder private func conteudoSecao(_ s: SecaoQuadro) -> some View {
        switch s {
        case .pecas:
            VStack(alignment: .leading, spacing: 8) {
                RotuloPainel("Times")
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                    BotaoPainel(texto: "+ Jogador A", cor: uiCorSwift(m.ed.corA)) { m.addJogador("A") }
                    BotaoPainel(texto: "+ Jogador B", cor: uiCorSwift(m.ed.corB)) { m.addJogador("B") }
                    BotaoPainel(texto: "GK Time A", cor: uiCorSwift(m.ed.corA)) { m.addGoleiro("A") }
                    BotaoPainel(texto: "GK Time B", cor: uiCorSwift(m.ed.corB)) { m.addGoleiro("B") }
                }
                RotuloPainel("Bola e plantel")
                HStack(spacing: 6) {
                    BotaoPainel(texto: "Bola") { m.addBola() }
                    BotaoPainel(texto: "Plantel") { m.abrirSecao(.plantel) }
                }
                RotuloPainel("Cores das equipes")
                CorTime(rotulo: "Time A", hex: m.ed.corA) { m.ed.definirCorA($0) }
                CorTime(rotulo: "Time B", hex: m.ed.corB) { m.ed.definirCorB($0) }
            }
        case .plantel:
            PainelPlantel(atletas: m.atletas, carregado: m.atletasCarregados, emCampo: m.ed.atletasEmCampo,
                          corA: uiCorSwift(m.ed.corA), corB: uiCorSwift(m.ed.corB)) { a, time in m.addAtleta(a, time: time) }
        case .formacoes:
            VStack(alignment: .leading, spacing: 8) {
                RotuloPainel("Aplicar em")
                Picker("Aplicar em", selection: $m.alvo) {
                    Text("Time A").tag(AlvoFormacao.a); Text("Time B").tag(AlvoFormacao.b); Text("Ambos").tag(AlvoFormacao.ambos)
                }
                .pickerStyle(.segmented)
                RotuloPainel("Formação")
                ForEach(formacoesDoCampo(m.ed.tipoCampo), id: \.chave) { f in
                    Button { m.aplicarFormacao(f) } label: {
                        HStack(spacing: 10) {
                            MiniFormacao(posicoes: m.alvo == .b ? espelharFormacao(f.posicoes) : f.posicoes,
                                         cor: uiCorSwift(m.alvo == .b ? m.ed.corB : m.ed.corA))
                            Text(f.rotulo).font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                            Spacer(minLength: 0)
                        }
                        .padding(6).background(RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.05)))
                    }
                }
                Text("Reposiciona apenas o time escolhido. O outro time, a bola e os desenhos não mudam. Desfazer volta.")
                    .font(.system(size: 10.5)).foregroundColor(.white.opacity(0.45))
            }
        case .setas:
            VStack(alignment: .leading, spacing: 6) {
                RotuloPainel("Tipo de seta")
                ForEach(FERRAMENTAS_SETA, id: \.id) { t in
                    BotaoPainel(texto: "\(t.rotulo) · \(t.descricao)", cor: uiCorSwift(t.cor), ativo: m.ferramenta.id == t.id) {
                        m.ativar(t.id, modo: t.modo, tracejado: t.tracejado, cor: t.cor)
                    }
                }
                RotuloPainel("Cor")
                PaletaCores(atual: m.cor) { m.cor = $0 }
            }
        case .desenho:
            VStack(alignment: .leading, spacing: 6) {
                RotuloPainel("Ferramenta")
                ForEach(FERRAMENTAS_DESENHO.indices, id: \.self) { i in
                    let t = FERRAMENTAS_DESENHO[i]
                    BotaoPainel(texto: t.rotulo, ativo: m.ferramenta.id == t.id) { m.ativar(t.id, modo: t.id) }
                }
                RotuloPainel("Cor")
                PaletaCores(atual: m.cor) { m.cor = $0 }
            }
        case .objetos:
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                ForEach(TIPOS_OBJETO, id: \.tipo) { o in BotaoPainel(texto: "\(o.icone) \(o.rotulo)") { m.addObjeto(o.tipo) } }
            }
        case .vista:
            VStack(alignment: .leading, spacing: 6) {
                RotuloPainel("Tipo de campo")
                ForEach(TIPOS_CAMPO.indices, id: \.self) { i in
                    let o = TIPOS_CAMPO[i]
                    BotaoPainel(texto: o.rotulo, ativo: m.ed.tipoCampo == o.tipo) { m.definirTipo(o.tipo) }
                }
                RotuloPainel("Vista do campo")
                ForEach(VISTAS_CAMPO.indices, id: \.self) { i in
                    let v = VISTAS_CAMPO[i]
                    BotaoPainel(texto: v.rotulo, ativo: m.ed.vista == v.vista) { m.ed.definirVista(v.vista) }
                }
            }
        }
    }

    private func editorTexto(_ t: (x: Double, y: Double, valor: String)) -> some View {
        HStack(spacing: 6) {
            TextField("Texto…", text: Binding(get: { m.textoNovo?.valor ?? "" },
                                              set: { v in m.textoNovo?.valor = String(v.prefix(60)) }))
                .textFieldStyle(.plain).foregroundColor(.white).font(.system(size: 14, weight: .semibold))
                .submitLabel(.done).onSubmit { m.confirmarTexto() }
                .frame(width: 180)
            Button("OK") { m.confirmarTexto() }.font(.system(size: 13, weight: .bold)).foregroundColor(LIMA_QUADRO)
            Button { m.textoNovo = nil } label: { Image(systemName: "xmark").foregroundColor(.white.opacity(0.6)) }
        }
        .padding(8)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color(red: 10 / 255, green: 14 / 255, blue: 26 / 255).opacity(0.92)))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(uiCorSwift(m.cor), lineWidth: 1.5))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top).padding(.top, 34)
    }
}

func uiCorSwift(_ css: String) -> Color { Color(uiCor(css)) }

// MARK: painéis

struct PainelQuadro<Conteudo: View>: View {
    let titulo: String
    let fechar: () -> Void
    @ViewBuilder let conteudo: () -> Conteudo

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(titulo.uppercased()).font(.system(size: 11, weight: .bold)).tracking(0.6).foregroundColor(.white)
                Spacer()
                Button(action: fechar) { Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundColor(.white.opacity(0.5)).frame(width: 30, height: 30) }
                    .accessibilityLabel("Fechar")
            }
            .padding(.leading, 12).padding(.trailing, 4)
            Divider().background(.white.opacity(0.08))
            ScrollView { conteudo().padding(10) }
        }
        .frame(width: 236)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(RoundedRectangle(cornerRadius: 14).fill(Color(red: 11 / 255, green: 18 / 255, blue: 32 / 255).opacity(0.94)))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.1), lineWidth: 1))
    }
}

struct RotuloPainel: View {
    let t: String
    init(_ t: String) { self.t = t }
    var body: some View {
        Text(t.uppercased()).font(.system(size: 10, weight: .bold)).tracking(0.6).foregroundColor(.white.opacity(0.45)).padding(.top, 2)
    }
}

struct BotaoPainel: View {
    let texto: String
    var cor: Color = .white
    var ativo = false
    let acao: () -> Void
    var body: some View {
        Button(action: acao) {
            Text(texto).font(.system(size: 12.5, weight: .medium)).foregroundColor(cor).lineLimit(1).minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading).padding(.horizontal, 8)
                .background(RoundedRectangle(cornerRadius: 7).fill(.white.opacity(ativo ? 0.14 : 0.05)))
                .overlay(RoundedRectangle(cornerRadius: 7).stroke(.white.opacity(ativo ? 0.4 : 0.08), lineWidth: 1))
        }
        .accessibilityAddTraits(ativo ? .isSelected : [])
    }
}

struct PaletaCores: View {
    let atual: String
    let escolher: (String) -> Void
    var body: some View {
        HStack(spacing: 6) {
            ForEach(CORES_DESENHO, id: \.self) { c in
                Button { escolher(c) } label: {
                    Circle().fill(uiCorSwift(c)).frame(width: 22, height: 22)
                        .overlay(Circle().stroke(.white, lineWidth: atual == c ? 2 : 0.5))
                }
                .accessibilityLabel("Cor \(c)")
            }
        }
    }
}

struct CorTime: View {
    let rotulo: String
    let hex: String
    let definir: (String) -> Void
    var body: some View {
        ColorPicker(selection: Binding(get: { uiCorSwift(hex) }, set: { definir(hexDaCor($0)) }), supportsOpacity: false) {
            HStack { Text(rotulo).font(.system(size: 12)).foregroundColor(.white.opacity(0.7)); Text(hex).font(.system(size: 11, design: .monospaced)).foregroundColor(.white.opacity(0.5)) }
        }
    }
}

/// Cor → "#rrggbb" (o formato que o web grava em team_a_color/team_b_color).
func hexDaCor(_ c: Color) -> String {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    UIColor(c).getRed(&r, green: &g, blue: &b, alpha: &a)
    func h(_ v: CGFloat) -> String { String(format: "%02x", Int((max(0, min(1, v)) * 255).rounded())) }
    return "#\(h(r))\(h(g))\(h(b))"
}

struct MiniFormacao: View {
    let posicoes: [PosicaoFormacao]
    let cor: Color
    var body: some View {
        Canvas { ctx, t in
            let w = t.width, h = t.height
            ctx.stroke(Path(roundedRect: CGRect(x: 0.5, y: 0.5, width: w - 1, height: h - 1), cornerRadius: 3), with: .color(.white.opacity(0.18)))
            ctx.stroke(Path { p in p.move(to: CGPoint(x: w / 2, y: 0)); p.addLine(to: CGPoint(x: w / 2, y: h)) }, with: .color(.white.opacity(0.14)))
            for p in posicoes {
                let c = CGPoint(x: CGFloat(p.x) / 100 * w, y: CGFloat(p.y) / 100 * h)
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - 2.3, y: c.y - 2.3, width: 4.6, height: 4.6)), with: .color(cor.opacity(p.goleiro ? 0.75 : 1)))
            }
        }
        .frame(width: 62, height: 40)
    }
}

/// Painel do jogador/bola/objeto selecionado (SelectionPanel do web).
struct PainelPeca: View {
    let peca: Peca
    let corA: Color
    let corB: Color
    let alterar: ([String: Json]) -> Void
    let remover: () -> Void
    @State private var camisa = ""
    @State private var nome = ""
    @FocusState private var foco: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if peca.tipo == "player" {
                HStack(spacing: 6) {
                    TextField("Nº", text: $camisa).keyboardType(.numberPad).frame(width: 46).focused($foco, equals: 1)
                        .onSubmit(confirmarCamisa)
                    TextField("Nome", text: $nome).focused($foco, equals: 2).submitLabel(.done).onSubmit(confirmarNome)
                }
                .textFieldStyle(.roundedBorder).font(.system(size: 13))
                HStack(spacing: 6) {
                    ForEach(["A", "B"], id: \.self) { t in
                        BotaoPainel(texto: "Time \(t)", cor: t == "A" ? corA : corB, ativo: peca.time == t) { if peca.time != t { alterar(["team": .texto(t)]) } }
                    }
                    BotaoPainel(texto: "GK", ativo: peca.goleiro) { alterar(["isGoalkeeper": .booleano(!peca.goleiro)]) }
                }
            } else if peca.tipo == "marker", OBJETOS_QUE_GIRAM.contains(peca.marcador) {
                RotuloPainel("Girar · \(numeroJs(girar(peca.rotacao, 0)))°")
                HStack(spacing: 6) {
                    BotaoPainel(texto: "↺ 45°") { alterar(["rotation": .numero(girar(peca.rotacao, -45))]) }
                    BotaoPainel(texto: "↻ 45°") { alterar(["rotation": .numero(girar(peca.rotacao, 45))]) }
                }
                Slider(value: Binding(get: { girar(peca.rotacao, 0) }, set: { alterar(["rotation": .numero($0)]) }), in: 0...345, step: 15)
            }
            Button(role: .destructive, action: remover) {
                Label("Remover", systemImage: "trash").font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .background(RoundedRectangle(cornerRadius: 7).fill(Color.red.opacity(0.18)))
            }
            .foregroundColor(Color(red: 252 / 255, green: 165 / 255, blue: 165 / 255))
        }
        .onAppear(perform: sincronizar)
        .onChange(of: peca.id) { _ in sincronizar() }
        .onChange(of: foco) { novo in
            if novo != 1 { confirmarCamisa() }
            if novo != 2 { confirmarNome() }
        }
    }

    private func sincronizar() { camisa = peca.camisaTexto; nome = peca.nome }
    private func confirmarCamisa() {
        if let n = camisaConfirmada(camisa, atual: peca.camisa) { alterar(["jerseyNumber": .numero(Double(n))]) } else { camisa = peca.camisaTexto }
    }
    private func confirmarNome() {
        let v = nomeConfirmado(nome)
        if v != peca.nome { alterar(["name": .texto(v)]) }
    }
}

/// Painel do desenho selecionado: cor, espessura, texto e remover.
struct PainelDesenho: View {
    let desenho: Desenho
    let alterar: ([String: Json]) -> Void
    let remover: () -> Void
    @State private var texto = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            RotuloPainel("Cor")
            HStack(spacing: 6) {
                ForEach(CORES_DESENHO, id: \.self) { c in
                    Button { alterar(patchCorDesenho(desenho, cor: c)) } label: {
                        Circle().fill(uiCorSwift(c)).frame(width: 20, height: 20)
                            .overlay(Circle().stroke(.white, lineWidth: corMarcada(desenho, c) ? 2 : 0.5))
                    }
                }
            }
            if desenhoTemEspessura(desenho) {
                RotuloPainel("Espessura")
                Slider(value: Binding(get: { desenho.n("strokeWidth", ou: 2.5) }, set: { alterar(["strokeWidth": .numero($0)]) }), in: 1...6, step: 0.5)
            }
            if desenho.tipo == "text" {
                RotuloPainel("Texto")
                TextField("Texto…", text: $texto).textFieldStyle(.roundedBorder).font(.system(size: 13)).submitLabel(.done)
                    .onSubmit {
                        let v = texto.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !v.isEmpty { alterar(["text": .texto(String(v.prefix(60)))]) }
                    }
            }
            Button(role: .destructive, action: remover) {
                Label("Remover", systemImage: "trash").font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 36)
                    .background(RoundedRectangle(cornerRadius: 7).fill(Color.red.opacity(0.18)))
            }
            .foregroundColor(Color(red: 252 / 255, green: 165 / 255, blue: 165 / 255))
        }
        .onAppear { texto = desenho.texto }
        .onChange(of: desenho.id) { _ in texto = desenho.texto }
    }
}

/// Plantel do clube (PlayerPalette): escolhe o time e toca no atleta; quem já está em campo fica marcado.
struct PainelPlantel: View {
    let atletas: [Atleta]
    let carregado: Bool
    let emCampo: Set<String>
    let corA: Color
    let corB: Color
    let adicionar: (Atleta, String) -> Void
    @State private var time = "A"
    @State private var busca = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Time", selection: $time) { Text("Time A").tag("A"); Text("Time B").tag("B") }.pickerStyle(.segmented)
            TextField("Buscar atleta", text: $busca).textFieldStyle(.roundedBorder).font(.system(size: 13))
            if !carregado { ProgressView().frame(maxWidth: .infinity) }
            let q = dobrar(busca.trimmingCharacters(in: .whitespaces))
            let lista = q.isEmpty ? atletas : atletas.filter { dobrar($0.nome).contains(q) || String($0.camisa ?? -1) == q }
            if carregado && lista.isEmpty { Text("Nenhum atleta.").font(.system(size: 12)).foregroundColor(.white.opacity(0.5)) }
            ForEach(lista) { a in
                let ja = emCampo.contains(a.id)
                Button { adicionar(a, time) } label: {
                    HStack {
                        Text(a.camisa.map(String.init) ?? "–").font(.system(size: 12, weight: .bold)).frame(width: 26)
                            .foregroundColor(.white).padding(.vertical, 3).background(Circle().fill(time == "A" ? corA : corB))
                        Text(a.nome).font(.system(size: 12.5)).foregroundColor(.white).lineLimit(1)
                        Spacer()
                        if ja { Text("em campo").font(.system(size: 10)).foregroundColor(.white.opacity(0.5)) }
                    }
                    .opacity(ja ? 0.45 : 1)
                }
                .disabled(ja)
            }
        }
    }
}

/// Salvar jogada (SavePlayModal): nome obrigatório, descrição opcional; jogada existente pode virar nova.
struct SalvarJogadaFolha: View {
    let nomeInicial: String
    let descricaoInicial: String
    let existente: Bool
    let salvar: (String, String, Bool) -> Void
    @Environment(\.dismiss) private var fechar
    @State private var nome = ""
    @State private var descricao = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Nome da jogada") { TextField("Ex: Saída de bola por baixo", text: $nome) }
                Section("Descrição") { TextField("Descrição opcional da jogada…", text: $descricao, axis: .vertical).lineLimit(2...4) }
                if existente {
                    Section {
                        Button("Salvar como nova jogada") { salvar(nome, descricao, true); fechar() }
                            .disabled(nomeValidoJogada(nome) == nil)
                    }
                }
            }
            .navigationTitle(existente ? "Salvar alterações" : "Salvar jogada")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") { salvar(nome, descricao, false); fechar() }.disabled(nomeValidoJogada(nome) == nil)
                }
            }
        }
        .onAppear { nome = nomeInicial; descricao = descricaoInicial }
    }
}

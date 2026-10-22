import SwiftUI
import TactiPlanKit

// O Jogo (T2): placar no herói (feitos × sofridos pelos eventos, como no web) e 4 abas —
// Escalação (formação + campo + vagas), Eventos (linha do tempo), Convocação (relacionados,
// posição em campo, camisa, minutagem) e Dados (adversário, local, duração, campeonato, rodada,
// vídeo). "+ Evento" sempre à mão. Salvar = o mesmo POST /api/games/:id do web.
// SEM INTERNET: salvar guarda no aparelho (FilaJogos) e envia quando a rede volta; em conflito
// vale o que está no aparelho e a pessoa é avisada. Regras todas no Kit (EditorJogo, FormEvento).

@MainActor
final class JogoModelo: ObservableObject {
    enum Estado: Equatable { case carregando, pronto, erro(String) }

    @Published var editor: EditorJogo?
    @Published private(set) var estado: Estado = .carregando
    @Published private(set) var pacote: PacoteJogo?
    @Published private(set) var pendencia: PendenciaJogo?
    @Published private(set) var salvando = false
    @Published private(set) var enviando = false
    @Published private(set) var doCache = false
    @Published var aviso: String?
    @Published var alerta: (titulo: String, texto: String)?
    /// Assinatura do que está salvo (no servidor ou guardado no aparelho).
    @Published private(set) var salvo: String?
    /// Assinatura da convocação salva NO SERVIDOR (o PDF usa a salva).
    @Published private(set) var convocacaoSalva: String?

    let sessaoId: String
    let servico: ServicoJogo
    let fila: FilaJogos
    let aoSessaoAcabar: (Error) -> Bool
    private var base: String?
    private var alteracoes = 0

    init(sessaoId: String, servico: ServicoJogo, fila: FilaJogos, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessaoId = sessaoId
        self.servico = servico
        self.fila = fila
        self.aoSessaoAcabar = aoSessaoAcabar
    }

    var sujo: Bool { editor.map { $0.assinatura != salvo } ?? false }
    var atletas: [AtletaResumo] { pacote?.atletas ?? [] }
    var campeonatos: [Campeonato] { pacote?.campeonatos ?? [] }
    var dia: DiaDoJogo? { pacote?.dia }
    var alteracoesPendentes: Int { (pendencia?.alteracoes ?? 0) + (sujo ? max(1, alteracoes) : 0) }

    /// Uma mudança no editor (conta para "N alterações"); devolve o aviso da operação.
    /// `conta` false = digitação num campo de texto (não soma uma alteração por letra).
    func mudar(conta: Bool = true, _ f: (inout EditorJogo) -> String?) {
        guard var e = editor else { return }
        let antes = e.assinatura
        let msg = f(&e)
        editor = e
        if conta && e.assinatura != antes { alteracoes += 1 }
        if let msg { aviso = msg }
    }

    // MARK: carregar

    func carregar(online: Bool) async {
        if let p = fila.pendencia(sessaoId) {
            // Vale o que está no aparelho (guardado sem sinal).
            pendencia = p
            if editor == nil || !sujo { editor = p.editor; salvo = p.editor.assinatura }
            base = p.base
            if pacote == nil { pacote = fila.cache(sessaoId) }
            estado = .pronto
            if let fresco = try? await servico.carregar(sessaoId) {
                pacote = PacoteJogo(dia: fresco.dia, jogo: fresco.jogo, atletas: fresco.atletas, campeonatos: fresco.campeonatos)
                fila.guardarCache(fresco)
                await sincronizar()
            }
            return
        }
        if editor == nil { estado = .carregando }
        do {
            let p = try await servico.carregar(sessaoId)
            aplicar(p)
        } catch is CancellationError {
            return
        } catch {
            if aoSessaoAcabar(error) { return }
            if semRede(error), let c = fila.cache(sessaoId) {
                if editor == nil { aplicar(c); doCache = true }
            } else if editor == nil {
                estado = .erro(mensagemDeErro(error))
            } else {
                aviso = mensagemDeErro(error)
            }
        }
    }

    private func aplicar(_ p: PacoteJogo) {
        fila.guardarCache(p)
        let e = EditorJogo.carregar(dia: p.dia, jogo: p.jogo, modalidade: servico.modalidade)
        pacote = p
        editor = e
        salvo = e.assinatura
        convocacaoSalva = e.assinaturaConvocacao
        base = e.assinaturaServidor
        alteracoes = 0
        doCache = false
        estado = .pronto
    }

    // MARK: salvar

    /// Salvar: com rede, o POST do web; sem rede, guarda no aparelho. Devolve true se ficou salvo
    /// (no servidor ou no aparelho).
    @discardableResult
    func salvar() async -> Bool {
        guard let ed = editor, !salvando else { return false }
        if let erro = ed.conferirAntesDeSalvar() {
            alerta = ("Confira o jogo", erro)
            return false
        }
        salvando = true
        defer { salvando = false }
        if pendencia != nil {
            // Já há coisa guardada no aparelho: junta e envia tudo pela fila (confere conflito).
            guard guardarNoAparelho(ed) else { return false }
            await sincronizar()
            return true
        }
        do {
            try await servico.api.salvar(sessaoId, corpo: ed.corpoSalvar())
            salvo = ed.assinatura
            alteracoes = 0
            vibrarSucesso()
            aviso = "Jogo salvo"
            await recarregarDepoisDeSalvar(ed.assinatura)
            return true
        } catch {
            if aoSessaoAcabar(error) { return false }
            if semRede(error) {
                guard guardarNoAparelho(ed) else { return false }
                aviso = MSG_GUARDADO
                return true
            }
            alerta = ("Não foi possível salvar", mensagemErroJogo(error))
            return false
        }
    }

    private func guardarNoAparelho(_ ed: EditorJogo) -> Bool {
        do {
            pendencia = try fila.guardar(ed, base: base, alteracoes: max(1, alteracoes))
            salvo = ed.assinatura
            alteracoes = 0
            return true
        } catch {
            alerta = ("Não foi possível guardar", "O aparelho não conseguiu guardar as alterações. Libere espaço e tente de novo.")
            return false
        }
    }

    /// Depois de salvar, relê do servidor (ids dos eventos, base nova). Se a pessoa já mexeu de
    /// novo no meio, não atropela o que está na tela.
    private func recarregarDepoisDeSalvar(_ assinaturaSalva: String) async {
        guard let p = try? await servico.carregar(sessaoId) else { return }
        if editor?.assinatura == assinaturaSalva { aplicar(p) } else {
            fila.guardarCache(p)
            pacote = p
            base = EditorJogo.carregar(dia: p.dia, jogo: p.jogo, modalidade: servico.modalidade).assinaturaServidor
            convocacaoSalva = EditorJogo.carregar(dia: p.dia, jogo: p.jogo, modalidade: servico.modalidade).assinaturaConvocacao
        }
    }

    // MARK: fila offline

    func sincronizar() async {
        guard pendencia != nil, !enviando else { return }
        enviando = true
        defer { enviando = false }
        let r = await SincronizadorJogos(servico: servico, fila: fila).enviar(sessaoId)
        switch r {
        case .enviado(let conflito):
            pendencia = nil
            vibrarSucesso()
            if conflito { alerta = ("Jogo alterado no servidor", MSG_CONFLITO) } else { aviso = "Alterações enviadas" }
            if let ed = editor { await recarregarDepoisDeSalvar(ed.assinatura) }
        case .semRede, .nadaAEnviar:
            pendencia = fila.pendencia(sessaoId)
        case .recusado:
            pendencia = fila.pendencia(sessaoId)
        case .sessaoEncerrada(let e):
            _ = aoSessaoAcabar(e)
        }
    }

    /// Joga fora o que ficou guardado no aparelho e volta ao que está no servidor.
    func descartarLocal(online: Bool) async {
        fila.remover(sessaoId)
        pendencia = nil
        editor = nil
        await carregar(online: online)
    }
}

enum AbaJogo: String, CaseIterable, Identifiable {
    case escalacao = "Escalação", eventos = "Eventos", convocacao = "Convocação", dados = "Dados"
    var id: String { rawValue }
}

struct JogoTela: View {
    let sessaoId: String
    let sessao: Sessao
    let contexto: ContextoClube

    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema
    @Environment(\.dismiss) private var voltar
    @StateObject private var modelo: JogoModelo
    @StateObject private var exportar: ExportadorRelatorio
    @StateObject private var rede = MonitorRede()
    @State private var aba: AbaJogo = .escalacao
    @State private var evento: EventoAberto?
    @State private var confirmarSaida = false
    @State private var confirmarDescarte = false

    init(sessaoId: String, sessao: Sessao, contexto: ContextoClube, servico: ServicoJogo, treino: ServicoTreino,
         fila: FilaJogos, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessaoId = sessaoId
        self.sessao = sessao
        self.contexto = contexto
        _modelo = StateObject(wrappedValue: JogoModelo(sessaoId: sessaoId, servico: servico, fila: fila, aoSessaoAcabar: aoSessaoAcabar))
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: treino, aoSessaoAcabar: aoSessaoAcabar))
    }

    /// Editar jogo: games:edit e a equipe fora do só leitura (clube arquivado incluso).
    private var podeEditar: Bool { contexto.podeEditar("games:edit") }
    private var podeExportar: Bool { !(contexto.conta.somenteLeitura ?? false) }

    private var titulo: String {
        let a = modelo.editor?.dados.adversario ?? modelo.dia?.adversario ?? ""
        return a.trimmingCharacters(in: .whitespaces).isEmpty ? "Jogo" : "vs \(a)"
    }

    var body: some View {
        let c = tema.cores
        Group {
            switch modelo.estado {
            case .carregando:
                VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in EsqueletoLinha() } }
                    .padding(16)
                    .frame(maxHeight: .infinity, alignment: .top)
            case .erro(let msg):
                Cartao {
                    EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível abrir o jogo", texto: msg,
                                acao: ("Tentar de novo", { Task { await modelo.carregar(online: rede.online) } }))
                }
                .padding(16)
                .frame(maxHeight: .infinity, alignment: .top)
            case .pronto:
                if let ed = modelo.editor { conteudo(ed) }
            }
        }
        .background(c.fundo.color.ignoresSafeArea())
        .navigationTitle(titulo)
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(modelo.sujo)
        .toolbar {
            if modelo.sujo {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { confirmarSaida = true } label: {
                        HStack(spacing: 4) { Image(systemName: "chevron.left"); Text("Jogos") }
                    }
                    .accessibilityLabel("Voltar")
                }
            }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                if podeExportar && modelo.editor != nil {
                    Button { exportarConvocacao() } label: {
                        if exportar.ocupado { ProgressView() } else { Image(systemName: "square.and.arrow.up") }
                    }
                    .accessibilityLabel("Exportar convocação em PDF")
                    .disabled(exportar.ocupado)
                }
                if podeEditar && modelo.editor != nil {
                    Button { Task { await modelo.salvar() } } label: {
                        if modelo.salvando { ProgressView() } else { Text("Salvar").font(Tipos.corpo15.comPeso(.seminegrito).font) }
                    }
                    .disabled(!modelo.sujo || modelo.salvando)
                    .accessibilityHint(modelo.sujo ? "Salva as alterações do jogo" : "Nada para salvar")
                }
            }
        }
        .task { await modelo.carregar(online: rede.online) }
        .onChange(of: rede.online) { on in if on { Task { await modelo.sincronizar() } } }
        .sheet(item: $evento) { aberto in
            if let ed = modelo.editor {
                EventoFolha(editor: ed, editando: aberto.evento, podeEditar: podeEditar) { acao in
                    switch acao {
                    case .salvar(let e):
                        modelo.mudar { ed in
                            if aberto.evento != nil { ed.atualizarEvento(e) } else { ed.adicionarEvento(e) }
                            return nil
                        }
                    case .excluir(let id):
                        modelo.mudar { ed in ed.removerEvento(id); return nil }
                    }
                }
                .environment(\.tema, tema)
            }
        }
        .confirmationDialog("Sair sem salvar?", isPresented: $confirmarSaida, titleVisibility: .visible) {
            if podeEditar {
                Button("Salvar e sair") { Task { if await modelo.salvar() { voltar() } } }
            }
            Button("Descartar alterações", role: .destructive) { voltar() }
            Button("Continuar editando", role: .cancel) {}
        } message: { Text("As alterações deste jogo ainda não foram salvas.") }
        .confirmationDialog("Descartar o que está no aparelho?", isPresented: $confirmarDescarte, titleVisibility: .visible) {
            Button("Descartar alterações do aparelho", role: .destructive) {
                Task { await modelo.descartarLocal(online: rede.online) }
            }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("As alterações guardadas sem conexão serão perdidas e o jogo volta ao que está no servidor.") }
        .alert(modelo.alerta?.titulo ?? "", isPresented: Binding(get: { modelo.alerta != nil },
                                                                 set: { if !$0 { modelo.alerta = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(modelo.alerta?.texto ?? "") }
        .avisoTemporario($modelo.aviso)
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }

    // MARK: conteúdo

    private func conteudo(_ ed: EditorJogo) -> some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    FaixasDoTopo(contexto: contexto, sessao: sessao)
                    heroi(ed)
                    faixaDaFila
                    Picker("Seção do jogo", selection: $aba) {
                        ForEach(AbaJogo.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    switch aba {
                    case .escalacao:
                        EscalacaoAba(modelo: modelo, podeEditar: podeEditar)
                    case .eventos:
                        eventos(ed)
                    case .convocacao:
                        ConvocacaoAba(modelo: modelo, podeEditar: podeEditar, podeExportar: podeExportar) { exportarConvocacao() }
                    case .dados:
                        DadosJogoAba(modelo: modelo, podeEditar: podeEditar)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, podeEditar ? 96 : 32)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { if !modelo.sujo { await modelo.carregar(online: rede.online) } }
            if podeEditar {
                Button { evento = EventoAberto(evento: nil) } label: {
                    Label("Evento", systemImage: "plus")
                        .font(Tipos.corpo15.comPeso(.seminegrito).font)
                        .padding(.horizontal, 20).frame(minHeight: 52)
                        .foregroundColor(tema.cores.sobreAcao.color)
                        .background(Capsule().fill(tema.cores.acao.color))
                        .shadow(color: .black.opacity(0.25), radius: 8, x: 0, y: 4)
                }
                .padding(.trailing, 16).padding(.bottom, 16)
                .accessibilityLabel("Adicionar evento")
            }
        }
    }

    private func heroi(_ ed: EditorJogo) -> some View {
        let c = tema.cores
        let feitos = ed.golsFeitos, sofridos = ed.golsSofridos
        let jogado = (modelo.dia.map { $0.data < hojeBrasilia() } ?? false) || feitos + sofridos > 0
        let r = resultadoDo(feitos: feitos, sofridos: sofridos)
        let adv = ed.dados.adversario.isEmpty ? "Adversário" : ed.dados.adversario
        let clube = contexto.clube?.nome ?? "Nós"
        let forma = RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCard), style: .continuous)
        return VStack(spacing: 8) {
            if let d = modelo.dia {
                Text([rotuloDiaCurto(d.data), rotuloLocal(ed.dados.local), ed.dados.rodada.isEmpty ? nil : "Rodada \(ed.dados.rodada)"]
                        .compactMap { $0 }.joined(separator: " · "))
                    .tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.sobreHeroi2.color)
            }
            HStack(alignment: .center) {
                VStack(spacing: 4) {
                    LogoClube(personalizacao: contexto.clube?.personalizacao, tamanho: 36)
                    Text(clube).font(Tipos.corpo13.comPeso(.seminegrito).font).foregroundColor(c.sobreHeroi.color)
                        .lineLimit(2).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                VStack(spacing: 4) {
                    HStack(spacing: 10) {
                        Text("\(feitos)").foregroundColor(VERDE_JOGO)
                        Text("×").foregroundColor(c.sobreHeroi2.color)
                        Text("\(sofridos)").foregroundColor(VERMELHO_JOGO)
                    }
                    .font(Tipos.valor.comTamanho(34).font)
                    if jogado {
                        Text(rotuloResultado(r))
                            .font(Tipos.legenda11.comPeso(.seminegrito).font)
                            .foregroundColor(Cor(hex: NAVY).color)
                            .padding(.horizontal, 10).padding(.vertical, 3)
                            .background(Capsule().fill(c.lime.color))
                    } else {
                        Text("feitos × sofridos").tipo(Tipos.legenda11).foregroundColor(c.sobreHeroi2.color)
                    }
                }
                VStack(spacing: 4) {
                    Image(systemName: "shield.fill").font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 36, height: 36)
                        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Color.gray))
                    Text(adv).font(Tipos.corpo13.comPeso(.seminegrito).font).foregroundColor(c.sobreHeroi.color)
                        .lineLimit(2).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(forma.fill(c.heroi.color))
        .overlay(forma.stroke(c.heroiBorda.color, lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(clube) \(feitos), \(adv) \(sofridos)\(jogado ? ". \(rotuloResultado(r))" : "")")
    }

    @ViewBuilder
    private var faixaDaFila: some View {
        if modelo.doCache {
            FaixaTom(icone: "icloud.slash", texto: "Sem conexão: mostrando o jogo como foi aberto pela última vez neste aparelho.", tom: .aviso)
        }
        if let p = modelo.pendencia {
            VStack(alignment: .leading, spacing: 8) {
                if let erro = p.erro {
                    FaixaTom(icone: "exclamationmark.triangle", texto: "Não foi enviado: \(erro)", tom: .erro)
                } else if modelo.enviando {
                    FaixaTom(icone: "arrow.up.circle", texto: "Enviando \(p.alteracoes == 1 ? "1 alteração" : "\(p.alteracoes) alterações")…", tom: .info)
                } else {
                    FaixaTom(icone: "icloud.slash", texto: textoFila(alteracoes: modelo.alteracoesPendentes, semConexao: !rede.online), tom: .aviso)
                }
                HStack(spacing: 8) {
                    if rede.online && !modelo.enviando {
                        Botao(texto: "Enviar agora", variante: .secundario, larguraCheia: false) { Task { await modelo.sincronizar() } }
                    }
                    if p.erro != nil {
                        Botao(texto: "Descartar", variante: .perigo, larguraCheia: false) { confirmarDescarte = true }
                    }
                }
            }
        }
    }

    // MARK: eventos

    @ViewBuilder
    private func eventos(_ ed: EditorJogo) -> some View {
        let c = tema.cores
        if ed.eventos.isEmpty {
            Cartao {
                EstadoVazio(icone: "sportscourt", titulo: "Nenhum evento registrado",
                            texto: "Toque em \"+ Evento\" para registrar gols, cartões\(ed.config.rastreiaMinutos ? " e substituições" : "").")
            }
        } else {
            Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                ForEach(Array(ed.eventosOrdenados.enumerated()), id: \.element.id) { i, e in
                    if i > 0 { Divisoria() }
                    let prob = ed.problemaDaSubstituicao(e)
                    Button { if podeEditar { evento = EventoAberto(evento: e) } } label: {
                        HStack(spacing: 12) {
                            IconeEvento(tipo: e.tipo, nosso: e.doNossoTime)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(e.minuto.map { "\($0)'" } ?? "—")
                                        .font(Tipos.corpo13.comPeso(.negrito).font).monospacedDigit()
                                        .foregroundColor(c.tinta2.color)
                                    Text(rotuloDoEvento(e)).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                                    let gt = rotuloTipoGol(e.tipoGol)
                                    if !gt.isEmpty { Text(gt).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).lineLimit(1) }
                                }
                                if let d = ed.detalheDoEvento(e, plantel: modelo.atletas) {
                                    Text(d).tipo(Tipos.corpo13.comPeso(prob != nil ? .seminegrito : .regular))
                                        .foregroundColor(prob != nil ? AMBAR_JOGO : c.tinta.color)
                                        .linhasAcessiveis(2)
                                }
                            }
                            Spacer(minLength: 0)
                            if podeEditar { Seta() }
                        }
                        .padding(.vertical, 10)
                        .padding(.horizontal, prob != nil ? 6 : 0)
                        .background(RoundedRectangle(cornerRadius: 8)
                            .stroke(prob != nil ? AMBAR_JOGO.opacity(0.6) : .clear, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(!podeEditar)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint(podeEditar ? (prob != nil ? "Toque para completar" : "Toque para editar") : "")
                    .contextMenu {
                        if podeEditar {
                            Button(role: .destructive) { modelo.mudar { ed in ed.removerEvento(e.id); return nil } } label: {
                                Label("Excluir evento", systemImage: "trash")
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: PDF

    private func exportarConvocacao() {
        guard let ed = modelo.editor else { return }
        if ed.jogadores.isEmpty { modelo.aviso = MSG_SELECIONE_ANTES; return }
        if modelo.pendencia != nil { modelo.aviso = MSG_ENVIE_ANTES; return }
        if let s = modelo.convocacaoSalva, s != ed.assinaturaConvocacao { modelo.aviso = MSG_SALVE_ANTES; return }
        exportar.iniciar(tipo: "convocacao", corpo: corpoConvocacao(sessaoId),
                         nome: nomePdfConvocacao(adversario: ed.dados.adversario, data: modelo.dia?.data ?? ""),
                         usuarioId: sessao.me.usuario.id)
    }
}

/// Evento aberto na folha (nil = novo).
struct EventoAberto: Identifiable {
    let id = UUID()
    let evento: EventoJogo?
}

/// Ícone do evento (cores do web): gol verde, sofrido vermelho, cartões, troca azul, faltas âmbar.
struct IconeEvento: View {
    let tipo: String
    var nosso = true
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        Group {
            switch tipo {
            case EVENTO_GOL: Image(systemName: "soccerball").foregroundColor(VERDE_JOGO)
            case EVENTO_GOL_SOFRIDO: Image(systemName: "shield.lefthalf.filled").foregroundColor(VERMELHO_JOGO)
            case EVENTO_AMARELO: RoundedRectangle(cornerRadius: 2).fill(corHex("#eab308")).frame(width: 11, height: 15)
            case EVENTO_VERMELHO: RoundedRectangle(cornerRadius: 2).fill(corHex("#dc2626")).frame(width: 11, height: 15)
            case EVENTO_SUBSTITUICAO: Image(systemName: "arrow.left.arrow.right").foregroundColor(corHex("#3b82f6"))
            case EVENTO_FALTA_ACUMULADA, EVENTO_SEXTA_FALTA: Image(systemName: "exclamationmark.triangle.fill").foregroundColor(AMBAR_JOGO)
            default: Image(systemName: "clock").foregroundColor(c.tinta2.color)
            }
        }
        .font(.system(size: 15, weight: .semibold))
        .frame(width: 34, height: 34)
        .background(Circle().fill(c.superficie.color))
        .overlay(Circle().stroke(c.borda.color, lineWidth: 1))
        .opacity(nosso || tipo == EVENTO_GOL_SOFRIDO ? 1 : 0.7)
        .accessibilityHidden(true)
    }
}

// MARK: Dados do jogo

struct DadosJogoAba: View {
    @ObservedObject var modelo: JogoModelo
    let podeEditar: Bool
    @Environment(\.tema) private var tema

    private func ligacao<T>(_ k: WritableKeyPath<DadosGerais, T>) -> Binding<T> where T: Equatable {
        Binding(get: { modelo.editor!.dados[keyPath: k] },
                set: { v in modelo.mudar(conta: false) { ed in if ed.dados[keyPath: k] != v { ed.dados[keyPath: k] = v }; return nil } })
    }

    var body: some View {
        let c = tema.cores
        if let ed = modelo.editor {
            VStack(alignment: .leading, spacing: 12) {
                campo("Adversário") { Campo(dica: "Nome do adversário", valor: ligacao(\.adversario), habilitado: podeEditar) }
                campo("Local") {
                    Picker("Local", selection: ligacao(\.local)) {
                        Text("—").tag("")
                        Text("Casa").tag("home")
                        Text("Fora").tag("away")
                        Text("Neutro").tag("neutral")
                    }
                    .pickerStyle(.segmented)
                    .disabled(!podeEditar)
                }
                campo("Duração (min)") {
                    Stepper(value: Binding(get: { ed.dados.duracao },
                                           set: { v in modelo.mudar { $0.dados.duracao = max(1, min(150, v)); return nil } }),
                            in: 1...150, step: 1) {
                        Text("\(ed.dados.duracao) min").font(Tipos.corpo17.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                    }
                    .disabled(!podeEditar)
                    .accessibilityValue("\(ed.dados.duracao) minutos")
                }
                campo("Campeonato") {
                    Menu {
                        Button("— sem campeonato —") { modelo.mudar { $0.dados.campeonatoId = ""; return nil } }
                        ForEach(modelo.campeonatos) { cp in
                            Button(cp.rotulo) { modelo.mudar { $0.dados.campeonatoId = cp.id; return nil } }
                        }
                    } label: {
                        HStack {
                            Text(modelo.campeonatos.first { $0.id == ed.dados.campeonatoId }?.rotulo ?? "— sem campeonato —")
                                .foregroundColor(c.tinta.color).lineLimit(1)
                            Spacer()
                            Image(systemName: "chevron.up.chevron.down").foregroundColor(c.tinta3.color)
                        }
                        .font(Tipos.corpo15.font)
                        .padding(.horizontal, 16).frame(minHeight: 52)
                        .background(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous).fill(c.superficie.color))
                        .overlay(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous).stroke(c.borda.color))
                    }
                    .disabled(!podeEditar)
                }
                campo("Rodada") { Campo(dica: "Nº", valor: ligacao(\.rodada), habilitado: podeEditar) }
                campo("Vídeo") { Campo(dica: "YouTube / Drive", valor: ligacao(\.video), teclado: .URL, habilitado: podeEditar) }
                if let u = URL(string: ed.dados.video), u.scheme?.hasPrefix("http") == true {
                    Link(destination: u) { Label("Abrir o vídeo", systemImage: "play.rectangle") }
                        .font(Tipos.corpo15.comPeso(.seminegrito).font)
                        .foregroundColor(c.acaoTinta.color)
                }
            }
        }
    }

    private func campo<V: View>(_ rotulo: String, @ViewBuilder _ v: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            RotuloSecao(rotulo).padding(.horizontal, 4)
            v()
        }
    }
}

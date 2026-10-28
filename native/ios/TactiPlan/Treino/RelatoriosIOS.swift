import SwiftUI
import UIKit
import TactiPlanKit

// Relatórios do dia e da semana: o PDF sai PRONTO do servidor (POST /api/reports/sessao e
// /treino, o mesmo gerador do web) e o celular só entrega pela folha de compartilhar. Com fotos
// no período, antes abre a tela "Fotos do relatório" (a do web: escolha, ordem, legenda, layout,
// proporção, tamanho 50–100%, posição na ficha, agrupar por dia na semana e a PRÉVIA em WebView,
// formato 'html'). A ficha do dia na tela é o formato 'visualizar' num WebView.
//
// Decisão (ficha na tela = WebView, não nativo): o Dia já é a versão nativa da ficha; a "Ficha do
// dia" é a página do relatório, e o servidor já monta esse HTML com o MESMO template do PDF (fontes
// e miniaturas embutidas, paginação). Refazer em SwiftUI/Compose seria manter três cópias do layout
// (web, iPhone, Android) que iriam divergir; no WebView o que se vê é exatamente o que se exporta.

@MainActor
final class ExportadorRelatorio: ObservableObject {
    struct SessaoFotos: Identifiable {
        let id = UUID()
        let tipo: String
        let corpo: [String: Json]
        let nome: String
        let usuarioId: String
        var escolha: EscolhaFotos
    }

    @Published var fotos: SessaoFotos?
    @Published var compartilhar: ArquivoLocal?
    @Published var aviso: String?
    @Published private(set) var ocupado = false

    let servico: ServicoTreino
    private let aoSessaoAcabar: (Error) -> Bool
    private let preferencias = ArmazemPreferencias()

    init(servico: ServicoTreino, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.servico = servico
        self.aoSessaoAcabar = aoSessaoAcabar
    }

    /// Botão "Exportar": com fotos, abre a escolha; sem fotos, gera e compartilha direto.
    func iniciar(tipo: String, corpo: [String: Json], nome: String, usuarioId: String) {
        guard !ocupado else { return }
        ocupado = true
        Task {
            defer { ocupado = false }
            var lista: ListaFotosRelatorio?
            do {
                lista = try await servico.api.fotosDoRelatorio(tipo, corpo: corpo)
            } catch {
                if aoSessaoAcabar(error) { return }
                if let e = error as? ErroApi, e.status == 402 || e.status == 403 {
                    aviso = mensagemErroTreino(error, permissao: "Você não tem permissão para exportar este relatório.")
                    return
                }
                lista = nil // lista falhou: segue com o padrão
            }
            if let l = lista, !l.fotos.isEmpty {
                fotos = SessaoFotos(tipo: tipo, corpo: corpo, nome: nome, usuarioId: usuarioId,
                                    escolha: EscolhaFotos(lista: l, preferencias: lerPreferencias(usuarioId)))
                return
            }
            await gerarPdf(tipo: tipo, corpo: corpo, nome: nome)
        }
    }

    /// Gera o PDF com as escolhas da tela de fotos.
    func gerarDasFotos(_ s: SessaoFotos, modo: ModoExportarFotos) async {
        guardarPreferencias(s.usuarioId, s.escolha.preferencias)
        ocupado = true
        defer { ocupado = false }
        if let url = await pdf(tipo: s.tipo, corpo: corpoComFotos(s.corpo, s.escolha, modo: modo), nome: s.nome) {
            fotos = nil
            // A folha de compartilhar sobe depois que a de fotos desceu.
            try? await Task.sleep(nanoseconds: 650_000_000)
            compartilhar = ArquivoLocal(url: url)
        }
    }

    /// PowerPoint da análise do adversário (com os vídeos) → folha de compartilhar.
    func gerarPptxAnalise(sessaoId: String, nome: String) {
        guard !ocupado else { return }
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                let d = try await servico.api.pptxDaAnalise(sessaoId)
                compartilhar = ArquivoLocal(url: try arquivoTemporario(d, nome: nome, pasta: "relatorios"))
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = mensagemErroTreino(error, permissao: "Você não tem permissão para exportar este relatório.")
            }
        }
    }

    private func gerarPdf(tipo: String, corpo: [String: Json], nome: String) async {
        if let url = await pdf(tipo: tipo, corpo: corpo, nome: nome) { compartilhar = ArquivoLocal(url: url) }
    }

    private func pdf(tipo: String, corpo: [String: Json], nome: String) async -> URL? {
        do {
            let d = try await servico.api.pdfDoRelatorio(tipo, corpo: corpo)
            return try arquivoTemporario(d, nome: nome, pasta: "relatorios")
        } catch {
            if aoSessaoAcabar(error) { return nil }
            aviso = mensagemErroTreino(error, permissao: "Você não tem permissão para exportar este relatório.")
            return nil
        }
    }

    func previa(_ s: SessaoFotos) async throws -> String {
        var c = s.corpo
        c["formato"] = "html"
        c["fotos"] = s.escolha.configuracao
        return try await servico.api.htmlDoRelatorio(s.tipo, corpo: c)
    }

    private func lerPreferencias(_ u: String) -> PreferenciasFotos? {
        guard let s = preferencias.ler(chavePreferenciasFotos(u)) else { return nil }
        return try? JSONDecoder().decode(PreferenciasFotos.self, from: Data(s.utf8))
    }

    private func guardarPreferencias(_ u: String, _ p: PreferenciasFotos) {
        guard let d = try? JSONEncoder().encode(p), let s = String(data: d, encoding: .utf8) else { return }
        preferencias.gravar(chavePreferenciasFotos(u), s)
    }
}

/// Liga a tela de fotos, a folha de compartilhar e os avisos de um exportador a uma tela.
struct ApresentacaoRelatorio: ViewModifier {
    @ObservedObject var exportar: ExportadorRelatorio
    @Environment(\.tema) private var tema

    func body(content: Content) -> some View {
        content
            .sheet(item: $exportar.fotos) { _ in
                FotosRelatorioTela(exportar: exportar).environment(\.tema, tema)
            }
            .sheet(item: $exportar.compartilhar) { a in
                FolhaCompartilhar(itens: [a.url]).presentationDetents([.medium, .large])
            }
            .avisoTemporario($exportar.aviso)
    }
}

// MARK: Fotos do relatório

struct FotosRelatorioTela: View {
    @ObservedObject var exportar: ExportadorRelatorio
    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State private var aba = 0
    @State private var html: String?
    @State private var carregandoPrevia = false
    @State private var erroPrevia: String?
    @State private var aviso: String?

    private var escolha: EscolhaFotos? { exportar.fotos?.escolha }

    private func mudar(_ f: (inout EscolhaFotos) -> Void) {
        guard var s = exportar.fotos else { return }
        f(&s.escolha)
        exportar.fotos = s
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Ver", selection: $aba) {
                    Text("Ajustes").tag(0)
                    Text("Prévia").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(16)
                if aba == 0 { ajustes } else { previa }
                rodape
            }
            .background(tema.cores.fundo.color.ignoresSafeArea())
            .navigationTitle("Fotos do relatório")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fechar") { fechar() }.disabled(exportar.ocupado) }
            }
        }
        .interactiveDismissDisabled(exportar.ocupado)
        .task(id: escolha?.configuracao.textoJson()) { await carregarPrevia() }
        .avisoTemporario($aviso)
    }

    private func carregarPrevia() async {
        guard let s = exportar.fotos else { return }
        guard s.escolha.quantasSelecionadas > 0 else { html = nil; erroPrevia = nil; return }
        try? await Task.sleep(nanoseconds: 400_000_000) // espera a pessoa parar de mexer
        if Task.isCancelled { return }
        carregandoPrevia = true
        defer { carregandoPrevia = false }
        do {
            let h = try await exportar.previa(s)
            if !Task.isCancelled { html = h; erroPrevia = nil }
        } catch is CancellationError {
        } catch {
            erroPrevia = mensagemDeErro(error, padrao: "Não foi possível montar a prévia.")
        }
    }

    // MARK: ajustes

    @ViewBuilder
    private var ajustes: some View {
        if let e = escolha {
            let c = tema.cores
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    secao("Layout") {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) {
                            ForEach(LAYOUTS_FOTOS) { l in
                                cartaoOpcao(l.rotulo, l.dica, on: e.layout == l.id) { mudar { $0.layout = l.id } }
                            }
                        }
                    }
                    if !e.semana {
                        secao("Onde ficam as fotos") {
                            FlowChips(itens: [ItemChip(id: "fim", rotulo: "No final da ficha"), ItemChip(id: "blocos", rotulo: "Abaixo de cada bloco")],
                                      marcados: [e.posicao]) { p in mudar { $0.posicao = p } }
                            if e.posicao == "blocos" {
                                Text("Cada foto vai logo abaixo do treino a que pertence. Fotos do dia sem bloco ficam no final.")
                                    .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                            }
                        }
                    }
                    secao("Proporção") {
                        FlowChips(itens: PROPORCOES_FOTOS.map { ItemChip(id: $0.id, rotulo: $0.rotulo) }, marcados: [e.proporcao]) { p in
                            mudar { $0.proporcao = p }
                        }
                    }
                    secao("Tamanho das fotos · \(e.tamanho)%") {
                        HStack {
                            Text("Menor").tipo(Tipos.legenda11)
                            Slider(value: Binding(get: { Double(e.tamanho) }, set: { v in mudar { $0.mudarTamanho(v) } }),
                                   in: Double(TAMANHO_FOTO_MIN)...Double(TAMANHO_FOTO_MAX), step: 10)
                                .accessibilityLabel("Tamanho das fotos")
                                .accessibilityValue("\(e.tamanho) por cento")
                            Text("Maior").tipo(Tipos.legenda11)
                        }
                        Text("Fotos menores cabem mais por página.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    }
                    Toggle("Mostrar legendas", isOn: Binding(get: { e.legendas }, set: { v in mudar { $0.legendas = v } }))
                        .tint(c.acao.color)
                    if e.semana {
                        Toggle("Agrupar por dia", isOn: Binding(get: { e.agrupar }, set: { v in mudar { $0.agrupar = v } }))
                            .tint(c.acao.color)
                    }
                    listaDeFotos(e)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            }
        }
    }

    private func listaDeFotos(_ e: EscolhaFotos) -> some View {
        let c = tema.cores
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                RotuloSecao("Fotos · \(e.quantasSelecionadas) de \(e.fotos.count)\(e.fotos.count > e.limite ? " (máx. \(e.limite))" : "")")
                Spacer()
                Button("Todas") { mudar { if let m = $0.selecionarTodas() { aviso = m } } }
                Button("Nenhuma") { mudar { $0.nenhuma() } }
            }
            .font(Tipos.corpo13.comPeso(.seminegrito).font)
            ForEach(e.grupos) { g in
                if let r = g.rotulo { Text(r).tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.tinta2.color) }
                ForEach(g.ids, id: \.self) { id in linhaFoto(e, id) }
            }
        }
    }

    private func linhaFoto(_ e: EscolhaFotos, _ id: String) -> some View {
        let c = tema.cores
        let f = e.fotos.first { $0.id == id }
        let on = e.marcada(id)
        return HStack(spacing: 10) {
            Button { mudar { if let m = $0.alternar(id) { aviso = m } } } label: {
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22)).foregroundColor(on ? c.acaoTinta.color : c.tinta3.color)
                    .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
            }
            .accessibilityLabel(on ? "Tirar \(e.legenda(id)) do relatório" : "Incluir \(e.legenda(id)) no relatório")
            Group {
                if let d = bytesDaMiniatura(f?.thumb), let img = UIImage(data: d) {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    Rectangle().fill(c.skeleton.color)
                }
            }
            .frame(width: 64, height: 48).clipShape(RoundedRectangle(cornerRadius: 6))
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                TextField("Legenda", text: Binding(get: { e.legenda(id) }, set: { v in mudar { $0.editarLegenda(id, v) } }))
                    .tipo(Tipos.corpo13)
                    .accessibilityLabel("Legenda da foto")
                Text(f?.origem ?? "Anexo do dia").tipo(Tipos.legenda11).foregroundColor(c.tinta3.color).lineLimit(1)
            }
            VStack(spacing: 0) {
                Button { mudar { $0.mover(id, -1) } } label: { Image(systemName: "chevron.up").frame(width: 36, height: 30) }
                    .disabled(!e.podeMover(id, -1)).accessibilityLabel("Subir")
                Button { mudar { $0.mover(id, 1) } } label: { Image(systemName: "chevron.down").frame(width: 36, height: 30) }
                    .disabled(!e.podeMover(id, 1)).accessibilityLabel("Descer")
            }
        }
        .padding(6)
        .background(RoundedRectangle(cornerRadius: 12).fill(c.superficie.color))
    }

    // MARK: prévia

    @ViewBuilder
    private var previa: some View {
        let c = tema.cores
        ZStack {
            if let h = html, (escolha?.quantasSelecionadas ?? 0) > 0 {
                WebViewHTML(html: h)
            } else if (escolha?.quantasSelecionadas ?? 0) == 0 {
                EstadoVazio(icone: "photo.on.rectangle", titulo: "Sem fotos", texto: "O relatório sai sem a seção de fotos.")
            } else if let e = erroPrevia {
                EstadoVazio(icone: "exclamationmark.triangle", titulo: "Prévia indisponível", texto: e)
            }
            if carregandoPrevia { ProgressView().padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(c.neutroFundo.color)
    }

    // MARK: rodapé

    private var rodape: some View {
        VStack(spacing: 8) {
            if exportar.ocupado { ProgressView("Gerando o PDF…") }
            HStack(spacing: 8) {
                Botao(texto: "Sem fotos", variante: .neutro, habilitado: !exportar.ocupado) { gerar(.semFotos) }
                Botao(texto: "Automático", variante: .neutro, habilitado: !exportar.ocupado) { gerar(.automatico) }
            }
            Botao(texto: "Gerar PDF", habilitado: !exportar.ocupado) { gerar(.escolhidas) }
        }
        .padding(16)
        .background(tema.cores.superficie.color.ignoresSafeArea(edges: .bottom))
    }

    private func gerar(_ modo: ModoExportarFotos) {
        guard let s = exportar.fotos else { return }
        Task { await exportar.gerarDasFotos(s, modo: modo) }
    }

    private func secao<C: View>(_ t: String, @ViewBuilder _ conteudo: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            RotuloSecao(t)
            conteudo()
        }
    }

    private func cartaoOpcao(_ titulo: String, _ dica: String, on: Bool, _ acao: @escaping () -> Void) -> some View {
        let c = tema.cores
        return Button(action: acao) {
            VStack(spacing: 2) {
                Text(titulo).font(Tipos.corpo15.comPeso(.seminegrito).font)
                Text(dica).tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
            }
            .frame(maxWidth: .infinity, minHeight: 56)
            .foregroundColor(on ? c.acaoTinta.color : c.tinta.color)
            .background(RoundedRectangle(cornerRadius: 12).fill(on ? c.acaoSuave.color : c.superficie.color))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(on ? c.acaoTinta.color : c.borda.color, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

// MARK: ficha do dia na tela

struct FichaDoDiaTela: View {
    let dia: Dia
    let contexto: ContextoClube
    let sessao: Sessao
    let servico: ServicoTreino
    let podeExportar: Bool

    @EnvironmentObject private var app: AppEstado
    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @StateObject private var exportar: ExportadorRelatorio
    @State private var html: String?
    @State private var erro: String?

    init(dia: Dia, contexto: ContextoClube, sessao: Sessao, servico: ServicoTreino, podeExportar: Bool,
         aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.dia = dia
        self.contexto = contexto
        self.sessao = sessao
        self.servico = servico
        self.podeExportar = podeExportar
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: servico, aoSessaoAcabar: aoSessaoAcabar))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                if let html {
                    WebViewHTML(html: html)
                } else if let erro {
                    EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível abrir a ficha", texto: erro,
                                acao: ("Tentar de novo", { Task { await carregar() } }))
                } else {
                    ProgressView("Montando a ficha…")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(tema.cores.neutroFundo.color.ignoresSafeArea())
            .navigationTitle("Ficha do dia")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fechar") { fechar() } }
                if podeExportar, let id = dia.id {
                    ToolbarItem(placement: .confirmationAction) {
                        Button {
                            exportar.iniciar(tipo: "sessao", corpo: corpoFichaDoDia(id), nome: nomePdfDoDia(dia),
                                             usuarioId: sessao.me.usuario.id)
                        } label: {
                            if exportar.ocupado { ProgressView() } else { Image(systemName: "square.and.arrow.up") }
                        }
                        .accessibilityLabel("Exportar a ficha em PDF")
                    }
                }
            }
        }
        .task { await carregar() }
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }

    private func carregar() async {
        guard let id = dia.id else { erro = "Nada salvo neste dia ainda."; return }
        erro = nil
        do {
            html = try await servico.api.htmlDoRelatorio("sessao", corpo: ["session_id": .texto(id), "formato": "visualizar"])
        } catch {
            if app.controle.tratarErro(error, token: sessao.token) { return }
            erro = mensagemDeErro(error)
        }
    }
}

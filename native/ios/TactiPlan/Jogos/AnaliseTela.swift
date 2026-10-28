import SwiftUI
import PhotosUI
import UIKit
import TactiPlanKit

// Análise do adversário no app: lista das 13 seções (● = preenchida) → formulário da seção, gerado
// pelo esquema do Kit (Analise.swift), o mesmo do web. Salvar = PUT; exportar (PDF sem vídeos ou
// PowerPoint com vídeos) salva antes. Escudo (Capa) e vídeos de cada seção sobem na hora.
// Android: ui/jogos/AnaliseTela.kt.

@MainActor
final class AnaliseModelo: ObservableObject {
    @Published var dados: Json?
    @Published var erro: String?
    @Published var sujo = false
    @Published var salvando = false
    @Published var aviso: String?
    @Published var midias: [MidiaAnalise] = []
    @Published var enviando: Double?

    let sessaoId: String
    let api: ApiJogo
    let treino: ApiTreino?
    let aoSessaoAcabar: (Error) -> Bool

    init(sessaoId: String, api: ApiJogo, treino: ApiTreino? = nil, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessaoId = sessaoId; self.api = api; self.treino = treino; self.aoSessaoAcabar = aoSessaoAcabar
    }

    func carregar() async {
        do { dados = try await api.analise(sessaoId) } catch {
            if !aoSessaoAcabar(error) { erro = mensagemDeErro(error) }
        }
        if let treino { midias = (try? await treino.midiasDaAnalise(sessaoId)) ?? [] }
    }

    /// Escudo (tipo "escudo") ou vídeo da seção (tipo "video").
    func enviar(_ arquivo: ArquivoUpload, tipo: String, secao: String?) async {
        guard let treino else { return }
        if let p = problemaMidiaAnalise(tipo: tipo, mime: arquivo.tipo, tamanho: arquivo.dados.count,
                                        videosNaAnalise: midias.filter { $0.tipo == "video" }.count) { aviso = p; return }
        enviando = 0
        defer { enviando = nil }
        do {
            midias = try await treino.enviarMidiaAnalise(sessaoId, tipo: tipo, secao: secao,
                                                         titulo: tipo == "video" ? tituloDoVideo(arquivo.nome) : nil,
                                                         arquivo: arquivo) { [modelo = self] p in Task { @MainActor in modelo.enviando = p } }
            aviso = tipo == "escudo" ? "Escudo salvo." : "Vídeo adicionado."
        } catch {
            if !aoSessaoAcabar(error) { aviso = mensagemDeErro(error) }
        }
    }

    /// Vídeo grande: só o link (sai clicável no PDF e no PowerPoint).
    func adicionarLink(_ url: String, titulo: String, secao: String) async -> Bool {
        guard let treino else { return false }
        if let p = problemaLinkVideo(url, linksNaAnalise: midias.filter { $0.tipo == "link" }.count) { aviso = p; return false }
        do {
            midias = try await treino.adicionarLinkAnalise(sessaoId, secao: secao, titulo: titulo,
                                                           url: url.trimmingCharacters(in: .whitespacesAndNewlines))
            aviso = "Link adicionado."
            return true
        } catch {
            if !aoSessaoAcabar(error) { aviso = mensagemDeErro(error) }
            return false
        }
    }

    func remover(_ m: MidiaAnalise) async {
        guard let treino else { return }
        do { midias = try await treino.apagarMidiaAnalise(sessaoId, midiaId: m.id) } catch {
            if !aoSessaoAcabar(error) { aviso = mensagemDeErro(error) }
        }
    }

    func mudar(_ novo: Json) { dados = novo; sujo = true }

    @discardableResult
    func salvar() async -> Bool {
        guard let d = dados else { return false }
        salvando = true
        defer { salvando = false }
        do {
            dados = try await api.salvarAnalise(sessaoId, dados: d)
            sujo = false
            aviso = "Análise salva."
            return true
        } catch {
            if !aoSessaoAcabar(error) { aviso = mensagemDeErro(error) }
            return false
        }
    }
}

struct AnaliseTela: View {
    let sessaoId: String
    let adversario: String
    let data: String
    let podeEditar: Bool
    let usuarioId: String
    @StateObject private var modelo: AnaliseModelo
    @StateObject private var exportar: ExportadorRelatorio
    @Environment(\.tema) private var tema
    @Environment(\.dismiss) private var fechar
    @State private var confirmarSaida = false

    init(sessaoId: String, adversario: String, data: String, podeEditar: Bool, usuarioId: String,
         api: ApiJogo, treino: ServicoTreino, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessaoId = sessaoId; self.adversario = adversario; self.data = data
        self.podeEditar = podeEditar; self.usuarioId = usuarioId
        _modelo = StateObject(wrappedValue: AnaliseModelo(sessaoId: sessaoId, api: api, treino: treino.api, aoSessaoAcabar: aoSessaoAcabar))
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: treino, aoSessaoAcabar: aoSessaoAcabar))
    }

    /// PDF (sem vídeos) ou PowerPoint (com os vídeos de cada seção).
    private func gerarPdf(pptx: Bool = false) {
        Task {
            if modelo.sujo && podeEditar { guard await modelo.salvar() else { return } }
            let nome = nomePdfAnalise(adversario: adversario, data: data, extensao: pptx ? "pptx" : "pdf")
            if pptx { exportar.gerarPptxAnalise(sessaoId: sessaoId, nome: nome) }
            else { exportar.iniciar(tipo: "analise", corpo: corpoRelatorioJogo(sessaoId), nome: nome, usuarioId: usuarioId) }
        }
    }

    var body: some View {
        let c = tema.cores
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let a = modelo.aviso { Text(a).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color) }
                if let e = modelo.erro {
                    Text(e).tipo(Tipos.corpo15).foregroundColor(c.erroTinta.color)
                } else if let d = modelo.dados {
                    Text("O relatório mostra só o que estiver preenchido.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    ListaAgrupada {
                        ForEach(Array(SECOES_ANALISE.enumerated()), id: \.element.chave) { i, s in
                            if i > 0 { Divisoria() }
                            NavigationLink {
                                SecaoAnaliseTela(secao: s, modelo: modelo, podeEditar: podeEditar, adversario: adversario)
                            } label: {
                                HStack(spacing: 10) {
                                    Circle().fill(secaoPreenchida(d, s.chave) ? c.acao.color : c.borda.color).frame(width: 8, height: 8)
                                    Text(s.titulo).tipo(Tipos.corpo15).foregroundColor(c.tinta.color)
                                    Spacer()
                                    Seta()
                                }
                                .frame(minHeight: 50)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(s.titulo)\(secaoPreenchida(d, s.chave) ? ", preenchida" : "")")
                        }
                    }
                    Botao(texto: exportar.ocupado ? "Gerando…" : "PDF (sem vídeos)", variante: .secundario) { gerarPdf() }
                        .disabled(exportar.ocupado)
                    Botao(texto: "PowerPoint (com vídeos)", variante: .secundario) { gerarPdf(pptx: true) }
                        .disabled(exportar.ocupado)
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(24)
                }
            }
            .padding(16)
        }
        .background(c.fundo.color.ignoresSafeArea())
        .navigationTitle("Análise · \(adversario)")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(modelo.sujo && podeEditar)
        .toolbar {
            if modelo.sujo && podeEditar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { confirmarSaida = true } label: { HStack(spacing: 4) { Image(systemName: "chevron.left"); Text("Jogo") } }
                }
            }
            ToolbarItemGroup(placement: .navigationBarTrailing) {
                Menu {
                    Button("PDF (sem vídeos)") { gerarPdf() }
                    Button("PowerPoint (com vídeos)") { gerarPdf(pptx: true) }
                } label: {
                    if exportar.ocupado { ProgressView() } else { Image(systemName: "square.and.arrow.up") }
                }
                .accessibilityLabel("Exportar a análise")
                .disabled(modelo.dados == nil || exportar.ocupado)
                if podeEditar {
                    Button { Task { await modelo.salvar() } } label: {
                        if modelo.salvando { ProgressView() } else { Text("Salvar").font(Tipos.corpo15.comPeso(.seminegrito).font) }
                    }
                    .disabled(!modelo.sujo || modelo.salvando)
                }
            }
        }
        .confirmationDialog("Sair sem salvar?", isPresented: $confirmarSaida, titleVisibility: .visible) {
            Button("Salvar e sair") { Task { if await modelo.salvar() { fechar() } } }
            Button("Descartar", role: .destructive) { fechar() }
            Button("Continuar editando", role: .cancel) {}
        } message: { Text("As alterações da análise ainda não foram salvas.") }
        .task { await modelo.carregar() }
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }
}

/// Formulário de UMA seção (campos do esquema).
struct SecaoAnaliseTela: View {
    let secao: SecaoAnalise
    @ObservedObject var modelo: AnaliseModelo
    let podeEditar: Bool
    var adversario: String = ""
    @Environment(\.tema) private var tema

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let a = modelo.aviso { Text(a).tipo(Tipos.corpo13).foregroundColor(tema.cores.tinta2.color) }
                if secao.chave == "capa" { EscudoAnalise(modelo: modelo, podeEditar: podeEditar, adversario: adversario) }
                ForEach(Array(secao.campos.enumerated()), id: \.offset) { _, campo in
                    campoView(campo, base: [])
                }
                if secao.chave != "capa" { VideosDaSecao(secao: secao.chave, modelo: modelo, podeEditar: podeEditar) }
            }
            .padding(16)
        }
        .background(tema.cores.fundo.color.ignoresSafeArea())
        .navigationTitle(secao.titulo)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if podeEditar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { Task { await modelo.salvar() } } label: {
                        if modelo.salvando { ProgressView() } else { Text("Salvar").font(Tipos.corpo15.comPeso(.seminegrito).font) }
                    }
                    .disabled(!modelo.sujo || modelo.salvando)
                }
            }
        }
    }

    // MARK: campos

    private func texto(_ p: [String], max: Int) -> Binding<String> {
        Binding(get: { textoEm(modelo.dados, p) }, set: { modelo.mudar(gravarEm(modelo.dados, p, .texto(String($0.prefix(max))))) })
    }

    private func rotulo(_ r: String) -> some View {
        RotuloSecao(r).padding(.horizontal, 4)
    }

    private func multilinha(_ r: String, dica: String, valor: Binding<String>) -> some View {
        let c = tema.cores
        return VStack(alignment: .leading, spacing: 6) {
            rotulo(r)
            TextField(dica, text: valor, axis: .vertical)
                .lineLimit(3...10)
                .font(Tipos.corpo15.font)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous).fill(c.superficie.color))
                .overlay(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous).stroke(c.borda.color))
                .disabled(!podeEditar)
        }
    }

    private func campoView(_ campo: CampoAnalise, base: [String]) -> AnyView {
        let c = tema.cores
        switch campo {
        case .aviso(let t):
            return AnyView(Text(t).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color))
        case .texto(let r, let p, let dica, let max):
            return AnyView(VStack(alignment: .leading, spacing: 6) {
                rotulo(r)
                Campo(dica: dica.isEmpty ? r : dica, valor: texto(base + p, max: max), habilitado: podeEditar)
            })
        case .numero(let r, let p, let max):
            let caminho = base + p
            let b = Binding<String>(
                get: { numeroEm(modelo.dados, caminho).map(String.init) ?? "" },
                set: { s in
                    let v = Int(String(s.filter(\.isNumber).prefix(3))).map { min($0, max) }
                    modelo.mudar(gravarEm(modelo.dados, caminho, v.map { .numero(Double($0)) } ?? .nulo))
                })
            return AnyView(VStack(alignment: .leading, spacing: 6) {
                rotulo(r)
                Campo(dica: r, valor: b, teclado: .numberPad, habilitado: podeEditar)
            })
        case .textoLongo(let r, let p, let dica):
            return AnyView(multilinha(r, dica: dica, valor: texto(base + p, max: 600)))
        case .lista(let r, let p, let dica):
            let caminho = base + p
            let b = Binding<String>(get: { listaComoTexto(modelo.dados, caminho) },
                                    set: { modelo.mudar(gravarEm(modelo.dados, caminho, textoComoLista($0))) })
            return AnyView(multilinha(r, dica: dica, valor: b))
        case .escolha(let r, let p, let opcoes):
            let caminho = base + p
            let atual = textoEm(modelo.dados, caminho)
            return AnyView(VStack(alignment: .leading, spacing: 6) {
                rotulo(r)
                Menu {
                    ForEach(opcoes, id: \.self) { o in
                        Button { modelo.mudar(gravarEm(modelo.dados, caminho, .texto(o.valor))) } label: {
                            if o.valor == atual { Label(o.rotulo, systemImage: "checkmark") } else { Text(o.rotulo) }
                        }
                    }
                } label: {
                    HStack {
                        Text(opcoes.first { $0.valor == atual }?.rotulo ?? "—").foregroundColor(c.tinta.color).lineLimit(1)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").foregroundColor(c.tinta3.color)
                    }
                    .font(Tipos.corpo15.font)
                    .padding(.horizontal, 16).frame(minHeight: 50)
                    .background(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous).fill(c.superficie.color))
                    .overlay(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous).stroke(c.borda.color))
                }
                .disabled(!podeEditar)
            })
        case .repetir(let r, let p, let item, let max, let campos):
            let caminho = base + p
            var lista: [Json] = []
            if case .lista(let l)? = lerEm(modelo.dados, caminho) { lista = l }
            return AnyView(VStack(alignment: .leading, spacing: 10) {
                rotulo(r)
                ForEach(Array(lista.indices), id: \.self) { i in
                    Cartao {
                        HStack {
                            Text("\(item) \(i + 1)").font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                            Spacer()
                            if podeEditar {
                                Button(role: .destructive) {
                                    var nova = lista; nova.remove(at: i)
                                    modelo.mudar(gravarEm(modelo.dados, caminho, .lista(nova)))
                                } label: { Image(systemName: "trash") }
                                .accessibilityLabel("Remover \(item.lowercased()) \(i + 1)")
                            }
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(Array(campos.enumerated()), id: \.offset) { _, sub in
                                campoView(sub, base: caminho + [String(i)])
                            }
                        }
                    }
                }
                if podeEditar && lista.count < max {
                    Botao(texto: "Adicionar \(item.lowercased())", variante: .secundario) {
                        modelo.mudar(gravarEm(modelo.dados, caminho, .lista(lista + [.objeto([:])])))
                    }
                }
            })
        case .escalacao:
            let fp = ["escalacao", "formacao"]
            let vagas = vagasLivres(textoEm(modelo.dados, fp))
            return AnyView(VStack(alignment: .leading, spacing: 8) {
                rotulo("Formação do adversário")
                Campo(dica: "Ex.: 4-3-3", valor: texto(fp, max: 12), habilitado: podeEditar)
                if vagas.count <= 1 {
                    Text("Informe a formação para preencher os titulares no campo.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                } else {
                    rotulo("Titulares (da defesa para o ataque, da esquerda para a direita)")
                    ForEach(vagas) { v in
                        HStack(spacing: 8) {
                            Text(PAPEL_VAGA[v.papel] ?? v.papel).font(Tipos.corpo13.comPeso(.negrito).font).foregroundColor(c.tinta2.color)
                                .frame(width: 64, alignment: .leading)
                            Campo(dica: "Nº", valor: Binding(
                                get: { jogadorDaVaga(modelo.dados, v.vaga)?["numero"]?.numero.map { String(Int($0)) } ?? "" },
                                set: { s in
                                    let n = Int(String(s.filter(\.isNumber).prefix(2)))
                                    modelo.mudar(mudarJogadorDaVaga(modelo.dados, v.vaga, "numero", n.map { .numero(Double($0)) } ?? .nulo))
                                }), teclado: .numberPad, habilitado: podeEditar)
                                .frame(width: 76)
                            Campo(dica: "Nome", valor: Binding(
                                get: { jogadorDaVaga(modelo.dados, v.vaga)?["nome"]?.texto ?? "" },
                                set: { modelo.mudar(mudarJogadorDaVaga(modelo.dados, v.vaga, "nome", .texto(String($0.prefix(80))))) }),
                                  habilitado: podeEditar)
                        }
                    }
                }
            })
        }
    }
}

// MARK: escudo e vídeos (migration 063)

/// Escudo do adversário (capa e topo de cada página). Sobe como PNG (mantém o fundo transparente).
struct EscudoAnalise: View {
    @ObservedObject var modelo: AnaliseModelo
    let podeEditar: Bool
    let adversario: String
    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema
    @State private var item: PhotosPickerItem?

    var body: some View {
        let c = tema.cores
        let escudo = modelo.midias.first { $0.tipo == "escudo" }
        HStack(spacing: 12) {
            Group {
                if let s = urlDoServidor(escudo?.url, base: app.base), let u = URL(string: s) {
                    AsyncImage(url: u) { f in if let i = f.image { i.resizable().scaledToFit() } else { AvatarIniciais(nome: adversario, tamanho: 56) } }
                } else { AvatarIniciais(nome: adversario, tamanho: 56) }
            }
            .frame(width: 56, height: 56)
            VStack(alignment: .leading, spacing: 4) {
                Text("Escudo do adversário").font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                Text("Aparece na capa e no topo de cada página.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                if podeEditar {
                    HStack(spacing: 16) {
                        PhotosPicker(selection: $item, matching: .images) {
                            Text(modelo.enviando != nil ? "Enviando… \(Int((modelo.enviando ?? 0) * 100))%" : (escudo == nil ? "Enviar imagem" : "Trocar"))
                        }
                        .disabled(modelo.enviando != nil)
                        if let escudo {
                            Button("Remover", role: .destructive) { Task { await modelo.remover(escudo) } }
                                .disabled(modelo.enviando != nil)
                        }
                    }
                    .font(Tipos.corpo15.font)
                }
            }
        }
        .onChange(of: item) { novo in
            guard let novo else { return }
            item = nil
            Task {
                guard let d = try? await novo.loadTransferable(type: Data.self), let png = escudoPng(d) else {
                    modelo.aviso = "Não foi possível ler a imagem."; return
                }
                await modelo.enviar(ArquivoUpload(nome: "escudo.png", tipo: "image/png", dados: png), tipo: "escudo", secao: nil)
            }
        }
    }
}

/// Imagem → PNG de até 600 px (escudo leve, com transparência).
func escudoPng(_ dados: Data) -> Data? {
    guard let img = UIImage(data: dados) else { return nil }
    let lado = max(img.size.width, img.size.height)
    let escala = lado > 600 ? 600 / lado : 1
    let tam = CGSize(width: (img.size.width * escala).rounded(), height: (img.size.height * escala).rounded())
    let formato = UIGraphicsImageRendererFormat.default()
    formato.scale = 1
    formato.opaque = false
    return UIGraphicsImageRenderer(size: tam, format: formato).image { _ in img.draw(in: CGRect(origin: .zero, size: tam)) }.pngData()
}

/// Vídeos da seção: arquivo (até 50 MB) só no PowerPoint; vídeo grande vai por link, clicável no PDF e no PowerPoint.
struct VideosDaSecao: View {
    let secao: String
    @ObservedObject var modelo: AnaliseModelo
    let podeEditar: Bool
    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema
    @State private var item: PhotosPickerItem?
    @State private var link = ""
    @State private var tituloLink = ""

    var body: some View {
        let c = tema.cores
        let lista = modelo.midias.filter { ($0.tipo == "video" || $0.tipo == "link") && $0.secao == secao }
        if podeEditar || !lista.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                RotuloSecao("Vídeos desta seção").padding(.horizontal, 4)
                Text("Arquivo (MP4 ou MOV até 50 MB) vai embutido só no PowerPoint. Vídeo maior: cole o link (YouTube, Drive…) — sai clicável no PDF e no PowerPoint.")
                    .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                ForEach(lista) { m in
                    HStack {
                        Image(systemName: m.tipo == "link" ? "link" : "film").foregroundColor(c.tinta3.color)
                        if let s = urlDoServidor(m.url, base: app.base), let u = URL(string: s) {
                            Link(m.titulo ?? (m.tipo == "link" ? m.url : "Vídeo"), destination: u).font(Tipos.corpo15.font).lineLimit(1)
                        } else { Text(m.titulo ?? "Vídeo").tipo(Tipos.corpo15) }
                        Spacer()
                        if podeEditar {
                            Button(role: .destructive) { Task { await modelo.remover(m) } } label: { Image(systemName: "trash") }
                                .accessibilityLabel("Remover vídeo")
                        }
                    }
                }
                if podeEditar {
                    PhotosPicker(selection: $item, matching: .videos) {
                        Text(modelo.enviando != nil ? "Enviando… \(Int((modelo.enviando ?? 0) * 100))%" : "Enviar arquivo de vídeo")
                            .font(Tipos.corpo15.comPeso(.seminegrito).font)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous).stroke(c.borda.color))
                    }
                    .disabled(modelo.enviando != nil)
                    Campo(dica: "Ou cole o link do vídeo (https://…)", valor: $link, teclado: .URL)
                    Campo(dica: "Título do link (opcional)", valor: $tituloLink)
                    Botao(texto: "Adicionar link", variante: .secundario) {
                        Task { if await modelo.adicionarLink(link, titulo: tituloLink, secao: secao) { link = ""; tituloLink = "" } }
                    }
                    .disabled(link.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: item) { novo in
                guard let novo else { return }
                item = nil
                Task {
                    let video = novo.supportedContentTypes.first { $0.conforms(to: .movie) }
                    guard let d = try? await novo.loadTransferable(type: Data.self) else { modelo.aviso = "Não foi possível ler o vídeo."; return }
                    let mp4 = video?.conforms(to: .mpeg4Movie) == true
                    let nome = "video-\(Int(Date().timeIntervalSince1970)).\(mp4 ? "mp4" : "mov")"
                    await modelo.enviar(ArquivoUpload(nome: nome, tipo: mp4 ? "video/mp4" : "video/quicktime", dados: d), tipo: "video", secao: secao)
                }
            }
        }
    }
}

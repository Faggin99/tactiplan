import SwiftUI
import UIKit
import PhotosUI
import UniformTypeIdentifiers
import TactiPlanKit

// Paridade com o web de 27/11/2026 (native/PARIDADE-27-11.md), as telas que só existem no iPhone:
// - ANEXOS DA SESSÃO (cartão no Dia, por período, depois dos blocos);
// - ARQUIVOS DA SEMANA (clipe na barra da Semana → folha);
// - SESSÕES SALVAS (Mais › Treino › Sessões salvas: lista, detalhe, renomear, excluir e "Usar em um dia";
//   no Dia: "Salvar sessão" e "Usar sessão salva" no menu);
// - ESCUDOS do jogo (mandante primeiro × visitante, horário embaixo).
// A regra toda vem do Kit (SessoesSalvas.swift, ArquivosTreino.swift, EscudosJogo.swift).

// MARK: escolher arquivo (câmera, fotos, Arquivos: PDF, planilha, Word, PowerPoint, CSV)

/// Tipos do seletor de Arquivos dos anexos da sessão e dos arquivos da semana.
let TIPOS_SELETOR_TREINO: [UTType] = [.pdf, .spreadsheet, .presentation, .commaSeparatedText, .image, .movie] + [
    "org.openxmlformats.wordprocessingml.document", "com.microsoft.word.doc",
    "org.openxmlformats.spreadsheetml.sheet", "com.microsoft.excel.xls",
    "org.openxmlformats.presentationml.presentation", "com.microsoft.powerpoint.ppt",
].compactMap { UTType($0) }

extension AnexosIOS {
    /// Arquivo escolhido em Arquivos (qualquer tipo aceito no treino), como veio.
    static func arquivoTreino(_ url: URL) -> PreparoAnexo {
        let liberou = url.startAccessingSecurityScopedResource()
        defer { if liberou { url.stopAccessingSecurityScopedResource() } }
        guard let d = try? Data(contentsOf: url) else { return .falhou(MSG_ILEGIVEL) }
        let nome = url.lastPathComponent
        guard let tipo = mimeDoArquivo(nome) else { return .falhou(MSG_ARQUIVO_TIPO) }
        if let p = problemaDoArquivoTreino(tipo: tipo, tamanho: d.count) { return .falhou(p) }
        return .pronto(AnexoNovo(nome: nome, tipo: tipo, tamanho: d.count), ArquivoUpload(nome: nome, tipo: tipo, dados: d))
    }
}

/// Câmera, galeria e Arquivos ligados a uma tela; cada arquivo pronto chega em `aoEscolher`.
struct SeletorArquivosTreino: ViewModifier {
    @Binding var camera: Bool
    @Binding var arquivos: Bool
    @Binding var galeria: [PhotosPickerItem]
    let aoEscolher: (ArquivoUpload) -> Void
    let aoFalhar: (String) -> Void

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $camera) {
                CameraFoto { img in
                    camera = false
                    if let img { Task { @MainActor in tratar(await AnexosIOS.foto(img)) } }
                }
                .ignoresSafeArea()
            }
            .fileImporter(isPresented: $arquivos, allowedContentTypes: TIPOS_SELETOR_TREINO, allowsMultipleSelection: false) { r in
                if case .success(let urls) = r, let u = urls.first { tratar(AnexosIOS.arquivoTreino(u)) }
            }
            .onChange(of: galeria) { itens in
                guard !itens.isEmpty else { return }
                galeria = []
                Task { @MainActor in for i in itens { tratar(await AnexosIOS.item(i)) } }
            }
    }

    private func tratar(_ p: PreparoAnexo) {
        switch p {
        case .falhou(let m): aoFalhar(m)
        case .pronto(_, let a): aoEscolher(a)
        }
    }
}

/// Os três botões de enviar (Câmera · Fotos · Arquivo), no estilo dos anexos da atividade.
struct BotoesEnviarTreino: View {
    @Binding var camera: Bool
    @Binding var arquivos: Bool
    @Binding var galeria: [PhotosPickerItem]
    var maximo: Int = 1
    var desabilitado = false
    @Environment(\.tema) private var tema

    var body: some View {
        HStack(spacing: 8) {
            if AnexosIOS.temCamera {
                Button { camera = true } label: { rotulo("Câmera", "camera") }.buttonStyle(.plain).disabled(desabilitado)
            }
            PhotosPicker(selection: $galeria, maxSelectionCount: max(1, maximo), matching: .any(of: [.images, .videos])) {
                rotulo("Fotos", "photo.on.rectangle")
            }
            .disabled(desabilitado)
            Button { arquivos = true } label: { rotulo("Arquivo", "doc") }.buttonStyle(.plain).disabled(desabilitado)
        }
        .opacity(desabilitado ? 0.5 : 1)
    }

    private func rotulo(_ t: String, _ i: String) -> some View {
        let c = tema.cores
        return Label(t, systemImage: i)
            .font(Tipos.corpo13.comPeso(.seminegrito).font)
            .frame(maxWidth: .infinity, minHeight: ALVO_TOQUE)
            .foregroundColor(c.acaoTinta.color)
            .background(RoundedRectangle(cornerRadius: 12).stroke(c.acaoTinta.color, lineWidth: 1.5))
    }
}

/// Ícone por espécie de arquivo do treino.
func iconeDoArquivo(_ e: EspecieArquivo) -> String {
    switch e {
    case .foto: return "photo"
    case .video: return "video"
    case .planilha: return "tablecells"
    case .documento: return "doc.text"
    case .outro: return "paperclip"
    }
}

/// Uma linha de arquivo (ícone, título, detalhe, ver e apagar).
struct LinhaArquivoTreino: View {
    let icone: String
    let titulo: String
    let detalhe: String
    let aoVer: () -> Void
    var aoApagar: (() -> Void)?
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        HStack(spacing: 10) {
            Button(action: aoVer) {
                HStack(spacing: 10) {
                    Image(systemName: icone).font(.system(size: 17)).foregroundColor(c.acaoTinta.color)
                        .frame(width: 36, height: 36).background(RoundedRectangle(cornerRadius: 8).fill(c.acaoSuave.color))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(titulo).font(Tipos.corpo15.comPeso(.medio).font).foregroundColor(c.tinta.color).lineLimit(2)
                        if !detalhe.isEmpty { Text(detalhe).tipo(Tipos.legenda11).foregroundColor(c.tinta2.color) }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Abre o arquivo")
            if let aoApagar {
                Button(action: aoApagar) { Image(systemName: "trash").frame(width: ALVO_TOQUE, height: ALVO_TOQUE) }
                    .foregroundColor(c.erroTinta.color)
                    .accessibilityLabel("Apagar \(titulo)")
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: anexos da sessão (Dia, por período)

struct AnexosDaSessaoCartao: View {
    let periodo: Dia
    let semana: SemanaISO
    let clubeId: String
    let servico: ServicoTreino
    let base: String
    let podeEnviar: Bool
    let podeApagar: Bool
    let aoSessaoAcabar: (Error) -> Bool
    /// Subiu/apagou: o Dia recarrega (o período pode ter acabado de ser criado).
    let aoMudar: () -> Void

    @Environment(\.tema) private var tema
    @State private var lista: [Anexo] = []
    @State private var enviando = 0
    @State private var aviso: String?
    @State private var apagar: Anexo?
    @State private var vendo: ArquivoLocal?
    @State private var camera = false
    @State private var arquivos = false
    @State private var galeria: [PhotosPickerItem] = []
    // link (28/11): YouTube, Drive… sem arquivo
    @State private var pedindoLink = false
    @State private var linkUrl = ""
    @State private var linkTitulo = ""
    @Environment(\.openURL) private var abrirURL

    var body: some View {
        let c = tema.cores
        let cheio = lista.count >= MAX_ANEXOS_SESSAO
        Cartao {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Anexos da sessão", systemImage: "folder").font(Tipos.corpo15.comPeso(.seminegrito).font)
                        .foregroundColor(c.tinta.color)
                    Spacer()
                    if enviando > 0 { ProgressView().accessibilityLabel("Enviando") }
                    Text("\(lista.count)/\(MAX_ANEXOS_SESSAO)").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                }
                Text(TEXTO_ANEXOS_SESSAO).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(lista) { a in
                    LinhaArquivoTreino(icone: a.ehLink ? "link" : iconeDoArquivo(especieDoArquivo(a.tipo)), titulo: a.rotulo,
                                       detalhe: a.ehLink ? hostDoLink(a.caminho) : tamanhoLegivel(a.tamanho), aoVer: { ver(a) },
                                       aoApagar: podeApagar ? { apagar = a } : nil)
                }
                if podeEnviar {
                    if cheio { Text(MSG_MAX_ANEXOS_SESSAO).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color) }
                    BotoesEnviarTreino(camera: $camera, arquivos: $arquivos, galeria: $galeria,
                                       maximo: MAX_ANEXOS_SESSAO - lista.count, desabilitado: cheio || enviando > 0)
                    Button {
                        linkUrl = ""; linkTitulo = ""; pedindoLink = true
                    } label: {
                        Label("Link", systemImage: "link")
                            .font(Tipos.corpo13.comPeso(.seminegrito).font)
                            .frame(maxWidth: .infinity, minHeight: ALVO_TOQUE)
                            .foregroundColor(c.acaoTinta.color)
                            .background(RoundedRectangle(cornerRadius: 12).stroke(c.acaoTinta.color, lineWidth: 1.5))
                    }
                    .buttonStyle(.plain)
                    .disabled(cheio || enviando > 0)
                    .opacity(cheio || enviando > 0 ? 0.5 : 1)
                }
            }
        }
        .task(id: periodo.id ?? "") { await carregar() }
        .modifier(SeletorArquivosTreino(camera: $camera, arquivos: $arquivos, galeria: $galeria,
                                        aoEscolher: { enviar($0) }, aoFalhar: { aviso = $0 }))
        .confirmationDialog("Apagar este anexo?", isPresented: Binding(get: { apagar != nil }, set: { if !$0 { apagar = nil } }),
                            titleVisibility: .visible) {
            Button("Apagar", role: .destructive) { if let a = apagar { remover(a) } }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("Esta ação não pode ser desfeita.") }
        .sheet(item: $vendo) { a in VisualizadorArquivo(url: a.url).ignoresSafeArea() }
        .alert("Adicionar link", isPresented: $pedindoLink) {
            TextField("Link (YouTube, Drive…)", text: $linkUrl)
                .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
            TextField("Título (opcional)", text: $linkTitulo)
            Button("Adicionar") { adicionarLink() }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("Vídeo, pasta ou planilha online deste treino.") }
        .avisoTemporario($aviso)
    }

    private func adicionarLink() {
        guard let url = linkValido(linkUrl) else { aviso = MSG_LINK_INVALIDO; return }
        guard lista.count + enviando < MAX_ANEXOS_SESSAO else { aviso = MSG_MAX_ANEXOS_SESSAO; return }
        let titulo = linkTitulo
        enviando += 1
        Task {
            defer { enviando -= 1 }
            do {
                let a = try await servico.adicionarLinkDaSessao(periodo, url: url, titulo: titulo, semana: semana, clubeId: clubeId)
                lista.append(a)
                if periodo.id == nil { aoMudar() }
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = mensagemErroTreino(error)
            }
        }
    }

    private func carregar() async {
        guard let id = periodo.id else { lista = []; return }
        do {
            lista = anexosDaSessao(try await servico.api.anexosDoDia(id))
        } catch is CancellationError {
        } catch {
            if aoSessaoAcabar(error) { return }
        }
    }

    private func enviar(_ arq: ArquivoUpload) {
        guard lista.count + enviando < MAX_ANEXOS_SESSAO else { aviso = MSG_MAX_ANEXOS_SESSAO; return }
        enviando += 1
        Task {
            defer { enviando -= 1 }
            do {
                let a = try await servico.enviarAnexoDaSessao(periodo, arquivo: arq, titulo: tituloDoArquivo(arq.nome),
                                                              semana: semana, clubeId: clubeId)
                lista.append(a)
                if periodo.id == nil { aoMudar() }
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = "\(arq.nome): " + mensagemErroTreino(error)
            }
        }
    }

    private func remover(_ a: Anexo) {
        apagar = nil
        Task {
            do {
                try await servico.api.apagarAnexo(a.id)
                lista.removeAll { $0.id == a.id }
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = mensagemErroTreino(error, permissao: MSG_SEM_PERMISSAO_APAGAR)
            }
        }
    }

    private func ver(_ a: Anexo) {
        if a.ehLink {
            if let s = a.caminho, let u = URL(string: s) { abrirURL(u) } else { aviso = MSG_LINK_INVALIDO }
            return
        }
        Task {
            do { vendo = ArquivoLocal(url: try await baixarAnexo(a, base: base)) } catch { aviso = "Não foi possível abrir o anexo agora." }
        }
    }
}

// MARK: arquivos da semana (folha aberta pelo clipe da Semana)

struct ArquivosSemanaFolha: View {
    @ObservedObject var modelo: SemanaModelo
    let podeEditar: Bool
    let base: String

    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State private var enviando = 0
    @State private var aviso: String?
    @State private var apagar: ArquivoSemana?
    @State private var vendo: ArquivoLocal?
    @State private var camera = false
    @State private var arquivos = false
    @State private var galeria: [PhotosPickerItem] = []

    var body: some View {
        let c = tema.cores
        let lista = modelo.arquivosSemana
        let cheio = lista.count >= MAX_ARQUIVOS_SEMANA
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(TEXTO_ARQUIVOS_SEMANA).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                        .fixedSize(horizontal: false, vertical: true)
                    if podeEditar {
                        BotoesEnviarTreino(camera: $camera, arquivos: $arquivos, galeria: $galeria,
                                           maximo: MAX_ARQUIVOS_SEMANA - lista.count, desabilitado: cheio || enviando > 0)
                        Text(cheio ? MSG_MAX_ARQUIVOS_SEMANA : "PDF, planilha, Word, PowerPoint, foto ou vídeo · até 50 MB")
                            .tipo(Tipos.legenda11).foregroundColor(c.tinta3.color)
                    }
                    if enviando > 0 { ProgressView("Enviando…") }
                    if lista.isEmpty {
                        Cartao { EstadoVazio(icone: "paperclip", titulo: "Nenhum arquivo nesta semana",
                                             texto: podeEditar ? "Envie planilhas, PDFs, fotos ou vídeos da comissão." : "Quando a comissão enviar, aparece aqui.") }
                    } else {
                        Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                            ForEach(Array(lista.enumerated()), id: \.element.id) { i, a in
                                if i > 0 { Divisoria() }
                                LinhaArquivoTreino(icone: iconeDoArquivo(especieDoArquivo(a.tipo)), titulo: a.rotulo, detalhe: a.detalhe,
                                                   aoVer: { ver(a) }, aoApagar: podeEditar ? { apagar = a } : nil)
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(c.fundo.color.ignoresSafeArea())
            .navigationTitle("Arquivos da semana")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fechar") { fechar() } } }
            .refreshable { await modelo.carregarArquivos() }
        }
        .task { await modelo.carregarArquivos() }
        .modifier(SeletorArquivosTreino(camera: $camera, arquivos: $arquivos, galeria: $galeria,
                                        aoEscolher: { enviar($0) }, aoFalhar: { aviso = $0 }))
        .confirmationDialog("Apagar este arquivo?", isPresented: Binding(get: { apagar != nil }, set: { if !$0 { apagar = nil } }),
                            titleVisibility: .visible) {
            Button("Apagar", role: .destructive) { if let a = apagar { remover(a) } }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("Esta ação não pode ser desfeita.") }
        .sheet(item: $vendo) { a in VisualizadorArquivo(url: a.url).ignoresSafeArea() }
        .avisoTemporario($aviso)
    }

    private func enviar(_ arq: ArquivoUpload) {
        enviando += 1
        let semana = modelo.semana
        Task {
            defer { enviando -= 1 }
            do {
                _ = try await modelo.servico.enviarArquivoSemana(semana, clubeId: modelo.clubeId, arquivo: arq, titulo: tituloDoArquivo(arq.nome))
                await modelo.carregarArquivos()
            } catch {
                if modelo.aoSessaoAcabar(error) { return }
                aviso = "\(arq.nome): " + mensagemErroTreino(error)
            }
        }
    }

    private func remover(_ a: ArquivoSemana) {
        apagar = nil
        Task {
            do {
                try await modelo.servico.api.apagarArquivoSemana(a.id)
                await modelo.carregarArquivos()
            } catch {
                if modelo.aoSessaoAcabar(error) { return }
                aviso = mensagemErroTreino(error)
            }
        }
    }

    private func ver(_ a: ArquivoSemana) {
        Task {
            do { vendo = ArquivoLocal(url: try await baixarAnexo(a.comoAnexo, base: base)) } catch { aviso = "Não foi possível abrir o arquivo agora." }
        }
    }
}

// MARK: escudos do jogo

/// Os dois escudos: mandante primeiro × visitante; sem imagem, a sigla numa placa (o nosso na cor do clube).
struct EscudosDoJogo: View {
    let clube: Clube?
    let jogo: Dia
    var tamanho: CGFloat = 28
    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema
    @Environment(\.colorScheme) private var esquema

    var body: some View {
        let e = escudosDoJogo(nossoNome: clube?.nome ?? "Nosso clube",
                              nossoLogo: logoDoClube(clube?.personalizacao, escuro: esquema == .dark),
                              adversario: jogo.adversario, adversarioLogo: jogo.adversarioLogo, mando: jogo.mando)
        HStack(spacing: tamanho * 0.22) {
            escudo(e.casa)
            Text("×").font(.system(size: max(12, tamanho * 0.42), weight: .bold)).foregroundColor(tema.cores.tinta2.color)
            escudo(e.fora)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(e.casa.nome) contra \(e.fora.nome)")
    }

    @ViewBuilder
    private func escudo(_ x: Escudo) -> some View {
        if let s = urlDoServidor(x.url, base: app.base), let url = URL(string: s) {
            AsyncImage(url: url) { fase in
                if let img = fase.image { img.resizable().scaledToFit() } else { placa(x) }
            }
            .frame(width: tamanho, height: tamanho)
        } else {
            placa(x)
        }
    }

    private func placa(_ x: Escudo) -> some View {
        let c = tema.cores
        let sigla = x.sigla
        return RoundedRectangle(cornerRadius: tamanho * 0.22, style: .continuous)
            .fill(x.nosso ? c.acao.color : Color(red: 0x64 / 255.0, green: 0x74 / 255.0, blue: 0x8b / 255.0))
            .frame(width: tamanho, height: tamanho)
            .overlay(Text(sigla).font(.system(size: tamanho * (sigla.count > 2 ? 0.3 : 0.38), weight: .heavy))
                .foregroundColor(x.nosso ? c.sobreAcao.color : .white)
                .minimumScaleFactor(0.5).lineLimit(1))
    }
}

// MARK: sessões salvas

@MainActor
final class SessoesSalvasModelo: ObservableObject {
    enum Estado: Equatable { case carregando, pronto, erro(String) }
    @Published private(set) var lista: [SessaoSalva] = []
    @Published private(set) var estado: Estado = .carregando
    @Published var aviso: String?
    let servico: ServicoTreino
    let aoSessaoAcabar: (Error) -> Bool

    init(servico: ServicoTreino, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.servico = servico
        self.aoSessaoAcabar = aoSessaoAcabar
    }

    func carregar() async {
        if lista.isEmpty { estado = .carregando }
        do {
            lista = try await servico.api.sessoesSalvas()
            estado = .pronto
        } catch is CancellationError {
        } catch {
            if aoSessaoAcabar(error) { return }
            if lista.isEmpty { estado = .erro(mensagemDeErro(error)) } else { aviso = mensagemDeErro(error) }
        }
    }

    func sessao(_ id: String) -> SessaoSalva? { lista.first { $0.id == id } }
}

/// Barra fina dos pilares da sessão (pilar dos blocos ponderado por minutos).
struct BarraPilaresSessao: View {
    let s: SessaoSalva
    var body: some View {
        let p = pilaresDaSessao(s)
        if !p.isEmpty {
            GeometryReader { g in
                HStack(spacing: 2) {
                    ForEach(p, id: \.pilar) { x in
                        Capsule().fill(corDoPilar(x.pilar))
                            .frame(width: max(4, (g.size.width - CGFloat(p.count - 1) * 2) * CGFloat(x.fracao)))
                    }
                }
            }
            .frame(height: 5)
            .frame(maxWidth: 180)
            .accessibilityHidden(true)
        }
    }
}

/// Mais › Treino › Sessões salvas.
struct SessoesSalvasTela: View {
    let sessao: Sessao
    let contexto: ContextoClube
    @StateObject private var modelo: SessoesSalvasModelo
    @Environment(\.tema) private var tema
    @State private var busca = ""

    init(sessao: Sessao, contexto: ContextoClube, servico: ServicoTreino, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessao = sessao
        self.contexto = contexto
        _modelo = StateObject(wrappedValue: SessoesSalvasModelo(servico: servico, aoSessaoAcabar: aoSessaoAcabar))
    }

    var body: some View {
        let c = tema.cores
        TelaGrande("Sessões salvas", empilhada: true, aoAtualizar: { await modelo.carregar() }) {
            Text(TEXTO_SESSOES_SALVAS).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                .fixedSize(horizontal: false, vertical: true)
            switch modelo.estado {
            case .carregando:
                ForEach(0..<3, id: \.self) { _ in EsqueletoLinha() }
            case .erro(let msg):
                Cartao { EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível carregar", texto: msg,
                                     acao: ("Tentar de novo", { Task { await modelo.carregar() } })) }
            case .pronto:
                if modelo.lista.isEmpty {
                    Cartao { EstadoVazio(icone: "bookmark", titulo: "Nenhuma sessão salva ainda",
                                         texto: "Monte um treino, abra o dia e use Salvar sessão. Ele aparece aqui para repetir quando quiser.") }
                } else {
                    if modelo.lista.count > 3 {
                        Campo(dica: "Buscar por nome ou atividade", valor: $busca, envio: .search)
                    }
                    let l = filtradas
                    if l.isEmpty {
                        Text("Nenhuma sessão com \"\(busca)\".").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    } else {
                        Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                            ForEach(Array(l.enumerated()), id: \.element.id) { i, s in
                                if i > 0 { Divisoria() }
                                NavigationLink {
                                    SessaoSalvaTela(id: s.id, modelo: modelo, contexto: contexto)
                                } label: { LinhaSessaoSalva(s: s) }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
        .task { await modelo.carregar() }
        .avisoTemporario($modelo.aviso)
    }

    private var filtradas: [SessaoSalva] {
        let t = dobrar(busca.trimmingCharacters(in: .whitespaces))
        guard !t.isEmpty else { return modelo.lista }
        return modelo.lista.filter { s in
            dobrar(s.nome).contains(t) || s.blocos.contains { dobrar("\($0.titulo ?? "") \($0.conteudo ?? "")").contains(t) }
        }
    }
}

struct LinhaSessaoSalva: View {
    let s: SessaoSalva
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(s.nome).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color).linhasAcessiveis(2)
                if let o = origemDaSessao(s) { Text(o).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color) }
                Text(resumoDaSessao(s)).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                BarraPilaresSessao(s: s)
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

/// Detalhe: os blocos na ordem (título, conteúdo, minutos, descrição, mídias), Renomear, Excluir, Usar em um dia.
struct SessaoSalvaTela: View {
    let id: String
    @ObservedObject var modelo: SessoesSalvasModelo
    let contexto: ContextoClube

    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema
    @Environment(\.dismiss) private var fechar
    @State private var renomeando = false
    @State private var novoNome = ""
    @State private var confirmarExcluir = false
    @State private var usando = false
    @State private var ocupado = false
    @State private var aviso: String?
    @State private var vendo: ArquivoLocal?

    private var podeEditar: Bool { contexto.podeEditar("training:edit") }

    var body: some View {
        let c = tema.cores
        Group {
            if let s = modelo.sessao(id) {
                TelaGrande(s.nome, empilhada: true) {
                    VStack(alignment: .leading, spacing: 4) {
                        if let o = origemDaSessao(s) { Text(o).tipo(Tipos.corpo13.comPeso(.medio)).foregroundColor(c.tinta2.color) }
                        Text(resumoDaSessao(s)).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                        BarraPilaresSessao(s: s)
                    }
                    if podeEditar, contexto.clube != nil {
                        Botao(texto: "Usar em um dia", habilitado: !ocupado) { usando = true }
                    }
                    ForEach(s.blocos, id: \.ordem) { b in cartaoBloco(b) }
                    Text(rodape(s)).tipo(Tipos.legenda11).foregroundColor(c.tinta3.color)
                }
                .toolbar {
                    if podeEditar {
                        ToolbarItem(placement: .navigationBarTrailing) {
                            Menu {
                                Button { novoNome = s.nome; renomeando = true } label: { Label("Renomear", systemImage: "pencil") }
                                Button(role: .destructive) { confirmarExcluir = true } label: { Label("Excluir", systemImage: "trash") }
                            } label: { Image(systemName: "ellipsis.circle") }
                            .accessibilityLabel("Mais ações da sessão")
                        }
                    }
                }
                .sheet(isPresented: $usando) {
                    UsarSessaoFolha(sessaoSalva: s, servico: modelo.servico, clubeId: contexto.clube?.id ?? "",
                                    aoSessaoAcabar: modelo.aoSessaoAcabar)
                        .environment(\.tema, tema)
                }
                .confirmationDialog("Excluir a sessão \"\(s.nome)\"?", isPresented: $confirmarExcluir, titleVisibility: .visible) {
                    Button("Excluir", role: .destructive) { excluir(s) }
                    Button("Cancelar", role: .cancel) {}
                } message: { Text("As mídias salvas junto também são apagadas. Os treinos onde ela já foi usada não mudam.") }
            } else {
                EstadoVazio(icone: "bookmark", titulo: "Sessão não encontrada", texto: "Ela pode ter sido excluída.")
            }
        }
        .alert("Renomear sessão", isPresented: $renomeando) {
            TextField("Nome da sessão", text: Binding(get: { novoNome }, set: { novoNome = String($0.prefix(MAX_NOME_SESSAO)) }))
            Button("Cancelar", role: .cancel) {}
            Button("Salvar") { renomear() }
        }
        .overlay { if ocupado { ProgressView().padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
        .sheet(item: $vendo) { a in VisualizadorArquivo(url: a.url).ignoresSafeArea() }
        .avisoTemporario($aviso)
    }

    /// "Salva por Marcos em 20/11".
    private func rodape(_ s: SessaoSalva) -> String {
        var t = s.criadoPor.map { "Salva por \($0)" } ?? "Salva"
        if let d = diaMesDoInstante(s.criadoEm) { t += " em \(d)" }
        return t
    }

    private func cartaoBloco(_ b: BlocoSessaoSalva) -> some View {
        let c = tema.cores
        return Cartao {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("\(b.ordem) · \(b.nome)".uppercased()).font(Tipos.legenda11.comPeso(.seminegrito).font).tracking(0.6)
                        .foregroundColor(c.tinta2.color)
                    Spacer()
                    if b.minutos > 0 { Text("\(b.minutos) min").tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.tinta2.color) }
                }
                if !b.preenchido {
                    Text("Sem atividade").tipo(Tipos.corpo13).foregroundColor(c.tinta3.color)
                } else {
                    if let ct = b.conteudo, !ct.isEmpty {
                        HStack(spacing: 8) {
                            Circle().fill(corDoPilar(b.pilar)).frame(width: 10, height: 10).accessibilityHidden(true)
                            Text(ct).font(Tipos.corpo17.comPeso(.seminegrito).font).foregroundColor(c.tinta.color).linhasAcessiveis(2)
                        }
                    }
                    if let t = b.titulo, !t.isEmpty { Text(t).tipo(Tipos.corpo13.comPeso(.medio)).foregroundColor(c.tinta2.color) }
                    if let d = b.descricao, !d.isEmpty { Text(d).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color) }
                    ForEach(Array(b.midias.enumerated()), id: \.offset) { _, m in
                        LinhaArquivoTreino(icone: iconeDoAnexo(m.especie), titulo: m.nome ?? "Mídia", detalhe: "", aoVer: { ver(m) })
                    }
                }
            }
        }
    }

    private func ver(_ m: MidiaSessaoSalva) {
        let nomeArq = (m.url ?? "").split(separator: "/").last.map(String.init) ?? "midia"
        let a = Anexo(id: "midia-\(abs(nomeArq.hashValue))", atividadeId: nil, titulo: m.nome, nomeArquivo: nomeArq, caminho: m.url, tipo: nil)
        Task {
            do { vendo = ArquivoLocal(url: try await baixarAnexo(a, base: app.base)) } catch { aviso = "Não foi possível abrir a mídia agora." }
        }
    }

    private func renomear() {
        let n = novoNome.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty else { aviso = MSG_NOME_SESSAO; return }
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await modelo.servico.api.renomearSessao(id, nome: n)
                await modelo.carregar()
            } catch {
                if modelo.aoSessaoAcabar(error) { return }
                aviso = mensagemErroTreino(error)
            }
        }
    }

    private func excluir(_ s: SessaoSalva) {
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await modelo.servico.api.excluirSessao(s.id)
                modelo.aviso = "Sessão \"\(s.nome)\" excluída."
                await modelo.carregar()
                fechar()
            } catch {
                if modelo.aoSessaoAcabar(error) { return }
                aviso = mensagemErroTreino(error)
            }
        }
    }
}

/// "Usar em um dia": escolhe a data (e o período, se o dia tiver 2+ treinos) e aplica; já tem atividades → pergunta.
struct UsarSessaoFolha: View {
    let sessaoSalva: SessaoSalva
    let servico: ServicoTreino
    let clubeId: String
    let aoSessaoAcabar: (Error) -> Bool

    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State private var data = Date()
    @State private var dia: Dia?
    @State private var periodoSel = 0
    @State private var carregando = false
    @State private var ocupado = false
    @State private var erro: String?
    @State private var substituir: Int?
    @State private var feito = false

    private var dataTexto: String { dataISO(data) }

    var body: some View {
        let treinos = dia.map(periodosParaAplicar) ?? []
        NavigationStack {
            Form {
                Section {
                    DatePicker("Dia", selection: $data, displayedComponents: .date)
                        .environment(\.locale, Locale(identifier: "pt_BR"))
                    if treinos.count > 1 {
                        Picker("Período", selection: $periodoSel) {
                            ForEach(Array(treinos.enumerated()), id: \.offset) { i, p in Text(periodoEfetivo(p)?.rotulo ?? "Período").tag(i) }
                        }
                        .pickerStyle(.segmented)
                    }
                } footer: {
                    if carregando { Text("Lendo o dia…") }
                    else if let d = dia, let e = erroDiaSemTreino(d) { Text(e) }
                    else if feito { Text("O treino de \(rotuloDiaMinusculo(dataTexto)) foi preenchido com a sessão \"\(sessaoSalva.nome)\".") }
                    else if let erro { Text(erro).foregroundColor(tema.cores.erroTinta.color) }
                    else { Text("As atividades da sessão entram no treino desse dia. Dá para ajustar qualquer bloco depois.") }
                }
            }
            .navigationTitle("Usar \"\(sessaoSalva.nome)\"")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(feito ? "Fechar" : "Cancelar") { fechar() } }
                if !feito {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Usar") { aplicar(treinos, substituir: false) }
                            .disabled(ocupado || carregando || treinos.isEmpty)
                    }
                }
            }
            .alert("Substituir o treino?", isPresented: Binding(get: { substituir != nil }, set: { if !$0 { substituir = nil } })) {
                Button("Cancelar", role: .cancel) {}
                Button("Substituir", role: .destructive) { aplicar(treinos, substituir: true) }
            } message: { Text(textoSubstituirSessao(substituir ?? 1)) }
        }
        .presentationDetents([.medium])
        .task(id: dataTexto) { await lerDia() }
    }

    private func lerDia() async {
        carregando = true
        erro = nil
        feito = false
        periodoSel = 0
        defer { carregando = false }
        let d = dataTexto
        let s = SemanaISO(data: d)
        do {
            let m = try await servico.api.microciclo(semana: s.identificador, clubeId: clubeId)
            guard d == dataTexto else { return }
            dia = diasDaSemana(m, s).first { $0.data == d } ?? diaVazio(d)
        } catch is CancellationError {
        } catch {
            if aoSessaoAcabar(error) { return }
            dia = nil
            erro = "Não foi possível ler esse dia."
        }
    }

    private func aplicar(_ treinos: [Dia], substituir sub: Bool) {
        guard !treinos.isEmpty else { return }
        let p = treinos[max(0, min(periodoSel, treinos.count - 1))]
        let d = dataTexto
        ocupado = true
        erro = nil
        Task {
            defer { ocupado = false }
            do {
                try await servico.aplicarSessao(sessaoSalva.id, em: p, substituir: sub, semana: SemanaISO(data: d), clubeId: clubeId)
                feito = true
            } catch {
                if aoSessaoAcabar(error) { return }
                if let n = atividadesQueSeraoTrocadas(error) { substituir = n; return }
                erro = mensagemErroTreino(error)
            }
        }
    }
}

/// Date → "YYYY-MM-DD" no fuso de Brasília.
func dataISO(_ d: Date) -> String { hojeBrasilia(Int64(d.timeIntervalSince1970 * 1000)) }

/// No Dia: "Usar sessão salva" → escolhe uma sessão da lista e aplica no período aberto.
struct EscolherSessaoFolha: View {
    let periodo: Dia
    let semana: SemanaISO
    let clubeId: String
    let servico: ServicoTreino
    let aoSessaoAcabar: (Error) -> Bool
    /// Aplicou: mensagem para o aviso do Dia.
    let aoAplicar: (String) -> Void

    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State private var lista: [SessaoSalva]?
    @State private var erro: String?
    @State private var ocupado = false
    @State private var pedir: (sessao: SessaoSalva, n: Int)?

    var body: some View {
        NavigationStack {
            Group {
                if let lista {
                    if lista.isEmpty {
                        EstadoVazio(icone: "bookmark", titulo: "Nenhuma sessão salva ainda",
                                    texto: "Monte um treino e use Salvar sessão no menu do dia.")
                    } else {
                        List(lista) { s in
                            Button { aplicar(s, substituir: false) } label: { LinhaSessaoSalva(s: s) }
                                .disabled(ocupado)
                        }
                        .listStyle(.plain)
                    }
                } else if let erro {
                    EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível carregar", texto: erro,
                                acao: ("Tentar de novo", { Task { await carregar() } }))
                } else {
                    ProgressView("Carregando…").frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .background(tema.cores.fundo.color.ignoresSafeArea())
            .navigationTitle("Usar sessão salva")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } } }
            .overlay { if ocupado { ProgressView().padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
            .alert("Substituir o treino?", isPresented: Binding(get: { pedir != nil }, set: { if !$0 { pedir = nil } })) {
                Button("Cancelar", role: .cancel) {}
                Button("Substituir", role: .destructive) { if let p = pedir { aplicar(p.sessao, substituir: true) } }
            } message: { Text(textoSubstituirSessao(pedir?.n ?? 1)) }
        }
        .task { await carregar() }
    }

    private func carregar() async {
        erro = nil
        do {
            lista = try await servico.api.sessoesSalvas()
        } catch is CancellationError {
        } catch {
            if aoSessaoAcabar(error) { return }
            erro = mensagemDeErro(error)
        }
    }

    private func aplicar(_ s: SessaoSalva, substituir: Bool) {
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await servico.aplicarSessao(s.id, em: periodo, substituir: substituir, semana: semana, clubeId: clubeId)
                aoAplicar("Sessão \"\(s.nome)\" aplicada.")
                fechar()
            } catch {
                if aoSessaoAcabar(error) { return }
                if let n = atividadesQueSeraoTrocadas(error) { pedir = (s, n); return }
                erro = nil
                aoAplicar(mensagemErroTreino(error))
            }
        }
    }
}

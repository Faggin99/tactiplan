import SwiftUI
import PhotosUI
import TactiPlanKit

// Cadastro do atleta (novo ou editar), os campos do PlayerModal do web: foto (câmera ou galeria,
// reduzida no aparelho), nome (formatarNome ao salvar), posição pelos códigos BR da modalidade
// (futsal com os próprios), camisa, status, grupo, categoria, nascimento, altura, pé, último clube
// e observação. Atleta novo: salva primeiro e sobe a foto depois (o web pedia para reabrir).

struct AtletaFolha: View {
    let original: Atleta?
    let contexto: ContextoClube
    let servico: ServicoElenco
    let categorias: [CategoriaCadastro]
    let aoSessaoAcabar: (Error) -> Bool
    let aoConcluir: (String) -> Void
    let aoSalvar: ((Atleta) -> Void)?

    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State var rascunho: Atleta
    @State var camisaTexto: String
    @State var alturaTexto: String
    @State var temNascimento: Bool
    @State var nascimento: Date
    @State var fotoNova: ArquivoUpload? = nil
    @State var fotoPrevia: UIImage? = nil
    @State var itemGaleria: PhotosPickerItem? = nil
    @State var camera = false
    @State var removerFoto = false
    @State var salvando = false
    @State var erro: String? = nil

    init(atleta: Atleta?, contexto: ContextoClube, servico: ServicoElenco, categorias: [CategoriaCadastro],
         aoSessaoAcabar: @escaping (Error) -> Bool, aoConcluir: @escaping (String) -> Void, aoSalvar: ((Atleta) -> Void)? = nil) {
        original = atleta
        self.contexto = contexto
        self.servico = servico
        self.categorias = categorias
        self.aoSessaoAcabar = aoSessaoAcabar
        self.aoConcluir = aoConcluir
        self.aoSalvar = aoSalvar
        let a = atleta ?? Atleta(id: "", nome: "", status: "active", clubeId: contexto.clube?.id)
        _rascunho = State(initialValue: a)
        _camisaTexto = State(initialValue: a.camisa.map(String.init) ?? "")
        _alturaTexto = State(initialValue: a.alturaCm.map(String.init) ?? "")
        _temNascimento = State(initialValue: a.nascimento != nil)
        _nascimento = State(initialValue: dataDoTexto(a.nascimento) ?? dataDoTexto("2010-01-01") ?? Date())
    }

    private var novo: Bool { original == nil }

    var body: some View {
        NavigationStack {
            Form {
                secaoFoto
                Section {
                    TextField("Nome do atleta", text: $rascunho.nome)
                        .textInputAutocapitalization(.words)
                    Picker("Posição", selection: Binding(get: { rascunho.posicao ?? "" }, set: { rascunho.posicao = $0.isEmpty ? nil : $0 })) {
                        Text("Selecione a posição").tag("")
                        ForEach(opcoesPosicao, id: \.codigo) { p in Text(p.rotulo).tag(p.codigo) }
                    }
                    TextField("Camisa (1 a 99)", text: $camisaTexto).keyboardType(.numberPad)
                } header: { Text("Atleta") }
                Section {
                    Picker("Status", selection: Binding(get: { rascunho.status ?? "active" }, set: { rascunho.status = $0 })) {
                        ForEach(STATUS_ATLETA, id: \.0) { s in Text(s.1).tag(s.0) }
                    }
                    Picker("Grupo", selection: Binding(get: { rascunho.grupo ?? "" }, set: { rascunho.grupo = $0.isEmpty ? nil : $0 })) {
                        ForEach(GRUPOS_ELENCO, id: \.id) { g in Text(g.nome).tag(g.valor ?? "") }
                    }
                    if !categorias.isEmpty {
                        Picker("Categoria", selection: Binding(get: { rascunho.categoriaId ?? "" },
                                                               set: { rascunho.categoriaId = $0.isEmpty ? nil : $0 })) {
                            Text("Sem categoria (clube todo)").tag("")
                            ForEach(categorias) { k in Text(k.rotulo).tag(k.id) }
                        }
                    }
                }
                Section {
                    Toggle("Data de nascimento", isOn: $temNascimento)
                    if temNascimento {
                        DatePicker("Nascimento", selection: $nascimento, in: ...Date(), displayedComponents: .date)
                    }
                    TextField("Altura em cm (ex.: 180)", text: $alturaTexto).keyboardType(.numberPad)
                    Picker("Pé preferencial", selection: Binding(get: { rascunho.pe ?? "" }, set: { rascunho.pe = $0.isEmpty ? nil : $0 })) {
                        Text("—").tag("")
                        ForEach(PES, id: \.0) { p in Text(p.1).tag(p.0) }
                    }
                    TextField("Último clube (de onde veio)", text: Binding(get: { rascunho.clubeAnterior ?? "" },
                                                                           set: { rascunho.clubeAnterior = $0 }))
                } header: { Text("Mais dados") }
                Section("Observação") {
                    TextField("Observações sobre o atleta", text: Binding(get: { rascunho.observacao ?? "" },
                                                                         set: { rascunho.observacao = $0 }), axis: .vertical)
                        .lineLimit(3...6)
                }
                if let erro { Section { Text(erro).foregroundColor(tema.cores.erroTinta.color) } }
            }
            .navigationTitle(novo ? "Novo atleta" : "Editar atleta")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") { salvar() }.disabled(salvando)
                }
            }
            .disabled(salvando)
            .overlay { if salvando { ProgressView().padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
            .onChange(of: itemGaleria) { item in
                guard let item else { return }
                Task {
                    if case .pronto(_, let arq) = await AnexosIOS.item(item), arq.tipo.hasPrefix("image/") {
                        usarFoto(arq)
                    } else {
                        erro = AnexosIOS.MSG_ILEGIVEL
                    }
                    itemGaleria = nil
                }
            }
            .fullScreenCover(isPresented: $camera) {
                CameraFoto { imagem in
                    camera = false
                    guard let imagem else { return }
                    Task {
                        if case .pronto(_, let arq) = await AnexosIOS.foto(imagem) { usarFoto(arq) } else { erro = AnexosIOS.MSG_ILEGIVEL }
                    }
                }
                .ignoresSafeArea()
            }
        }
    }

    private var opcoesPosicao: [Posicao] {
        var l = posicoesDaModalidade(contexto.clube?.modalidade)
        // código antigo (ou de outra modalidade) continua escolhido até a pessoa trocar
        if let p = rascunho.posicao, !l.contains(where: { $0.codigo == p }) { l.append(Posicao(p, p)) }
        return l
    }

    private var secaoFoto: some View {
        Section {
            HStack(spacing: 14) {
                FotoAtleta(url: removerFoto ? nil : rascunho.fotoUrl, nome: rascunho.nome.isEmpty ? "?" : rascunho.nome,
                           tamanho: 64, local: fotoPrevia)
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        PhotosPicker(selection: $itemGaleria, matching: .images) {
                            Label("Galeria", systemImage: "photo")
                        }
                        if AnexosIOS.temCamera {
                            Button { camera = true } label: { Label("Câmera", systemImage: "camera") }
                        }
                    }
                    .buttonStyle(.borderless)
                    if fotoPrevia != nil || (rascunho.fotoUrl != nil && !removerFoto) {
                        Button("Remover foto", role: .destructive) {
                            fotoNova = nil
                            fotoPrevia = nil
                            removerFoto = rascunho.fotoUrl != nil
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
        } header: { Text("Foto do atleta") } footer: { Text(TEXTO_FOTO_ATLETA) }
    }

    private func usarFoto(_ arq: ArquivoUpload) {
        guard arq.dados.count <= TAMANHO_MAX_FOTO else { erro = MSG_FOTO_GRANDE; return }
        fotoNova = arq
        fotoPrevia = UIImage(data: arq.dados)
        removerFoto = false
        erro = nil
    }

    private func salvar() {
        var a = rascunho
        let camisa = camisaTexto.trimmingCharacters(in: .whitespaces)
        let altura = alturaTexto.trimmingCharacters(in: .whitespaces)
        if !camisa.isEmpty && Int(camisa) == nil { erro = MSG_CAMISA_INVALIDA; return }
        if !altura.isEmpty && Int(altura) == nil { erro = MSG_ALTURA_INVALIDA; return }
        a.camisa = Int(camisa)
        a.alturaCm = Int(altura)
        a.nascimento = temNascimento ? textoDaData(nascimento) : nil
        if removerFoto { a.fotoUrl = nil }
        if let e = erroAtleta(nome: a.nome, posicao: a.posicao, camisa: a.camisa, altura: a.alturaCm) { erro = e; return }
        salvando = true
        Task {
            defer { salvando = false }
            do {
                // Remover a foto: o PUT já grava photo_url nulo; o DELETE apaga o arquivo do servidor.
                if removerFoto, !novo, original?.fotoUrl != nil { _ = try? await servico.api.removerFoto(a.id) }
                let salvo = try await servico.salvar(a, novo: novo, foto: fotoNova)
                aoSalvar?(salvo)
                aoConcluir(novo ? "Atleta cadastrado." : "Cadastro salvo.")
                fechar()
            } catch {
                if aoSessaoAcabar(error) { return }
                erro = mensagemErroElenco(error)
            }
        }
    }
}

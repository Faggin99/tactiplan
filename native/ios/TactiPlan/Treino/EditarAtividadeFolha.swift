import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import TactiPlanKit

// Folha "Editar atividade" (sobe de baixo, com o dia atrás). Os mesmos cadastros e regras do
// UnifiedTrainingModal do web (FormAtividade no Kit): Pilar → Conteúdo → Submomentos → Atividade,
// tempo (−/+ de 5 em 5), grupos, descrição, distância ideal do dia e os ANEXOS DESTA atividade
// (câmera, galeria com fotos e vídeos, PDF; até 5; título editável; ver e remover). Salvar segue a
// sequência do web (ServicoTreino): ensure → atividade → distância → anexos com o id real.
// Sem permissão: só leitura, com aviso. Nada de compra.

struct EditarAtividadeFolha: View {
    let dia: Dia
    let bloco: Bloco
    let semana: SemanaISO
    let contexto: ContextoClube
    let sessao: Sessao
    let servico: ServicoTreino
    let base: String
    /// Salvou (ou apagou): mensagem para o aviso do Dia (nil = tudo certo).
    let aoSalvar: (String?) -> Void

    @EnvironmentObject private var app: AppEstado
    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema

    @State private var cadastros = CadastrosTreino()
    @State private var carregando = true
    @State private var erroCarregar: String?
    @State private var form = FormAtividade()
    @State private var formInicial = FormAtividade()
    @State private var kmTexto = ""
    @State private var existentes: [Anexo] = []
    @State private var titulosEditados: [String: String] = [:]
    @State private var novos: [AnexoNovo] = []
    @State private var bytes: [String: ArquivoUpload] = [:]
    @State private var etapa: Etapa?
    @State private var aviso: String?
    @State private var confirmarPassado = false
    @State private var confirmarExcluir = false
    @State private var removerAnexo: Anexo?
    @State private var mostrarCamera = false
    @State private var mostrarArquivos = false
    @State private var itensGaleria: [PhotosPickerItem] = []
    @State private var vendo: ArquivoLocal?
    @State private var novoTitulo = false
    @State private var novoTituloTexto = ""

    private var podeEditar: Bool { contexto.podeEditar("training:edit") }
    private var podeApagar: Bool { contexto.podeEditar("training:delete") }
    private var diaDeTreino: Bool { dia.tipo == .treino }
    private var salvando: Bool { etapa != nil }
    private var titulo: String { dia.tipo == .jogo ? ROTULO_NAO_RELACIONADOS : bloco.nome }

    var body: some View {
        NavigationStack {
            Group {
                if carregando {
                    ProgressView("Carregando…").frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let e = erroCarregar {
                    EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível abrir", texto: e,
                                acao: ("Tentar de novo", { Task { await carregar() } }))
                } else {
                    formulario
                }
            }
            .background(tema.cores.fundo.color.ignoresSafeArea())
            .navigationTitle(titulo)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(podeEditar ? "Cancelar" : "Fechar") { fechar() }.disabled(salvando)
                }
                if podeEditar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Salvar") { pedirSalvar() }.disabled(salvando || carregando || erroCarregar != nil)
                            .font(.body.weight(.semibold))
                    }
                }
            }
        }
        .interactiveDismissDisabled(salvando)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task { await carregar() }
        .overlay { if let etapa { CamadaSalvando(etapa: etapa) } }
        .avisoTemporario($aviso)
        .confirmationDialog(MSG_DATA_PASSADA, isPresented: $confirmarPassado, titleVisibility: .visible) {
            Button("Continuar") { salvar() }
            Button("Cancelar", role: .cancel) {}
        }
        .confirmationDialog("Excluir esta atividade?", isPresented: $confirmarExcluir, titleVisibility: .visible) {
            Button("Excluir atividade", role: .destructive) { excluir() }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text(existentes.isEmpty ? "O bloco fica vazio." : "Os anexos desta atividade também serão apagados.")
        }
        .confirmationDialog("Remover este anexo?", isPresented: Binding(get: { removerAnexo != nil }, set: { if !$0 { removerAnexo = nil } }),
                            titleVisibility: .visible) {
            Button("Remover", role: .destructive) { if let a = removerAnexo { remover(a) } }
            Button("Cancelar", role: .cancel) {}
        } message: { Text("Esta ação não pode ser desfeita.") }
        .fullScreenCover(isPresented: $mostrarCamera) {
            CameraFoto { img in
                mostrarCamera = false
                if let img { Task { receber(await AnexosIOS.foto(img)) } }
            }
            .ignoresSafeArea()
        }
        .fileImporter(isPresented: $mostrarArquivos, allowedContentTypes: [.pdf], allowsMultipleSelection: false) { r in
            if case .success(let urls) = r, let u = urls.first { receber(AnexosIOS.pdf(u)) }
        }
        .onChange(of: itensGaleria) { itens in
            guard !itens.isEmpty else { return }
            itensGaleria = []
            Task { for i in itens { receber(await AnexosIOS.item(i)) } }
        }
        .sheet(item: $vendo) { a in VisualizadorArquivo(url: a.url).ignoresSafeArea() }
        .alert("Nova atividade", isPresented: $novoTitulo) {
            TextField("Nome da atividade", text: $novoTituloTexto)
            Button("Cancelar", role: .cancel) {}
            Button("Cadastrar") { criarTitulo() }
        } message: { Text("Entra na biblioteca da conta, no conteúdo escolhido.") }
    }

    // MARK: carregar

    private func carregar() async {
        carregando = true
        erroCarregar = nil
        do {
            let c = try await servico.api.cadastros(modalidade: contexto.clube?.modalidade)
            cadastros = c
            form = FormAtividade(de: bloco.atividade, cadastros: c)
            formInicial = form
            kmTexto = formatarKm(dia.distanciaKm)
            if let diaId = dia.id, let atv = bloco.atividade?.id {
                existentes = try await servico.api.anexosDoDia(diaId).filter { $0.atividadeId == atv }
            }
        } catch {
            if app.controle.tratarErro(error, token: sessao.token) { return }
            erroCarregar = mensagemDeErro(error)
        }
        carregando = false
    }

    // MARK: formulário

    private var formulario: some View {
        let c = tema.cores
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if !podeEditar {
                    FaixaTom(icone: "lock.fill",
                             texto: contexto.somenteLeitura
                                ? ((contexto.clube?.arquivado ?? false) ? TEXTO_CLUBE_ARQUIVADO : contexto.mensagemSomenteLeitura)
                                : MSG_SEM_PERMISSAO_TREINO,
                             tom: .neutro)
                }
                campo("Pilar", dica: "obrigatório") {
                    FlowChips(itens: PILARES.map { ItemChip(id: $0.id, rotulo: $0.rotulo, cor: corDoPilar($0.id)) }, marcados: Set([form.pilar].compactMap { $0 })) { id in
                        form.tocarPilar(id, cadastros: cadastros)
                    }
                }
                if form.pilar != nil {
                    campo(form.rotuloConteudo, dica: "obrigatório") {
                        Menu {
                            Button("Nenhum") { form.escolherConteudo(nil, cadastros: cadastros) }
                            ForEach(form.conteudosDoPilar(cadastros)) { ct in
                                Button(ct.nome) { form.escolherConteudo(ct.id, cadastros: cadastros) }
                            }
                        } label: {
                            linhaEscolha(cadastros.conteudos.first { $0.id == form.conteudoId }?.nome ?? "Escolher…")
                        }
                    }
                }
                if form.mostraEtapas, form.conteudoId != nil {
                    let etapas = form.etapasDisponiveis(cadastros)
                    campo("Submomentos", dica: "opcional") {
                        if etapas.isEmpty {
                            Text("Este momento não tem submomentos cadastrados.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                        } else {
                            FlowChips(itens: etapas.map { ItemChip(id: $0.id, rotulo: $0.nome) }, marcados: Set(form.etapas)) { form.alternarEtapa($0) }
                        }
                    }
                }
                if form.conteudoId != nil {
                    campo("Atividade", dica: "obrigatório") {
                        NavigationLink {
                            EscolherTitulo(titulos: form.titulosDisponiveis(cadastros), escolhido: form.tituloId,
                                           podeCriar: contexto.podeEditar("library:edit")) { id in
                                form.tituloId = id
                            } aoCriar: {
                                novoTituloTexto = ""
                                novoTitulo = true
                            }
                        } label: {
                            linhaEscolha(cadastros.titulos.first { $0.id == form.tituloId }?.titulo ?? "Escolher da biblioteca…")
                        }
                        .disabled(!podeEditar)
                    }
                }
                campo("Tempo", dica: nil) {
                    HStack(spacing: 12) {
                        botaoRedondo("minus", "Menos 5 minutos") { form.somarMinutos(-5) }
                        TextField("0", text: Binding(get: { form.minutos }, set: { form.minutos = limparMinutos($0) }))
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.center)
                            .font(Tipos.titulo20.font)
                            .frame(width: 70)
                            .accessibilityLabel("Tempo em minutos")
                        Text("min").tipo(Tipos.corpo15).foregroundColor(c.tinta2.color)
                        botaoRedondo("plus", "Mais 5 minutos") { form.somarMinutos(5) }
                    }
                }
                campo("Grupos", dica: nil) {
                    VStack(alignment: .leading, spacing: 8) {
                        FlowChips(itens: GRUPOS_ATIVIDADE.map { ItemChip(id: $0.valor, rotulo: $0.rotulo) }, marcados: Set(form.grupos)) { form.alternarGrupo($0) }
                        Button(form.todosOsGrupos ? "Limpar" : "Todos") { form.alternarTodosOsGrupos() }
                            .tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.acaoTinta.color)
                    }
                }
                campo("Descrição", dica: "opcional") {
                    TextEditor(text: $form.descricao)
                        .frame(minHeight: 96)
                        .padding(8)
                        .background(RoundedRectangle(cornerRadius: 12).fill(c.superficie.color))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(c.borda.color))
                        .accessibilityLabel("Descrição da atividade")
                }
                if diaDeTreino {
                    campo("Distância ideal do dia (km)", dica: "opcional · por jogador") {
                        Campo(dica: "Ex.: 5,2", valor: $kmTexto, teclado: .decimalPad)
                    }
                }
                secaoAnexos
                if bloco.atividade != nil && podeApagar {
                    Botao(texto: "Excluir atividade", variante: .perigo) { confirmarExcluir = true }
                        .disabled(salvando)
                }
            }
            .padding(16)
        }
        .scrollDismissesKeyboardCompat()
        .allowsHitTesting(!salvando)
    }

    private func campo<C: View>(_ rotulo: String, dica: String?, @ViewBuilder _ conteudo: () -> C) -> some View {
        let c = tema.cores
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(rotulo).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                if let dica { Text(dica).tipo(Tipos.legenda11).foregroundColor(c.tinta3.color) }
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            conteudo().disabled(!podeEditar)
        }
    }

    private func linhaEscolha(_ texto: String) -> some View {
        let c = tema.cores
        return HStack {
            Text(texto).tipo(Tipos.corpo15).foregroundColor(c.tinta.color).multilineTextAlignment(.leading)
            Spacer()
            Image(systemName: "chevron.up.chevron.down").foregroundColor(c.tinta3.color).accessibilityHidden(true)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 48)
        .background(RoundedRectangle(cornerRadius: 12).fill(c.superficie.color))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(c.borda.color))
    }

    private func botaoRedondo(_ icone: String, _ rotulo: String, _ acao: @escaping () -> Void) -> some View {
        let c = tema.cores
        return Button(action: acao) {
            Image(systemName: icone).font(.system(size: 17, weight: .semibold))
                .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                .background(Circle().fill(c.acaoSuave.color))
                .foregroundColor(c.acaoTinta.color)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(rotulo)
    }

    // MARK: anexos

    private var secaoAnexos: some View {
        let c = tema.cores
        let total = existentes.count + novos.count
        let motivo = motivoParaNaoAnexar(form, existentes: existentes.count, novos: novos.count)
        let restantes = max(0, MAX_ANEXOS_POR_ATIVIDADE - total)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Anexos desta atividade", systemImage: "paperclip")
                    .font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                Spacer()
                Text("\(total)/\(MAX_ANEXOS_POR_ATIVIDADE)").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
            }
            ForEach(existentes) { a in
                linhaAnexo(icone: iconeDoAnexo(a.especie),
                           titulo: Binding(get: { titulosEditados[a.id] ?? a.rotulo }, set: { titulosEditados[a.id] = $0 }),
                           aoConfirmar: { renomear(a) },
                           aoVer: { ver(a) },
                           aoRemover: podeApagar ? { removerAnexo = a } : nil)
            }
            ForEach($novos) { $n in
                linhaAnexo(icone: iconeDoAnexo(n.especie), titulo: $n.titulo, novo: true,
                           aoConfirmar: {}, aoVer: nil,
                           aoRemover: { novos.removeAll { $0.id == n.id }; bytes.removeValue(forKey: n.id) })
            }
            if podeEditar {
                if let motivo, total < MAX_ANEXOS_POR_ATIVIDADE {
                    Text(motivo).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                }
                HStack(spacing: 8) {
                    if AnexosIOS.temCamera {
                        botaoAnexar("Câmera", "camera") { mostrarCamera = true }.disabled(motivo != nil)
                    }
                    PhotosPicker(selection: $itensGaleria, maxSelectionCount: max(1, restantes),
                                 matching: .any(of: [.images, .videos])) {
                        rotuloAnexar("Fotos", "photo.on.rectangle")
                    }
                    .disabled(motivo != nil)
                    .opacity(motivo != nil ? 0.5 : 1)
                    botaoAnexar("Arquivo", "doc") { mostrarArquivos = true }.disabled(motivo != nil)
                }
            }
        }
        .padding(.top, 6)
    }

    private func linhaAnexo(icone: String, titulo: Binding<String>, novo: Bool = false, aoConfirmar: @escaping () -> Void,
                            aoVer: (() -> Void)?, aoRemover: (() -> Void)?) -> some View {
        let c = tema.cores
        return HStack(spacing: 10) {
            Image(systemName: icone).font(.system(size: 18)).foregroundColor(c.acaoTinta.color)
                .frame(width: 36, height: 36).background(RoundedRectangle(cornerRadius: 8).fill(c.acaoSuave.color))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                TextField("Título do anexo", text: titulo)
                    .tipo(Tipos.corpo15)
                    .submitLabel(.done)
                    .onSubmit(aoConfirmar)
                    .disabled(!podeEditar)
                    .accessibilityLabel("Título do anexo")
                if novo { Text("Sobe ao salvar").tipo(Tipos.legenda11).foregroundColor(c.tinta3.color) }
            }
            Spacer(minLength: 0)
            if let aoVer {
                Button(action: aoVer) { Image(systemName: "eye").frame(width: ALVO_TOQUE, height: ALVO_TOQUE) }
                    .accessibilityLabel("Ver anexo")
            }
            if let aoRemover, podeEditar {
                Button(action: aoRemover) { Image(systemName: "xmark.circle.fill").frame(width: ALVO_TOQUE, height: ALVO_TOQUE) }
                    .foregroundColor(c.tinta3.color)
                    .accessibilityLabel("Remover anexo")
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 12).fill(c.superficie.color))
    }

    private func botaoAnexar(_ t: String, _ i: String, _ acao: @escaping () -> Void) -> some View {
        Button(action: acao) { rotuloAnexar(t, i) }.buttonStyle(.plain)
    }

    private func rotuloAnexar(_ t: String, _ i: String) -> some View {
        let c = tema.cores
        return Label(t, systemImage: i)
            .font(Tipos.corpo13.comPeso(.seminegrito).font)
            .frame(maxWidth: .infinity, minHeight: ALVO_TOQUE)
            .foregroundColor(c.acaoTinta.color)
            .background(RoundedRectangle(cornerRadius: 12).stroke(c.acaoTinta.color, lineWidth: 1.5))
    }

    private func receber(_ p: PreparoAnexo) {
        switch p {
        case .falhou(let m): aviso = m
        case .pronto(let n, let arq):
            if let m = motivoParaNaoAnexar(form, existentes: existentes.count, novos: novos.count) { aviso = m; return }
            novos.append(n)
            bytes[n.id] = arq
        }
    }

    private func renomear(_ a: Anexo) {
        guard let t = titulosEditados[a.id]?.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
        guard !t.isEmpty else { titulosEditados.removeValue(forKey: a.id); return }
        guard t != a.titulo else { return }
        Task {
            do {
                let novo = try await servico.api.renomearAnexo(a.id, titulo: t)
                if let i = existentes.firstIndex(where: { $0.id == a.id }) { existentes[i].titulo = novo.titulo ?? t }
                titulosEditados.removeValue(forKey: a.id)
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                titulosEditados.removeValue(forKey: a.id)
                aviso = "Não foi possível renomear o anexo: " + mensagemErroTreino(error)
            }
        }
    }

    private func remover(_ a: Anexo) {
        removerAnexo = nil
        Task {
            do {
                try await servico.api.apagarAnexo(a.id)
                existentes.removeAll { $0.id == a.id }
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                aviso = mensagemErroTreino(error, permissao: MSG_SEM_PERMISSAO_APAGAR)
            }
        }
    }

    private func ver(_ a: Anexo) {
        Task {
            do { vendo = ArquivoLocal(url: try await baixarAnexo(a, base: base)) } catch { aviso = "Não foi possível abrir o anexo agora." }
        }
    }

    private func criarTitulo() {
        let t = novoTituloTexto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, let ct = form.conteudoId else { return }
        Task {
            do {
                let novo = try await servico.api.criarTitulo(titulo: t, conteudoId: ct, descricao: nil)
                cadastros.titulos.append(novo)
                form.tituloId = novo.id
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                aviso = mensagemErroTreino(error, permissao: MSG_SEM_PERMISSAO_BIBLIOTECA)
            }
        }
    }

    // MARK: salvar

    private func pedirSalvar() {
        // Os títulos em edição dos anexos já salvos valem no salvar.
        for a in existentes where titulosEditados[a.id] != nil { renomear(a) }
        if let m = validarSalvar(form, anexosExistentes: existentes.count, anexosNovos: novos.count,
                                 distanciaTexto: diaDeTreino ? kmTexto : nil) {
            aviso = m
            return
        }
        if dataPassada(dia.data, hoje: hojeBrasilia()) { confirmarPassado = true } else { salvar() }
    }

    private func salvar() {
        guard let clube = contexto.clube else { return }
        var km: Double?? = nil
        if diaDeTreino, case .ok(let v) = lerKm(kmTexto), v != dia.distanciaKm { km = .some(v) }
        let envios = novos.compactMap { n in bytes[n.id].map { EnvioAnexo(anexo: n, arquivo: $0) } }
        let pedido = PedidoSalvar(semana: semana, clubeId: clube.id, dia: dia, ordemDoBloco: bloco.ordem, form: form,
                                  distancia: km, anexos: envios)
        etapa = .preparando
        Task {
            do {
                let r = try await servico.salvar(pedido) { e in Task { @MainActor in etapa = e } }
                etapa = nil
                aoSalvar(r.mensagemFalhas)
                fechar()
            } catch {
                etapa = nil
                if app.controle.tratarErro(error, token: sessao.token) { return }
                aviso = mensagemErroTreino(error)
            }
        }
    }

    private func excluir() {
        guard let blocoId = bloco.id else { return }
        etapa = .salvando
        Task {
            do {
                try await servico.api.apagarAtividadeDoBloco(blocoId)
                etapa = nil
                aoSalvar("Atividade excluída.")
                fechar()
            } catch {
                etapa = nil
                if app.controle.tratarErro(error, token: sessao.token) { return }
                aviso = mensagemErroTreino(error, permissao: MSG_SEM_PERMISSAO_APAGAR)
            }
        }
    }
}

/// Véu com o andamento do salvar (e o progresso do envio de cada anexo).
struct CamadaSalvando: View {
    let etapa: Etapa

    var body: some View {
        ZStack {
            Color.black.opacity(0.25).ignoresSafeArea()
            VStack(spacing: 12) {
                switch etapa {
                case .preparando, .salvando:
                    ProgressView()
                    Text("Salvando…").tipo(Tipos.corpo15.comPeso(.seminegrito))
                case .enviando(let i, let total, let p):
                    ProgressView(value: p)
                        .frame(width: 200)
                    Text("Enviando anexo \(i + 1) de \(total)").tipo(Tipos.corpo15.comPeso(.seminegrito))
                    Text("\(Int((p * 100).rounded()))%").tipo(Tipos.corpo13)
                }
            }
            .padding(24)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
            .accessibilityElement(children: .combine)
        }
    }
}

/// Chips que quebram linha (pilares, submomentos, grupos). `cor` = bolinha do pilar.
struct ItemChip: Identifiable {
    let id: String
    let rotulo: String
    var cor: Color? = nil
}

struct FlowChips: View {
    let itens: [ItemChip]
    let marcados: Set<String>
    let aoTocar: (String) -> Void
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        LayoutFluxo(espaco: 8) {
            ForEach(itens) { item in
                let on = marcados.contains(item.id)
                Button { aoTocar(item.id) } label: {
                    HStack(spacing: 6) {
                        if let cor = item.cor { Circle().fill(cor).frame(width: 8, height: 8) }
                        if on && item.cor == nil { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)) }
                        Text(item.rotulo)
                    }
                    .font(Tipos.corpo13.comPeso(on ? .seminegrito : .medio).font)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 38)
                    .foregroundColor(on ? (item.cor ?? c.acaoTinta.color) : c.tinta.color)
                    .background(Capsule().fill(on ? (item.cor ?? c.acaoTinta.color).opacity(0.12) : Color.clear))
                    .overlay(Capsule().stroke(on ? (item.cor ?? c.acaoTinta.color) : c.borda.color, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

/// Layout que quebra linha (iOS 16).
struct LayoutFluxo: Layout {
    var espaco: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let largura = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, linha: CGFloat = 0, maiorX: CGFloat = 0
        for s in subviews {
            let t = s.sizeThatFits(.unspecified)
            if x > 0 && x + t.width > largura { x = 0; y += linha + espaco; linha = 0 }
            x += t.width + espaco
            maiorX = max(maiorX, x - espaco)
            linha = max(linha, t.height)
        }
        return CGSize(width: min(maiorX, largura), height: y + linha)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, linha: CGFloat = 0
        for s in subviews {
            let t = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + t.width > bounds.maxX { x = bounds.minX; y += linha + espaco; linha = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(t))
            x += t.width + espaco
            linha = max(linha, t.height)
        }
    }
}

/// Lista da biblioteca com busca; "Nova atividade" para quem pode cadastrar.
struct EscolherTitulo: View {
    let titulos: [TituloCadastro]
    let escolhido: String?
    let podeCriar: Bool
    let aoEscolher: (String?) -> Void
    let aoCriar: () -> Void
    @State private var busca = ""
    @Environment(\.dismiss) private var voltar

    var body: some View {
        let filtrados = busca.isEmpty ? titulos : titulos.filter { $0.titulo.localizedCaseInsensitiveContains(busca) }
        List {
            if podeCriar {
                Button { voltar(); aoCriar() } label: { Label("Nova atividade", systemImage: "plus") }
            }
            if filtrados.isEmpty {
                Text(titulos.isEmpty ? "Nenhuma atividade deste conteúdo na biblioteca." : "Nada encontrado.")
                    .foregroundColor(.secondary)
            }
            ForEach(filtrados) { t in
                Button { aoEscolher(t.id); voltar() } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(t.titulo)
                            if let d = t.descricao, !d.isEmpty { Text(d).font(.footnote).foregroundColor(.secondary).lineLimit(2) }
                        }
                        Spacer()
                        if t.id == escolhido { Image(systemName: "checkmark").foregroundColor(.accentColor) }
                    }
                }
                .foregroundColor(.primary)
                .accessibilityAddTraits(t.id == escolhido ? .isSelected : [])
            }
            if escolhido != nil {
                Button("Tirar a atividade", role: .destructive) { aoEscolher(nil); voltar() }
            }
        }
        .searchable(text: $busca, prompt: "Buscar atividade")
        .navigationTitle("Atividade")
        .navigationBarTitleDisplayMode(.inline)
    }
}

extension View {
    /// Arrastar a lista fecha o teclado (iOS 16+).
    @ViewBuilder func scrollDismissesKeyboardCompat() -> some View {
        self.scrollDismissesKeyboard(.interactively)
    }
}

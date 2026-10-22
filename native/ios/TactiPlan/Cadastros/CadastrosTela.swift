import SwiftUI
import TactiPlanKit

// Mais › Cadastros (T3): Campeonatos, Categorias, Clubes, Conteúdos e submomentos e Atividades,
// com as MESMAS rotas, validações e permissões do web. Cada tela: carregando, vazio, erro com
// "Tentar de novo", edição numa folha. Cores e logo do clube: só ver (edição no web).

/// Carregador genérico das listas dos cadastros.
@MainActor
final class ListaCadastro<Item>: ObservableObject {
    enum Estado { case carregando, pronto, erro(String) }
    @Published var itens: [Item] = []
    @Published var estado: Estado = .carregando
    @Published var aviso: String?
    let buscar: () async throws -> [Item]
    let aoSessaoAcabar: (Error) -> Bool

    init(aoSessaoAcabar: @escaping (Error) -> Bool, buscar: @escaping () async throws -> [Item]) {
        self.buscar = buscar
        self.aoSessaoAcabar = aoSessaoAcabar
    }

    func carregar() async {
        do {
            itens = try await buscar()
            estado = .pronto
        } catch is CancellationError {
            return
        } catch {
            if aoSessaoAcabar(error) { return }
            if itens.isEmpty { estado = .erro(mensagemDeErro(error)) } else { aviso = mensagemDeErro(error) }
        }
    }

    /// Executa uma escrita: aviso de sucesso e recarrega; erro em frase neutra.
    func escrever(_ ok: String, limite: String? = nil, _ f: @escaping () async throws -> Void) {
        Task {
            do {
                try await f()
                aviso = ok
                await carregar()
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = mensagemErroCadastro(error, limite: limite)
            }
        }
    }
}

/// Estado padrão de uma lista de cadastro (carregando / erro).
struct EstadoLista<Item, Pronto: View>: View {
    @ObservedObject var lista: ListaCadastro<Item>
    let pronto: () -> Pronto

    init(_ lista: ListaCadastro<Item>, @ViewBuilder pronto: @escaping () -> Pronto) {
        self.lista = lista
        self.pronto = pronto
    }

    var body: some View {
        switch lista.estado {
        case .carregando:
            ForEach(0..<3, id: \.self) { _ in EsqueletoLinha() }
        case .erro(let msg):
            Cartao {
                EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível carregar", texto: msg,
                            acao: ("Tentar de novo", { Task { await lista.carregar() } }))
            }
        case .pronto:
            pronto()
        }
    }
}

// MARK: a seção no Mais

struct SecaoCadastros: View {
    let sessao: Sessao
    let contexto: ContextoClube
    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema

    var body: some View {
        let api = app.apiCadastros(sessao, contexto)
        let fim: (Error) -> Bool = { [token = sessao.token] e in app.controle.tratarErro(e, token: token) }
        ListaAgrupada("Cadastros") {
            if contexto.clube != nil {
                link("trophy", "Campeonatos") { CampeonatosTela(contexto: contexto, api: api, aoSessaoAcabar: fim) }
                Divisoria()
                link("square.stack.3d.up", "Categorias") { CategoriasTela(contexto: contexto, api: api, aoSessaoAcabar: fim) }
                Divisoria()
            }
            link("shield", "Clubes") { ClubesTela(contexto: contexto, api: api, aoSessaoAcabar: fim) }
            Divisoria()
            link("list.bullet.rectangle", "Conteúdos e submomentos") { ConteudosTela(contexto: contexto, api: api, aoSessaoAcabar: fim) }
            Divisoria()
            link("figure.run", "Atividades (biblioteca)") { AtividadesBibliotecaTela(contexto: contexto, api: api, aoSessaoAcabar: fim) }
        }
    }

    private func link<D: View>(_ icone: String, _ titulo: String, @ViewBuilder destino: @escaping () -> D) -> some View {
        NavigationLink { destino().environment(\.tema, tema) } label: {
            LinhaAgrupada(icone: icone, titulo: titulo).overlay(alignment: .trailing) { Seta() }
        }
        .buttonStyle(.plain)
    }
}

// MARK: campeonatos

struct CampeonatosTela: View {
    let contexto: ContextoClube
    let api: ApiCadastros
    @StateObject private var lista: ListaCadastro<CampeonatoCadastro>
    @Environment(\.tema) private var tema
    @State var editando: CampeonatoCadastro? = nil
    @State var criando = false
    @State var verArquivados = false
    @State var remover: CampeonatoCadastro? = nil

    init(contexto: ContextoClube, api: ApiCadastros, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.contexto = contexto
        self.api = api
        let clube = contexto.clube?.id ?? ""
        _lista = StateObject(wrappedValue: ListaCadastro(aoSessaoAcabar: aoSessaoAcabar) { try await api.campeonatos(clubeId: clube) })
    }

    private var pode: Bool { contexto.podeEditar("training:edit") }
    private var clubeId: String { contexto.clube?.id ?? "" }

    var body: some View {
        TelaGrande("Campeonatos", empilhada: true, aoAtualizar: { await lista.carregar() }) {
            Text("Clube: \(contexto.nome). Vincule cada jogo a um campeonato pra organizar histórico e estatísticas por competição.")
                .tipo(Tipos.corpo13).foregroundColor(tema.cores.tinta2.color).fixedSize(horizontal: false, vertical: true)
            Toggle("Ver arquivados", isOn: $verArquivados).tint(tema.cores.acao.color)
            EstadoLista(lista) {
                let itens = lista.itens.filter { verArquivados || !$0.arquivado }
                if itens.isEmpty {
                    Cartao { EstadoVazio(icone: "trophy", titulo: "Nenhum campeonato cadastrado.",
                                         texto: "Crie \"Brasileirão Série D 2026\", \"Campeonato Estadual Sub-15\", etc.",
                                         acao: pode ? ("Novo campeonato", { criando = true }) : nil) }
                } else {
                    Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                        ForEach(Array(itens.enumerated()), id: \.element.id) { i, k in
                            if i > 0 { Divisoria() }
                            linha(k)
                        }
                    }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if pode { Button { criando = true } label: { Image(systemName: "plus") }.accessibilityLabel("Novo campeonato") }
            }
        }
        .task { await lista.carregar() }
        .sheet(isPresented: $criando) { folha(nil) }
        .sheet(item: $editando) { k in folha(k) }
        .confirmationDialog("Remover campeonato", isPresented: Binding(get: { remover != nil }, set: { if !$0 { remover = nil } }),
                            titleVisibility: .visible) {
            Button("Remover", role: .destructive) {
                if let k = remover { lista.escrever("Campeonato removido.") { try await api.removerCampeonato(k.id) } }
                remover = nil
            }
            Button("Cancelar", role: .cancel) {}
        } message: { Text(remover.map(textoRemoverCampeonato) ?? "") }
        .avisoTemporario($lista.aviso)
    }

    private func linha(_ k: CampeonatoCadastro) -> some View {
        LinhaAgrupada(titulo: k.nome + (k.temporada.map { " · \($0)" } ?? ""), detalhe: k.detalhe, selo: k.arquivado ? "Arquivado" : nil,
                      aoTocar: pode ? { editando = k } : nil) { IconeLinha(icone: "trophy") }
            .contextMenu {
                if pode {
                    Button(k.arquivado ? "Desarquivar" : "Arquivar") {
                        var n = k
                        n.arquivado.toggle()
                        lista.escrever(n.arquivado ? "Campeonato arquivado." : "Campeonato desarquivado.") {
                            try await api.salvarCampeonato(k.id, corpoCampeonato(n, clubeId: clubeId))
                        }
                    }
                    Button("Remover", role: .destructive) { remover = k }
                }
            }
    }

    private func folha(_ k: CampeonatoCadastro?) -> some View {
        CampeonatoFolha(original: k) { novo in
            lista.escrever(k == nil ? "Campeonato criado." : "Campeonato salvo.") {
                try await api.salvarCampeonato(k?.id, corpoCampeonato(novo, clubeId: clubeId))
            }
        }
        .environment(\.tema, tema)
    }
}

struct CampeonatoFolha: View {
    let original: CampeonatoCadastro?
    let aoSalvar: (CampeonatoCadastro) -> Void
    @Environment(\.dismiss) private var fechar
    @State var c: CampeonatoCadastro
    @State var temInicio: Bool
    @State var temFim: Bool
    @State var erro: String? = nil

    init(original: CampeonatoCadastro?, aoSalvar: @escaping (CampeonatoCadastro) -> Void) {
        self.original = original
        self.aoSalvar = aoSalvar
        let ano = String(hojeBrasilia().prefix(4))
        let k = original ?? CampeonatoCadastro(id: "", nome: "", temporada: ano)
        _c = State(initialValue: k)
        _temInicio = State(initialValue: k.inicio != nil)
        _temFim = State(initialValue: k.fim != nil)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nome (ex.: Brasileirão Série D 2026)", text: $c.nome)
                    TextField("Temporada / Edição (2026 ou 2025/26)", text: Binding(get: { c.temporada ?? "" }, set: { c.temporada = $0 }))
                    TextField("Formato", text: Binding(get: { c.formato ?? "" }, set: { c.formato = $0 }))
                    Menu("Sugestões de formato") {
                        ForEach(FORMATOS_CAMPEONATO, id: \.self) { f in Button(f) { c.formato = f } }
                    }
                }
                Section {
                    Toggle("Início", isOn: $temInicio)
                    if temInicio {
                        DatePicker("Data de início", selection: Binding(get: { dataDoTexto(c.inicio) ?? Date() }, set: { c.inicio = textoDaData($0) }),
                                   displayedComponents: .date)
                    }
                    Toggle("Fim", isOn: $temFim)
                    if temFim {
                        DatePicker("Data de fim", selection: Binding(get: { dataDoTexto(c.fim) ?? Date() }, set: { c.fim = textoDaData($0) }),
                                   displayedComponents: .date)
                    }
                }
                if let erro { Section { Text(erro).foregroundColor(.red) } }
            }
            .navigationTitle(original == nil ? "Novo campeonato" : "Editar campeonato")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") {
                        guard !c.nome.trimmingCharacters(in: .whitespaces).isEmpty else { erro = MSG_NOME_CAMPEONATO; return }
                        var n = c
                        if !temInicio { n.inicio = nil } else if n.inicio == nil { n.inicio = textoDaData(Date()) }
                        if !temFim { n.fim = nil } else if n.fim == nil { n.fim = textoDaData(Date()) }
                        aoSalvar(n)
                        fechar()
                    }
                }
            }
        }
    }
}

// MARK: categorias

struct CategoriasTela: View {
    let contexto: ContextoClube
    let api: ApiCadastros
    @StateObject private var lista: ListaCadastro<CategoriaCadastro>
    @Environment(\.tema) private var tema
    @State var editando: CategoriaCadastro? = nil
    @State var criando = false
    @State var remover: CategoriaCadastro? = nil

    init(contexto: ContextoClube, api: ApiCadastros, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.contexto = contexto
        self.api = api
        let clube = contexto.clube?.id ?? ""
        _lista = StateObject(wrappedValue: ListaCadastro(aoSessaoAcabar: aoSessaoAcabar) { try await api.categorias(clubeId: clube) })
    }

    private var pode: Bool { contexto.podeEditar("categories:manage") }
    private var clubeId: String { contexto.clube?.id ?? "" }

    var body: some View {
        TelaGrande("Categorias", empilhada: true, aoAtualizar: { await lista.carregar() }) {
            Text("Clube: \(contexto.nome). Use categorias pra separar atletas e microciclos (Sub-15, Profissional, etc.). Atletas sem categoria continuam visíveis pra todo o clube.")
                .tipo(Tipos.corpo13).foregroundColor(tema.cores.tinta2.color).fixedSize(horizontal: false, vertical: true)
            EstadoLista(lista) {
                if lista.itens.isEmpty {
                    Cartao { EstadoVazio(icone: "square.stack.3d.up", titulo: "Nenhuma categoria cadastrada.",
                                         texto: "Crie Sub-15, Sub-17, Profissional…", acao: pode ? ("Nova categoria", { criando = true }) : nil) }
                } else {
                    Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                        ForEach(Array(lista.itens.enumerated()), id: \.element.id) { i, k in
                            if i > 0 { Divisoria() }
                            LinhaAgrupada(titulo: k.rotulo, detalhe: [contagem(k.atletas, "atleta", "atletas"), k.notas].compactMap { $0 }.joined(separator: " · "),
                                          aoTocar: pode ? { editando = k } : nil) { IconeLinha(icone: "square.stack.3d.up") }
                                .contextMenu { if pode { Button("Remover", role: .destructive) { remover = k } } }
                        }
                    }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if pode { Button { criando = true } label: { Image(systemName: "plus") }.accessibilityLabel("Nova categoria") }
            }
        }
        .task { await lista.carregar() }
        .sheet(isPresented: $criando) { folha(nil) }
        .sheet(item: $editando) { k in folha(k) }
        .confirmationDialog("Remover categoria", isPresented: Binding(get: { remover != nil }, set: { if !$0 { remover = nil } }),
                            titleVisibility: .visible) {
            Button("Remover", role: .destructive) {
                if let k = remover { lista.escrever("Categoria removida.") { try await api.removerCategoria(k.id) } }
                remover = nil
            }
            Button("Cancelar", role: .cancel) {}
        } message: { Text(remover.map(textoRemoverCategoria) ?? "") }
        .avisoTemporario($lista.aviso)
    }

    private func folha(_ k: CategoriaCadastro?) -> some View {
        CategoriaFolha(original: k) { nome, faixa, ordem, notas in
            lista.escrever(k == nil ? "Categoria criada." : "Categoria salva.", limite: MSG_LIMITE_CATEGORIAS) {
                try await api.salvarCategoria(k?.id, corpoCategoria(nome: nome, faixa: faixa, ordem: ordem, notas: notas, clubeId: clubeId))
            }
        }
        .environment(\.tema, tema)
    }
}

struct CategoriaFolha: View {
    let original: CategoriaCadastro?
    let aoSalvar: (String, String?, Int?, String?) -> Void
    @Environment(\.dismiss) private var fechar
    @State var nome: String
    @State var faixa: String
    @State var ordem: String
    @State var notas: String
    @State var erro: String? = nil

    init(original: CategoriaCadastro?, aoSalvar: @escaping (String, String?, Int?, String?) -> Void) {
        self.original = original
        self.aoSalvar = aoSalvar
        _nome = State(initialValue: original?.nome ?? "")
        _faixa = State(initialValue: original?.faixa ?? "")
        _ordem = State(initialValue: original?.ordem.map(String.init) ?? "")
        _notas = State(initialValue: original?.notas ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nome (ex.: Sub-15 Tarde)", text: $nome)
                    Picker("Categoria etária", selection: $faixa) {
                        Text("—").tag("")
                        ForEach(FAIXAS_ETARIAS, id: \.self) { f in Text(f).tag(f) }
                        if !faixa.isEmpty && !FAIXAS_ETARIAS.contains(faixa) { Text(faixa).tag(faixa) }
                    }
                    TextField("Ordem (opcional)", text: $ordem).keyboardType(.numberPad)
                }
                Section("Observações") {
                    TextField("Treinador responsável, horário, anotações…", text: $notas, axis: .vertical).lineLimit(2...5)
                }
                if let erro { Section { Text(erro).foregroundColor(.red) } }
            }
            .navigationTitle(original == nil ? "Nova categoria" : "Editar categoria")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") {
                        guard !nome.trimmingCharacters(in: .whitespaces).isEmpty else { erro = MSG_NOME_CATEGORIA; return }
                        aoSalvar(nome, faixa, Int(ordem.trimmingCharacters(in: .whitespaces)), notas)
                        fechar()
                    }
                }
            }
        }
    }
}

// MARK: clubes

struct ClubesTela: View {
    let contexto: ContextoClube
    let api: ApiCadastros
    @StateObject private var lista: ListaCadastro<ClubeCadastro>
    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema
    @State var limite: LimiteClubes? = nil
    @State var editando: ClubeCadastro? = nil
    @State var criando = false
    @State var confirmar: (titulo: String, texto: String, botao: String, acao: () -> Void)? = nil

    init(contexto: ContextoClube, api: ApiCadastros, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.contexto = contexto
        self.api = api
        _lista = StateObject(wrappedValue: ListaCadastro(aoSessaoAcabar: aoSessaoAcabar) { try await api.clubes() })
    }

    /// Criar: escrita na conta (o servidor confere); editar/arquivar/remover: club_settings:manage.
    private var podeCriar: Bool { !(contexto.conta.somenteLeitura ?? false) && contexto.editaAlgo }
    private var pode: Bool { !(contexto.conta.somenteLeitura ?? false) && contexto.pode("club_settings:manage") }

    var body: some View {
        let c = tema.cores
        TelaGrande("Clubes", empilhada: true, aoAtualizar: { await recarregar() }) {
            Text("Conteúdos, submomentos e títulos de atividades são da conta e valem para todos os clubes.")
                .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).fixedSize(horizontal: false, vertical: true)
            if let l = limite {
                FaixaTom(icone: "shield", texto: textoLimiteClubes(l), tom: l.cheio ? .aviso : .info)
            }
            EstadoLista(lista) {
                let ativos = lista.itens.filter { !$0.arquivado }
                let arquivados = lista.itens.filter(\.arquivado)
                if ativos.isEmpty {
                    Cartao { EstadoVazio(icone: "shield", titulo: arquivados.isEmpty ? "Nenhum clube cadastrado." : "Nenhum clube ativo.",
                                         texto: arquivados.isEmpty ? "Crie o primeiro clube da conta." : "Crie um clube novo ou desarquive um abaixo.") }
                } else {
                    ListaAgrupada("Ativos") {
                        ForEach(Array(ativos.enumerated()), id: \.element.id) { i, k in
                            if i > 0 { Divisoria() }
                            linha(k)
                        }
                    }
                }
                if !arquivados.isEmpty {
                    ListaAgrupada("Arquivados (\(arquivados.count))") {
                        ForEach(Array(arquivados.enumerated()), id: \.element.id) { i, k in
                            if i > 0 { Divisoria() }
                            linha(k)
                        }
                    }
                    Text("Só leitura: abra pelo Trocar clube para consultar o histórico e gerar relatórios. Não contam no limite.")
                        .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.horizontal, 4)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if podeCriar { Button { novo() } label: { Image(systemName: "plus") }.accessibilityLabel("Novo clube") }
            }
        }
        .task { await recarregar() }
        .sheet(isPresented: $criando) { folha(nil) }
        .sheet(item: $editando) { k in folha(k) }
        .confirmationDialog(confirmar?.titulo ?? "", isPresented: Binding(get: { confirmar != nil }, set: { if !$0 { confirmar = nil } }),
                            titleVisibility: .visible) {
            Button(confirmar?.botao ?? "OK", role: confirmar?.botao == "Remover" ? .destructive : nil) { confirmar?.acao(); confirmar = nil }
            Button("Cancelar", role: .cancel) {}
        } message: { Text(confirmar?.texto ?? "") }
        .avisoTemporario($lista.aviso)
    }

    private func recarregar() async {
        async let l: LimiteClubes? = try? await api.limiteClubes()
        await lista.carregar()
        limite = await l
    }

    private func escrever(_ ok: String, _ f: @escaping () async throws -> Void) {
        lista.escrever(ok) {
            try await f()
            await app.controle.atualizarMe()
            limite = try? await api.limiteClubes()
        }
    }

    private func novo() {
        if let l = limite, l.cheio { lista.aviso = MSG_LIMITE_CLUBES; return }
        criando = true
    }

    private func linha(_ k: ClubeCadastro) -> some View {
        LinhaAgrupada(titulo: k.nome, detalhe: k.detalhe, selo: k.id == contexto.clube?.id ? (k.arquivado ? "Aberto · só leitura" : "Aberto") : nil,
                      aoTocar: pode && !k.arquivado ? { editando = k } : nil) { IconeLinha(icone: k.arquivado ? "archivebox" : "shield") }
            .contextMenu {
                if pode {
                    if k.arquivado {
                        Button("Desarquivar") {
                            if let l = limite, l.cheio { lista.aviso = MSG_LIMITE_CLUBES; return }
                            confirmar = ("Desarquivar clube", textoDesarquivarClube(k.nome), "Desarquivar", {
                                escrever("\"\(k.nome)\" voltou a ser um clube ativo.") { try await api.arquivarClube(k.id, arquivar: false) }
                            })
                        }
                    } else {
                        Button("Arquivar") {
                            confirmar = ("Arquivar clube", textoArquivarClube(k.nome), "Arquivar", {
                                escrever("\"\(k.nome)\" foi arquivado.") { try await api.arquivarClube(k.id, arquivar: true) }
                            })
                        }
                    }
                    Button("Remover", role: .destructive) {
                        confirmar = ("Remover clube", textoRemoverClube(k), "Remover", {
                            escrever("Clube removido.") { try await api.removerClube(k.id) }
                        })
                    }
                }
            }
    }

    private func folha(_ k: ClubeCadastro?) -> some View {
        ClubeFolha(original: k) { nome, modalidade, descricao in
            escrever(k == nil ? "Clube criado." : "Clube salvo.") {
                try await api.salvarClube(k?.id, corpoClube(nome: nome, modalidade: modalidade, descricao: descricao))
            }
        }
        .environment(\.tema, tema)
    }
}

struct ClubeFolha: View {
    let original: ClubeCadastro?
    let aoSalvar: (String, String, String?) -> Void
    @Environment(\.dismiss) private var fechar
    @State var nome: String
    @State var modalidade: String
    @State var descricao: String
    @State var erro: String? = nil

    init(original: ClubeCadastro?, aoSalvar: @escaping (String, String, String?) -> Void) {
        self.original = original
        self.aoSalvar = aoSalvar
        _nome = State(initialValue: original?.nome ?? "")
        _modalidade = State(initialValue: original?.modalidade ?? "football_11")
        _descricao = State(initialValue: original?.descricao ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nome do clube", text: $nome)
                    Picker("Modalidade", selection: $modalidade) {
                        ForEach(MODALIDADES, id: \.0) { m in Text(m.1).tag(m.0) }
                    }
                    TextField("Descrição (opcional)", text: $descricao)
                } footer: {
                    if let o = original, o.modalidade != modalidade { Text(TEXTO_MODALIDADE_POSICOES) }
                    else { Text("As cores e a logo do clube são editadas no TactiPlan pelo computador.") }
                }
                if let erro { Section { Text(erro).foregroundColor(.red) } }
            }
            .navigationTitle(original == nil ? "Novo clube" : "Editar clube")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") {
                        guard !nome.trimmingCharacters(in: .whitespaces).isEmpty else { erro = MSG_NOME_CLUBE; return }
                        aoSalvar(nome, modalidade, descricao)
                        fechar()
                    }
                }
            }
        }
    }
}

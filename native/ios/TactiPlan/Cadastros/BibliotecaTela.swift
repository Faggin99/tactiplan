import SwiftUI
import TactiPlanKit

// Biblioteca da CONTA (vale para todos os clubes): Conteúdos por pilar (padrão = ligar/desligar;
// os da conta = editar/remover), Submomentos dos conteúdos táticos (editar um padrão cria uma cópia
// da conta, no servidor) e Atividades (títulos) com busca, filtro, arquivadas e o aviso de uso.
// Tudo com library:edit, como o web.

struct DadosConteudos {
    var conteudos: [ConteudoItem] = []
    var submomentos: [SubmomentoItem] = []
}

struct ConteudosTela: View {
    let contexto: ContextoClube
    let api: ApiCadastros
    @StateObject private var lista: ListaCadastro<DadosConteudos>
    @Environment(\.tema) private var tema
    @State var pilar = "tatico"
    @State var busca = ""
    @State var editando: ConteudoItem? = nil
    @State var criando = false
    @State var submomento: (conteudo: ConteudoItem, item: SubmomentoItem?)? = nil
    @State var removerConteudo: ConteudoItem? = nil
    @State var removerSub: SubmomentoItem? = nil

    init(contexto: ContextoClube, api: ApiCadastros, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.contexto = contexto
        self.api = api
        let modalidade = contexto.clube?.modalidade
        _lista = StateObject(wrappedValue: ListaCadastro(aoSessaoAcabar: aoSessaoAcabar) {
            async let c = api.conteudos()
            async let s = api.submomentos(modalidade: modalidade)
            return [DadosConteudos(conteudos: try await c, submomentos: try await s)]
        })
    }

    private var pode: Bool { contexto.podeEditar("library:edit") }
    private var dados: DadosConteudos { lista.itens.first ?? DadosConteudos() }

    var body: some View {
        let c = tema.cores
        TelaGrande("Conteúdos", empilhada: true, aoAtualizar: { await lista.carregar() }) {
            Text("Pilares são fixos. Conteúdos padrão podem ser ativados/desativados mas não editados. Os seus conteúdos podem ser editados e removidos. Submomentos (só em Tático) são editáveis.")
                .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).fixedSize(horizontal: false, vertical: true)
            Picker("Pilar", selection: $pilar) {
                ForEach(PILARES_STATS, id: \.id) { p in Text(p.rotulo).tag(p.id) }
            }
            .pickerStyle(.segmented)
            Text(DESCRICAO_PILAR[pilar] ?? "").tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
            Campo(dica: pilar == "tatico" ? "Buscar conteúdo ou submomento…" : "Buscar conteúdo…", valor: $busca, envio: .search)
            EstadoLista(lista) {
                let itens = conteudosDoPilarCadastro(dados.conteudos, pilar: pilar, busca: busca, submomentos: dados.submomentos)
                if itens.isEmpty {
                    Cartao { EstadoVazio(icone: "list.bullet.rectangle", titulo: busca.isEmpty ? "Nenhum conteúdo neste pilar." : "Nada encontrado pra \"\(busca)\".",
                                         texto: pilar == "tatico" ? "" : TEXTO_SEM_SUBMOMENTOS_NAO_TATICO) }
                } else {
                    ForEach(itens) { k in cartao(k) }
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if pode { Button { criando = true } label: { Image(systemName: "plus") }.accessibilityLabel("Novo conteúdo") }
            }
        }
        .task { await lista.carregar() }
        .sheet(isPresented: $criando) { folhaConteudo(nil) }
        .sheet(item: $editando) { k in folhaConteudo(k) }
        .sheet(isPresented: Binding(get: { submomento != nil }, set: { if !$0 { submomento = nil } })) {
            if let s = submomento { folhaSub(s.conteudo, s.item) }
        }
        .confirmationDialog("Remover conteúdo", isPresented: Binding(get: { removerConteudo != nil }, set: { if !$0 { removerConteudo = nil } }),
                            titleVisibility: .visible) {
            Button("Remover", role: .destructive) {
                if let k = removerConteudo { lista.escrever("Conteúdo removido.") { try await api.removerConteudo(k.id) } }
                removerConteudo = nil
            }
            Button("Cancelar", role: .cancel) {}
        } message: { Text(removerConteudo.map(textoRemoverConteudo) ?? "") }
        .confirmationDialog("Remover submomento", isPresented: Binding(get: { removerSub != nil }, set: { if !$0 { removerSub = nil } }),
                            titleVisibility: .visible) {
            Button("Remover", role: .destructive) {
                if let s = removerSub { lista.escrever("Submomento removido.") { try await api.removerSubmomento(s.id) } }
                removerSub = nil
            }
            Button("Cancelar", role: .cancel) {}
        } message: { Text(removerSub.map(textoRemoverSubmomento) ?? "") }
        .avisoTemporario($lista.aviso)
    }

    private func cartao(_ k: ConteudoItem) -> some View {
        let c = tema.cores
        let subs = submomentosDe(k.id, dados.submomentos)
        return Cartao {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(k.nome + (k.abreviacao.map { $0.isEmpty ? "" : " · \($0)" } ?? ""))
                            .font(Tipos.corpo15.comPeso(.seminegrito).font)
                            .foregroundColor(k.ativo ? c.tinta.color : c.tinta3.color)
                            .strikethrough(!k.ativo)
                        if !k.proprio { Pastilha(texto: "Padrão", tom: .neutro) }
                    }
                    if let d = k.descricao, !d.isEmpty { Text(d).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).lineLimit(2) }
                }
                Spacer(minLength: 0)
                Toggle("Ativo", isOn: Binding(get: { k.ativo }, set: { on in
                    lista.escrever(on ? "\(k.nome) ativado." : "\(k.nome) desativado.") { try await api.ativarConteudo(k.id, on) }
                }))
                .labelsHidden()
                .tint(c.acao.color)
                .disabled(!pode)
                .accessibilityLabel(k.ativo ? "\(k.nome) ativo" : "\(k.nome) inativo")
            }
            if pode && k.proprio {
                HStack(spacing: 16) {
                    Button("Editar") { editando = k }
                    Button("Remover", role: .destructive) { removerConteudo = k }
                }
                .font(Tipos.corpo13.comPeso(.seminegrito).font)
                .buttonStyle(.borderless)
                .padding(.top, 6)
            }
            if k.dimensao == "tatico" {
                Divisoria().padding(.vertical, 8)
                if subs.isEmpty { Text("sem submomentos").tipo(Tipos.corpo13).foregroundColor(c.tinta3.color) }
                ForEach(subs) { s in
                    HStack(spacing: 8) {
                        Text(s.nome).tipo(Tipos.corpo13.comPeso(.medio))
                            .foregroundColor(s.ativo ? c.tinta.color : c.tinta3.color)
                            .strikethrough(!s.ativo)
                        if !s.proprio { Image(systemName: "lock.fill").font(.system(size: 10)).foregroundColor(c.tinta3.color).accessibilityLabel("padrão") }
                        Spacer(minLength: 0)
                        if pode {
                            Menu {
                                Button(s.ativo ? "Desativar" : "Reativar") {
                                    lista.escrever(s.ativo ? "Submomento desativado." : "Submomento reativado.") { try await api.ativarSubmomento(s.id, !s.ativo) }
                                }
                                Button(s.proprio ? "Editar" : "Editar (gera uma cópia sua)") { submomento = (k, s) }
                                if s.proprio { Button("Remover", role: .destructive) { removerSub = s } }
                            } label: {
                                Image(systemName: "ellipsis.circle").frame(width: ALVO_TOQUE, height: 32)
                            }
                            .accessibilityLabel("Opções de \(s.nome)")
                        }
                    }
                }
                if pode && k.ativo {
                    Button { submomento = (k, nil) } label: { Label("Submomento", systemImage: "plus") }
                        .font(Tipos.corpo13.comPeso(.seminegrito).font)
                        .buttonStyle(.borderless)
                        .padding(.top, 6)
                }
            }
        }
    }

    private func folhaConteudo(_ k: ConteudoItem?) -> some View {
        FormularioSimples(titulo: k == nil ? "Novo conteúdo" : "Editar conteúdo",
                          campos: [("Nome *", k?.nome ?? ""), ("Abreviação (opcional)", k?.abreviacao ?? ""), ("Descrição (opcional)", k?.descricao ?? "")],
                          rodape: (k?.dimensao ?? pilar) == "tatico" ? nil : TEXTO_SEM_SUBMOMENTOS_NAO_TATICO,
                          validar: { $0[0].trimmingCharacters(in: .whitespaces).isEmpty ? MSG_NOME_CONTEUDO : nil }) { v in
            let corpo = corpoConteudo(nome: v[0], abreviacao: v[1], descricao: v[2], pilar: k?.dimensao ?? pilar)
            lista.escrever(k == nil ? "Conteúdo criado." : "Conteúdo salvo.") { try await api.salvarConteudo(k?.id, corpo) }
        }
        .environment(\.tema, tema)
    }

    private func folhaSub(_ k: ConteudoItem, _ s: SubmomentoItem?) -> some View {
        FormularioSimples(titulo: s == nil ? "Novo submomento" : "Editar submomento",
                          campos: [("Nome *", s?.nome ?? ""), ("Descrição (opcional)", s?.descricao ?? ""), ("Ordem", s?.ordem.map(String.init) ?? "")],
                          rodape: s.map { $0.proprio ? nil : "Editar um submomento padrão cria uma cópia sua (o padrão fica desativado)." } ?? "Conteúdo: \(k.nome)",
                          validar: { $0[0].trimmingCharacters(in: .whitespaces).isEmpty ? MSG_NOME_CONTEUDO : nil }) { v in
            let corpo = corpoSubmomento(conteudoId: k.id, nome: v[0], descricao: v[1], ordem: Int(v[2].trimmingCharacters(in: .whitespaces)))
            lista.escrever(s == nil ? "Submomento criado." : "Submomento salvo.") { try await api.salvarSubmomento(s?.id, corpo) }
        }
        .environment(\.tema, tema)
    }
}

/// Folha com N campos de texto (o 1º obrigatório).
struct FormularioSimples: View {
    let titulo: String
    let rotulos: [String]
    let rodape: String?
    let validar: ([String]) -> String?
    let aoSalvar: ([String]) -> Void
    @Environment(\.dismiss) private var fechar
    @State var valores: [String]
    @State var erro: String? = nil

    init(titulo: String, campos: [(String, String)], rodape: String? = nil, validar: @escaping ([String]) -> String?,
         aoSalvar: @escaping ([String]) -> Void) {
        self.titulo = titulo
        rotulos = campos.map(\.0)
        self.rodape = rodape
        self.validar = validar
        self.aoSalvar = aoSalvar
        _valores = State(initialValue: campos.map(\.1))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(rotulos.indices, id: \.self) { i in
                        TextField(rotulos[i], text: $valores[i], axis: .vertical)
                    }
                } footer: { if let rodape { Text(rodape) } }
                if let erro { Section { Text(erro).foregroundColor(.red) } }
            }
            .navigationTitle(titulo)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") {
                        if let e = validar(valores) { erro = e; return }
                        aoSalvar(valores)
                        fechar()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

// MARK: atividades (biblioteca)

struct AtividadesBibliotecaTela: View {
    let contexto: ContextoClube
    let api: ApiCadastros
    @StateObject private var lista: ListaCadastro<AtividadeBiblioteca>
    @StateObject private var conteudos: ListaCadastro<ConteudoItem>
    @Environment(\.tema) private var tema
    @State var busca = ""
    @State var conteudoId: String? = nil
    @State var arquivadas = false
    @State var editando: AtividadeBiblioteca? = nil
    @State var criando = false
    @State var aviso: (titulo: String, texto: String, botao: String, acao: () -> Void)? = nil

    init(contexto: ContextoClube, api: ApiCadastros, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.contexto = contexto
        self.api = api
        _lista = StateObject(wrappedValue: ListaCadastro(aoSessaoAcabar: aoSessaoAcabar) { try await api.atividades() })
        _conteudos = StateObject(wrappedValue: ListaCadastro(aoSessaoAcabar: aoSessaoAcabar) { try await api.conteudos() })
    }

    private var pode: Bool { contexto.podeEditar("library:edit") }

    var body: some View {
        let c = tema.cores
        TelaGrande("Atividades", empilhada: true, aoAtualizar: { await lista.carregar() }) {
            Campo(dica: "Buscar atividades…", valor: $busca, envio: .search)
            HStack(spacing: 8) {
                PilulaMenu(conteudoId.flatMap { id in conteudos.itens.first { $0.id == id }?.nome } ?? "Todos os conteúdos") {
                    Button("Todos os conteúdos") { conteudoId = nil }
                    ForEach(conteudos.itens.filter(\.ativo).sorted { compararNome($0.nome, $1.nome) }) { k in Button(k.nome) { conteudoId = k.id } }
                }
                Toggle("Arquivadas", isOn: $arquivadas).tint(c.acao.color).fixedSize()
            }
            EstadoLista(lista) {
                let itens = filtrarAtividades(lista.itens, busca: busca, conteudoId: conteudoId, arquivadas: arquivadas)
                if itens.isEmpty {
                    Cartao { EstadoVazio(icone: "figure.run", titulo: arquivadas ? "Nenhuma atividade arquivada." : "Nenhuma atividade encontrada.",
                                         texto: "As atividades cadastradas aqui aparecem na hora de planejar o treino.",
                                         acao: pode && !arquivadas ? ("Nova atividade", { criando = true }) : nil) }
                } else {
                    Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                        ForEach(Array(itens.enumerated()), id: \.element.id) { i, a in
                            if i > 0 { Divisoria() }
                            LinhaAgrupada(titulo: a.titulo, detalhe: [a.conteudoNome, a.descricao].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: " · "),
                                          selo: a.arquivada ? "arquivada" : nil, aoTocar: pode && !a.arquivada ? { conferirUso(a, arquivar: false) } : nil) {
                                IconeLinha(icone: "figure.run")
                            }
                            .contextMenu {
                                if pode {
                                    if a.arquivada {
                                        Button("Restaurar") { lista.escrever("Atividade restaurada.") { try await api.arquivarAtividade(a.id, arquivar: false) } }
                                    } else {
                                        Button("Editar") { conferirUso(a, arquivar: false) }
                                        Button("Arquivar") { conferirUso(a, arquivar: true) }
                                    }
                                }
                            }
                        }
                    }
                    Text("Mostrando \(contagem(itens.count, arquivadas ? "atividade arquivada" : "atividade ativa", arquivadas ? "atividades arquivadas" : "atividades ativas"))")
                        .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.horizontal, 4)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if pode { Button { criando = true } label: { Image(systemName: "plus") }.accessibilityLabel("Nova atividade") }
            }
        }
        .task {
            await lista.carregar()
            await conteudos.carregar()
        }
        .sheet(isPresented: $criando) { folha(nil) }
        .sheet(item: $editando) { a in folha(a) }
        .confirmationDialog(aviso?.titulo ?? "", isPresented: Binding(get: { aviso != nil }, set: { if !$0 { aviso = nil } }),
                            titleVisibility: .visible) {
            Button(aviso?.botao ?? "OK") { aviso?.acao(); aviso = nil }
            Button("Cancelar", role: .cancel) {}
        } message: { Text(aviso?.texto ?? "") }
        .avisoTemporario($lista.aviso)
    }

    /// Antes de editar/arquivar: quantas vezes foi usada (o aviso do web quando > 0).
    private func conferirUso(_ a: AtividadeBiblioteca, arquivar: Bool) {
        Task {
            let usos = (try? await api.usoAtividade(a.id)) ?? 0
            let acao: () -> Void = arquivar
                ? { lista.escrever("Atividade arquivada.") { try await api.arquivarAtividade(a.id, arquivar: true) } }
                : { editando = a }
            if let t = avisoUsoAtividade(usos: usos, arquivar: arquivar) {
                aviso = (arquivar ? "Arquivar atividade" : "Editar atividade", t, arquivar ? "Confirmar arquivamento" : "Confirmar edição", acao)
            } else if arquivar {
                aviso = ("Arquivar atividade", "Deseja arquivar esta atividade?", "Arquivar", acao)
            } else {
                acao()
            }
        }
    }

    private func folha(_ a: AtividadeBiblioteca?) -> some View {
        AtividadeBibliotecaFolha(original: a, conteudos: conteudos.itens) { titulo, conteudo, descricao in
            lista.escrever(a == nil ? "Atividade cadastrada." : "Atividade salva.") {
                try await api.salvarAtividade(a?.id, corpoAtividadeBiblioteca(titulo: titulo, conteudoId: conteudo, descricao: descricao))
            }
        }
        .environment(\.tema, tema)
    }
}

struct AtividadeBibliotecaFolha: View {
    let original: AtividadeBiblioteca?
    let conteudos: [ConteudoItem]
    let aoSalvar: (String, String, String?) -> Void
    @Environment(\.dismiss) private var fechar
    @State var pilar: String
    @State var conteudoId: String
    @State var titulo: String
    @State var descricao: String
    @State var erro: String? = nil

    init(original: AtividadeBiblioteca?, conteudos: [ConteudoItem], aoSalvar: @escaping (String, String, String?) -> Void) {
        self.original = original
        self.conteudos = conteudos
        self.aoSalvar = aoSalvar
        let conteudo = conteudos.first { $0.id == original?.conteudoId }
        _pilar = State(initialValue: conteudo?.dimensao ?? "")
        _conteudoId = State(initialValue: original?.conteudoId ?? "")
        _titulo = State(initialValue: original?.titulo ?? "")
        _descricao = State(initialValue: original?.descricao ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Pilar", selection: Binding(get: { pilar }, set: { pilar = $0; conteudoId = "" })) {
                        Text("Selecione").tag("")
                        ForEach(PILARES_STATS, id: \.id) { p in Text(p.rotulo).tag(p.id) }
                    }
                    Picker("Conteúdo", selection: $conteudoId) {
                        Text(pilar.isEmpty ? "Selecione o pilar primeiro" : "Selecione um conteúdo…").tag("")
                        ForEach(conteudos.filter { $0.ativo && $0.dimensao == pilar }.sorted { compararNome($0.nome, $1.nome) }) { k in
                            Text(k.nome).tag(k.id)
                        }
                    }
                    .disabled(pilar.isEmpty)
                    TextField("Nome da atividade (ex.: Posse 4x4+2)", text: $titulo)
                    TextField("Descrição (opcional)", text: $descricao, axis: .vertical).lineLimit(2...6)
                }
                if let erro { Section { Text(erro).foregroundColor(.red) } }
            }
            .navigationTitle(original == nil ? "Nova atividade" : "Editar atividade")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salvar") {
                        if let e = erroAtividadeBiblioteca(pilar: pilar, conteudoId: conteudoId, titulo: titulo) { erro = e; return }
                        aoSalvar(titulo, conteudoId, descricao)
                        fechar()
                    }
                }
            }
        }
    }
}

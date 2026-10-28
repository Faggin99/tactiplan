import SwiftUI
import PhotosUI
import TactiPlanKit

// Ficha do atleta: foto, dados do cadastro, grupo (Mover para…) e o Departamento médico
// (lesões ativas e histórico; registrar, dar alta, remover — injuries:manage, como o web).
// Editar abre a folha do cadastro (athletes:edit). Remover pede confirmação.

struct AtletaTela: View {
    let sessao: Sessao
    let contexto: ContextoClube
    let servico: ServicoElenco
    let categorias: [CategoriaCadastro]
    let aoSessaoAcabar: (Error) -> Bool
    let aoMudar: () -> Void

    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema
    @Environment(\.dismiss) private var fechar
    @State var atleta: Atleta
    @State var lesoes: [Lesao] = []
    @State var carregandoLesoes = true
    @State var erroLesoes: String? = nil
    @State var editando = false
    @State var registrando = false
    @State var confirmarRemover = false
    @State var removerLesao: Lesao? = nil
    @State var ocupado = false
    @State var aviso: String? = nil

    init(atleta: Atleta, sessao: Sessao, contexto: ContextoClube, servico: ServicoElenco, categorias: [CategoriaCadastro],
         aoSessaoAcabar: @escaping (Error) -> Bool, aoMudar: @escaping () -> Void) {
        _atleta = State(initialValue: atleta)
        self.sessao = sessao
        self.contexto = contexto
        self.servico = servico
        self.categorias = categorias
        self.aoSessaoAcabar = aoSessaoAcabar
        self.aoMudar = aoMudar
    }

    private var podeEditar: Bool { contexto.podeEditar("athletes:edit") }
    private var podeLesoes: Bool { contexto.podeEditar("injuries:manage") }

    var body: some View {
        let _ = RegistroDeFalhas.marcar("AtletaTela")
        let c = tema.cores
        let a = atleta
        TelaGrande(a.nome, empilhada: true, aoAtualizar: { await carregarLesoes() }) {
            Cartao {
                HStack(spacing: 14) {
                    FotoAtleta(url: a.fotoUrl, nome: a.nome, tamanho: 72)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(a.nome).font(Tipos.corpo17.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                        Text(detalheAtleta(a, hoje: hojeBrasilia())).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                        Pastilha(texto: grupoDoAtleta(a.grupo).nome, tom: a.grupo == "DM" ? .erro : .info)
                    }
                    Spacer(minLength: 0)
                    if let n = a.camisa {
                        Text("\(n)").font(Tipos.titulo24.font).foregroundColor(c.acaoTinta.color)
                            .accessibilityLabel("Camisa \(n)")
                    }
                }
            }
            ListaAgrupada("Cadastro") {
                LinhaInfo(rotulo: "Posição", valor: nomeDaPosicao(a.posicao, modalidade: contexto.clube?.modalidade).map { n in
                    a.posicao.map { "\(n) (\($0))" } ?? n } ?? "—")
                Divisoria()
                LinhaInfo(rotulo: "Status", valor: ROTULO_STATUS[a.status ?? "active"] ?? "Ativo")
                Divisoria()
                LinhaInfo(rotulo: "Categoria", valor: categorias.first { $0.id == a.categoriaId }?.rotulo ?? "Sem categoria (clube todo)")
                Divisoria()
                LinhaInfo(rotulo: "Nascimento", valor: dataCurtaBR(a.nascimento).map { d in
                    idadeEm(a.nascimento, hoje: hojeBrasilia()).map { "\(d) · \($0) anos" } ?? d } ?? "—")
                Divisoria()
                LinhaInfo(rotulo: "Altura", valor: a.alturaCm.map { "\($0) cm" } ?? "—")
                Divisoria()
                LinhaInfo(rotulo: "Pé preferencial", valor: a.pe.flatMap { ROTULO_PE[$0] } ?? "—")
                Divisoria()
                LinhaInfo(rotulo: "Último clube", valor: a.clubeAnterior ?? "—")
            }
            if let o = a.observacao, !o.isEmpty {
                ListaAgrupada("Observação") {
                    Text(o).tipo(Tipos.corpo15).foregroundColor(c.tinta.color).padding(.vertical, 10)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if podeEditar {
                ListaAgrupada {
                    LinhaAgrupada(icone: "pencil", titulo: "Editar cadastro") { editando = true }
                    Divisoria()
                    Menu {
                        ForEach(GRUPOS_ELENCO, id: \.id) { g in
                            Button(g.nome) { mover(g) }.disabled(grupoDoAtleta(a.grupo) == g)
                        }
                    } label: {
                        LinhaAgrupada(icone: "arrow.left.arrow.right", titulo: "Mover para…", detalhe: grupoDoAtleta(a.grupo).nome)
                    }
                }
            }
            departamentoMedico
            if podeEditar {
                Botao(texto: "Remover atleta", variante: .perigo) { confirmarRemover = true }
                    .padding(.top, 8)
            }
        }
        .task { await carregarLesoes() }
        .sheet(isPresented: $editando) {
            AtletaFolha(atleta: atleta, contexto: contexto, servico: servico, categorias: categorias,
                        aoSessaoAcabar: aoSessaoAcabar) { msg in
                aviso = msg
                aoMudar()
            } aoSalvar: { novo in atleta = novo }
            .environment(\.tema, tema)
            .environmentObject(app)
        }
        .sheet(isPresented: $registrando) {
            LesaoFolha(atleta: atleta, servico: servico, aoSessaoAcabar: aoSessaoAcabar) { msg in
                aviso = msg
                aoMudar()
                Task { await carregarLesoes() }
            }
            .environment(\.tema, tema)
        }
        .confirmationDialog("Excluir atleta", isPresented: $confirmarRemover, titleVisibility: .visible) {
            Button("Excluir", role: .destructive) { remover() }
            Button("Cancelar", role: .cancel) {}
        } message: { Text(TEXTO_REMOVER_ATLETA) }
        .confirmationDialog("Remover lesão", isPresented: Binding(get: { removerLesao != nil }, set: { if !$0 { removerLesao = nil } }),
                            titleVisibility: .visible) {
            Button("Remover", role: .destructive) { if let l = removerLesao { apagarLesao(l) } }
            Button("Cancelar", role: .cancel) {}
        } message: { Text(TEXTO_REMOVER_LESAO) }
        .overlay { if ocupado { ProgressView().padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
        .avisoTemporario($aviso)
    }

    // MARK: departamento médico

    @ViewBuilder
    private var departamentoMedico: some View {
        let c = tema.cores
        let ativas = lesoes.filter(\.ativa)
        let historico = lesoes.filter { !$0.ativa }
        HStack {
            RotuloSecao("Departamento médico")
            Spacer()
            if podeLesoes {
                Button { registrando = true } label: {
                    Label("Registrar lesão", systemImage: "plus").font(Tipos.corpo13.comPeso(.seminegrito).font)
                }
                .foregroundColor(c.acaoTinta.color)
                .frame(minHeight: ALVO_TOQUE)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
        if carregandoLesoes {
            EsqueletoLinha()
        } else if let erroLesoes {
            Cartao {
                EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível carregar as lesões", texto: erroLesoes,
                            acao: ("Tentar de novo", { Task { await carregarLesoes() } }))
            }
        } else if lesoes.isEmpty {
            Cartao { Text("Nenhuma lesão registrada.").tipo(Tipos.corpo15).foregroundColor(c.tinta2.color).padding(.vertical, 6) }
        } else {
            if !ativas.isEmpty {
                ListaAgrupada("Ativas") {
                    ForEach(Array(ativas.enumerated()), id: \.element.id) { i, l in
                        if i > 0 { Divisoria() }
                        linhaLesao(l)
                    }
                }
            }
            if !historico.isEmpty {
                ListaAgrupada("Histórico (\(historico.count))") {
                    ForEach(Array(historico.enumerated()), id: \.element.id) { i, l in
                        if i > 0 { Divisoria() }
                        linhaLesao(l)
                    }
                }
            }
        }
    }

    private func linhaLesao(_ l: Lesao) -> some View {
        let c = tema.cores
        let sev = severidade(l.gravidade)
        return HStack(alignment: .top, spacing: 10) {
            Circle().fill(corHex(sev.cor)).frame(width: 10, height: 10).padding(.top, 6).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(tituloLesao(l)).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                Text("\(sev.rotulo) · \(detalheLesao(l))").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                if let n = l.notas, !n.isEmpty {
                    Text(n).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            if podeLesoes {
                if l.ativa {
                    Button { darAlta(l) } label: {
                        Image(systemName: "checkmark.circle").font(.system(size: 20, weight: .semibold))
                            .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                    }
                    .foregroundColor(c.okTinta.color)
                    .accessibilityLabel("Marcar como resolvida (dar alta)")
                }
                Button { removerLesao = l } label: {
                    Image(systemName: "trash").font(.system(size: 17, weight: .semibold)).frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                }
                .foregroundColor(c.erroTinta.color)
                .accessibilityLabel("Remover registro da lesão")
            }
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .contain)
    }

    // MARK: ações

    private func carregarLesoes() async {
        do {
            lesoes = try await servico.api.lesoes(atletaId: atleta.id)
            erroLesoes = nil
        } catch is CancellationError {
            return
        } catch {
            if aoSessaoAcabar(error) { return }
            erroLesoes = mensagemDeErro(error)
        }
        carregandoLesoes = false
    }

    private func mover(_ g: GrupoElenco) {
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await servico.api.moverGrupo([atleta.id], para: g.valor)
                atleta.grupo = g.valor
                aviso = "Agora em \(g.nome)."
                aoMudar()
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = mensagemErroElenco(error)
            }
        }
    }

    private func darAlta(_ l: Lesao) {
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await servico.api.darAlta(l.id, hoje: hojeBrasilia())
                aviso = "Lesão marcada como resolvida."
                aoMudar()
                await carregarLesoes()
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = mensagemErroElenco(error, permissao: MSG_SEM_PERMISSAO_LESOES)
            }
        }
    }

    private func apagarLesao(_ l: Lesao) {
        removerLesao = nil
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await servico.api.removerLesao(l.id)
                aviso = "Registro removido."
                aoMudar()
                await carregarLesoes()
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = mensagemErroElenco(error, permissao: MSG_SEM_PERMISSAO_LESOES)
            }
        }
    }

    private func remover() {
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await servico.api.removerAtleta(atleta.id)
                aoMudar()
                fechar()
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = mensagemErroElenco(error)
            }
        }
    }
}

// MARK: registrar lesão

struct LesaoFolha: View {
    let atleta: Atleta
    let servico: ServicoElenco
    let aoSessaoAcabar: (Error) -> Bool
    let aoConcluir: (String) -> Void

    @Environment(\.dismiss) private var fechar
    @State var tipo = ""
    @State var local = ""
    @State var gravidade = SEVERIDADE_PADRAO
    @State var inicio = Date()
    @State var temRetorno = false
    @State var retorno = Date()
    @State var notas = ""
    @State var salvando = false
    @State var erro: String? = nil

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Tipo (ex.: Distensão muscular)", text: $tipo)
                    TextField("Local (ex.: Coxa direita)", text: $local)
                    Picker("Gravidade", selection: $gravidade) {
                        ForEach(SEVERIDADES, id: \.id) { s in Text(s.rotulo).tag(s.id) }
                    }
                } header: { Text("Nova lesão · \(atleta.nome)") }
                Section {
                    DatePicker("Início", selection: $inicio, displayedComponents: .date)
                    Toggle("Retorno previsto", isOn: $temRetorno)
                    if temRetorno { DatePicker("Volta em", selection: $retorno, in: inicio..., displayedComponents: .date) }
                }
                Section("Observações") {
                    TextField("Observações", text: $notas, axis: .vertical).lineLimit(3...6)
                }
                if let erro { Section { Text(erro).foregroundColor(.red) } }
            }
            .navigationTitle("Registrar lesão")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Registrar") { salvar() }.disabled(salvando)
                }
            }
            .disabled(salvando)
        }
    }

    private func salvar() {
        if let e = erroLesao(tipo: tipo) { erro = e; return }
        salvando = true
        Task {
            defer { salvando = false }
            do {
                _ = try await servico.registrarLesao(atleta.id, tipo: tipo, local: local, gravidade: gravidade,
                                                     inicio: textoDaData(inicio), retornoPrevisto: temRetorno ? textoDaData(retorno) : nil,
                                                     notas: notas, hoje: hojeBrasilia())
                aoConcluir("Lesão registrada.")
                fechar()
            } catch {
                if aoSessaoAcabar(error) { return }
                erro = mensagemErroElenco(error, permissao: MSG_SEM_PERMISSAO_LESOES)
            }
        }
    }
}

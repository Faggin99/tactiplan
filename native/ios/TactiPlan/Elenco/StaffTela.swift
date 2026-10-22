import SwiftUI
import TactiPlanKit

// Staff (comissão técnica), dentro da aba Elenco: o responsável, os membros, os convites pendentes
// (Reenviar = e-mail de novo + link pela folha de compartilhar), convidar por e-mail com papel,
// permissões por área (interruptores) e categorias, editar e remover. Só o DONO da conta gerencia
// (regra do servidor); os outros veem a lista com o aviso. Limite de convidados "X de Y" sem plano.

@MainActor
final class StaffModelo: ObservableObject {
    enum Estado: Equatable { case carregando, pronto, erro(String) }

    @Published private(set) var equipe = Equipe(membros: [], souDono: false)
    @Published private(set) var categorias: [CategoriaCadastro] = []
    @Published private(set) var estado: Estado = .carregando
    @Published var aviso: String?
    @Published var compartilhar: TextoCompartilhado?

    let api: ApiStaff
    let clubeId: String

    init(api: ApiStaff, clubeId: String) { self.api = api; self.clubeId = clubeId }

    func carregar(_ aoSessaoAcabar: (Error) -> Bool) async {
        if equipe.membros.isEmpty && equipe.dono == nil { estado = .carregando }
        do {
            async let k: [CategoriaCadastro] = (try? await api.categorias(clubeId: clubeId)) ?? []
            equipe = try await api.equipe(clubeId: clubeId)
            categorias = await k
            estado = .pronto
        } catch is CancellationError {
            return
        } catch {
            if aoSessaoAcabar(error) { return }
            estado = .erro(mensagemErroStaff(error))
        }
    }
}

struct StaffConteudo: View {
    let sessao: Sessao
    let contexto: ContextoClube
    @StateObject private var modelo: StaffModelo
    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema
    @State private var editando: MembroEquipe? = nil
    @State private var convidando = false
    @State private var remover: MembroEquipe? = nil

    init(sessao: Sessao, contexto: ContextoClube, api: ApiStaff) {
        self.sessao = sessao
        self.contexto = contexto
        _modelo = StateObject(wrappedValue: StaffModelo(api: api, clubeId: contexto.clube?.id ?? ""))
    }

    /// Gerencia = dono da conta + members:manage + não está em só leitura.
    private var gerencia: Bool { modelo.equipe.souDono && contexto.podeEditar("members:manage") }

    var body: some View {
        Group {
            switch modelo.estado {
            case .carregando:
                ForEach(0..<3, id: \.self) { _ in EsqueletoLinha() }
            case .erro(let msg):
                Cartao {
                    EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível carregar a comissão", texto: msg,
                                acao: ("Tentar de novo", { Task { await carregar() } }))
                }
            case .pronto:
                pronto
            }
        }
        .task { await carregar() }
        .sheet(isPresented: $convidando) { folha(nil) }
        .sheet(item: $editando) { m in folha(m) }
        .sheet(item: $modelo.compartilhar) { t in FolhaCompartilhar(itens: t.itens).presentationDetents([.medium, .large]) }
        .confirmationDialog(remover?.pendente == true ? "Cancelar convite" : "Remover membro",
                            isPresented: Binding(get: { remover != nil }, set: { if !$0 { remover = nil } }), titleVisibility: .visible) {
            Button(remover?.pendente == true ? "Cancelar convite" : "Remover", role: .destructive) { if let m = remover { apagar(m) } }
            Button("Voltar", role: .cancel) {}
        } message: {
            Text("Remover \(remover?.nomeExibido ?? "")? Perde acesso imediato.")
        }
        .avisoTemporario($modelo.aviso)
    }

    private func carregar() async {
        await modelo.carregar { [token = sessao.token] e in app.controle.tratarErro(e, token: token) }
    }

    private func folha(_ m: MembroEquipe?) -> some View {
        MembroFolha(membro: m, clube: contexto.nome, categorias: modelo.categorias, api: modelo.api, clubeId: modelo.clubeId,
                    aoSessaoAcabar: { [token = sessao.token] e in app.controle.tratarErro(e, token: token) }) { msg, link in
            modelo.aviso = msg
            if let link, !link.isEmpty {
                let itens: [Any] = [textoConvite(clube: contexto.nome, url: link)]
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 650_000_000)
                    modelo.compartilhar = TextoCompartilhado(itens: itens)
                }
            }
            Task { await carregar() }
        }
        .environment(\.tema, tema)
    }

    @ViewBuilder
    private var pronto: some View {
        let e = modelo.equipe
        let c = tema.cores
        if gerencia {
            Button { convidar() } label: {
                CartaoHeroi(rotulo: "Convidar para a comissão", selo: nil, valor: "Convidar membro",
                            frase: "Por e-mail, com o link para compartilhar no WhatsApp")
            }
            .buttonStyle(.plain)
            .accessibilityHint("Abre o convite com papel, permissões e categorias")
            if let t = textoLimiteEquipe(usados: e.usados, limite: e.limiteConvidados) {
                Text(t).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.horizontal, 4)
            }
        } else {
            FaixaTom(icone: "person.badge.key", texto: e.souDono ? TEXTO_NAO_EDITA : MSG_SO_DONO_EQUIPE, tom: .neutro)
        }
        ListaAgrupada("Comissão · \(contexto.nome)") {
            if let d = e.dono {
                LinhaAgrupada(titulo: d.nome ?? d.email ?? "Responsável", detalhe: "Proprietário · todas as categorias",
                              selo: d.id == sessao.me.usuario.id ? "Você" : "Dono") {
                    AvatarIniciais(nome: d.nome ?? d.email, tamanho: 36)
                }
            }
            ForEach(e.ativos) { m in
                Divisoria()
                linha(m)
            }
        }
        if e.ativos.isEmpty && e.pendentes.isEmpty {
            Text(TEXTO_SEM_MEMBROS).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).padding(.horizontal, 4)
        }
        if !e.pendentes.isEmpty {
            ListaAgrupada("Convites pendentes") {
                ForEach(Array(e.pendentes.enumerated()), id: \.element.id) { i, m in
                    if i > 0 { Divisoria() }
                    pendente(m)
                }
            }
        }
    }

    private func linha(_ m: MembroEquipe) -> some View {
        let eu = m.usuarioId == sessao.me.usuario.id
        var detalhe = "\(rotuloPapelStaff(m.papel)) · \(escopoCategorias(m.categoriaIds, categorias: modelo.categorias))"
        if m.personalizadas { detalhe += " · permissões personalizadas" }
        let resumo = resumoPermissoes(m.efetivas).prefix(3).joined(separator: "\n")
        return VStack(alignment: .leading, spacing: 4) {
            LinhaAgrupada(titulo: m.nomeExibido, detalhe: detalhe, selo: eu ? "Você" : nil,
                          aoTocar: gerencia && !eu ? { editando = m } : nil) {
                AvatarIniciais(nome: m.nomeExibido, tamanho: 36)
            }
            if !resumo.isEmpty {
                Text(resumo).tipo(Tipos.corpo13).foregroundColor(tema.cores.tinta2.color)
                    .padding(.leading, 48).padding(.bottom, 6)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .contextMenu {
            if gerencia && !eu {
                Button { editando = m } label: { Label("Editar permissões", systemImage: "slider.horizontal.3") }
                Button(role: .destructive) { remover = m } label: { Label("Remover", systemImage: "trash") }
            }
        }
    }

    private func pendente(_ m: MembroEquipe) -> some View {
        let c = tema.cores
        return HStack(spacing: 12) {
            IconeLinha(icone: "envelope")
            VStack(alignment: .leading, spacing: 1) {
                Text(m.nomeExibido).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color).lineLimit(1)
                Text("\(rotuloPapelStaff(m.papel)) · convite enviado\(m.convidadoEm.flatMap { dataCurtaBR($0) }.map { " em \($0)" } ?? "")")
                    .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
            }
            Spacer(minLength: 0)
            if gerencia {
                Menu {
                    Button { reenviar(m) } label: { Label("Reenviar e compartilhar o link", systemImage: "arrowshape.turn.up.right") }
                    Button { editando = m } label: { Label("Editar convite", systemImage: "slider.horizontal.3") }
                    Button(role: .destructive) { remover = m } label: { Label("Cancelar convite", systemImage: "trash") }
                } label: {
                    Text("Reenviar").font(Tipos.corpo13.comPeso(.seminegrito).font).foregroundColor(c.acaoTinta.color)
                        .frame(minHeight: ALVO_TOQUE)
                }
                .accessibilityLabel("Opções do convite de \(m.nomeExibido)")
            }
        }
        .padding(.vertical, 8)
    }

    private func convidar() {
        let e = modelo.equipe
        guard podeConvidar(usados: e.usados, limite: e.limiteConvidados) else {
            modelo.aviso = (e.limiteConvidados ?? 0) > 0 ? MSG_LIMITE_EQUIPE : MSG_CONVITE_INDISPONIVEL
            return
        }
        convidando = true
    }

    private func reenviar(_ m: MembroEquipe) {
        Task {
            do {
                let link = try await modelo.api.reenviar(clubeId: modelo.clubeId, membroId: m.id)
                modelo.aviso = "Convite reenviado para \(m.nomeExibido)."
                if !link.isEmpty { modelo.compartilhar = TextoCompartilhado(itens: [textoConvite(clube: contexto.nome, url: link)]) }
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                modelo.aviso = mensagemErroStaff(error)
            }
        }
    }

    private func apagar(_ m: MembroEquipe) {
        remover = nil
        Task {
            do {
                try await modelo.api.remover(clubeId: modelo.clubeId, membroId: m.id)
                modelo.aviso = m.pendente ? "Convite cancelado." : "\(m.nomeExibido) saiu da comissão."
                await carregar()
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                modelo.aviso = mensagemErroStaff(error)
            }
        }
    }
}

// MARK: convidar / editar

struct MembroFolha: View {
    let membro: MembroEquipe?
    let clube: String
    let categorias: [CategoriaCadastro]
    let api: ApiStaff
    let clubeId: String
    let aoSessaoAcabar: (Error) -> Bool
    /// (aviso, link do convite para compartilhar)
    let aoConcluir: (String, String?) -> Void

    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State var r: RascunhoMembro
    @State var avancado: Bool
    @State var salvando = false
    @State var erro: String? = nil

    init(membro: MembroEquipe?, clube: String, categorias: [CategoriaCadastro], api: ApiStaff, clubeId: String,
         aoSessaoAcabar: @escaping (Error) -> Bool, aoConcluir: @escaping (String, String?) -> Void) {
        self.membro = membro; self.clube = clube; self.categorias = categorias; self.api = api; self.clubeId = clubeId
        self.aoSessaoAcabar = aoSessaoAcabar; self.aoConcluir = aoConcluir
        let r = membro.map(RascunhoMembro.de) ?? RascunhoMembro()
        _r = State(initialValue: r)
        _avancado = State(initialValue: membro?.personalizadas == true || r.papel == "other")
    }

    private var convite: Bool { membro == nil }

    private var papeis: [String] {
        var l = PAPEIS_CONVITE
        if let p = membro?.papel, !l.contains(p) { l.insert(p, at: 0) } // legado (manager/viewer)
        return l
    }

    var body: some View {
        NavigationStack {
            Form {
                if convite {
                    Section {
                        TextField("convidado@email.com", text: $r.email)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .textContentType(.emailAddress)
                    } header: { Text("E-mail") } footer: { Text("A pessoa recebe o convite por e-mail e você também pode mandar o link pelo WhatsApp.") }
                }
                Section {
                    Picker("Papel", selection: Binding(get: { r.papel }, set: { novo in
                        r.trocarPapel(novo)
                        if novo == "other" { avancado = true }
                    })) {
                        ForEach(papeis, id: \.self) { p in Text(rotuloPapelStaff(p)).tag(p) }
                    }
                } footer: { Text(DESCRICOES_PAPEL[r.papel] ?? "") }
                if !categorias.isEmpty {
                    Section {
                        Toggle("Todas as categorias do clube", isOn: Binding(get: { r.categoriaIds == nil },
                                                                              set: { r.categoriaIds = $0 ? nil : [] }))
                        if let sel = r.categoriaIds {
                            ForEach(categorias) { k in
                                Toggle(k.rotulo, isOn: Binding(get: { sel.contains(k.id) }, set: { on in
                                    var l = r.categoriaIds ?? []
                                    if on { if !l.contains(k.id) { l.append(k.id) } } else { l.removeAll { $0 == k.id } }
                                    r.categoriaIds = l
                                }))
                            }
                        }
                    } header: { Text("Acesso a categorias") } footer: {
                        Text("Quando limitado, o membro só vê e edita dados das categorias selecionadas.")
                    }
                }
                Section {
                    Toggle("Personalizar permissões", isOn: Binding(get: { avancado }, set: { on in
                        avancado = on
                        if !on && (r.mexeuPermissoes || membro?.personalizadas == true) { r.voltarAoPadrao() }
                    }))
                    if avancado {
                        if r.mexeuPermissoes || membro?.personalizadas == true {
                            Button("Voltar aos padrões do papel") { r.voltarAoPadrao() }
                        }
                    }
                } footer: {
                    Text(avancado ? "Ligado: o que você marcar abaixo substitui o padrão do papel." : "Desligado: usa as permissões padrão do papel.")
                }
                if avancado {
                    ForEach(GRUPOS_PERMISSAO, id: \.rotulo) { g in
                        let visiveis = g.permissoes.filter { !PERMISSOES_OCULTAS_NO_APP.contains($0) }
                        Section(g.rotulo) {
                            ForEach(visiveis, id: \.self) { p in
                                Toggle(ROTULOS_PERMISSAO[p] ?? p, isOn: Binding(get: { r.permissoes.contains(p) },
                                                                                 set: { r.alternar(p, $0) }))
                            }
                        }
                    }
                } else {
                    Section("O que a pessoa pode fazer") {
                        ForEach(resumoPermissoes(r.permissoes), id: \.self) { t in Text(t).font(Tipos.corpo13.font) }
                    }
                }
                if let erro { Section { Text(erro).foregroundColor(tema.cores.erroTinta.color) } }
            }
            .navigationTitle(convite ? "Convidar membro" : "Editar permissões")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(convite ? "Enviar" : "Salvar") { salvar() }.disabled(salvando)
                }
            }
            .disabled(salvando)
            .overlay { if salvando { ProgressView().padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
        }
    }

    private func salvar() {
        if let e = r.erro(convite: convite) { erro = e; return }
        salvando = true
        Task {
            defer { salvando = false }
            do {
                if let m = membro {
                    try await api.atualizar(clubeId: clubeId, membroId: m.id, r.corpoEdicao())
                    aoConcluir("Permissões salvas.", nil)
                } else {
                    let link = try await api.convidar(clubeId: clubeId, r.corpoConvite())
                    aoConcluir("Convite enviado para \(r.email.trimmingCharacters(in: .whitespaces)).", link)
                }
                fechar()
            } catch {
                if aoSessaoAcabar(error) { return }
                erro = mensagemErroStaff(error)
            }
        }
    }
}

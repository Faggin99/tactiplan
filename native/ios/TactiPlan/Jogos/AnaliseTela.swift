import SwiftUI
import TactiPlanKit

// Análise do adversário no app: lista das 13 seções (● = preenchida) → formulário da seção, gerado
// pelo esquema do Kit (Analise.swift), o mesmo do web. Salvar = PUT; Gerar PDF salva antes.
// Android: ui/jogos/AnaliseTela.kt.

@MainActor
final class AnaliseModelo: ObservableObject {
    @Published var dados: Json?
    @Published var erro: String?
    @Published var sujo = false
    @Published var salvando = false
    @Published var aviso: String?

    let sessaoId: String
    let api: ApiJogo
    let aoSessaoAcabar: (Error) -> Bool

    init(sessaoId: String, api: ApiJogo, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessaoId = sessaoId; self.api = api; self.aoSessaoAcabar = aoSessaoAcabar
    }

    func carregar() async {
        do { dados = try await api.analise(sessaoId) } catch {
            if !aoSessaoAcabar(error) { erro = mensagemDeErro(error) }
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
        _modelo = StateObject(wrappedValue: AnaliseModelo(sessaoId: sessaoId, api: api, aoSessaoAcabar: aoSessaoAcabar))
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: treino, aoSessaoAcabar: aoSessaoAcabar))
    }

    private func gerarPdf() {
        Task {
            if modelo.sujo && podeEditar { guard await modelo.salvar() else { return } }
            exportar.iniciar(tipo: "analise", corpo: corpoRelatorioJogo(sessaoId),
                             nome: nomePdfAnalise(adversario: adversario, data: data), usuarioId: usuarioId)
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
                    Text("O PDF mostra só o que estiver preenchido.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    ListaAgrupada {
                        ForEach(Array(SECOES_ANALISE.enumerated()), id: \.element.chave) { i, s in
                            if i > 0 { Divisoria() }
                            NavigationLink {
                                SecaoAnaliseTela(secao: s, modelo: modelo, podeEditar: podeEditar)
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
                    Botao(texto: exportar.ocupado ? "Gerando…" : "Gerar PDF", variante: .secundario) { gerarPdf() }
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
                Button { gerarPdf() } label: {
                    if exportar.ocupado { ProgressView() } else { Image(systemName: "square.and.arrow.up") }
                }
                .accessibilityLabel("Gerar PDF da análise")
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
    @Environment(\.tema) private var tema

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(secao.campos.enumerated()), id: \.offset) { _, campo in
                    campoView(campo, base: [])
                }
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

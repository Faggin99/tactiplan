import SwiftUI
import UIKit
import TactiPlanKit

// Aba Quadro (T5, tela 14 do desenho): as jogadas da CONTA (valem para todos os clubes; a linha
// mostra "criada em <clube>"), com busca. Tocar = assistir em pé; "Editar" (ou "+") abre o editor
// deitado. Criar/duplicar/renomear/excluir só com tactical:edit e conta com assinatura (no só
// leitura, só assistir). Mesmas rotas do web (/api/plays), mesmo formato de jogada.

@MainActor
final class QuadroModelo: ObservableObject {
    enum Estado: Equatable { case carregando, pronto, erro(String) }

    @Published private(set) var jogadas: [Jogada] = []
    @Published private(set) var estado: Estado = .carregando
    @Published var busca = ""
    @Published var aviso: String?

    let api: ApiQuadro
    let clubeId: String?
    let aoSessaoAcabar: (Error) -> Bool

    init(api: ApiQuadro, clubeId: String?, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.api = api; self.clubeId = clubeId; self.aoSessaoAcabar = aoSessaoAcabar
    }

    var visiveis: [Jogada] { filtrarJogadas(jogadas, busca: busca) }

    func carregar() async {
        if jogadas.isEmpty { estado = .carregando }
        do {
            jogadas = try await api.listar()
            estado = .pronto
        } catch is CancellationError {
            return
        } catch {
            if aoSessaoAcabar(error) { return }
            if jogadas.isEmpty { estado = .erro(mensagemErroQuadro(error)) } else { aviso = mensagemErroQuadro(error) }
        }
    }

    /// Abre a jogada completa (a lista já traz os quadros, mas o editor pede a versão mais nova).
    func completa(_ j: Jogada) async -> Jogada {
        (try? await api.abrir(j.id)) ?? j
    }

    func duplicar(_ j: Jogada) async {
        do {
            let c = try await api.criar(corpoDaJogada(await completa(j), nome: nomeDaCopia(j.nome), clubeId: clubeId))
            aviso = "Jogada duplicada: \(c.nome)"
            await carregar()
        } catch {
            if aoSessaoAcabar(error) { return }
            aviso = mensagemErroQuadro(error)
        }
    }

    func renomear(_ j: Jogada, para nome: String) async {
        guard let n = nomeValidoJogada(nome) else { return }
        do {
            _ = try await api.atualizar(j.id, corpoDaJogada(await completa(j), nome: n, clubeId: clubeId))
            aviso = "Jogada renomeada"
            await carregar()
        } catch {
            if aoSessaoAcabar(error) { return }
            aviso = mensagemErroQuadro(error)
        }
    }

    func excluir(_ j: Jogada) async {
        do {
            try await api.excluir(j.id)
            jogadas.removeAll { $0.id == j.id }
            aviso = "Jogada excluída"
        } catch {
            if aoSessaoAcabar(error) { return }
            aviso = mensagemErroQuadro(error)
        }
    }

    func salvou(_ j: Jogada) { Task { await carregar() } }
}

/// O que o editor abre (jogada existente ou quadro novo).
struct AberturaEditor: Identifiable {
    let id = UUID()
    let jogada: Jogada?
}

struct QuadroTela: View {
    @EnvironmentObject private var app: AppEstado
    let sessao: Sessao
    let contexto: ContextoClube
    @StateObject private var modelo: QuadroModelo
    @Environment(\.tema) private var tema
    @State private var assistir: Jogada?
    @State private var editor: AberturaEditor?
    @State private var renomeando: Jogada?
    @State private var novoNome = ""
    @State private var excluindo: Jogada?

    init(sessao: Sessao, contexto: ContextoClube, api: ApiQuadro, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessao = sessao
        self.contexto = contexto
        _modelo = StateObject(wrappedValue: QuadroModelo(api: api, clubeId: contexto.clube?.id, aoSessaoAcabar: aoSessaoAcabar))
    }

    private var permissoes: PermissoesQuadro { permissoesQuadro(contexto) }

    var body: some View {
        TelaGrande(ABA_QUADRO.rotulo, aoAtualizar: { await modelo.carregar() }) {
            HStack(spacing: 4) {
                if permissoes.editar {
                    Button { editor = AberturaEditor(jogada: nil) } label: {
                        Image(systemName: "plus").font(.system(size: 18, weight: .semibold)).frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                    }
                    .accessibilityLabel("Nova jogada")
                }
                LogoClube(personalizacao: contexto.clube?.personalizacao, tamanho: 36)
            }
        } conteudo: {
            FaixasDoTopo(contexto: contexto, sessao: sessao)
            Campo(dica: "Buscar jogada", valor: $modelo.busca, envio: .search)
            conteudo
            if permissoes.editar && !modelo.jogadas.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "rectangle.landscape.rotate").font(.system(size: 14))
                    Text("Toque em Editar para abrir o editor deitado").tipo(Tipos.corpo13)
                }
                .foregroundColor(tema.cores.tinta2.color)
                .frame(maxWidth: .infinity)
                .padding(.top, 4)
            }
        }
        .task { await modelo.carregar() }
        .avisoTemporario($modelo.aviso)
        .navigationDestination(isPresented: Binding(get: { assistir != nil }, set: { if !$0 { assistir = nil } })) {
            if let j = assistir {
                AssistirJogadaTela(jogada: j, podeEditar: permissoes.editar, carregar: { [modelo] in await modelo.completa(j) }) { jj in
                    editor = AberturaEditor(jogada: jj)
                }
            }
        }
        .fullScreenCover(item: $editor) { ab in
            let web = app.clienteWeb(sessao, contexto)
            let clube = contexto.clube?.id
            EditorQuadroTela(modelo: EditorQuadroModelo(
                jogada: ab.jogada, tipoInicial: tipoDoClube, api: modelo.api, clubeId: clube,
                carregarAtletas: {
                    guard let id = clube else { return [] }
                    let lista = (try? await ApiElencoHttp(web).atletas(clubeId: id)) ?? []
                    return lista.sorted { compararNome($0.nome, $1.nome) }
                },
                aoSalvar: { [modelo] j in modelo.salvou(j) }, aoSessaoAcabar: modelo.aoSessaoAcabar))
        }
        .alert("Renomear jogada", isPresented: Binding(get: { renomeando != nil }, set: { if !$0 { renomeando = nil } })) {
            TextField("Nome da jogada", text: $novoNome)
            Button("Cancelar", role: .cancel) {}
            Button("Salvar") { if let j = renomeando { Task { await modelo.renomear(j, para: novoNome) } } }
        }
        .confirmationDialog("Excluir a jogada \"\(excluindo?.nome ?? "")\"?", isPresented: Binding(get: { excluindo != nil }, set: { if !$0 { excluindo = nil } }),
                            titleVisibility: .visible) {
            Button("Excluir", role: .destructive) { if let j = excluindo { Task { await modelo.excluir(j) } } }
            Button("Cancelar", role: .cancel) {}
        }
    }

    /// Modalidade do clube → campo do quadro novo (sport.defaultFieldType do web).
    private var tipoDoClube: String {
        switch contexto.clube?.modalidade {
        case "futsal": return TipoCampo.futsal
        case "football_7": return TipoCampo.futebol7
        default: return TipoCampo.futebol11
        }
    }

    @ViewBuilder private var conteudo: some View {
        switch modelo.estado {
        case .carregando where modelo.jogadas.isEmpty:
            Cartao { ProgressView().frame(maxWidth: .infinity, minHeight: 120) }
        case .erro(let msg):
            Cartao { EstadoVazio(icone: "wifi.exclamationmark", titulo: "Não deu para abrir as jogadas", texto: msg,
                                 acao: (rotulo: "Tentar de novo", aoTocar: { Task { await modelo.carregar() } })) }
        default:
            if modelo.jogadas.isEmpty {
                Cartao {
                    if permissoes.editar {
                        EstadoVazio(icone: ABA_QUADRO.icone, titulo: "Nenhuma jogada ainda",
                                    texto: "Crie a primeira no editor: peças, setas, desenhos e quadros animados.",
                                    acao: (rotulo: "Nova jogada", aoTocar: { editor = AberturaEditor(jogada: nil) }))
                    } else {
                        EstadoVazio(icone: ABA_QUADRO.icone, titulo: "Nenhuma jogada ainda",
                                    texto: "Quando a comissão criar jogadas no quadro tático, elas aparecem aqui.")
                    }
                }
            } else if modelo.visiveis.isEmpty {
                Cartao { EstadoVazio(icone: "magnifyingglass", titulo: "Nada encontrado", texto: "Nenhuma jogada com \"\(modelo.busca)\".") }
            } else {
                ListaAgrupada {
                    ForEach(Array(modelo.visiveis.enumerated()), id: \.element.id) { i, j in
                        if i > 0 { Divisoria() }
                        LinhaAgrupada(titulo: j.nome.isEmpty ? "Sem nome" : j.nome, detalhe: resumoJogada(j), aoTocar: { assistir = j }) {
                            MiniaturaJogada(jogada: j)
                        }
                        .contextMenu { menu(j) }
                    }
                }
            }
        }
    }

    @ViewBuilder private func menu(_ j: Jogada) -> some View {
        Button { assistir = j } label: { Label("Assistir", systemImage: "play.fill") }
        if permissoes.editar {
            Button { Task { editor = AberturaEditor(jogada: await modelo.completa(j)) } } label: { Label("Editar", systemImage: "pencil") }
            Button { Task { await modelo.duplicar(j) } } label: { Label("Duplicar", systemImage: "plus.square.on.square") }
            Button { novoNome = j.nome; renomeando = j } label: { Label("Renomear", systemImage: "character.cursor.ibeam") }
            Button(role: .destructive) { excluindo = j } label: { Label("Excluir", systemImage: "trash") }
        }
    }
}

/// Miniatura: o 1º quadro desenhado pequeno (mesmo desenho do campo).
struct MiniaturaJogada: View {
    let jogada: Jogada
    var body: some View {
        let q = jogada.quadros.first
        CampoQuadro { t in
            CenaQuadro(dims: dimensoesCanvas(Double(t.width), Double(t.height), tipo: jogada.tipoCampo, vista: jogada.vista),
                       tipo: jogada.tipoCampo, vista: jogada.vista, pecas: q?.elementos ?? [], desenhos: q?.desenhos ?? [],
                       corA: jogada.bruto["team_a_color"]?.texto ?? "#3b82f6", corB: jogada.bruto["team_b_color"]?.texto ?? "#ef4444")
        }
        .scaleEffect(1 / 6, anchor: .topLeading)
        .frame(width: 56 * 6, height: 36 * 6, alignment: .topLeading)
        .frame(width: 56, height: 36, alignment: .topLeading)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .accessibilityHidden(true)
    }
}

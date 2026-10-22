import SwiftUI
import TactiPlanKit

// Aba Elenco (T3): Atletas | Staff. Atletas = o plantel do clube aberto em acordeões por grupo
// (G1, G2, G3, Transição, DM, Sem grupo), com busca, filtro por categoria e posição e ordem por
// posição (GOL, LD, ZAG, LE, VOL, MEI, ED, EE, CA) — as regras do PlantelPage do web, no Kit.
// Segurar a linha = "Mover para…" (PUT /api/athletes/batch-groups, como o arrastar do web).
// "+" cadastra; o PDF do plantel sai do servidor (POST /api/reports/plantel).

@MainActor
final class ElencoModelo: ObservableObject {
    enum Estado: Equatable { case carregando, pronto, erro(String) }

    @Published private(set) var pacote = PacoteElenco(atletas: [])
    @Published private(set) var estado: Estado = .carregando
    @Published var busca = ""
    @Published var categoria = CATEGORIA_TODAS
    @Published var posicao: String?
    @Published var porPosicao = true
    @Published var abertos: Set<String> = [GRUPOS_ELENCO[0].id]
    @Published var aviso: String?

    let servico: ServicoElenco
    let aoSessaoAcabar: (Error) -> Bool

    init(servico: ServicoElenco, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.servico = servico
        self.aoSessaoAcabar = aoSessaoAcabar
    }

    var secoes: [SecaoElenco] {
        agruparElenco(pacote.atletas, busca: busca, categoria: categoria, posicao: posicao, porPosicao: porPosicao,
                      lesoesAtivas: pacote.lesoesAtivas)
    }

    func carregar() async {
        if pacote.atletas.isEmpty { estado = .carregando }
        do {
            pacote = try await servico.carregar()
            estado = .pronto
        } catch is CancellationError {
            return
        } catch {
            if aoSessaoAcabar(error) { return }
            if pacote.atletas.isEmpty { estado = .erro(mensagemDeErro(error)) } else { aviso = mensagemDeErro(error) }
        }
    }

    func mover(_ a: Atleta, para g: GrupoElenco) {
        guard grupoDoAtleta(a.grupo) != g else { return }
        Task {
            do {
                try await servico.api.moverGrupo([a.id], para: g.valor)
                aviso = "\(primeiroNome(a.nome) ?? a.nome) foi para \(g.nome)."
                await carregar()
            } catch {
                if aoSessaoAcabar(error) { return }
                aviso = mensagemErroElenco(error)
            }
        }
    }

    func aberto(_ id: String) -> Binding<Bool> {
        Binding(get: { [weak self] in self?.abertos.contains(id) ?? false },
                set: { [weak self] v in if v { self?.abertos.insert(id) } else { self?.abertos.remove(id) } })
    }
}

struct ElencoTela: View {
    @EnvironmentObject private var app: AppEstado
    let sessao: Sessao
    let contexto: ContextoClube
    @StateObject private var modelo: ElencoModelo
    @StateObject private var exportar: ExportadorRelatorio
    @Environment(\.tema) private var tema
    @State private var parte = 0
    @State private var novo = false

    init(sessao: Sessao, contexto: ContextoClube, servico: ServicoElenco, treino: ServicoTreino,
         aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessao = sessao
        self.contexto = contexto
        _modelo = StateObject(wrappedValue: ElencoModelo(servico: servico, aoSessaoAcabar: aoSessaoAcabar))
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: treino, aoSessaoAcabar: aoSessaoAcabar))
    }

    private var podeEditar: Bool { contexto.clube != nil && contexto.podeEditar("athletes:edit") }
    private var podeExportar: Bool {
        contexto.clube != nil && contexto.pode("athletes:view") && !(contexto.conta.somenteLeitura ?? false)
    }

    var body: some View {
        TelaGrande(ABA_ELENCO.rotulo, aoAtualizar: { await modelo.carregar() }) {
            HStack(spacing: 4) {
                if parte == 0 && podeExportar {
                    Button { exportarPlantel() } label: {
                        Image(systemName: "doc.richtext").font(.system(size: 18, weight: .semibold))
                            .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                    }
                    .accessibilityLabel("Exportar o plantel em PDF")
                    .disabled(exportar.ocupado)
                }
                if parte == 0 && podeEditar {
                    Button { novo = true } label: {
                        Image(systemName: "plus").font(.system(size: 18, weight: .semibold))
                            .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                    }
                    .accessibilityLabel("Novo atleta")
                }
                LogoClube(personalizacao: contexto.clube?.personalizacao, tamanho: 36)
            }
        } conteudo: {
            FaixasDoTopo(contexto: contexto, sessao: sessao)
            Picker("Parte do elenco", selection: $parte) {
                Text("Atletas").tag(0)
                Text("Staff").tag(1)
            }
            .pickerStyle(.segmented)
            if contexto.clube == nil {
                Cartao { EstadoVazio(icone: "sportscourt", titulo: "Nenhum clube ainda",
                                     texto: "Quando o clube for cadastrado, o elenco aparece aqui.") }
            } else if parte == 1 {
                StaffConteudo(sessao: sessao, contexto: contexto, api: app.apiStaff(sessao, contexto))
            } else if !contexto.pode("athletes:view") {
                Cartao { EstadoVazio(icone: "lock", titulo: "Sem acesso aos atletas",
                                     texto: "Peça ao responsável pela equipe a permissão de ver atletas.") }
            } else {
                atletas
            }
        }
        .task { if contexto.pode("athletes:view") { await modelo.carregar() } }
        .sheet(isPresented: $novo) {
            AtletaFolha(atleta: nil, contexto: contexto, servico: modelo.servico, categorias: modelo.pacote.categorias,
                        aoSessaoAcabar: modelo.aoSessaoAcabar) { msg in
                modelo.aviso = msg
                Task { await modelo.carregar() }
            }
            .environment(\.tema, tema)
            .environmentObject(app)
        }
        .avisoTemporario($modelo.aviso)
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }

    private func exportarPlantel() {
        guard let clube = contexto.clube else { return }
        exportar.iniciar(tipo: "plantel", corpo: corpoPdfPlantel(clubeId: clube.id),
                         nome: nomePdfPlantel(clube.nome, hoje: hojeBrasilia()), usuarioId: sessao.me.usuario.id)
    }

    @ViewBuilder
    private var atletas: some View {
        let c = tema.cores
        Campo(dica: "Buscar atleta (nome ou camisa)", valor: $modelo.busca, envio: .search)
            .accessibilityLabel("Buscar atleta")
        filtros
        switch modelo.estado {
        case .carregando:
            ForEach(0..<4, id: \.self) { _ in EsqueletoLinha() }
        case .erro(let msg):
            Cartao {
                EstadoVazio(icone: "exclamationmark.triangle", titulo: "Não foi possível carregar o elenco", texto: msg,
                            acao: ("Tentar de novo", { Task { await modelo.carregar() } }))
            }
        case .pronto:
            if modelo.pacote.atletas.isEmpty {
                Cartao {
                    EstadoVazio(icone: "person.3", titulo: TITULO_ELENCO_VAZIO,
                                texto: podeEditar ? TEXTO_ELENCO_VAZIO_EDITA : TEXTO_ELENCO_VAZIO_LE,
                                acao: podeEditar ? ("Novo atleta", { novo = true }) : nil)
                }
            } else {
                Text(resumoElenco(modelo.pacote.atletas))
                    .tipo(Tipos.corpo13.comPeso(.medio))
                    .foregroundColor(c.tinta2.color)
                    .padding(.horizontal, 4)
                let secoes = modelo.secoes
                if secoes.isEmpty {
                    Cartao { EstadoVazio(icone: "magnifyingglass", titulo: "Ninguém encontrado",
                                         texto: "Nenhum atleta com esse filtro. Mude a busca ou os filtros.") }
                }
                ForEach(secoes) { s in
                    Acordeao(titulo: s.grupo.nome, sigla: s.grupo.sigla, quantidade: s.atletas.count, resumo: s.resumo,
                             aberto: modelo.aberto(s.id)) {
                        ForEach(s.atletas) { a in
                            Divisoria()
                            linha(a)
                        }
                    }
                }
            }
        }
    }

    private var filtros: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if !modelo.pacote.categorias.isEmpty {
                    PilulaMenu(rotuloCategoria) {
                        Button("Todas") { modelo.categoria = CATEGORIA_TODAS }
                        Button("Sem categoria") { modelo.categoria = CATEGORIA_SEM }
                        ForEach(modelo.pacote.categorias) { k in Button(k.rotulo) { modelo.categoria = k.id } }
                    }
                }
                PilulaMenu(modelo.posicao ?? "Posição") {
                    Button("Todas as posições") { modelo.posicao = nil }
                    ForEach(posicoesDaModalidade(contexto.clube?.modalidade), id: \.codigo) { p in
                        Button(p.rotulo) { modelo.posicao = p.codigo }
                    }
                }
                PilulaMenu(modelo.porPosicao ? "Ordem: posição" : "Ordem: nome") {
                    Button("Por posição") { modelo.porPosicao = true }
                    Button("Por nome") { modelo.porPosicao = false }
                }
            }
            .padding(.vertical, 2)
        }
    }

    private var rotuloCategoria: String {
        switch modelo.categoria {
        case CATEGORIA_TODAS: return "Categoria: todas"
        case CATEGORIA_SEM: return "Sem categoria"
        default: return modelo.pacote.categorias.first { $0.id == modelo.categoria }?.nome ?? "Categoria"
        }
    }

    private func linha(_ a: Atleta) -> some View {
        let c = tema.cores
        let lesao = modelo.pacote.lesoesAtivas.first { $0.atletaId == a.id }
        return NavigationLink {
            AtletaTela(atleta: a, sessao: sessao, contexto: contexto, servico: modelo.servico,
                       categorias: modelo.pacote.categorias, aoSessaoAcabar: modelo.aoSessaoAcabar,
                       aoMudar: { Task { await modelo.carregar() } })
        } label: {
            HStack(spacing: 12) {
                Text(a.camisa.map(String.init) ?? "—")
                    .font(Tipo.corpo(15, peso: .bold))
                    .foregroundColor(c.tinta2.color)
                    .frame(width: 28)
                FotoAtleta(url: a.fotoUrl, nome: a.nome, tamanho: 36)
                VStack(alignment: .leading, spacing: 1) {
                    Text(a.nome).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color).lineLimit(1)
                    Text(detalheAtleta(a, hoje: hojeBrasilia())).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                }
                Spacer(minLength: 0)
                if lesao != nil { Pastilha(texto: "Lesão", tom: .erro) }
                Seta()
            }
            .padding(.vertical, 8)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(podeEditar ? "Abre a ficha. Segure para mover de grupo." : "Abre a ficha")
        .contextMenu {
            if podeEditar {
                Text("Mover para…")
                ForEach(GRUPOS_ELENCO, id: \.id) { g in
                    Button(g.nome) { modelo.mover(a, para: g) }.disabled(grupoDoAtleta(a.grupo) == g)
                }
            }
        }
    }
}

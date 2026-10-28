import SwiftUI
import TactiPlanKit

/// As 5 abas do clube em uso (Semana · Jogos · Elenco · Quadro · Mais), com o tema do clube.
/// Um NavigationStack por aba; tocar a aba ativa já na raiz rola para o topo.
struct Casca: View {
    @EnvironmentObject private var app: AppEstado
    let sessao: Sessao
    let contexto: ContextoClube
    @State private var aba = ABA_SEMANA.id
    @State private var toques: [String: Int] = [:]

    init(sessao: Sessao, contexto: ContextoClube) {
        self.sessao = sessao
        self.contexto = contexto
    }

    var body: some View {
        let _ = RegistroDeFalhas.marcar("Casca")
        let abas = abasDoContexto(contexto)
        TabView(selection: selecao(abas)) {
            ForEach(abas) { def in
                NavigationStack {
                    raiz(def)
                        .environment(\.toqueNaAba, toques[def.id] ?? 0)
                }
                .tabItem { Label(def.rotulo, systemImage: def.icone) }
                .tag(def.id)
            }
        }
    }

    @ViewBuilder
    private func raiz(_ def: DefAba) -> some View {
        if def.id == ABA_MAIS.id {
            MaisTela(sessao: sessao, contexto: contexto, treino: app.servicoTreino(sessao, contexto),
                     aoSessaoAcabar: { [token = sessao.token] e in app.controle.tratarErro(e, token: token) })
        } else if def.id == ABA_SEMANA.id {
            SemanaTela(sessao: sessao, contexto: contexto, servico: app.servicoTreino(sessao, contexto),
                       aoSessaoAcabar: { [token = sessao.token] e in app.controle.tratarErro(e, token: token) })
        } else if def.id == ABA_JOGOS.id {
            JogosTela(sessao: sessao, contexto: contexto, servico: app.servicoJogo(sessao, contexto),
                      treino: app.servicoTreino(sessao, contexto), fila: app.filaJogos(sessao.me.usuario.id),
                      aoSessaoAcabar: { [token = sessao.token] e in app.controle.tratarErro(e, token: token) })
        } else if def.id == ABA_ELENCO.id {
            ElencoTela(sessao: sessao, contexto: contexto, servico: app.servicoElenco(sessao, contexto),
                       treino: app.servicoTreino(sessao, contexto),
                       aoSessaoAcabar: { [token = sessao.token] e in app.controle.tratarErro(e, token: token) })
        } else if def.id == ABA_QUADRO.id {
            QuadroTela(sessao: sessao, contexto: contexto, api: app.apiQuadro(sessao, contexto),
                       aoSessaoAcabar: { [token = sessao.token] e in app.controle.tratarErro(e, token: token) })
        } else {
            EmBreveTela(aba: def, contexto: contexto)
        }
    }

    /// Tocar a aba que já está ativa conta um "toque na raiz" (rola para o topo).
    private func selecao(_ abas: [DefAba]) -> Binding<String> {
        Binding(get: { abas.contains { $0.id == aba } ? aba : ABA_SEMANA.id },
                set: { nova in
                    if nova == aba { toques[nova, default: 0] += 1 }
                    aba = nova
                })
    }
}

/// Faixas do topo de TODA aba: só leitura (frase neutra, sem link/botão/preço), sem conexão e
/// "atualize o app".
struct FaixasDoTopo: View {
    @EnvironmentObject private var app: AppEstado
    let contexto: ContextoClube
    let sessao: Sessao

    var body: some View {
        let _ = RegistroDeFalhas.marcar("FaixasDoTopo")
        if precisaAtualizar(instalada: versaoInstalada, minima: app.config.versaoMinima?.ios) {
            FaixaTom(icone: "arrow.down.app", texto: TEXTO_ATUALIZAR_APP, tom: .info)
        }
        if app.semConexao {
            FaixaTom(icone: "icloud.slash", texto: textoSemConexao(sessao.meEm), tom: .aviso)
        }
        if contexto.somenteLeitura {
            FaixaTom(icone: "lock.fill",
                     texto: (contexto.clube?.arquivado ?? false) ? TEXTO_CLUBE_ARQUIVADO : contexto.mensagemSomenteLeitura,
                     tom: .neutro)
        }
    }
}

/// Aba que ainda não chegou: herói com o clube de hoje + "Em breve" com o que ela vai ter.
struct EmBreveTela: View {
    @EnvironmentObject private var app: AppEstado
    let aba: DefAba
    let contexto: ContextoClube

    var body: some View {
        TelaGrande(aba.rotulo, aoAtualizar: { await app.controle.atualizarMe() }) {
            LogoClube(personalizacao: contexto.clube?.personalizacao, tamanho: 36)
        } conteudo: {
            if let s = app.estado.sessao { FaixasDoTopo(contexto: contexto, sessao: s) }
            CartaoHeroi(rotulo: "Hoje · \(dataPorExtenso())", selo: contexto.papelRotulo,
                        valor: contexto.nome,
                        frase: fraseDoClube(contexto))
            Cartao {
                EstadoVazio(icone: "hourglass", titulo: "Em breve", texto: aba.emBreve)
            }
        }
    }
}

/// "Futebol 11 · Sub-15, Sub-17" (ou o nome da conta, se o clube ainda não tem categorias).
func fraseDoClube(_ c: ContextoClube) -> String {
    var partes: [String] = []
    let m = rotuloModalidade(c.clube?.modalidade)
    if !m.isEmpty { partes.append(m) }
    let cats = c.categorias.map(\.nome)
    if !cats.isEmpty { partes.append(listaCurta(cats, maximo: 4)) }
    if partes.isEmpty { partes.append(c.conta.nome) }
    return partes.joined(separator: " · ")
}

import XCTest
import SwiftUI
import UIKit
import TactiPlanKit
@testable import TactiPlan

// Investigação (27/10/2026): no iPhone do dono o app FECHA ao abrir a aba Mais e ao tocar num
// atleta (sem relatório de falha com o nome do app). Aqui cada tela suspeita — e cada peça que ela
// usa — é desenhada num teste SEPARADO no simulador (xcodebuild test no Codemagic). Se uma peça
// derruba o processo, o Xcode reinicia e segue: o log mostra exatamente quais testes caíram, e o
// passo do Codemagic guarda o relatório de falha do simulador (com a pilha) como artefato.
@MainActor
final class TelasTests: XCTestCase {
    private static let app = AppEstado()

    private func contexto() -> (Sessao, ContextoClube) {
        let clube = Clube(id: "c1", nome: "Clube Teste", modalidade: "football_11")
        let perms = ["training:view", "training:edit", "games:view", "games:edit", "athletes:view", "athletes:edit",
                     "injuries:manage", "stats:view", "tactical:view", "tactical:edit", "members:view", "members:manage"]
        let conta = Conta(id: "w1", nome: "Conta Teste", dono: true, papel: "owner", papelRotulo: "Dono",
                          permissoes: perms, somenteLeitura: false, clubes: [clube])
        let me = Me(usuario: Usuario(id: "u1", nome: "Pessoa Teste", email: "teste@exemplo.com"), workspaces: [conta])
        let sessao = Sessao(token: "tpa_teste", me: me, escolha: Escolha(workspaceId: "w1", clubeId: "c1"))
        let ctx = contextoDe(me, sessao.escolha)!
        return (sessao, ctx)
    }

    private let atleta = Atleta(id: "a1", nome: "Atleta Teste", posicao: "MEI", camisa: 10, grupo: "1",
                                nascimento: "2008-05-04", alturaCm: 175, pe: "right", clubeAnterior: "Clube Antigo")

    /// Desenha a view numa janela de iPhone, roda o ciclo (task/onAppear) e deixa assentar.
    private func desenhar<V: View>(_ v: V, file: StaticString = #filePath, line: UInt = #line) {
        let raiz = v.environmentObject(Self.app).environmentObject(Self.app.trava).environment(\.tema, Tema())
        let h = UIHostingController(rootView: raiz)
        let w = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        w.rootViewController = h
        w.makeKeyAndVisible()
        h.view.setNeedsLayout()
        h.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(1.5))
        XCTAssertNotNil(h.view.window, file: file, line: line)
        w.isHidden = true
    }

    // MARK: telas inteiras

    func test01_ElencoTela_controle() {
        let (s, c) = contexto()
        desenhar(NavigationStack { ElencoTela(sessao: s, contexto: c, servico: Self.app.servicoElenco(s, c), treino: Self.app.servicoTreino(s, c), aoSessaoAcabar: { _ in false }) })
    }

    func test02_MaisTela() {
        let (s, c) = contexto()
        desenhar(NavigationStack { MaisTela(sessao: s, contexto: c, treino: Self.app.servicoTreino(s, c), aoSessaoAcabar: { _ in false }) })
    }

    func test03_AtletaTela() {
        let (s, c) = contexto()
        desenhar(NavigationStack {
            AtletaTela(atleta: atleta, sessao: s, contexto: c, servico: Self.app.servicoElenco(s, c), categorias: [],
                       aoSessaoAcabar: { _ in false }, aoMudar: {})
        })
    }

    // MARK: peças (bisseção)

    func test10_ListaAgrupada_LinhaAgrupada_icone() {
        desenhar(ScrollView { ListaAgrupada("Teste") { LinhaAgrupada(icone: "pencil", titulo: "Editar cadastro") {} } })
    }

    func test11_LinhaAgrupada_comInicio_e_selo() {
        desenhar(ScrollView { ListaAgrupada { LinhaAgrupada(titulo: "Clube", detalhe: "Trocar", selo: "1 convite", aoTocar: {}) { AvatarIniciais(nome: "AB") } } })
    }

    func test12_LinhaInfo() {
        desenhar(ScrollView { ListaAgrupada("Cadastro") { LinhaInfo(rotulo: "Posição", valor: "Meia (MEI)"); Divisoria() } })
    }

    func test13_CabecalhoPerfil() {
        desenhar(CabecalhoPerfil(nome: "Pessoa Teste", contato: "teste@exemplo.com", papel: "Dono · Clube"))
    }

    func test14_SecaoSeguranca() {
        desenhar(ScrollView { SecaoSeguranca() })
    }

    func test15_SecaoCadastros() {
        let (s, c) = contexto()
        desenhar(NavigationStack { ScrollView { SecaoCadastros(sessao: s, contexto: c) } })
    }

    func test16_FaixasDoTopo() {
        let (s, c) = contexto()
        desenhar(ScrollView { FaixasDoTopo(contexto: c, sessao: s) })
    }

    func test17_LogoClube() {
        desenhar(LogoClube(personalizacao: nil, tamanho: 30))
    }

    func test18_FotoAtleta_e_Pastilha() {
        desenhar(HStack { FotoAtleta(url: nil, nome: "Atleta Teste", tamanho: 72); Pastilha(texto: "Grupo 1", tom: .info) })
    }

    func test19_Menu_com_LinhaAgrupada() {
        desenhar(ScrollView {
            ListaAgrupada {
                Menu { Button("Grupo 1") {} } label: { LinhaAgrupada(icone: "arrow.left.arrow.right", titulo: "Mover para…", detalhe: "Grupo 1") }
            }
        })
    }

    func test20_RodapeVersao() {
        desenhar(RodapeVersao())
    }
}

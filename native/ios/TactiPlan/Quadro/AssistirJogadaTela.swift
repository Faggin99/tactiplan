import SwiftUI
import UIKit
import TactiPlanKit

// Assistir a jogada EM PÉ (tela 14): campo proporcional, play/pause com 0,5× a 2×, quadros e as
// trajetórias até o próximo quadro quando parado (como o web). "Editar" abre o editor deitado
// (só com tactical:edit e conta com assinatura). O vídeo MP4 sai daqui também.

struct AssistirJogadaTela: View {
    @State var jogada: Jogada
    let podeEditar: Bool
    let carregar: () async -> Jogada
    let aoEditar: (Jogada) -> Void
    @StateObject private var reprodutor = ReprodutorQuadro()
    @StateObject private var video = ExportadorVideoQuadro()
    @State private var atual = 0
    @State private var tamanho = CGSize(width: 390, height: 260)
    @Environment(\.tema) private var tema

    init(jogada: Jogada, podeEditar: Bool, carregar: @escaping () async -> Jogada, aoEditar: @escaping (Jogada) -> Void) {
        _jogada = State(initialValue: jogada)
        self.podeEditar = podeEditar
        self.carregar = carregar
        self.aoEditar = aoEditar
    }

    private var quadros: [QuadroJogada] { let q = jogada.quadros; return q.isEmpty ? [QuadroJogada(indice: 0)] : q }
    private var corA: String { jogada.bruto["team_a_color"]?.texto ?? "#3b82f6" }
    private var corB: String { jogada.bruto["team_b_color"]?.texto ?? "#ef4444" }

    var body: some View {
        let qs = quadros
        let i = min(atual, qs.count - 1)
        let prop = CGFloat(proporcaoCampo(jogada.tipoCampo, jogada.vista))
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                GeometryReader { geo in
                    CampoQuadro { t in
                        CenaQuadro(dims: dimensoesCanvas(Double(t.width), Double(t.height), tipo: jogada.tipoCampo, vista: jogada.vista),
                                   tipo: jogada.tipoCampo, vista: jogada.vista,
                                   pecas: reprodutor.pecas(qs) ?? qs[i].elementos, desenhos: qs[i].desenhos,
                                   proximas: reprodutor.tocando ? nil : qs.indices.contains(i + 1) ? qs[i + 1].elementos : nil,
                                   corA: corA, corB: corB)
                    }
                    .onAppear { tamanho = geo.size }
                    .onChange(of: geo.size) { tamanho = $0 }
                }
                // O canvas tem respiro em volta (6%, mín. 28/24 px): a altura acompanha a proporção do campo.
                .aspectRatio(max(0.8, prop * 0.86), contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .accessibilityLabel("Campo \(rotuloMedidas(jogada.tipoCampo)), quadro \(i + 1) de \(qs.count)")

                ScrollView(.horizontal, showsIndicators: false) {
                    BarraQuadros(atual: i, total: qs.count, tocando: reprodutor.tocando, velocidade: $reprodutor.velocidade,
                                 aoVoltarInicio: { reprodutor.parar(); atual = 0 },
                                 aoTocar: { reprodutor.alternar(atual: i, total: qs.count) { atual = $0 } },
                                 aoIr: { reprodutor.parar(); atual = $0 })
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(jogada.nome.isEmpty ? "Sem nome" : jogada.nome).tipo(Tipos.titulo20).foregroundColor(tema.cores.tinta.color)
                    Text("\(rotuloTipoCampo(jogada.tipoCampo)) · \(rotuloVista(jogada.vista).lowercased()) · \(resumoJogada(jogada))")
                        .tipo(Tipos.corpo13).foregroundColor(tema.cores.tinta2.color)
                    if !jogada.descricao.isEmpty {
                        Text(jogada.descricao).tipo(Tipos.corpo15).foregroundColor(tema.cores.tinta.color).padding(.top, 4)
                    }
                }

                if podeEditar {
                    Botao(texto: "Editar (deitado)") { reprodutor.parar(); aoEditar(jogada) }
                }
                Botao(texto: video.gerando ? "Gerando vídeo… \(Int(video.progresso * 100))%" : "Exportar vídeo MP4",
                      variante: .secundario, habilitado: qs.count > 1 && !video.gerando) {
                    reprodutor.parar()
                    video.gerar(nome: jogada.nome, quadros: qs, tipo: jogada.tipoCampo, vista: jogada.vista, corA: corA, corB: corB,
                                tamanho: CGSize(width: 844, height: 390))
                }
                if qs.count <= 1 {
                    Text("Esta jogada tem um quadro só: não há animação para tocar.").tipo(Tipos.corpo13).foregroundColor(tema.cores.tinta2.color)
                }
            }
            .padding(16)
        }
        .background(tema.cores.fundo.color.ignoresSafeArea())
        .navigationTitle(jogada.nome.isEmpty ? "Jogada" : jogada.nome)
        .navigationBarTitleDisplayMode(.inline)
        .task { jogada = await carregar() }
        .onDisappear { reprodutor.parar() }
        .sheet(item: $video.arquivo) { a in FolhaCompartilhar(itens: [a.url]) }
        .alert("Vídeo", isPresented: Binding(get: { video.erro != nil }, set: { if !$0 { video.erro = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(video.erro ?? "") }
    }
}

import SwiftUI
import UIKit
import PhotosUI
import TactiPlanKit

// Peças da T3 que só existem no iPhone: montagem dos clientes das rotas do web (Elenco, Staff,
// Estatísticas, Cadastros) com o token do app, datas do DatePicker e a foto do atleta.

extension AppEstado {
    /// Rotas do web com o token do app e a conta escolhida (X-Workspace-Id). Upload com progresso.
    func clienteWeb(_ sessao: Sessao, _ ctx: ContextoClube) -> ClienteWeb {
        ClienteWeb(api: Api(base: base), token: sessao.token, workspaceId: ctx.escolha.workspaceId,
                   upload: TransporteUploadURLSession())
    }

    func servicoElenco(_ sessao: Sessao, _ ctx: ContextoClube) -> ServicoElenco {
        ServicoElenco(api: ApiElencoHttp(clienteWeb(sessao, ctx)), clubeId: ctx.clube?.id ?? "")
    }

    func apiStaff(_ sessao: Sessao, _ ctx: ContextoClube) -> ApiStaff { ApiStaffHttp(clienteWeb(sessao, ctx)) }
    func apiEstatisticas(_ sessao: Sessao, _ ctx: ContextoClube) -> ApiEstatisticas { ApiEstatisticasHttp(clienteWeb(sessao, ctx)) }
    func apiCadastros(_ sessao: Sessao, _ ctx: ContextoClube) -> ApiCadastros { ApiCadastrosHttp(clienteWeb(sessao, ctx)) }
}

// MARK: datas do DatePicker ↔ "AAAA-MM-DD"

private var calendarioLocal: Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    return c
}

func dataDoTexto(_ s: String?) -> Date? {
    guard let s, s.count >= 10 else { return nil }
    let p = s.prefix(10).split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return nil }
    return calendarioLocal.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))
}

func textoDaData(_ d: Date) -> String {
    let c = calendarioLocal.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
}

/// Linha "Rótulo ……… valor" de uma ficha (só leitura).
struct LinhaInfo: View {
    let rotulo: String
    let valor: String
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(rotulo).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
            Spacer(minLength: 8)
            Text(valor).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }
}

/// Foto do atleta (URL do servidor) ou as iniciais.
struct FotoAtleta: View {
    let url: String?
    let nome: String
    var tamanho: CGFloat = 40
    var local: UIImage?
    @EnvironmentObject private var app: AppEstado

    var body: some View {
        Group {
            if let local {
                Image(uiImage: local).resizable().scaledToFill()
            } else if let s = urlDoServidor(url, base: app.base), let u = URL(string: s) {
                AsyncImage(url: u) { fase in
                    if let i = fase.image { i.resizable().scaledToFill() } else { AvatarIniciais(nome: nome, tamanho: tamanho) }
                }
            } else {
                AvatarIniciais(nome: nome, tamanho: tamanho)
            }
        }
        .frame(width: tamanho, height: tamanho)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

/// Seção expansível (acordeão) com título, contagem e resumo.
struct Acordeao<Conteudo: View>: View {
    let titulo: String
    let sigla: String
    let quantidade: Int
    var resumo: String?
    @Binding var aberto: Bool
    private let conteudo: Conteudo
    @Environment(\.tema) private var tema

    init(titulo: String, sigla: String, quantidade: Int, resumo: String? = nil, aberto: Binding<Bool>,
         @ViewBuilder conteudo: () -> Conteudo) {
        self.titulo = titulo; self.sigla = sigla; self.quantidade = quantidade; self.resumo = resumo
        _aberto = aberto
        self.conteudo = conteudo()
    }

    var body: some View {
        let c = tema.cores
        Cartao(preenchimento: PREENCHIMENTO_LISTA) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) { aberto.toggle() }
            } label: {
                HStack(spacing: 12) {
                    Text(sigla)
                        .font(Tipo.corpo(13, peso: .bold))
                        .foregroundColor(c.acaoTinta.color)
                        .frame(width: 34, height: 34)
                        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(c.acaoSuave.color))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(titulo).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                        if let resumo, !resumo.isEmpty {
                            Text(resumo).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).lineLimit(2)
                        }
                    }
                    Spacer(minLength: 0)
                    Text("\(quantidade)").font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta2.color)
                    Image(systemName: aberto ? "chevron.down" : "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(c.tinta3.color)
                }
                .frame(minHeight: 56)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(titulo), \(quantidade)")
            .accessibilityHint(aberto ? "Toque para fechar" : "Toque para abrir")
            if aberto { conteudo }
        }
    }
}

/// Menu de seleção compacto ("Categoria: Todas ▾").
struct PilulaMenu<Itens: View>: View {
    let rotulo: String
    private let itens: Itens
    @Environment(\.tema) private var tema

    init(_ rotulo: String, @ViewBuilder itens: () -> Itens) {
        self.rotulo = rotulo
        self.itens = itens()
    }

    var body: some View {
        let c = tema.cores
        Menu { itens } label: {
            HStack(spacing: 4) {
                Text(rotulo).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 11, weight: .semibold))
            }
            .font(Tipos.corpo13.comPeso(.seminegrito).font)
            .foregroundColor(c.tinta.color)
            .padding(.horizontal, 12)
            .frame(minHeight: 36)
            .background(Capsule().fill(c.superficie.color))
            .overlay(Capsule().stroke(c.borda.color, lineWidth: 1))
        }
    }
}

/// Mensagem do que foi compartilhado (texto + link) para a folha do sistema.
struct TextoCompartilhado: Identifiable {
    let id = UUID()
    let itens: [Any]
}

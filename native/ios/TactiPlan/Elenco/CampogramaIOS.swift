import SwiftUI
import TactiPlanKit

// Campograma do Elenco (web: components/plantel/Campograma.jsx): o elenco no campo EM PÉ (ataque para cima), cada
// atleta (foto/iniciais, número, nome curto) empilhado no lugar da posição. Zagueiros divididos por lado; DM em
// vermelho, Transição em amarelo. Toque abre a ficha. Posições/âncoras do Kit (`montarCampograma`, paridade com o
// PDF do plantel: native/paridade/campograma.json).

/// Proporção do campo em pé (a do web no celular: 68 × 125).
private let CAMPO_LARGURA: CGFloat = 68
private let CAMPO_ALTURA: CGFloat = 125

struct CampogramaVista<Destino: View>: View {
    let atletas: [Atleta]
    let lesoesAtivas: [Lesao]
    let modalidade: String?
    @ViewBuilder let destino: (Atleta) -> Destino

    @State private var mostrarDM = true
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        let campo = montarCampograma(atletas, modalidade: modalidade, mostrarDM: mostrarDM, lesoesAtivas: lesoesAtivas)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                legenda(Color(red: 0x7f / 255.0, green: 0x1d / 255.0, blue: 0x1d / 255.0), "DM")
                legenda(Color(red: 0xfa / 255.0, green: 0xcc / 255.0, blue: 0x15 / 255.0), "Transição")
                Spacer(minLength: 0)
                Toggle("Mostrar DM", isOn: $mostrarDM).fixedSize().tint(c.acao.color)
                    .tipo(Tipos.corpo13)
            }
            .foregroundColor(c.tinta2.color)
            GeometryReader { g in
                let w = g.size.width
                let h = w * CAMPO_ALTURA / CAMPO_LARGURA
                ZStack(alignment: .topLeading) {
                    FundoCampo(largura: w, altura: h)
                    ForEach(campo.zonas) { z in
                        zona(z)
                            .fixedSize()
                            .alignmentGuide(.leading) { d in -(w * CGFloat(z.left) / 100) + d.width * fator(z.tx) }
                            .alignmentGuide(.top) { d in -(h * CGFloat(z.top) / 100) + d.height * fator(z.ty) }
                    }
                }
                .frame(width: w, height: h, alignment: .topLeading)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .aspectRatio(CAMPO_LARGURA / CAMPO_ALTURA, contentMode: .fit)
            if !campo.semLugar.isEmpty {
                Text("Sem posição no campo (\(campo.semLugar.count)): "
                     + campo.semLugar.map { a in a.posicao.map { "\(a.nome) (\($0))" } ?? a.nome }.joined(separator: ", ")
                     + " — cadastre a posição para aparecer no campo.")
                    .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("Zagueiros se dividem pelo lado em que preferem jogar (direita, esquerda, ambos); edite o atleta para escolher.")
                .tipo(Tipos.legenda11).foregroundColor(c.tinta3.color)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func fator(_ a: AncoraCampo) -> CGFloat {
        switch a {
        case .inicio: return 0
        case .centro: return 0.5
        case .fim: return 1
        }
    }

    private func legenda(_ cor: Color, _ t: String) -> some View {
        HStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 3).fill(cor).frame(width: 10, height: 10)
            Text(t).tipo(Tipos.legenda11)
        }
        .accessibilityElement(children: .combine)
    }

    private func zona(_ z: ZonaCampo) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("\(z.nome) · \(z.atletas.count)".uppercased())
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(Color.white.opacity(0.9))
                .shadow(color: .black.opacity(0.5), radius: 1, x: 0, y: 1)
                .frame(maxWidth: .infinity)
            ForEach(z.atletas) { a in
                NavigationLink { destino(a.atleta) } label: { FichaCampo(a: a) }
                    .buttonStyle(.plain)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(z.nome)
    }
}

/// Uma ficha no campo: foto/iniciais, número e nome curto.
private struct FichaCampo: View {
    let a: AtletaNoCampo
    @Environment(\.tema) private var tema

    var body: some View {
        let fundo: Color = a.dm ? Color(red: 0x7f / 255.0, green: 0x1d / 255.0, blue: 0x1d / 255.0)
            : a.trans ? Color(red: 0xfa / 255.0, green: 0xcc / 255.0, blue: 0x15 / 255.0)
            : Color(red: 15 / 255.0, green: 23 / 255.0, blue: 42 / 255.0).opacity(0.88)
        let texto: Color = a.trans ? Color(white: 0.1) : .white
        HStack(spacing: 4) {
            FotoAtleta(url: a.atleta.fotoUrl, nome: a.atleta.nome, tamanho: 18)
            if let n = a.numero {
                Text("\(n)").font(.system(size: 10, weight: .heavy)).monospacedDigit().opacity(0.75)
            }
            Text(a.nome).font(.system(size: 11, weight: .semibold)).lineLimit(1)
        }
        .foregroundColor(texto)
        .padding(.leading, 2).padding(.trailing, 7).padding(.vertical, 2)
        .background(Capsule().fill(fundo))
        .shadow(color: .black.opacity(0.35), radius: 2, x: 0, y: 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(a.atleta.nome)\(a.numero.map { ", camisa \($0)" } ?? "")\(a.dm ? ", no DM" : a.trans ? ", em transição" : "")")
        .accessibilityHint("Abre a ficha")
    }
}

/// Gramado listrado com as linhas do campo (em pé).
private struct FundoCampo: View {
    let largura: CGFloat
    let altura: CGFloat

    var body: some View {
        let faixa1 = Color(red: 0x2f / 255.0, green: 0x8f / 255.0, blue: 0x4e / 255.0)
        let faixa2 = Color(red: 0x2a / 255.0, green: 0x84 / 255.0, blue: 0x47 / 255.0)
        ZStack {
            VStack(spacing: 0) {
                ForEach(0..<11, id: \.self) { i in Rectangle().fill(i % 2 == 0 ? faixa1 : faixa2) }
            }
            Path { p in
                // escala das medidas do web (viewBox 68 × 125)
                let sx = largura / CAMPO_LARGURA, sy = altura / CAMPO_ALTURA
                p.addRect(CGRect(x: 1.5 * sx, y: 1.5 * sy, width: (CAMPO_LARGURA - 3) * sx, height: (CAMPO_ALTURA - 3) * sy))
                p.move(to: CGPoint(x: 1.5 * sx, y: altura / 2))
                p.addLine(to: CGPoint(x: largura - 1.5 * sx, y: altura / 2))
                p.addEllipse(in: CGRect(x: largura / 2 - 9.15 * sx, y: altura / 2 - 9.15 * sx, width: 18.3 * sx, height: 18.3 * sx))
                p.addRect(CGRect(x: (CAMPO_LARGURA / 2 - 20.15) * sx, y: 1.5 * sy, width: 40.3 * sx, height: 16.5 * sy))
                p.addRect(CGRect(x: (CAMPO_LARGURA / 2 - 9.16) * sx, y: 1.5 * sy, width: 18.32 * sx, height: 5.5 * sy))
                p.addRect(CGRect(x: (CAMPO_LARGURA / 2 - 20.15) * sx, y: (CAMPO_ALTURA - 18) * sy, width: 40.3 * sx, height: 16.5 * sy))
                p.addRect(CGRect(x: (CAMPO_LARGURA / 2 - 9.16) * sx, y: (CAMPO_ALTURA - 7) * sy, width: 18.32 * sx, height: 5.5 * sy))
            }
            .stroke(Color.white.opacity(0.75), lineWidth: 1)
        }
        .frame(width: largura, height: altura)
        .accessibilityHidden(true)
    }
}

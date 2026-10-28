import SwiftUI
import TactiPlanKit

/// Mais: perfil, clube (trocar, cores e logo), aparência, segurança, conta e sair. Lista agrupada
/// do Gestsport. Não existe "Assinatura", "Meu plano" nem "Planos" em lugar nenhum do app.
struct MaisTela: View {
    @EnvironmentObject private var app: AppEstado
    let sessao: Sessao
    let contexto: ContextoClube

    @State private var confirmarSair = false
    @StateObject private var exportar: ExportadorRelatorio
    @Environment(\.openURL) private var abrirUrl

    init(sessao: Sessao, contexto: ContextoClube, treino: ServicoTreino, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessao = sessao
        self.contexto = contexto
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: treino, aoSessaoAcabar: aoSessaoAcabar))
    }

    var body: some View {
        let _ = RegistroDeFalhas.marcar("MaisTela")
        let me = sessao.me
        let nConvites = me.convites.count
        TelaGrande(ABA_MAIS.rotulo, aoAtualizar: { await app.controle.atualizarMe() }) {
            FaixasDoTopo(contexto: contexto, sessao: sessao)
            CabecalhoPerfil(nome: me.usuario.nome ?? "", contato: me.usuario.email,
                            papel: "\(contexto.papelRotulo) · \(contexto.nome)")

            ListaAgrupada("Clube") {
                LinhaAgrupada(titulo: contexto.nome,
                              detalhe: "Trocar clube ou conta",
                              selo: nConvites > 0 ? contagem(nConvites, "convite", "convites") : nil,
                              aoTocar: { app.controle.abrirTroca() }) {
                    LogoClube(personalizacao: contexto.clube?.personalizacao, tamanho: 30)
                }
                if contexto.clube != nil {
                    Divisoria()
                    NavigationLink {
                        CoresDoClubeTela(contexto: contexto)
                    } label: {
                        LinhaAgrupada(icone: "paintpalette", titulo: "Cores e logo do clube", detalhe: "Ver")
                            .overlay(alignment: .trailing) { Seta() }
                    }
                    .buttonStyle(.plain)
                }
            }

            SecaoCadastros(sessao: sessao, contexto: contexto)

            if let clube = contexto.clube, contexto.pode("stats:view"), !(contexto.conta.somenteLeitura ?? false) {
                ListaAgrupada("Relatórios") {
                    LinhaAgrupada(icone: "doc.richtext", titulo: "Relatório do clube (PDF)",
                                  detalhe: "Plantel, treinos e jogos de \(String(hojeBrasilia().prefix(4)))", habilitado: !exportar.ocupado) {
                        let ano = String(hojeBrasilia().prefix(4))
                        exportar.iniciar(tipo: "clube", corpo: corpoRelatorioClube(clubeId: clube.id, ano: ano),
                                         nome: nomePdfRelatorioClube(clube.nome, ano: ano), usuarioId: sessao.me.usuario.id)
                    }
                }
            }

            ListaAgrupada("Aparência") {
                LinhaAgrupada(icone: "circle.lefthalf.filled", titulo: "Tema", detalhe: TEXTO_TEMA)
            }

            SecaoSeguranca()

            ListaAgrupada("Conta") {
                LinhaAgrupada(icone: "hand.raised", titulo: "Política de privacidade") {
                    AbrirLink.abrir(app.config.privacidadeUrl ?? PRIVACIDADE_URL_PADRAO)
                }
                Divisoria()
                LinhaAgrupada(icone: "doc.text", titulo: "Termos de uso") {
                    AbrirLink.abrir(app.config.termosUrl ?? TERMOS_URL_PADRAO)
                }
                Divisoria()
                LinhaAgrupada(icone: "message", titulo: "Suporte", detalhe: "WhatsApp \(SUPORTE_TELEFONE_ROTULO)") {
                    if let u = URL(string: "https://wa.me/\(SUPORTE_TELEFONE)") { abrirUrl(u) }
                }
            }

            ListaAgrupada {
                LinhaAgrupada(icone: "rectangle.portrait.and.arrow.right", titulo: "Sair", tom: .erro, seta: false) {
                    confirmarSair = true
                }
            }

            RodapeVersao()
        }
        .alert("Sair do TactiPlan?", isPresented: $confirmarSair) {
            Button("Sair", role: .destructive) { Task { await app.controle.sair() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Você vai precisar entrar de novo com o seu e-mail e senha.")
        }
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }
}

/// Cores e logo do clube: SÓ VISUALIZAÇÃO (a edição fica no web).
struct CoresDoClubeTela: View {
    let contexto: ContextoClube
    @Environment(\.tema) private var tema

    var body: some View {
        let _ = RegistroDeFalhas.marcar("CoresDoClubeTela")
        let p = contexto.clube?.personalizacao
        TelaGrande("Cores e logo", empilhada: true) {
            Cartao {
                HStack(spacing: 14) {
                    LogoClube(personalizacao: p, tamanho: 64)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(contexto.nome).font(Tipos.corpo17.comPeso(.seminegrito).font)
                        Text(rotuloModalidade(contexto.clube?.modalidade)).tipo(Tipos.corpo13)
                            .foregroundColor(tema.cores.tinta2.color)
                    }
                }
            }
            ListaAgrupada("Cor principal") {
                Amostra(titulo: "Tema claro", cores: coresDoClube(p, escuro: false), propria: corDoClube(p, escuro: false) != nil)
                Divisoria()
                Amostra(titulo: "Tema escuro", cores: coresDoClube(p, escuro: true), propria: corDoClube(p, escuro: true) != nil)
            }
            Text(TEXTO_CORES_CLUBE)
                .tipo(Tipos.corpo13)
                .foregroundColor(tema.cores.tinta2.color)
                .padding(.horizontal, 4)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// Uma amostra: o botão como aparece no app (cor de ação + texto com contraste AA).
private struct Amostra: View {
    let titulo: String
    let cores: Cores
    let propria: Bool
    @Environment(\.tema) private var tema

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(titulo).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(tema.cores.tinta.color)
                Text(propria ? cores.acao.hex : "Padrão do TactiPlan").tipo(Tipos.corpo13)
                    .foregroundColor(tema.cores.tinta2.color)
            }
            Spacer(minLength: 0)
            Text("Salvar")
                .font(Tipo.corpo(13, peso: .semibold))
                .foregroundColor(cores.sobreAcao.color)
                .padding(.horizontal, 16).padding(.vertical, 8)
                .background(Capsule().fill(cores.acao.color))
                .padding(6)
                .background(RoundedRectangle(cornerRadius: 12).fill(cores.superficie.color))
                .accessibilityHidden(true)
        }
        .padding(.vertical, 10)
    }
}

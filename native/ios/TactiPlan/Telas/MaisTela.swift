import SwiftUI
import TactiPlanKit

/// Mais: perfil, clube (trocar, cores e logo), treino (sessões salvas), aparência, segurança, conta (com
/// "Excluir minha conta", Apple 5.1.1(v)) e sair. Lista agrupada do Gestsport. Não existe "Assinatura",
/// "Meu plano" nem "Planos" em lugar nenhum do app.
struct MaisTela: View {
    @EnvironmentObject private var app: AppEstado
    let sessao: Sessao
    let contexto: ContextoClube

    let treino: ServicoTreino
    let aoSessaoAcabar: (Error) -> Bool

    @State private var confirmarSair = false
    @StateObject private var exportar: ExportadorRelatorio
    @Environment(\.openURL) private var abrirUrl

    init(sessao: Sessao, contexto: ContextoClube, treino: ServicoTreino, aoSessaoAcabar: @escaping (Error) -> Bool) {
        self.sessao = sessao
        self.contexto = contexto
        self.treino = treino
        self.aoSessaoAcabar = aoSessaoAcabar
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

            if contexto.clube != nil, contexto.pode("training:view") {
                ListaAgrupada("Treino") {
                    NavigationLink {
                        SessoesSalvasTela(sessao: sessao, contexto: contexto, servico: treino, aoSessaoAcabar: aoSessaoAcabar)
                    } label: {
                        LinhaAgrupada(icone: "bookmark", titulo: "Sessões salvas", detalhe: "Treinos completos para usar de novo")
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
                LinhaAgrupada(icone: "circle.lefthalf.filled", titulo: "Tema", detalhe: TEXTO_MODO_TEMA)
                Picker("Tema", selection: Binding(get: { app.modoTema }, set: { app.mudarModoTema($0) })) {
                    ForEach(ModoTema.allCases) { Text($0.rotulo).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding(.bottom, 12)
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
                Divisoria()
                NavigationLink {
                    ExcluirContaTela(sessao: sessao)
                } label: {
                    LinhaAgrupada(icone: "person.crop.circle.badge.xmark", titulo: "Excluir minha conta", tom: .erro)
                        .overlay(alignment: .trailing) { Seta() }
                }
                .buttonStyle(.plain)
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

/// Mais › Conta › Excluir minha conta: aviso claro, senha (conta com senha) e botão destrutivo com confirmação.
/// Depois de excluir, a sessão é limpa e o app volta ao login. "Senha incorreta" fica na tela (não sai da conta).
struct ExcluirContaTela: View {
    @EnvironmentObject private var app: AppEstado
    let sessao: Sessao
    @Environment(\.tema) private var tema
    @State private var senha = ""
    @State private var confirmar = false
    @State private var ocupado = false
    @State private var erro: String?

    /// Conta só Google/Apple não tem senha: o corpo vai vazio.
    private var pedeSenha: Bool { sessao.me.usuario.temSenha != false }

    var body: some View {
        let _ = RegistroDeFalhas.marcar("ExcluirContaTela")
        let c = tema.cores
        TelaGrande("Excluir conta", empilhada: true) {
            FaixaTom(icone: "exclamationmark.triangle.fill", texto: TEXTO_EXCLUIR_CONTA, tom: .erro)
            if pedeSenha {
                Campo(dica: "Sua senha", valor: $senha, conteudo: .password, secreto: true, habilitado: !ocupado)
                    .accessibilityLabel("Senha para confirmar")
                Text("Digite a senha para confirmar.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
            }
            if let erro { Text(erro).tipo(Tipos.corpo13.comPeso(.medio)).foregroundColor(c.erroTinta.color) }
            Botao(texto: ocupado ? "Excluindo…" : "Excluir minha conta", variante: .perigo,
                  habilitado: !ocupado && (!pedeSenha || !senha.isEmpty)) { confirmar = true }
        }
        .alert("Excluir sua conta?", isPresented: $confirmar) {
            Button("Cancelar", role: .cancel) {}
            Button("Excluir", role: .destructive) { excluir() }
        } message: { Text(TEXTO_EXCLUIR_CONTA) }
    }

    private func excluir() {
        ocupado = true
        erro = nil
        let s = pedeSenha ? senha : nil
        Task {
            defer { ocupado = false }
            do {
                try await app.controle.excluirConta(senha: s)
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                erro = mensagemDeErro(error)
            }
        }
    }
}

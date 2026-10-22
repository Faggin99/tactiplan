import SwiftUI
import TactiPlanKit

/// "Onde entrar": convites pendentes no topo (aceitar com um toque) e uma linha por clube
/// (conta + clube), com a logo, a cor, o papel e o aviso de só leitura. Arquivados à parte.
/// Também é o "Trocar clube" do Mais (com o voltar para o clube atual).
struct OndeEntrarTela: View {
    @EnvironmentObject private var app: AppEstado
    let sessao: Sessao
    let atual: Escolha?

    @Environment(\.tema) private var tema
    @State private var aceitando: String?
    @State private var erroConvite: String?
    @State private var confirmarSair = false
    @State private var recusando: Convite?

    init(sessao: Sessao, atual: Escolha?) {
        self.sessao = sessao
        self.atual = atual
    }

    var body: some View {
        let me = sessao.me
        let secoes = secoesDeEntrada(me)
        let c = tema.cores
        NavigationStack {
            TelaGrande(TITULO_ONDE_ENTRAR,
                       subtitulo: primeiroNome(me.usuario.nome).map { "Olá, \($0). Escolha o clube de hoje." } ?? "Escolha o clube de hoje.",
                       aoAtualizar: { await app.controle.atualizarMe() }) {
                HStack(spacing: 4) {
                    if atual != nil {
                        Button { app.controle.cancelarTroca() } label: {
                            Image(systemName: "xmark").font(.system(size: 16, weight: .semibold))
                                .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                        }
                        .accessibilityLabel("Fechar e voltar ao clube atual")
                    } else {
                        Button { confirmarSair = true } label: {
                            Image(systemName: "rectangle.portrait.and.arrow.right").font(.system(size: 16, weight: .semibold))
                                .frame(width: ALVO_TOQUE, height: ALVO_TOQUE)
                        }
                        .accessibilityLabel("Sair")
                    }
                }
                .foregroundColor(c.tinta2.color)
            } conteudo: {
                if app.semConexao { FaixaTom(icone: "icloud.slash", texto: textoSemConexao(sessao.meEm), tom: .aviso) }

                if !me.convites.isEmpty {
                    RotuloSecao(me.convites.count == 1 ? "Convite pendente" : "Convites pendentes").padding(.horizontal, 4)
                    ForEach(me.convites, id: \.token) { cv in
                        CartaoConvite(convite: cv, aceitando: aceitando == cv.token, habilitado: aceitando == nil,
                                      aceitar: { aceitar(cv.token) }, recusar: { recusando = cv })
                    }
                    if let erroConvite { FaixaTom(icone: "exclamationmark.circle", texto: erroConvite, tom: .erro) }
                }

                if secoes.ativas.isEmpty && secoes.arquivadas.isEmpty {
                    if me.convites.isEmpty {
                        EstadoVazio(icone: "person.3", titulo: TITULO_SEM_EQUIPE, texto: TEXTO_SEM_EQUIPE)
                    }
                } else {
                    if !secoes.ativas.isEmpty {
                        ListaAgrupada(me.convites.isEmpty ? nil : "Seus clubes") {
                            ForEach(Array(secoes.ativas.enumerated()), id: \.element.id) { i, o in
                                if i > 0 { Divisoria() }
                                linha(o)
                            }
                        }
                    }
                    if !secoes.arquivadas.isEmpty {
                        ListaAgrupada(TITULO_ARQUIVADOS) {
                            ForEach(Array(secoes.arquivadas.enumerated()), id: \.element.id) { i, o in
                                if i > 0 { Divisoria() }
                                linha(o)
                            }
                        }
                    }
                    Text(TEXTO_TROCAR_DEPOIS)
                        .tipo(Tipos.corpo13)
                        .foregroundColor(c.tinta2.color)
                        .padding(.horizontal, 4)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .alert("Sair do TactiPlan?", isPresented: $confirmarSair) {
            Button("Sair", role: .destructive) { Task { await app.controle.sair() } }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Você vai precisar entrar de novo com o seu e-mail e senha.")
        }
        .alert(TITULO_RECUSAR_CONVITE, isPresented: Binding(get: { recusando != nil }, set: { if !$0 { recusando = nil } })) {
            Button("Recusar", role: .destructive) { if let cv = recusando { recusar(cv.token) } }
            Button("Cancelar", role: .cancel) { recusando = nil }
        } message: {
            Text(TEXTO_RECUSAR_CONVITE)
        }
    }

    private func linha(_ o: OpcaoEntrada) -> some View {
        LinhaAgrupada(titulo: o.titulo, detalhe: o.subtitulo, selo: o.escolha == atual ? "Atual" : o.papelRotulo,
                      aoTocar: { app.controle.escolher(o.escolha) }) {
            LogoClube(personalizacao: o.personalizacao, tamanho: 40)
        }
    }

    private func recusar(_ token: String) {
        recusando = nil
        aceitando = token
        erroConvite = nil
        Task { @MainActor in
            do {
                try await app.controle.recusarConvite(token)
            } catch {
                erroConvite = mensagemDeErro(error)
            }
            aceitando = nil
        }
    }

    private func aceitar(_ token: String) {
        aceitando = token
        erroConvite = nil
        Task { @MainActor in
            do {
                try await app.controle.aceitarConvite(token)
            } catch {
                erroConvite = mensagemDeErro(error)
            }
            aceitando = nil
        }
    }
}

/// Convite pendente: equipe, papel, quem convidou e "Aceitar".
private struct CartaoConvite: View {
    let convite: Convite
    let aceitando: Bool
    let habilitado: Bool
    let aceitar: () -> Void
    let recusar: () -> Void
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        Cartao {
            HStack(alignment: .top, spacing: 12) {
                IconeLinha(icone: "envelope.open")
                VStack(alignment: .leading, spacing: 2) {
                    Text(convite.clubeNome ?? convite.workspaceNome ?? "Equipe")
                        .font(Tipos.corpo15.comPeso(.seminegrito).font)
                        .foregroundColor(c.tinta.color)
                    Text(detalhe)
                        .tipo(Tipos.corpo13)
                        .foregroundColor(c.tinta2.color)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            Botao(texto: aceitando ? "Aguarde…" : "Aceitar convite", habilitado: habilitado, acao: aceitar)
                .padding(.top, 12)
            BotaoTexto(texto: "Recusar", habilitado: habilitado, cor: c.erroTinta.color, acao: recusar)
                .frame(maxWidth: .infinity)
        }
    }

    private var detalhe: String {
        var s = "Convidou você como \(convite.papelRotulo ?? rotuloPapel(convite.papel))"
        if let por = convite.convidadoPor, !por.isEmpty { s += " · por \(por)" }
        return s
    }
}

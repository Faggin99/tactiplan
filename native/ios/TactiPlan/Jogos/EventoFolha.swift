import SwiftUI
import TactiPlanKit

// Folha "Novo evento" (EventModal do web): tipo, momento do gol + bola parada, time (cartões),
// substituição com "Quem saiu" PRIMEIRO (só quem está em campo no minuto) e "Quem entrou" (só
// reservas que ainda não entraram, com aviso quando não há), autor/assistência, minuto com 1º/2º
// tempo, −/+ e acréscimo, resumo e a prévia da minutagem. Regras no Kit (FormEvento).

enum AcaoEvento { case salvar(EventoJogo), excluir(String) }

struct EventoFolha: View {
    let editor: EditorJogo
    let editando: EventoJogo?
    let podeEditar: Bool
    let aoTerminar: (AcaoEvento) -> Void

    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State private var form: FormEvento
    @State private var erro: String?
    @State private var confirmarSemAutor = false
    @State private var confirmarExcluir = false

    init(editor: EditorJogo, editando: EventoJogo?, podeEditar: Bool, aoTerminar: @escaping (AcaoEvento) -> Void) {
        self.editor = editor
        self.editando = editando
        self.podeEditar = podeEditar
        self.aoTerminar = aoTerminar
        _form = State(initialValue: FormEvento(editando: editando, duracao: editor.dados.duracao, modalidade: editor.modalidade))
    }

    var body: some View {
        let c = tema.cores
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    tipos
                    if form.ehGol { momento }
                    if form.mostraTime { time }
                    if form.ehSubstituicao { substituicao }
                    if form.mostraJogador {
                        seletor(form.tipo == EVENTO_GOL ? "Autor do gol" : "Atleta", vazio: form.relacionados(editor).isEmpty
                                    ? "Nenhum jogador na escalação" : "Selecione um atleta…",
                                opcoes: form.opcoesJogador(editor), valor: $form.jogadorId, permiteVazio: true)
                    }
                    if form.mostraAssistencia {
                        seletor("Assistência (opcional)", vazio: "Sem assistência", opcoes: form.opcoesAssistencia(editor),
                                valor: $form.jogador2Id, permiteVazio: true)
                    }
                    minuto
                    resumo
                    if let erro { FaixaTom(icone: "exclamationmark.triangle", texto: erro, tom: .erro) }
                    Botao(texto: editando == nil ? "Salvar evento" : "Salvar", habilitado: podeEditar) { salvar(confirmou: false) }
                    if editando != nil && podeEditar {
                        Botao(texto: "Excluir evento", variante: .perigo) { confirmarExcluir = true }
                    }
                }
                .padding(16)
            }
            .background(c.fundo.color.ignoresSafeArea())
            .navigationTitle(editando == nil ? "Novo evento" : "Editar evento")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } } }
            .alert("Salvar gol sem atribuir ao atleta?", isPresented: $confirmarSemAutor) {
                Button("Cancelar", role: .cancel) {}
                Button("Salvar") { salvar(confirmou: true) }
            }
            .confirmationDialog("Excluir este evento?", isPresented: $confirmarExcluir, titleVisibility: .visible) {
                Button("Excluir evento", role: .destructive) {
                    if let e = editando { aoTerminar(.excluir(e.id)) }
                    fechar()
                }
                Button("Cancelar", role: .cancel) {}
            }
        }
        .presentationDetents([.large])
        .disabled(!podeEditar)
    }

    private func salvar(confirmou: Bool) {
        switch form.montar(editor, confirmouSemAutor: confirmou) {
        case .erro(let m):
            erro = m
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        case .confirmarSemAutor:
            confirmarSemAutor = true
        case .ok(let e):
            vibrarLeve()
            aoTerminar(.salvar(e))
            fechar()
        }
    }

    // MARK: partes

    private var tipos: some View {
        let c = tema.cores
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 8)], spacing: 8) {
            ForEach(form.tipos) { t in
                let on = form.tipo == t.valor
                let cor = corHex(t.corHex)
                Button { form.mudarTipo(t.valor); erro = nil } label: {
                    HStack(spacing: 6) {
                        IconeEvento(tipo: t.valor).scaleEffect(0.8).frame(width: 26, height: 26)
                        Text(t.rotulo).font(Tipos.corpo13.comPeso(.seminegrito).font).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .foregroundColor(on ? cor : c.tinta.color)
                    .background(RoundedRectangle(cornerRadius: 12).fill(on ? cor.opacity(0.14) : c.superficie.color))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(on ? cor : c.borda.color, lineWidth: on ? 2 : 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(t.rotulo)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }

    private func chip(_ texto: String, _ on: Bool, rotulo: String? = nil, acao: @escaping () -> Void) -> some View {
        let c = tema.cores
        return Button(action: acao) {
            Text(texto)
                .font(Tipos.corpo13.comPeso(.seminegrito).font)
                .padding(.horizontal, 12).frame(minHeight: 40)
                .foregroundColor(on ? c.acaoTinta.color : c.tinta.color)
                .background(RoundedRectangle(cornerRadius: 10).fill(on ? c.acaoSuave.color : c.superficie.color))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(on ? c.acaoTinta.color : c.borda.color, lineWidth: on ? 2 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(rotulo ?? texto)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private var momento: some View {
        VStack(alignment: .leading, spacing: 8) {
            RotuloSecao(form.tipo == EVENTO_GOL_SOFRIDO ? "Em qual momento sofremos?" : "Em qual momento marcamos?")
            HStack(spacing: 8) {
                ForEach(form.momentos, id: \.valor) { m in
                    chip(m.curto, form.momento == m.valor, rotulo: m.rotulo) { form.momento = m.valor }
                }
            }
            if form.momento == "bp" {
                Text("Tipo de bola parada").tipo(Tipos.corpo13).foregroundColor(tema.cores.tinta2.color)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 8)], alignment: .leading, spacing: 8) {
                    ForEach(form.subtiposBP) { s in chip(s.rotulo, form.subtipoBP == s.valor) { form.subtipoBP = s.valor } }
                }
            }
        }
    }

    private var time: some View {
        VStack(alignment: .leading, spacing: 8) {
            RotuloSecao("De qual time?")
            Picker("De qual time?", selection: $form.time) {
                Text("Nosso Time").tag("own")
                Text("Adversário").tag("opponent")
            }
            .pickerStyle(.segmented)
        }
    }

    private var substituicao: some View {
        let c = tema.cores
        let sai = form.opcoesSai(editor)
        let entra = form.opcoesEntra(editor)
        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Text("↓").foregroundColor(VERMELHO_JOGO).bold()
                    RotuloSecao("Quem saiu (em campo aos \(form.minutoTexto))")
                }
                if sai.isEmpty {
                    Text(form.semNinguemEmCampo()).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                } else {
                    listaEscolha(sai, selecionado: form.jogador2Id, cor: VERMELHO_JOGO) { form.jogador2Id = $0; erro = nil }
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Text("↑").foregroundColor(VERDE_JOGO).bold()
                    RotuloSecao("Quem entrou (banco)")
                }
                if entra.isEmpty {
                    Text(FormEvento.SEM_RESERVA)
                        .tipo(Tipos.corpo13).foregroundColor(c.tinta.color)
                        .padding(10)
                        .background(RoundedRectangle(cornerRadius: 10).fill(AMBAR_JOGO.opacity(0.1)))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(AMBAR_JOGO.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                        .accessibilityAddTraits(.updatesFrequently)
                } else {
                    listaEscolha(entra, selecionado: form.jogadorId, cor: VERDE_JOGO) { form.jogadorId = $0; erro = nil }
                }
            }
        }
    }

    private func listaEscolha(_ ops: [OpcaoAtleta], selecionado: String, cor: Color, aoEscolher: @escaping (String) -> Void) -> some View {
        let c = tema.cores
        return VStack(spacing: 0) {
            ForEach(Array(ops.enumerated()), id: \.element.id) { i, o in
                if i > 0 { Divisoria() }
                let on = selecionado == o.id
                let pos = editor.jogador(o.id).flatMap { etiquetaDaVaga(editor.formacao, $0.vaga, editor.modalidade) }
                Button { aoEscolher(o.id) } label: {
                    HStack(spacing: 10) {
                        AvatarCamisa(camisa: o.camisa, nome: o.nome, tamanho: 30, destaque: on ? cor : nil)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(o.nome).font(Tipos.corpo15.comPeso(on ? .seminegrito : .regular).font).foregroundColor(c.tinta.color)
                            if let pos { Text(pos).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color) }
                        }
                        Spacer(minLength: 0)
                        if on { Image(systemName: "checkmark").font(.system(size: 16, weight: .bold)).foregroundColor(cor) }
                    }
                    .padding(.horizontal, 12).frame(minHeight: 50)
                    .background(on ? cor.opacity(0.08) : Color.clear)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(o.rotulo)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .background(RoundedRectangle(cornerRadius: 14).fill(c.superficie.color))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(c.borda.color))
    }

    private func seletor(_ titulo: String, vazio: String, opcoes: [OpcaoAtleta], valor: Binding<String>, permiteVazio: Bool) -> some View {
        let c = tema.cores
        return VStack(alignment: .leading, spacing: 6) {
            RotuloSecao(titulo)
            Menu {
                if permiteVazio { Button(vazio) { valor.wrappedValue = "" } }
                ForEach(opcoes) { o in Button(o.rotulo) { valor.wrappedValue = o.id; erro = nil } }
            } label: {
                HStack {
                    Text(opcoes.first { $0.id == valor.wrappedValue }?.rotulo ?? vazio)
                        .foregroundColor(valor.wrappedValue.isEmpty ? c.tinta3.color : c.tinta.color).lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").foregroundColor(c.tinta3.color)
                }
                .font(Tipos.corpo15.font)
                .padding(.horizontal, 16).frame(minHeight: 52)
                .background(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous).fill(c.superficie.color))
                .overlay(RoundedRectangle(cornerRadius: CGFloat(Tokens.raioCampo), style: .continuous).stroke(c.borda.color))
            }
            .accessibilityLabel("\(titulo): \(opcoes.first { $0.id == valor.wrappedValue }?.nome ?? vazio)")
        }
    }

    private var minuto: some View {
        let c = tema.cores
        return VStack(alignment: .leading, spacing: 8) {
            RotuloSecao("Tempo do jogo")
            Cartao {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Minuto").tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
                        Text(form.minutoTexto).font(Tipos.valor.comTamanho(30).font).foregroundColor(c.tinta.color)
                            .accessibilityLabel("Minuto \(form.minutoTexto)")
                    }
                    Spacer(minLength: 0)
                    Picker("Tempo", selection: Binding(get: { form.tempo }, set: { form.mudarTempo($0) })) {
                        Text("1º T").tag(1)
                        Text("2º T").tag(2)
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 120)
                    HStack(spacing: 0) {
                        Button { form.passo(-1) } label: { Image(systemName: "minus").frame(width: ALVO_TOQUE, height: ALVO_TOQUE) }
                            .accessibilityLabel("Um minuto a menos")
                        Divider().frame(height: 28)
                        Button { form.passo(1) } label: { Image(systemName: "plus").frame(width: ALVO_TOQUE, height: ALVO_TOQUE) }
                            .accessibilityLabel("Um minuto a mais")
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(c.acaoTinta.color)
                    .background(RoundedRectangle(cornerRadius: 10).fill(c.fundo.color))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(c.borda.color))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Minuto (\(form.faixaDoTempo))").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    Slider(value: Binding(get: { Double(form.minutoNoTempo) }, set: { form.mudarMinuto(Int($0.rounded())) }),
                           in: 1...Double(max(2, form.maxNoTempo)), step: 1)
                        .tint(c.acao.color)
                        .accessibilityLabel("Minuto dentro do tempo")
                        .accessibilityValue(form.minutoTexto)
                }
                .padding(.top, 10)
                Stepper(value: Binding(get: { form.acrescimo }, set: { form.mudarAcrescimo($0) }), in: 0...15) {
                    Text(form.acrescimo > 0 ? "Acréscimo +\(form.acrescimo)" : "Acréscimo")
                        .font(Tipos.corpo15.comPeso(form.acrescimo > 0 ? .seminegrito : .regular).font)
                        .foregroundColor(form.acrescimo > 0 ? c.acaoTinta.color : c.tinta.color)
                }
                .padding(.top, 6)
            }
        }
    }

    private var resumo: some View {
        let c = tema.cores
        let prev = form.previaMinutagem(editor)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "timer").foregroundColor(c.infoTinta.color).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(form.resumo(editor)).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.infoTinta.color)
                    if let prev { Text(prev).tipo(Tipos.corpo13).foregroundColor(c.infoTinta.color) }
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(c.infoFundo.color))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Resumo: \(form.resumo(editor)). \(prev ?? "")")
    }
}

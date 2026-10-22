import SwiftUI
import TactiPlanKit

// Escalação (campo por vaga), seletor de atleta da vaga, relacionados e a Convocação (lista com a
// posição EM CAMPO derivada da vaga, camisa do jogo, minutagem automática com ajuste manual).
// Regras do GameModal/SlotAthletePicker/PlayerSelectionModal do web — todas no Kit (EditorJogo).

// MARK: Escalação

struct EscalacaoAba: View {
    @ObservedObject var modelo: JogoModelo
    let podeEditar: Bool
    @Environment(\.tema) private var tema
    @State var vagaAberta: VagaAberta?
    @State var movendo: String?

    var body: some View {
        let c = tema.cores
        if let ed = modelo.editor {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Menu {
                        ForEach(formacoesDa(ed.modalidade), id: \.self) { f in
                            Button { trocar(f) } label: {
                                if f == ed.formacao { Label(f, systemImage: "checkmark") } else { Text(f) }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(ed.formacao).font(Tipos.corpo15.comPeso(.negrito).font)
                            Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundColor(c.tinta.color)
                        .padding(.horizontal, 14).frame(minHeight: 36)
                        .background(Capsule().fill(c.superficie.color))
                        .overlay(Capsule().stroke(c.borda.color, lineWidth: 1))
                    }
                    .disabled(!podeEditar)
                    .accessibilityLabel("Formação \(ed.formacao)")
                    .accessibilityHint(podeEditar ? "Toque para trocar a formação" : "")
                    Spacer()
                    if podeEditar {
                        Text("Toque numa vaga para escalar").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    }
                }
                if let m = movendo, let p = ed.jogador(m) {
                    HStack(spacing: 8) {
                        Text("Toque na vaga para onde vai **\(p.nomeExibido ?? "o atleta")**")
                            .tipo(Tipos.corpo13).foregroundColor(c.tinta.color)
                        Spacer(minLength: 0)
                        Button("Cancelar") { movendo = nil }.font(Tipos.corpo13.comPeso(.seminegrito).font)
                    }
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Color.yellow.opacity(0.18)))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.yellow.opacity(0.5)))
                }
                CampoDoJogo(editor: ed, movendo: movendo, aoTocar: podeEditar ? { tocar($0) } : nil)
                    .frame(maxWidth: 420)
                    .frame(maxWidth: .infinity)
                if !ed.semVaga.isEmpty { semVaga(ed) }
                if ed.titulares.isEmpty {
                    Text(podeEditar ? "Toque numa vaga para escolher o atleta." : "Ninguém escalado ainda.")
                        .tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).frame(maxWidth: .infinity)
                }
            }
            .sheet(item: $vagaAberta) { v in
                SlotAtletaFolha(modelo: modelo, vaga: v.vaga) { acao in
                    vagaAberta = nil
                    switch acao {
                    case .escolher(let a): modelo.mudar { $0.colocar(a, naVaga: v.vaga.indice) }; vibrarLeve()
                    case .mover(let id): movendo = id
                    case .tirar(let id): modelo.mudar { $0.tirarDoCampo(id); return nil }
                    }
                }
                .environment(\.tema, tema)
            }
        }
    }

    private func trocar(_ f: String) {
        movendo = nil
        modelo.mudar { $0.trocarFormacao(f) }
    }

    private func tocar(_ vaga: Int) {
        guard let ed = modelo.editor else { return }
        if let m = movendo {
            movendo = nil
            modelo.mudar { $0.mover(m, paraVaga: vaga); return nil }
            vibrarLeve()
            return
        }
        if let v = ed.vagas.first(where: { $0.indice == vaga }) { vagaAberta = VagaAberta(vaga: v) }
    }

    private func semVaga(_ ed: EditorJogo) -> some View {
        let c = tema.cores
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("TITULARES SEM VAGA (\(ed.semVaga.count))")
                    .font(Tipos.legenda11.comPeso(.negrito).font).foregroundColor(AMBAR_JOGO)
                Spacer()
                if podeEditar && ed.vagasLivres > 0 {
                    Button { modelo.mudar { $0.encaixarSugestao() } } label: {
                        Label("Encaixar sugestão", systemImage: "wand.and.stars")
                            .font(Tipos.corpo13.comPeso(.seminegrito).font)
                    }
                    .accessibilityHint("Encaixa nas vagas livres usando a posição cadastrada como sugestão")
                }
            }
            FluxoChips(itens: ed.semVaga.map { ($0.atletaId, $0.nomeExibido ?? "Atleta") }) { id in
                guard podeEditar else { return }
                movendo = movendo == id ? nil : id
            } ativo: { $0 == movendo }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 12).fill(AMBAR_JOGO.opacity(0.08)))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(AMBAR_JOGO.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [5, 3])))
        .foregroundColor(c.tinta.color)
    }
}

struct VagaAberta: Identifiable {
    let vaga: Vaga
    var id: Int { vaga.indice }
}

/// Chips que quebram linha (titulares sem vaga).
struct FluxoChips: View {
    let itens: [(id: String, texto: String)]
    let aoTocar: (String) -> Void
    let ativo: (String) -> Bool
    @Environment(\.tema) private var tema

    var body: some View {
        let c = tema.cores
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 6)], alignment: .leading, spacing: 6) {
            ForEach(itens, id: \.id) { item in
                let on = ativo(item.id)
                Button { aoTocar(item.id) } label: {
                    Text(item.texto)
                        .font(Tipos.corpo13.comPeso(.seminegrito).font)
                        .lineLimit(1)
                        .padding(.horizontal, 12).frame(maxWidth: .infinity, minHeight: 36)
                        .foregroundColor(c.tinta.color)
                        .background(Capsule().fill(on ? Color.yellow.opacity(0.3) : c.superficie.color))
                        .overlay(Capsule().stroke(on ? Color.yellow : AMBAR_JOGO.opacity(0.6), lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityHint("Toque e depois escolha a vaga no campo")
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
    }
}

// MARK: seletor de atleta da vaga

enum AcaoVaga { case escolher(AtletaResumo), mover(String), tirar(String) }

/// Plantel inteiro com busca (nome ou camisa); a posição cadastrada é só informação. Vaga ocupada:
/// trocar, mover para outra vaga ou tirar do campo.
struct SlotAtletaFolha: View {
    @ObservedObject var modelo: JogoModelo
    let vaga: Vaga
    let aoEscolher: (AcaoVaga) -> Void
    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State var busca = ""

    private func normal(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "pt_BR"))
    }

    var body: some View {
        let c = tema.cores
        let ed = modelo.editor
        let ocupante = ed?.ocupante(vaga.indice)
        let pos = ed.flatMap { posicaoEmCampo($0.formacao, vaga.indice, $0.modalidade) } ?? vaga.papel
        NavigationStack {
            List {
                if let o = ocupante {
                    Section {
                        HStack(spacing: 10) {
                            AvatarCamisa(camisa: o.camisa, nome: o.nomeExibido)
                            Text(o.nomeExibido ?? "Atleta").font(Tipos.corpo15.comPeso(.seminegrito).font)
                            Spacer()
                            if let p = o.atleta?.posicao { Pastilha(texto: p, tom: .neutro).accessibilityLabel("Posição cadastrada \(p)") }
                        }
                        Button { aoEscolher(.mover(o.atletaId)) } label: { Label("Mover para outra vaga", systemImage: "arrow.left.arrow.right") }
                        Button(role: .destructive) { aoEscolher(.tirar(o.atletaId)) } label: { Label("Tirar do campo", systemImage: "person.fill.xmark") }
                    } header: { Text("Na vaga") }
                }
                Section {
                    let lista = atletas(ocupante: ocupante)
                    if lista.isEmpty {
                        Text(modelo.atletas.isEmpty ? "Nenhum atleta no plantel." : "Nenhum atleta com esse nome.")
                            .foregroundColor(c.tinta2.color)
                    }
                    ForEach(lista) { a in
                        Button { aoEscolher(.escolher(a)) } label: { linha(a, ed: ed) }
                            .buttonStyle(.plain)
                    }
                } header: { Text(ocupante == nil ? "Escolher atleta" : "Trocar por") }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $busca, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: ocupante == nil ? "Buscar atleta pelo nome" : "Buscar outro atleta pelo nome")
            .navigationTitle("\(pos) · \(ed?.formacao ?? "")")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Fechar") { fechar() } } }
        }
        .presentationDetents([.large])
    }

    /// Plantel + quem já está no jogo e não veio no plantel (ex.: no DM), sem o ocupante.
    private func atletas(ocupante: JogadorJogo?) -> [AtletaResumo] {
        let ed = modelo.editor
        let ids = Set(modelo.atletas.map(\.id))
        let extras = (ed?.jogadores ?? []).filter { !ids.contains($0.atletaId) }.map {
            AtletaResumo(id: $0.atletaId, nome: $0.nomeExibido ?? "", camisa: $0.atleta?.camisa, posicao: $0.atleta?.posicao)
        }
        let q = normal(busca.trimmingCharacters(in: .whitespaces))
        return (modelo.atletas + extras)
            .filter { $0.id != ocupante?.atletaId }
            .filter { q.isEmpty || normal($0.nome).contains(q) || $0.camisa.map(String.init) == busca.trimmingCharacters(in: .whitespaces) }
            .sorted { $0.nome.compare($1.nome, locale: Locale(identifier: "pt_BR")) == .orderedAscending }
    }

    private func linha(_ a: AtletaResumo, ed: EditorJogo?) -> some View {
        let c = tema.cores
        let p = ed?.jogador(a.id)
        let situacao: (String, Color)? = {
            guard let p, let ed else { return nil }
            if p.titular, let v = p.vaga { return ("Em campo · \(papelDaVaga(ed.formacao, v) ?? "")", VERDE_JOGO) }
            if p.titular { return ("Titular sem vaga", AMBAR_JOGO) }
            return ("Reserva", c.tinta2.color)
        }()
        return HStack(spacing: 10) {
            AvatarCamisa(camisa: p?.camisa ?? a.camisa, nome: a.nome)
            VStack(alignment: .leading, spacing: 1) {
                Text(a.nome).font(Tipos.corpo15.font).foregroundColor(c.tinta.color).lineLimit(1)
                if let s = situacao { Text(s.0).font(Tipos.legenda11.comPeso(.seminegrito).font).foregroundColor(s.1) }
            }
            Spacer(minLength: 0)
            if let pos = a.posicao, !pos.isEmpty {
                Pastilha(texto: pos, tom: .neutro).accessibilityLabel("Posição cadastrada \(pos), só informação")
            }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: relacionados

/// Selecionar os relacionados (PlayerSelectionModal do web): marcar atletas do plantel e dizer se
/// é titular ou reserva.
struct RelacionadosFolha: View {
    @ObservedObject var modelo: JogoModelo
    @Environment(\.dismiss) private var fechar
    @Environment(\.tema) private var tema
    @State var selecao: [(atletaId: String, status: String)] = []
    @State var busca = ""

    var body: some View {
        let c = tema.cores
        let titulares = selecao.filter { $0.status == STATUS_TITULAR }.count
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text("Titulares: \(titulares)").foregroundColor(VERDE_JOGO)
                        Spacer()
                        Text("Reservas: \(selecao.count - titulares)").foregroundColor(AMBAR_JOGO)
                        Spacer()
                        Text("Total: \(selecao.count)").foregroundColor(c.acaoTinta.color)
                    }
                    .font(Tipos.corpo13.comPeso(.seminegrito).font)
                    .accessibilityElement(children: .combine)
                }
                Section {
                    if modelo.atletas.isEmpty { Text("Nenhum atleta cadastrado").foregroundColor(c.tinta2.color) }
                    ForEach(lista) { a in linha(a) }
                }
            }
            .listStyle(.insetGrouped)
            .searchable(text: $busca, prompt: "Buscar atleta")
            .navigationTitle("Relacionados")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { fechar() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Confirmar") {
                        let s = selecao
                        modelo.mudar { ed in ed.confirmarRelacionados(s, plantel: modelo.atletas); return nil }
                        fechar()
                    }
                }
            }
        }
        .onAppear { selecao = (modelo.editor?.jogadores ?? []).map { ($0.atletaId, $0.status) } }
    }

    private var lista: [AtletaResumo] {
        let q = busca.trimmingCharacters(in: .whitespaces).folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
        // Plantel + quem está no jogo e não está no plantel (para poder tirar).
        let ids = Set(modelo.atletas.map(\.id))
        let extras = (modelo.editor?.jogadores ?? []).filter { !ids.contains($0.atletaId) }
            .map { AtletaResumo(id: $0.atletaId, nome: $0.nomeExibido ?? "", camisa: $0.atleta?.camisa, posicao: $0.atleta?.posicao) }
        return (modelo.atletas + extras).filter {
            q.isEmpty || $0.nome.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil).contains(q)
        }
    }

    private func linha(_ a: AtletaResumo) -> some View {
        let c = tema.cores
        let i = selecao.firstIndex { $0.atletaId == a.id }
        let marcado = i != nil
        return HStack(spacing: 10) {
            Button {
                if let i { selecao.remove(at: i) } else { selecao.append((a.id, STATUS_TITULAR)) }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: marcado ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 22)).foregroundColor(marcado ? c.acaoTinta.color : c.tinta3.color)
                    VStack(alignment: .leading, spacing: 1) {
                        Text((a.camisa.map { "#\($0) " } ?? "") + a.nome).font(Tipos.corpo15.font).foregroundColor(c.tinta.color).lineLimit(1)
                        if let p = a.posicao, !p.isEmpty { Text(p).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color) }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(a.nome)
            .accessibilityValue(marcado ? "relacionado" : "não relacionado")
            if let i {
                Picker("Situação de \(a.nome)", selection: Binding(get: { selecao[i].status }, set: { selecao[i].status = $0 })) {
                    Text("Titular").tag(STATUS_TITULAR)
                    Text("Reserva").tag(STATUS_RESERVA)
                }
                .pickerStyle(.segmented)
                .frame(width: 150)
            }
        }
        .frame(minHeight: 44)
    }
}

// MARK: Convocação

struct ConvocacaoAba: View {
    @ObservedObject var modelo: JogoModelo
    let podeEditar: Bool
    let podeExportar: Bool
    let aoExportar: () -> Void
    @Environment(\.tema) private var tema
    @State var relacionados = false
    @State var vagaAberta: VagaAberta?
    @State var editandoCamisa: JogadorJogo?
    @State var camisaTexto = ""
    @State var editandoMinutos: JogadorJogo?
    @State var minutosTexto = ""

    var body: some View {
        let c = tema.cores
        if let ed = modelo.editor {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    if podeEditar {
                        Botao(texto: "Selecionar relacionados", variante: .secundario) { relacionados = true }
                    }
                    if podeExportar && !ed.jogadores.isEmpty {
                        Botao(texto: "PDF", variante: .neutro, larguraCheia: false) { aoExportar() }
                            .accessibilityLabel("Exportar convocação em PDF")
                    }
                }
                if ed.jogadores.isEmpty {
                    Cartao {
                        EstadoVazio(icone: "person.3", titulo: "Nenhum jogador selecionado",
                                    texto: "Toque numa vaga do campo para escalar, ou em \"Selecionar relacionados\" para relacionar reservas.")
                    }
                } else {
                    let mins = ed.minutagem
                    if !ed.titulares.isEmpty {
                        RotuloSecao("Titulares (\(ed.titulares.count))").padding(.horizontal, 4)
                        Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                            ForEach(Array(ed.titulares.enumerated()), id: \.element.id) { i, p in
                                if i > 0 { Divisoria() }
                                linha(p, ed: ed, info: mins[p.atletaId], titular: true)
                            }
                        }
                    }
                    if !ed.reservas.isEmpty {
                        RotuloSecao("Reservas (\(ed.reservas.count))").padding(.horizontal, 4)
                        Cartao(preenchimento: PREENCHIMENTO_LISTA) {
                            ForEach(Array(ed.reservas.enumerated()), id: \.element.id) { i, p in
                                if i > 0 { Divisoria() }
                                linha(p, ed: ed, info: mins[p.atletaId], titular: false)
                            }
                        }
                    }
                    if !ed.config.rastreiaMinutos {
                        Text("Futsal: a troca é livre, os minutos não são contados.").tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    }
                }
            }
            .sheet(isPresented: $relacionados) { RelacionadosFolha(modelo: modelo).environment(\.tema, tema) }
            .sheet(item: $vagaAberta) { v in
                SlotAtletaFolha(modelo: modelo, vaga: v.vaga) { acao in
                    vagaAberta = nil
                    switch acao {
                    case .escolher(let a): modelo.mudar { $0.colocar(a, naVaga: v.vaga.indice) }
                    case .mover: modelo.aviso = "Para mover, use a aba Escalação."
                    case .tirar(let id): modelo.mudar { $0.tirarDoCampo(id); return nil }
                    }
                }
                .environment(\.tema, tema)
            }
            .alert("Camisa neste jogo", isPresented: Binding(get: { editandoCamisa != nil }, set: { if !$0 { editandoCamisa = nil } })) {
                TextField("1 a 99 (vazio = sem número)", text: $camisaTexto).keyboardType(.numberPad)
                Button("Cancelar", role: .cancel) {}
                Button("Salvar") {
                    if let p = editandoCamisa {
                        let t = camisaTexto.trimmingCharacters(in: .whitespaces)
                        modelo.mudar { $0.mudarCamisa(p.atletaId, t.isEmpty ? nil : (Int(t) ?? 1)); return nil }
                    }
                }
            } message: { Text(editandoCamisa?.nomeExibido ?? "") }
            .alert("Minutos jogados", isPresented: Binding(get: { editandoMinutos != nil }, set: { if !$0 { editandoMinutos = nil } })) {
                TextField("0 a 200", text: $minutosTexto).keyboardType(.numberPad)
                Button("Cancelar", role: .cancel) {}
                Button("Ajustar") {
                    if let p = editandoMinutos {
                        let v = Int(minutosTexto.trimmingCharacters(in: .whitespaces)) ?? 0
                        modelo.mudar { $0.ajustarMinutos(p.atletaId, v); return nil }
                    }
                }
            } message: { Text("Ajuste manual: fica marcado e não é recalculado pelas substituições. \(dicaMinutagem(editandoMinutos.flatMap { modelo.editor?.minutagem[$0.atletaId] }))") }
        }
    }

    private func linha(_ p: JogadorJogo, ed: EditorJogo, info: EstadoMinutagem?, titular: Bool) -> some View {
        let c = tema.cores
        let etiqueta = etiquetaDaVaga(ed.formacao, p.vaga, ed.modalidade)
        let repetida = ed.camisaRepetida(p.atletaId)
        let corStatus = titular ? VERDE_JOGO : AMBAR_JOGO
        return HStack(spacing: 8) {
            if titular {
                Button {
                    guard podeEditar else { return }
                    if let v = p.vaga, let vg = ed.vagas.first(where: { $0.indice == v }) { vagaAberta = VagaAberta(vaga: vg) }
                    else { modelo.aviso = "Sem vaga no campo: escolha a vaga na aba Escalação." }
                } label: {
                    Text(etiqueta ?? "S/V")
                        .font(Tipo.corpo(10, peso: .heavy))
                        .frame(width: 44, height: 24)
                        .foregroundColor(etiqueta == nil ? AMBAR_JOGO : c.tinta2.color)
                        .background(RoundedRectangle(cornerRadius: 5).fill(etiqueta == nil ? AMBAR_JOGO.opacity(0.12) : c.fundo.color))
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(etiqueta == nil ? AMBAR_JOGO.opacity(0.6) : c.borda.color))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(etiqueta.map { "Posição em campo \($0)" } ?? "Sem vaga no campo")
            }
            Button {
                guard podeEditar else { return }
                camisaTexto = p.camisa.map(String.init) ?? ""
                editandoCamisa = p
            } label: {
                Text(p.camisa.map(String.init) ?? "–")
                    .font(Tipo.corpo(12, peso: .bold))
                    .foregroundColor(corStatus)
                    .frame(width: 36, height: 28)
                    .background(Capsule().fill(corStatus.opacity(0.14)))
                    .overlay(Capsule().stroke(repetida ? VERMELHO_JOGO : corStatus.opacity(0.35), lineWidth: repetida ? 1.5 : 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(p.camisa.map { "Camisa \($0)\(repetida ? ", repetida neste jogo" : "")" } ?? "Sem camisa")
            .accessibilityHint(podeEditar ? "Toque para mudar a camisa deste jogo" : "")
            Text(p.nomeExibido ?? "Atleta").font(Tipos.corpo15.font).foregroundColor(c.tinta.color).lineLimit(1)
            Spacer(minLength: 0)
            if ed.config.rastreiaMinutos { minutos(p, info) }
            if podeEditar {
                Button { modelo.mudar { $0.tirarDoJogo(p.atletaId); return nil } } label: {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold)).foregroundColor(c.tinta3.color)
                        .frame(width: 32, height: ALVO_TOQUE)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Tirar \(p.nomeExibido ?? "o atleta") do jogo")
            }
        }
        .frame(minHeight: 48)
    }

    private func minutos(_ p: JogadorJogo, _ info: EstadoMinutagem?) -> some View {
        let c = tema.cores
        let m = info?.minutos ?? 0
        let manual = info?.manual ?? false
        let marca = marcadorMinutagem(info)
        let corMarca: Color = {
            switch marca?.tom ?? "" {
            case "expulso": return corHex("#dc2626")
            case "entrou": return VERDE_JOGO
            default: return VERMELHO_JOGO
            }
        }()
        return HStack(spacing: 4) {
            if let marca { Text(marca.texto).font(Tipo.corpo(10, peso: .bold)).foregroundColor(corMarca).monospacedDigit() }
            if manual {
                Button { modelo.mudar { $0.voltarAoAutomatico(p.atletaId); return nil } } label: {
                    HStack(spacing: 2) {
                        Text("MANUAL").font(Tipo.corpo(9, peso: .bold))
                        Image(systemName: "arrow.counterclockwise").font(.system(size: 8, weight: .bold))
                    }
                    .foregroundColor(AMBAR_JOGO)
                    .padding(.horizontal, 4).padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 4).fill(AMBAR_JOGO.opacity(0.12)))
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(AMBAR_JOGO.opacity(0.4)))
                }
                .buttonStyle(.plain)
                .disabled(!podeEditar)
                .accessibilityLabel("Ajuste manual, automático seria \(info?.auto ?? 0) minutos")
                .accessibilityHint("Toque para voltar ao automático")
            }
            Button {
                guard podeEditar else { return }
                minutosTexto = String(m)
                editandoMinutos = p
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(m)").font(Tipo.corpo(15, peso: .semibold)).monospacedDigit()
                        .foregroundColor(manual ? AMBAR_JOGO : c.tinta.color)
                    Text("min").font(Tipo.corpo(10)).foregroundColor(c.tinta2.color)
                }
                .frame(minWidth: 44, minHeight: ALVO_TOQUE, alignment: .trailing)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(m) minutos\(manual ? ", ajuste manual" : ""). \(dicaMinutagem(info))")
            .accessibilityHint(podeEditar ? "Toque para ajustar" : "")
        }
    }
}

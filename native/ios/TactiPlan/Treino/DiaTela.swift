import SwiftUI
import TactiPlanKit

// Dia (ficha do dia): tipo do dia (Treino · Jogo · Descanso, editável com training:edit),
// pilar/tempo/distância ideal, e um cartão por bloco — o CONTEÚDO em destaque (cor do pilar),
// submomentos, tempo, grupos e descrição, e a ATIVIDADE por último, mais discreta (a hierarquia do
// web). Tocar num bloco abre a folha Editar atividade. Dia de jogo: só "Não relacionados".
// No topo: ver a ficha do dia (HTML do servidor) e exportar o PDF.

struct DiaTela: View {
    let data: String
    @ObservedObject var modelo: SemanaModelo
    let sessao: Sessao
    let contexto: ContextoClube

    @EnvironmentObject private var app: AppEstado
    @Environment(\.tema) private var tema
    @StateObject private var exportar: ExportadorRelatorio
    @State private var editando: BlocoAberto?
    @State private var pedirAdversario = false
    @State private var adversario = ""
    @State private var editandoKm = false
    @State private var kmTexto = ""
    @State private var ocupado = false
    @State private var aviso: String?
    @State private var verFicha = false

    init(data: String, modelo: SemanaModelo, sessao: Sessao, contexto: ContextoClube) {
        self.data = data
        self.modelo = modelo
        self.sessao = sessao
        self.contexto = contexto
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: modelo.servico, aoSessaoAcabar: modelo.aoSessaoAcabar))
    }

    private var dia: Dia { modelo.dia(data) ?? diaVazio(data) }
    private var podeEditar: Bool { contexto.podeEditar("training:edit") }
    private var podeExportar: Bool { !(contexto.conta.somenteLeitura ?? false) }

    var body: some View {
        let d = dia
        let r = resumoDoDia(d)
        TelaGrande(rotuloDiaCurto(data), empilhada: true, aoAtualizar: { await modelo.invalidar() }) {
            FaixasDoTopo(contexto: contexto, sessao: sessao)
            seletorDeTipo(d)
            if d.tipo == .treino { resumo(r, d) }
            switch d.tipo {
            case .descanso:
                Cartao { EstadoVazio(icone: "moon.zzz", titulo: "Descanso", texto: TEXTO_DIA_DESCANSO) }
            case .jogo:
                FaixaTom(icone: "trophy", texto: TEXTO_JOGO_NO_APP, tom: .info)
                if let b = d.blocos.first { cartaoDoBloco(b, rotulo: ROTULO_NAO_RELACIONADOS, nao: true) }
            case .treino:
                if r.atividades == 0 {
                    FaixaTom(icone: "calendar.badge.plus",
                             texto: podeEditar ? TEXTO_SEM_ATIVIDADE_EDITA : TEXTO_SEM_ATIVIDADE_LE, tom: .neutro)
                }
                ForEach(d.blocos, id: \.ordem) { b in cartaoDoBloco(b, rotulo: "\(b.ordem) · \(b.nome)", nao: false) }
            }
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    if d.id != nil {
                        Button { verFicha = true } label: { Label("Ver ficha do dia", systemImage: "doc.text.magnifyingglass") }
                        if podeExportar {
                            Button { exportarFicha(d) } label: { Label("Exportar ficha do dia (PDF)", systemImage: "square.and.arrow.up") }
                        }
                    } else {
                        Text("Nada salvo neste dia ainda")
                    }
                } label: {
                    if exportar.ocupado { ProgressView() } else { Image(systemName: "doc.text") }
                }
                .accessibilityLabel("Ficha do dia")
            }
        }
        .sheet(item: $editando) { aberto in
            EditarAtividadeFolha(dia: d, bloco: aberto.bloco, semana: modelo.semana, contexto: contexto, sessao: sessao,
                                 servico: modelo.servico, base: app.base) { msg in
                aviso = msg
                Task { await modelo.invalidar() }
            }
            .environment(\.tema, tema)
            .environment(\.contexto, contexto)
            .environmentObject(app)
        }
        .sheet(isPresented: $verFicha) {
            FichaDoDiaTela(dia: d, contexto: contexto, sessao: sessao, servico: modelo.servico, podeExportar: podeExportar,
                           aoSessaoAcabar: modelo.aoSessaoAcabar)
                .environment(\.tema, tema)
                .environmentObject(app)
        }
        .alert("Adversário", isPresented: $pedirAdversario) {
            TextField("Nome do adversário", text: $adversario)
            Button("Cancelar", role: .cancel) {}
            Button("Salvar") { mudarTipo(.jogo, adversario: adversario) }
        } message: { Text("Contra quem é o jogo?") }
        .alert("Distância ideal (km)", isPresented: $editandoKm) {
            TextField("Ex.: 5,2", text: $kmTexto).keyboardType(.decimalPad)
            Button("Cancelar", role: .cancel) {}
            Button("Salvar") { salvarKm() }
        } message: { Text("Opcional · por jogador, no dia") }
        .overlay { if ocupado { ProgressView().padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
        .avisoTemporario($aviso)
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }

    private func exportarFicha(_ d: Dia) {
        guard let id = d.id else { return }
        exportar.iniciar(tipo: "sessao", corpo: corpoFichaDoDia(id), nome: nomePdfDoDia(d), usuarioId: sessao.me.usuario.id)
    }

    // MARK: tipo do dia

    private func seletorDeTipo(_ d: Dia) -> some View {
        Picker("Tipo do dia", selection: Binding(get: { d.tipo }, set: { novo in
            guard novo != d.tipo else { return }
            if novo == .jogo {
                adversario = d.adversario ?? ""
                pedirAdversario = true
            } else {
                mudarTipo(novo, adversario: nil)
            }
        })) {
            ForEach(TipoDia.allCases, id: \.self) { Text($0.rotulo).tag($0) }
        }
        .pickerStyle(.segmented)
        .disabled(!podeEditar || ocupado)
        .accessibilityHint(podeEditar ? "Muda o tipo do dia" : "Somente leitura")
    }

    private func mudarTipo(_ t: TipoDia, adversario: String?) {
        guard let clube = contexto.clube else { return }
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await modelo.servico.mudarTipo(dia, para: t, adversario: adversario, semana: modelo.semana, clubeId: clube.id)
                await modelo.invalidar()
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                aviso = mensagemErroTreino(error)
            }
        }
    }

    // MARK: resumo (pilar, tempo, distância)

    private func resumo(_ r: ResumoDia, _ d: Dia) -> some View {
        let c = tema.cores
        return Cartao {
            HStack(alignment: .top, spacing: 0) {
                item("Pilar", r.pilares.isEmpty ? "—" : r.rotuloPilares, cor: r.pilares.first.map(corDoPilar))
                item("Tempo", r.minutos > 0 ? "\(r.minutos) min" : "—")
                Button {
                    guard podeEditar else { return }
                    kmTexto = formatarKm(d.distanciaKm)
                    editandoKm = true
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Text("Distância ideal").tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
                            if podeEditar { Image(systemName: "pencil").font(.system(size: 11)).foregroundColor(c.tinta3.color) }
                        }
                        Text(d.distanciaKm.map { "\(formatarKm($0)) km" } ?? "—")
                            .font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Distância ideal: \(d.distanciaKm.map { "\(formatarKm($0)) quilômetros" } ?? "sem valor")")
                .accessibilityHint(podeEditar ? "Toque para editar" : "")
            }
        }
    }

    private func item(_ rotulo: String, _ valor: String, cor: Color? = nil) -> some View {
        let c = tema.cores
        return VStack(alignment: .leading, spacing: 2) {
            Text(rotulo).tipo(Tipos.legenda11).foregroundColor(c.tinta2.color)
            HStack(spacing: 6) {
                if let cor { Circle().fill(cor).frame(width: 8, height: 8).accessibilityHidden(true) }
                Text(valor).font(Tipos.corpo15.comPeso(.seminegrito).font).foregroundColor(c.tinta.color).linhasAcessiveis(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func salvarKm() {
        guard let clube = contexto.clube else { return }
        switch lerKm(kmTexto) {
        case .erro(let m): aviso = m
        case .ok(let km):
            ocupado = true
            Task {
                defer { ocupado = false }
                do {
                    try await modelo.servico.mudarDistancia(dia, km: km, semana: modelo.semana, clubeId: clube.id)
                    await modelo.invalidar()
                } catch {
                    if app.controle.tratarErro(error, token: sessao.token) { return }
                    aviso = mensagemErroTreino(error)
                }
            }
        }
    }

    // MARK: bloco

    @ViewBuilder
    private func cartaoDoBloco(_ b: Bloco, rotulo: String, nao: Bool) -> some View {
        let c = tema.cores
        let a = b.atividade
        let abrir: (() -> Void)? = (podeEditar || a != nil) && contexto.clube != nil ? { editando = BlocoAberto(bloco: b) } : nil
        Cartao(aoTocar: abrir) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(rotulo.uppercased())
                        .font(Tipos.legenda11.comPeso(.seminegrito).font)
                        .tracking(0.6)
                        .foregroundColor(c.tinta2.color)
                    Spacer()
                    if let m = a?.minutos, m > 0 {
                        Text("\(m) min").tipo(Tipos.corpo13.comPeso(.seminegrito)).foregroundColor(c.tinta2.color)
                    }
                }
                if nao, a == nil { Text(TEXTO_NAO_RELACIONADOS).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color) }
                if let a {
                    // Conteúdo em destaque
                    if let ct = a.conteudos?.first {
                        HStack(spacing: 8) {
                            Circle().fill(corDoPilar(ct.dimensao)).frame(width: 10, height: 10).accessibilityHidden(true)
                            Text(ct.nome ?? "").font(Tipos.corpo17.comPeso(.seminegrito).font).foregroundColor(c.tinta.color)
                                .linhasAcessiveis(2)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(rotuloPilar(ct.dimensao)): \(ct.nome ?? "")")
                    }
                    let etapas = (a.etapas ?? []).compactMap(\.nome)
                    if !etapas.isEmpty {
                        Text(etapas.joined(separator: " · ")).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color)
                    }
                    if let g = a.grupos, !g.isEmpty {
                        HStack(spacing: 6) { ForEach(g, id: \.self) { Pastilha(texto: $0, tom: .neutro) } }
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("Grupos: \(g.joined(separator: ", "))")
                    }
                    if let desc = a.descricao, !desc.isEmpty {
                        Text(desc).tipo(Tipos.corpo13).foregroundColor(c.tinta2.color).lineLimit(4)
                    }
                    // Atividade por último, discreta
                    HStack(spacing: 6) {
                        if let t = a.tituloNome, !t.isEmpty {
                            Text(t).tipo(Tipos.corpo13.comPeso(.medio)).foregroundColor(c.tinta3.color).linhasAcessiveis(2)
                        }
                        Spacer(minLength: 0)
                        if let n = a.anexos, n > 0 {
                            Label("\(n)", systemImage: "paperclip").tipo(Tipos.corpo13).foregroundColor(c.acaoTinta.color)
                                .accessibilityLabel(contagem(n, "anexo", "anexos"))
                        }
                    }
                } else if !nao {
                    HStack(spacing: 6) {
                        Image(systemName: podeEditar ? "plus.circle" : "minus").accessibilityHidden(true)
                        Text(podeEditar ? "Adicionar atividade" : "Sem atividade")
                    }
                    .tipo(Tipos.corpo13.comPeso(.medio))
                    .foregroundColor(podeEditar ? c.acaoTinta.color : c.tinta3.color)
                }
            }
        }
        .accessibilityHint(abrir == nil ? "" : (podeEditar ? "Abre para editar" : "Abre a atividade"))
    }
}

/// Bloco aberto na folha (o id do bloco pode ser nil num dia ainda não salvo: vale a ordem).
struct BlocoAberto: Identifiable {
    let bloco: Bloco
    var id: Int { bloco.ordem }
}

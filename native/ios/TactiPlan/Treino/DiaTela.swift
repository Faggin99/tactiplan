import SwiftUI
import TactiPlanKit

// Dia (ficha do dia): tipo do dia (Treino · Jogo · Descanso, editável com training:edit),
// pilar/tempo/distância ideal, e um cartão por bloco — o CONTEÚDO em destaque (cor do pilar),
// submomentos, tempo, grupos e descrição, e a ATIVIDADE por último, mais discreta (a hierarquia do
// web). Tocar num bloco abre a folha Editar atividade. Dia de jogo: só "Não relacionados".
// No topo: ver a ficha do dia (HTML do servidor) e exportar o PDF.
// Dia com 2+ períodos (Manhã · Tarde · Noite): seletor segmentado no topo; tipo, blocos, distância
// e edição são do período escolhido; o total do dia soma todos ("150 min · 90+60"). O menu do topo
// adiciona/remove período, troca o horário (Manhã/Tarde/Noite) e exporta a ficha do dia inteiro ou só do período.

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
    @State private var fichaSoPeriodo = false
    @State private var periodoSel = 0
    @State private var adicionandoPeriodo = false
    @State private var novoAtual: Periodo = .manha
    @State private var novoPeriodo: Periodo = .tarde
    @State private var confirmarRemover = false

    init(data: String, modelo: SemanaModelo, sessao: Sessao, contexto: ContextoClube) {
        self.data = data
        self.modelo = modelo
        self.sessao = sessao
        self.contexto = contexto
        _exportar = StateObject(wrappedValue: ExportadorRelatorio(servico: modelo.servico, aoSessaoAcabar: modelo.aoSessaoAcabar))
    }

    /// O dia inteiro (com `periodos` quando há 2+).
    private var diaInteiro: Dia { modelo.dia(data) ?? diaVazio(data) }
    /// O período escolhido (o próprio dia quando é único).
    private var dia: Dia {
        let ps = diaInteiro.listaPeriodos
        return ps[max(0, min(periodoSel, ps.count - 1))]
    }
    private var podeEditar: Bool { contexto.podeEditar("training:edit") }
    private var podeExportar: Bool { !(contexto.conta.somenteLeitura ?? false) }

    var body: some View {
        let todo = diaInteiro
        let d = dia
        let r = resumoDoDia(d)
        TelaGrande(rotuloDiaCurto(data), empilhada: true, aoAtualizar: { await modelo.invalidar() }) {
            FaixasDoTopo(contexto: contexto, sessao: sessao)
            if todo.temPeriodos {
                seletorDePeriodo(todo)
            } else if d.tipo == .treino, let p = periodoEfetivo(d) {
                // dia de 1 período: o horário também aparece (Manhã é o padrão); troca pelo menu
                HStack(spacing: 6) {
                    Image(systemName: "clock")
                    Text("Período: \(p.rotulo)").tipo(Tipos.corpo13.comPeso(.medio))
                }
                .foregroundColor(tema.cores.tinta2.color)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Período do treino: \(p.rotulo)")
            }
            seletorDeTipo(d)
            if d.tipo == .treino { resumo(r, d) }
            switch d.tipo {
            case .descanso:
                Cartao { EstadoVazio(icone: "moon.zzz", titulo: "Descanso", texto: TEXTO_DIA_DESCANSO) }
            case .jogo:
                if let id = d.id, contexto.pode("games:view") {
                    NavigationLink {
                        JogoTela(sessaoId: id, sessao: sessao, contexto: contexto,
                                 servico: app.servicoJogo(sessao, contexto), treino: modelo.servico,
                                 fila: app.filaJogos(sessao.me.usuario.id), aoSessaoAcabar: modelo.aoSessaoAcabar)
                    } label: {
                        Cartao {
                            HStack(spacing: 12) {
                                IconeLinha(icone: "trophy.fill")
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Abrir jogo").font(Tipos.corpo15.comPeso(.seminegrito).font)
                                        .foregroundColor(tema.cores.tinta.color)
                                    Text("Escalação, eventos, minutagem e convocação").tipo(Tipos.corpo13)
                                        .foregroundColor(tema.cores.tinta2.color)
                                }
                                Spacer(minLength: 0)
                                Seta()
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Abre a escalação e os eventos do jogo")
                }
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
                    if podeEditar, contexto.clube != nil, !periodosDisponiveis(todo).isEmpty {
                        Button { abrirAdicionarPeriodo(todo) } label: { Label("Adicionar período", systemImage: "plus.square.on.square") }
                    }
                    if podeEditar, !periodosParaTrocar(todo, d).isEmpty {
                        Menu {
                            ForEach(periodosParaTrocar(todo, d), id: \.self) { p in
                                Button(p.rotulo) { trocarPeriodo(d, todo, para: p) }
                            }
                        } label: {
                            Label("Trocar horário (\(periodoEfetivo(d)?.rotulo ?? ""))", systemImage: "clock.arrow.2.circlepath")
                        }
                    }
                    if todo.temPeriodos, contexto.podeEditar("training:delete") {
                        Button(role: .destructive) { confirmarRemover = true } label: {
                            Label("Remover período \(rotuloDoPeriodo(d.periodo) ?? "")", systemImage: "minus.square")
                        }
                    }
                    if todo.id != nil {
                        Button { fichaSoPeriodo = false; verFicha = true } label: { Label("Ver ficha do dia", systemImage: "doc.text.magnifyingglass") }
                        if podeExportar {
                            Button { exportarFicha(todo, soPeriodo: nil) } label: { Label("Exportar ficha do dia (PDF)", systemImage: "square.and.arrow.up") }
                            if todo.temPeriodos {
                                Button { exportarFicha(todo, soPeriodo: d) } label: {
                                    Label("Exportar só \(rotuloDoPeriodo(d.periodo) ?? "o período") (PDF)", systemImage: "square.and.arrow.up.on.square")
                                }
                            }
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
            FichaDoDiaTela(dia: todo, contexto: contexto, sessao: sessao, servico: modelo.servico, podeExportar: podeExportar,
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
        .sheet(isPresented: $adicionandoPeriodo) { folhaAdicionarPeriodo(todo).environment(\.tema, tema) }
        .confirmationDialog("Remover período", isPresented: $confirmarRemover, titleVisibility: .visible) {
            Button("Remover \(rotuloDoPeriodo(d.periodo) ?? "período")", role: .destructive) { removerPeriodo(d) }
            Button("Cancelar", role: .cancel) {}
        } message: { Text(textoRemoverPeriodo(d)) }
        .overlay { if ocupado { ProgressView().padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16)) } }
        .avisoTemporario($aviso)
        .modifier(ApresentacaoRelatorio(exportar: exportar))
    }

    /// Ficha do dia inteiro (soPeriodo nil) ou só de um período.
    private func exportarFicha(_ todo: Dia, soPeriodo p: Dia?) {
        if let p, let id = p.id {
            exportar.iniciar(tipo: "sessao", corpo: corpoFichaDoDia(id, soPeriodo: true), nome: nomePdfDoDia(todo, periodo: p.periodo),
                             usuarioId: sessao.me.usuario.id)
            return
        }
        guard let id = todo.id else { return }
        exportar.iniciar(tipo: "sessao", corpo: corpoFichaDoDia(id), nome: nomePdfDoDia(todo), usuarioId: sessao.me.usuario.id)
    }

    // MARK: períodos

    private func seletorDePeriodo(_ todo: Dia) -> some View {
        let ps = todo.listaPeriodos
        let total = resumoDoDiaInteiro(todo)
        return VStack(alignment: .leading, spacing: 8) {
            Picker("Período", selection: Binding(get: { min(periodoSel, ps.count - 1) }, set: { periodoSel = $0 })) {
                ForEach(Array(ps.enumerated()), id: \.offset) { i, p in Text(rotuloDoPeriodo(p.periodo) ?? "Período").tag(i) }
            }
            .pickerStyle(.segmented)
            .accessibilityHint("Escolhe o período do dia")
            Text("Dia: \(total.minutos) min · \(divisaoMinutos(todo) ?? "")\(total.distanciaKm.map { " · \(formatarKm($0)) km" } ?? "")")
                .tipo(Tipos.corpo13.comPeso(.medio))
                .foregroundColor(tema.cores.tinta2.color)
                .accessibilityLabel("Total do dia: \(total.minutos) minutos, \(ps.count) períodos")
        }
    }

    private func abrirAdicionarPeriodo(_ todo: Dia) {
        guard let s = sugestaoNovoPeriodo(todo) else { return }
        novoAtual = s.atual ?? .manha
        novoPeriodo = s.novo
        adicionandoPeriodo = true
    }

    private func folhaAdicionarPeriodo(_ todo: Dia) -> some View {
        let livres = periodosDisponiveis(todo)
        let unico = !todo.temPeriodos
        let erro = erroNovoPeriodo(todo, atual: unico ? novoAtual : nil, novo: novoPeriodo)
        return NavigationStack {
            Form {
                if unico {
                    Section {
                        Picker("O treino que já existe é", selection: $novoAtual) {
                            ForEach(Periodo.allCases, id: \.self) { Text($0.rotulo).tag($0) }
                        }
                    } footer: { Text("O que já está planejado neste dia fica neste período.") }
                }
                Section {
                    Picker("Novo período", selection: $novoPeriodo) {
                        ForEach(livres, id: \.self) { Text($0.rotulo).tag($0) }
                    }
                } footer: { Text(erro ?? "O novo período começa com os 6 blocos vazios. Máximo de 3 por dia.") }
            }
            .navigationTitle("Adicionar período")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { adicionandoPeriodo = false } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Adicionar") { adicionarPeriodo(todo) }.disabled(erro != nil || ocupado)
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func adicionarPeriodo(_ todo: Dia) {
        guard let clube = contexto.clube else { return }
        let novo = novoPeriodo
        let atual: Periodo? = todo.temPeriodos ? nil : novoAtual
        adicionandoPeriodo = false
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await modelo.servico.adicionarPeriodo(todo, novo: novo, atual: atual, semana: modelo.semana, clubeId: clube.id)
                await modelo.invalidar()
                periodoSel = diaInteiro.listaPeriodos.firstIndex { $0.periodo == novo.rawValue } ?? 0
                aviso = "Período \(novo.rotulo) adicionado."
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                aviso = mensagemErroTreino(error)
            }
        }
    }

    private func trocarPeriodo(_ p: Dia, _ todo: Dia, para: Periodo) {
        let de = periodoEfetivo(p)?.rotulo ?? ""
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await modelo.servico.trocarPeriodo(p, noDia: todo, para: para)
                await modelo.invalidar()
                // a ordem sai do nome: segue o período trocado
                periodoSel = diaInteiro.listaPeriodos.firstIndex { $0.periodo == para.rawValue } ?? 0
                aviso = "\(de) agora é \(para.rotulo)."
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                aviso = mensagemErroTreino(error)
            }
        }
    }

    private func removerPeriodo(_ p: Dia) {
        ocupado = true
        Task {
            defer { ocupado = false }
            do {
                try await modelo.servico.removerPeriodo(p)
                periodoSel = 0
                await modelo.invalidar()
                aviso = "Período \(rotuloDoPeriodo(p.periodo) ?? "") removido."
            } catch {
                if app.controle.tratarErro(error, token: sessao.token) { return }
                aviso = mensagemErroTreino(error, permissao: MSG_SEM_PERMISSAO_APAGAR)
            }
        }
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

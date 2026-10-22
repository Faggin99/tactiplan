import Foundation

// Períodos do dia (Manhã · Tarde · Noite) — migration 057 do servidor.
// Cada período é uma sessão (training_sessions) da mesma data; dia de 1 período (a maioria)
// tem periodo = nil e fica exatamente como antes. Regras iguais às do servidor
// (backend-node/src/services/periodos.js): máximo 3, nomes fixos, descanso é do dia inteiro
// (só com 1 período), no máximo 1 período de jogo por dia. Ao adicionar o 1º período extra,
// o treino que já existia ganha um nome (padrão: atual = Manhã, novo = Tarde).
// Paridade: dados/treino/Periodos.kt (Android).

public enum Periodo: String, CaseIterable, Codable, Equatable, Sendable {
    case manha, tarde, noite

    public var rotulo: String {
        switch self {
        case .manha: return "Manhã"
        case .tarde: return "Tarde"
        case .noite: return "Noite"
        }
    }

    public var ordem: Int { (Periodo.allCases.firstIndex(of: self) ?? 0) + 1 }
}

public let MAX_PERIODOS = 3

/// 0 = período único, 1 = manhã, 2 = tarde, 3 = noite.
public func ordemDoPeriodo(_ p: String?) -> Int { p.flatMap { Periodo(rawValue: $0) }?.ordem ?? 0 }

/// "Manhã" (nil no período único ou valor desconhecido).
public func rotuloDoPeriodo(_ p: String?) -> String? { p.flatMap { Periodo(rawValue: $0) }?.rotulo }

extension Dia {
    /// Os períodos do dia (o próprio dia quando é único).
    public var listaPeriodos: [Dia] {
        if let ps = periodos, ps.count > 1 { return ps }
        return [self]
    }

    /// Tem 2 ou mais períodos?
    public var temPeriodos: Bool { listaPeriodos.count > 1 }
}

/// Selo do card do dia na Semana: "2 períodos" (nil no dia de 1 período).
public func seloPeriodos(_ d: Dia) -> String? {
    let n = d.listaPeriodos.count
    return n > 1 ? "\(n) períodos" : nil
}

/// Divisão dos minutos: "90+60" (nil no dia de 1 período).
public func divisaoMinutos(_ d: Dia) -> String? {
    guard d.temPeriodos else { return nil }
    return d.listaPeriodos.map { String(resumoDoDia($0).minutos) }.joined(separator: "+")
}

/// Distância do dia = soma dos períodos de TREINO com registro (nil sem nenhum).
public func distanciaDoDia(_ d: Dia) -> Double? {
    var total: Double?
    for p in d.listaPeriodos where p.tipo == .treino {
        if let km = p.distanciaKm, km.isFinite { total = (total ?? 0) + km }
    }
    return total.map { ($0 * 100).rounded() / 100 }
}

/// Resumo do DIA inteiro (todos os períodos somados): minutos, pilares por tempo, anexos e distância.
/// Dia de 1 período = `resumoDoDia` de sempre. Com um período de jogo, o dia aparece como jogo.
public func resumoDoDiaInteiro(_ d: Dia) -> ResumoDia {
    guard d.temPeriodos else { return resumoDoDia(d) }
    let ps = d.listaPeriodos
    let jogo = ps.first { $0.tipo == .jogo }
    let todos = Dia(id: d.id, data: d.data, nomeDia: d.nomeDia, diaDaSemana: d.diaDaSemana, tipoBruto: TipoDia.treino.rawValue,
                    blocos: ps.flatMap(\.blocos))
    let r = resumoDoDia(todos)
    return ResumoDia(tipo: jogo != nil ? .jogo : .treino, pilares: r.pilares, minutosPorPilar: r.minutosPorPilar,
                     minutos: r.minutos, blocosComAtividade: r.blocosComAtividade, atividades: r.atividades,
                     anexos: r.anexos, distanciaKm: distanciaDoDia(d), adversario: jogo?.adversario)
}

/// Os nomes que ainda cabem no dia (vazio = não dá para adicionar: descanso ou já tem 3).
/// No dia de 1 período, os 3 (o usuário escolhe o nome do atual e o do novo).
public func periodosDisponiveis(_ d: Dia) -> [Periodo] {
    let ps = d.listaPeriodos
    if ps.contains(where: { $0.tipo == .descanso }) || ps.count >= MAX_PERIODOS { return [] }
    if !d.temPeriodos { return Periodo.allCases }
    let usados = Set(ps.compactMap(\.periodo))
    return Periodo.allCases.filter { !usados.contains($0.rawValue) }
}

/// Sugestão ao abrir "Adicionar período": dia único → atual Manhã, novo Tarde; senão o 1º livre.
public func sugestaoNovoPeriodo(_ d: Dia) -> (atual: Periodo?, novo: Periodo)? {
    let livres = periodosDisponiveis(d)
    guard !livres.isEmpty else { return nil }
    if !d.temPeriodos { return (.manha, .tarde) }
    return (nil, livres[0])
}

public let MSG_PERIODO_DESCANSO = "Dia de descanso não tem períodos. Mude o tipo do dia antes."
public let MSG_PERIODO_MAXIMO = "O dia já tem 3 períodos (o máximo)."
public let MSG_PERIODO_IGUAL = "O novo período precisa ser diferente do atual."

/// Confere o pedido antes de mandar (o servidor confere de novo). nil = ok.
public func erroNovoPeriodo(_ d: Dia, atual: Periodo?, novo: Periodo) -> String? {
    let ps = d.listaPeriodos
    if ps.contains(where: { $0.tipo == .descanso }) { return MSG_PERIODO_DESCANSO }
    if ps.count >= MAX_PERIODOS { return MSG_PERIODO_MAXIMO }
    if !d.temPeriodos {
        guard let atual else { return "Diga qual é o período do treino que já existe." }
        return atual == novo ? MSG_PERIODO_IGUAL : nil
    }
    if ps.contains(where: { $0.periodo == novo.rawValue }) { return "O dia já tem o período \(novo.rotulo)." }
    return nil
}

/// Texto da confirmação de "Remover período".
public func textoRemoverPeriodo(_ p: Dia) -> String {
    let r = resumoDoDia(p)
    var t = "Remover o período \(rotuloDoPeriodo(p.periodo) ?? "")? "
    if p.tipo == .jogo { t += "O jogo deste período (escalação e eventos) também será apagado. " }
    if r.atividades > 0 || r.anexos > 0 {
        t += "Serão apagados \(contagem(r.atividades, "atividade", "atividades"))"
        if r.anexos > 0 { t += " e \(contagem(r.anexos, "anexo", "anexos"))" }
        t += ". "
    }
    return t + "Não dá para desfazer."
}

/// "Trocar horário" de um período (PUT /api/sessions/:id/periodo): os nomes livres no dia
/// (os que nenhum OUTRO período usa). Vazio no dia de 1 período (não há o que trocar).
public func periodosParaTrocar(_ d: Dia, _ p: Dia) -> [Periodo] {
    guard d.temPeriodos, p.periodo != nil else { return [] }
    let outros = Set(d.listaPeriodos.filter { $0.id != p.id }.compactMap(\.periodo))
    return Periodo.allCases.filter { $0.rawValue != p.periodo && !outros.contains($0.rawValue) }
}

/// Confere a troca antes de mandar (mesmas regras de validarRenomear no servidor). nil = ok.
public func erroTrocarPeriodo(_ d: Dia, _ p: Dia, para: Periodo) -> String? {
    guard d.temPeriodos, p.periodo != nil else { return "O dia tem um período só: adicione um período antes." }
    if p.periodo == para.rawValue { return "O período já é \(para.rotulo)." }
    if d.listaPeriodos.contains(where: { $0.id != p.id && $0.periodo == para.rawValue }) { return "O dia já tem o período \(para.rotulo)." }
    return nil
}

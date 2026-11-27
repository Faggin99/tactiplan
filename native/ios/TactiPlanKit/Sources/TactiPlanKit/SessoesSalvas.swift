import Foundation

// SESSÕES SALVAS (/api/treinos-modelo, migrations 070/073): o treino inteiro de um período (os 6 blocos com a
// atividade de cada um, e as mídias copiadas) guardado com um nome para usar de novo em outro dia. Da CONTA.
// Regras iguais às do web (frontend/src/pages/SessoesSalvasPage.jsx) e do servidor (routes/treinosModelo.js):
// a lista já vem ordenada pelo dia do treino de origem; "atividades" não conta Academia, Ativação nem o
// goleiro; "minutos" não soma o goleiro (vem à parte, "+N′ gol"). Usar num treino que já tem atividades →
// 409 TEM_ATIVIDADES: o app pergunta e reenvia com `substituir: true`.
// Paridade: dados/treino/SessoesSalvas.kt (Android).

/// Mídia guardada junto do bloco (cópia do anexo da atividade de origem).
public struct MidiaSessaoSalva: Codable, Equatable, Sendable {
    public var url: String?
    /// "image" | "video" | "application"
    public var tipo: String?
    public var nome: String?

    public init(url: String?, tipo: String?, nome: String?) { self.url = url; self.tipo = tipo; self.nome = nome }

    /// Foto, vídeo ou PDF/arquivo (para o ícone).
    public var especie: EspecieAnexo {
        switch tipo {
        case "image": return .foto
        case "video": return .video
        default: return especieDoAnexo(tipo: nil, nome: url ?? nome) == .pdf ? .pdf : .outro
        }
    }
}

/// Um bloco da sessão salva (resumo para a lista e o detalhe).
public struct BlocoSessaoSalva: Codable, Equatable, Sendable {
    public var ordem: Int
    public var nome: String
    public var titulo: String?
    public var conteudo: String?
    /// "tatico" | "fisico" | "tecnico" | "mental" (o pilar do conteúdo)
    public var pilar: String?
    public var minutos: Int
    public var descricao: String?
    public var midias: [MidiaSessaoSalva]

    public init(ordem: Int, nome: String, titulo: String? = nil, conteudo: String? = nil, pilar: String? = nil, minutos: Int = 0,
                descricao: String? = nil, midias: [MidiaSessaoSalva] = []) {
        self.ordem = ordem; self.nome = nome; self.titulo = titulo; self.conteudo = conteudo; self.pilar = pilar
        self.minutos = minutos; self.descricao = descricao; self.midias = midias
    }

    enum CodingKeys: String, CodingKey { case ordem, nome, titulo, conteudo, pilar, minutos, descricao, midias }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ordem = c.numeroFlex(.ordem).map { Int($0) } ?? 0
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        titulo = try? c.decodeIfPresent(String.self, forKey: .titulo)
        conteudo = try? c.decodeIfPresent(String.self, forKey: .conteudo)
        pilar = try? c.decodeIfPresent(String.self, forKey: .pilar)
        minutos = c.numeroFlex(.minutos).map { Int($0) } ?? 0
        descricao = try? c.decodeIfPresent(String.self, forKey: .descricao)
        midias = (try? c.decodeIfPresent([MidiaSessaoSalva].self, forKey: .midias)) ?? []
    }

    /// O bloco tem atividade (título, conteúdo, minutos ou descrição)?
    public var preenchido: Bool {
        !(titulo ?? "").isEmpty || !(conteudo ?? "").isEmpty || minutos > 0
            || !(descricao ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

public struct SessaoSalva: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var nome: String
    public var descricao: String?
    public var criadoPor: String?
    public var criadoEm: String?
    /// Dia do treino de onde a sessão foi salva ("YYYY-MM-DD"; nil nas sessões antigas).
    public var origemData: String?
    /// "manha" | "tarde" | "noite" (nil = período único antigo)
    public var origemPeriodo: String?
    public var atividades: Int
    public var minutos: Int
    public var goleiro: Int
    public var midias: Int
    public var blocos: [BlocoSessaoSalva]

    public init(id: String, nome: String, descricao: String? = nil, criadoPor: String? = nil, criadoEm: String? = nil,
                origemData: String? = nil, origemPeriodo: String? = nil, atividades: Int = 0, minutos: Int = 0, goleiro: Int = 0,
                midias: Int = 0, blocos: [BlocoSessaoSalva] = []) {
        self.id = id; self.nome = nome; self.descricao = descricao; self.criadoPor = criadoPor; self.criadoEm = criadoEm
        self.origemData = origemData; self.origemPeriodo = origemPeriodo; self.atividades = atividades; self.minutos = minutos
        self.goleiro = goleiro; self.midias = midias; self.blocos = blocos
    }

    enum CodingKeys: String, CodingKey {
        case id, nome, descricao, criadoPor = "criado_por", criadoEm = "created_at", origemData = "origem_data"
        case origemPeriodo = "origem_periodo", atividades, minutos, goleiro, midias, blocos
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        nome = (try? c.decodeIfPresent(String.self, forKey: .nome)) ?? ""
        descricao = try? c.decodeIfPresent(String.self, forKey: .descricao)
        criadoPor = try? c.decodeIfPresent(String.self, forKey: .criadoPor)
        criadoEm = try? c.decodeIfPresent(String.self, forKey: .criadoEm)
        origemData = (try? c.decodeIfPresent(String.self, forKey: .origemData)).flatMap { $0 }.map { String($0.prefix(10)) }
        origemPeriodo = try? c.decodeIfPresent(String.self, forKey: .origemPeriodo)
        atividades = c.numeroFlex(.atividades).map { Int($0) } ?? 0
        minutos = c.numeroFlex(.minutos).map { Int($0) } ?? 0
        goleiro = c.numeroFlex(.goleiro).map { Int($0) } ?? 0
        midias = c.numeroFlex(.midias).map { Int($0) } ?? 0
        blocos = ((try? c.decodeIfPresent([BlocoSessaoSalva].self, forKey: .blocos)) ?? []).sorted { $0.ordem < $1.ordem }
    }
}

/// GET /api/treinos-modelo → `{ data: [...] }` (a ordem do servidor é mantida).
public func lerSessoesSalvas(_ j: Json) throws -> [SessaoSalva] {
    try listaOuData(j).decodificar([SessaoSalva].self)
}

public let MAX_NOME_SESSAO = 80

/// "Treino de sexta, 20/11 · Manhã" (nil nas sessões antigas, sem origem).
public func origemDaSessao(_ s: SessaoSalva) -> String? {
    guard let d = s.origemData, lerData(d) != nil else { return nil }
    var t = "Treino de \(rotuloDiaMinusculo(d))"
    if let p = rotuloDoPeriodo(s.origemPeriodo) { t += " · \(p)" }
    return t
}

/// "4 atividades · 75 min · +20′ gol".
public func resumoDaSessao(_ s: SessaoSalva) -> String {
    var p = [contagem(s.atividades, "atividade", "atividades")]
    if s.minutos > 0 { p.append("\(s.minutos) min") }
    if s.goleiro > 0 { p.append("+\(s.goleiro)′ gol") }
    return p.joined(separator: " · ")
}

/// Barra dos pilares da sessão: o pilar de cada bloco ponderado pelos minutos (sem minutos na sessão, 1 por
/// bloco); o goleiro fica de fora. Ordem dos PILARES; fração 0…1.
public func pilaresDaSessao(_ s: SessaoSalva) -> [(pilar: String, fracao: Double)] {
    var t: [String: Int] = [:]
    for b in s.blocos {
        guard let p = b.pilar, !p.isEmpty, !ehBlocoGoleiro(b.nome) else { continue }
        t[p, default: 0] += s.minutos > 0 ? b.minutos : 1
    }
    let total = t.values.reduce(0, +)
    guard total > 0 else { return [] }
    return PILARES.map(\.id).filter { (t[$0] ?? 0) > 0 }.map { ($0, Double(t[$0]!) / Double(total)) }
}

/// Nome sugerido ao salvar: "Treino de sexta, 20/11".
public func nomePadraoSessao(_ d: Dia) -> String { "Treino de \(rotuloDiaMinusculo(d.data))" }

/// O período tem atividade para virar sessão salva? (só treino, já salvo no banco)
public func podeSalvarSessao(_ p: Dia) -> Bool {
    p.tipo == .treino && p.id != nil && p.blocos.contains { $0.atividade != nil }
}

/// Os períodos de TREINO do dia (onde uma sessão salva pode entrar).
public func periodosParaAplicar(_ d: Dia) -> [Dia] { d.listaPeriodos.filter { $0.tipo == .treino } }

/// Dia sem período de treino: a frase amigável (nil = tem treino).
public func erroDiaSemTreino(_ d: Dia) -> String? {
    guard periodosParaAplicar(d).isEmpty else { return nil }
    let tipo = d.listaPeriodos.first?.tipo.rotulo.lowercased() ?? "outro tipo"
    return "Esse dia está marcado como \(tipo). Para usar a sessão, mude o dia para treino (ou adicione um período de treino)."
}

/// 409 TEM_ATIVIDADES do aplicar: quantas atividades o treino já tem (nil = outro erro).
public func atividadesQueSeraoTrocadas(_ e: Error) -> Int? {
    guard let erro = e as? ErroApi, erro.codigo == "TEM_ATIVIDADES" else { return nil }
    if let n = erro.extras["atividades"].flatMap({ Int($0) }) { return n }
    // sem o número no corpo: tira da frase ("Esse treino já tem 3 atividades.")
    let digitos = erro.mensagem.split(whereSeparator: { !$0.isNumber }).first.flatMap { Int($0) }
    return digitos ?? 1
}

/// "Esse treino já tem 3 atividades. Substituir pelas da sessão salva?"
public func textoSubstituirSessao(_ n: Int) -> String {
    "Esse treino já tem \(contagem(n, "atividade", "atividades")). Substituir pelas da sessão salva?"
}

public let MSG_NOME_SESSAO = "Dê um nome à sessão."
public let TEXTO_SESSOES_SALVAS = "Treinos completos guardados com um nome para usar de novo em outro dia. Para salvar, abra o dia e toque em Salvar sessão."

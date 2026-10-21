import Foundation

// "Fotos do relatório" (a tela nativa equivalente ao ReportPhotosModal do web): antes de gerar a
// ficha do dia ou o relatório da semana, escolher quais fotos entram, a ordem, a legenda, o
// layout, a proporção, o tamanho (50–100%), a posição ("no final" ou "abaixo de cada bloco", só
// na ficha) e se agrupa por dia (só na semana). O servidor valida tudo de novo
// (backend-node/src/reports/photoConfig.js); aqui é a MESMA regra do modal, pura.
// Paridade: dados/treino/FotosRelatorio.kt (Android).

public struct OpcaoLayout: Equatable, Sendable, Identifiable {
    public let id: String
    public let rotulo: String
    public let dica: String
}

public let LAYOUTS_FOTOS: [OpcaoLayout] = [
    OpcaoLayout(id: "grande", rotulo: "Grande", dica: "1 por linha"),
    OpcaoLayout(id: "medio", rotulo: "Médio", dica: "2 por linha"),
    OpcaoLayout(id: "compacto", rotulo: "Compacto", dica: "3 por linha"),
    OpcaoLayout(id: "mosaico", rotulo: "Mosaico", dica: "1 destaque + menores"),
]

public let PROPORCOES_FOTOS: [(id: String, rotulo: String)] = [
    ("4:3", "Paisagem 4:3"), ("1:1", "Quadrada 1:1"), ("original", "Original"),
]

public let MAX_LEGENDA_FOTO = 120
public let TAMANHO_FOTO_MIN = 50
public let TAMANHO_FOTO_MAX = 100

/// Escolhas que ficam lembradas no aparelho (como o localStorage do web).
public struct PreferenciasFotos: Codable, Equatable, Sendable {
    public var layout: String?
    public var proporcao: String?
    public var legendas: Bool?
    public var agrupar: Bool?
    public var posicao: String?
    public var tamanho: Int?
    public init(layout: String? = nil, proporcao: String? = nil, legendas: Bool? = nil, agrupar: Bool? = nil,
                posicao: String? = nil, tamanho: Int? = nil) {
        self.layout = layout; self.proporcao = proporcao; self.legendas = legendas; self.agrupar = agrupar
        self.posicao = posicao; self.tamanho = tamanho
    }
}

public func chavePreferenciasFotos(_ usuarioId: String?) -> String { "tp.relatorio.fotos.v1.\(usuarioId ?? "anon")" }

public struct GrupoFotos: Equatable, Sendable, Identifiable {
    public let id: String
    /// "Quarta-feira · 21/10" (nil = lista corrida).
    public let rotulo: String?
    public let ids: [String]
}

public struct EscolhaFotos: Equatable, Sendable {
    public let fotos: [FotoRelatorio]
    /// Semana (relatório de treino) × ficha do dia.
    public let semana: Bool
    public let limite: Int
    public var layout: String
    public var proporcao: String
    public var legendas: Bool
    public var tamanho: Int
    public var agrupar: Bool
    public var posicao: String
    public private(set) var ordem: [String]
    public private(set) var selecionadas: Set<String>
    /// Legenda editada (só no relatório; o título do anexo não muda).
    public private(set) var legendas_: [String: String]

    public init(lista: ListaFotosRelatorio, preferencias p: PreferenciasFotos? = nil) {
        fotos = lista.fotos
        semana = lista.semana ?? false
        limite = lista.limite ?? 24
        let padrao = lista.padrao
        layout = LAYOUTS_FOTOS.contains { $0.id == p?.layout } ? p!.layout! : (padrao?.layout ?? "medio")
        proporcao = PROPORCOES_FOTOS.contains { $0.id == p?.proporcao } ? p!.proporcao! : (padrao?.proporcao ?? "4:3")
        legendas = p?.legendas ?? true
        agrupar = p?.agrupar ?? true
        posicao = p?.posicao == "blocos" ? "blocos" : "fim"
        tamanho = min(TAMANHO_FOTO_MAX, max(TAMANHO_FOTO_MIN, p?.tamanho ?? TAMANHO_FOTO_MAX))
        ordem = lista.fotos.map(\.id)
        let ids = Set(lista.fotos.map(\.id))
        selecionadas = Set((padrao?.ids ?? []).filter { ids.contains($0) })
        legendas_ = [:]
    }

    public var preferencias: PreferenciasFotos {
        PreferenciasFotos(layout: layout, proporcao: proporcao, legendas: legendas, agrupar: agrupar, posicao: posicao, tamanho: tamanho)
    }

    private func foto(_ id: String) -> FotoRelatorio? { fotos.first { $0.id == id } }
    private var agrupada: Bool { semana && agrupar }

    /// Grupos exibidos: por dia (semana agrupada, dias em ordem) ou um só.
    public var grupos: [GrupoFotos] {
        guard agrupada else { return [GrupoFotos(id: "all", rotulo: nil, ids: ordem)] }
        var mapa: [String: (rotulo: String, ids: [String])] = [:]
        for id in ordem {
            let f = foto(id)
            let k = f?.data ?? "sem-data"
            let rotulo = f?.dia.map { "\($0) · \(f?.dd ?? "")" } ?? "Sem data"
            mapa[k, default: (rotulo, [])].ids.append(id)
        }
        return mapa.keys.sorted().map { GrupoFotos(id: $0, rotulo: mapa[$0]!.rotulo, ids: mapa[$0]!.ids) }
    }

    /// A ordem como aparece (e como vai pro relatório).
    public var ordemExibida: [String] { grupos.flatMap(\.ids) }

    public func marcada(_ id: String) -> Bool { selecionadas.contains(id) }

    /// Marca/desmarca. Devolve o aviso quando bate no limite.
    @discardableResult
    public mutating func alternar(_ id: String) -> String? {
        if selecionadas.contains(id) { selecionadas.remove(id); return nil }
        guard selecionadas.count < limite else { return "No máximo \(limite) fotos por relatório." }
        selecionadas.insert(id)
        return nil
    }

    @discardableResult
    public mutating func selecionarTodas() -> String? {
        let ids = ordemExibida
        selecionadas = Set(ids.prefix(limite))
        return ids.count > limite ? "Selecionadas as primeiras \(limite) (máximo por relatório)." : nil
    }

    public mutating func nenhuma() { selecionadas = [] }

    private func grupoDe(_ id: String) -> String { agrupada ? (foto(id)?.data ?? "sem-data") : "all" }

    /// Dá para subir/descer? (dentro do mesmo dia quando agrupado)
    public func podeMover(_ id: String, _ direcao: Int) -> Bool {
        let seq = ordemExibida
        guard let i = seq.firstIndex(of: id) else { return false }
        let j = i + direcao
        return j >= 0 && j < seq.count && grupoDe(seq[j]) == grupoDe(id)
    }

    public mutating func mover(_ id: String, _ direcao: Int) {
        guard podeMover(id, direcao) else { return }
        var seq = ordemExibida
        let i = seq.firstIndex(of: id)!
        seq.swapAt(i, i + direcao)
        ordem = seq
    }

    /// Legenda mostrada no campo (a editada ou o título do anexo).
    public func legenda(_ id: String) -> String { legendas_[id] ?? foto(id)?.titulo ?? "" }

    public mutating func editarLegenda(_ id: String, _ texto: String) {
        legendas_[id] = String(texto.prefix(MAX_LEGENDA_FOTO))
    }

    public func legendaEditada(_ id: String) -> Bool {
        guard let l = legendas_[id] else { return false }
        return l != (foto(id)?.titulo ?? "")
    }

    public mutating func restaurarLegenda(_ id: String) { legendas_.removeValue(forKey: id) }

    public var quantasSelecionadas: Int { ordemExibida.filter { selecionadas.contains($0) }.count }

    /// O `fotos` do corpo do relatório (igual ao `config` do modal do web).
    public var configuracao: Json {
        let ids = ordemExibida.filter { selecionadas.contains($0) }
        var custom: [String: Json] = [:]
        for id in ids where legendaEditada(id) { custom[id] = .texto(legendas_[id]!) }
        var o: [String: Json] = [
            "ids": .lista(ids.map { .texto($0) }), "layout": .texto(layout), "proporcao": .texto(proporcao),
            "legendas": .booleano(legendas), "agrupar": .booleano(agrupar), "tamanho": .numero(Double(tamanho)),
            "legendasCustom": .objeto(custom),
        ]
        if !semana { o["posicao"] = .texto(posicao) }
        return .objeto(o)
    }

    /// "Fotos: 2 páginas" / "Ficha: …" / "Sem fotos" (rótulo da prévia).
    public var rotuloPrevia: String { !semana && posicao == "blocos" ? "Ficha" : "Fotos" }

    /// Tamanho em passos de 10 (o slider do web).
    public mutating func mudarTamanho(_ v: Double) {
        tamanho = min(TAMANHO_FOTO_MAX, max(TAMANHO_FOTO_MIN, Int((v / 10).rounded()) * 10))
    }
}

/// Como gerar o PDF a partir da tela de fotos.
public enum ModoExportarFotos: Equatable, Sendable {
    /// Com as escolhas da tela.
    case escolhidas
    /// Seleção automática do servidor (como antes).
    case automatico
    /// Sem a seção de fotos.
    case semFotos
}

/// Corpo final do PDF.
public func corpoComFotos(_ base: [String: Json], _ escolha: EscolhaFotos, modo: ModoExportarFotos) -> [String: Json] {
    var c = base
    switch modo {
    case .automatico: break
    case .semFotos: c["fotos"] = ["ids": .lista([])]
    case .escolhidas:
        c["fotos"] = escolha.quantasSelecionadas == 0 ? ["ids": .lista([])] : escolha.configuracao
    }
    return c
}

/// A prévia (WebView) recebe o HTML do servidor sem viewport: põe um que caiba a folha A4
/// (794 px) na largura do celular, e trava o zoom pelo próprio WebView.
public func htmlParaWebView(_ html: String, largura: Int = 820) -> String {
    let meta = "<meta name=\"viewport\" content=\"width=\(largura)\">"
    if let r = html.range(of: "<head>", options: .caseInsensitive) {
        return html.replacingCharacters(in: r, with: "<head>" + meta)
    }
    return meta + html
}

/// Miniatura em data URI → bytes (a tela decodifica). nil se não for data URI base64.
public func bytesDaMiniatura(_ thumb: String?) -> Data? {
    guard let t = thumb, t.hasPrefix("data:"), let virgula = t.firstIndex(of: ",") else { return nil }
    let cabecalho = t[..<virgula]
    guard cabecalho.hasSuffix(";base64") else { return nil }
    return Data(base64Encoded: String(t[t.index(after: virgula)...]))
}

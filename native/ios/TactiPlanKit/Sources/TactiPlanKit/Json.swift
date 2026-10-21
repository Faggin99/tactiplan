import Foundation

/// Valor JSON genérico (o `JsonElement` do Android): corpo cru da API e blob do
/// cache. Tipos de tela usam `Codable` direto via `Api.chamar`.
public enum Json: Equatable, Sendable, Codable {
    case nulo
    case booleano(Bool)
    case numero(Double)
    case texto(String)
    case lista([Json])
    case objeto([String: Json])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .nulo }
        else if let b = try? c.decode(Bool.self) { self = .booleano(b) }
        else if let n = try? c.decode(Double.self) { self = .numero(n) }
        else if let s = try? c.decode(String.self) { self = .texto(s) }
        else if let l = try? c.decode([Json].self) { self = .lista(l) }
        else { self = .objeto(try c.decode([String: Json].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .nulo: try c.encodeNil()
        case .booleano(let b): try c.encode(b)
        case .numero(let n):
            // Inteiro sai sem ".0" (como o JSON.stringify do JS).
            if n.rounded() == n, abs(n) < 9_007_199_254_740_992 { try c.encode(Int64(n)) } else { try c.encode(n) }
        case .texto(let s): try c.encode(s)
        case .lista(let l): try c.encode(l)
        case .objeto(let o): try c.encode(o)
        }
    }

    /// Campo de um objeto (nil se não for objeto ou não tiver a chave).
    public subscript(chave: String) -> Json? {
        if case .objeto(let o) = self { return o[chave] }
        return nil
    }

    public var objeto: [String: Json]? { if case .objeto(let o) = self { return o }; return nil }
    public var texto: String? { if case .texto(let s) = self { return s }; return nil }
    public var booleano: Bool? { if case .booleano(let b) = self { return b }; return nil }
    public var numero: Double? { if case .numero(let n) = self { return n }; return nil }

    // MARK: codificação

    /// JSON do app: chaves ordenadas (saída determinística).
    public func dados() throws -> Data {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try e.encode(self)
    }

    public func textoJson() -> String { (try? dados()).flatMap { String(data: $0, encoding: .utf8) } ?? "null" }

    /// Texto JSON → valor; lança se não for JSON válido.
    public static func ler(_ dados: Data) throws -> Json { try JSONDecoder().decode(Json.self, from: dados) }

    /// Qualquer `Encodable` → `Json` (ex.: corpo tipado de uma chamada).
    public static func de<T: Encodable>(_ valor: T) throws -> Json {
        try ler(try JSONEncoder().encode(valor))
    }

    /// `Json` → tipo `Decodable` (campos desconhecidos ignorados, opcionais podem faltar).
    public func decodificar<T: Decodable>(_ tipo: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(T.self, from: try dados())
    }
}

extension Json: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByFloatLiteral,
    ExpressibleByBooleanLiteral, ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral
{
    public init(stringLiteral v: String) { self = .texto(v) }
    public init(integerLiteral v: Int) { self = .numero(Double(v)) }
    public init(floatLiteral v: Double) { self = .numero(v) }
    public init(booleanLiteral v: Bool) { self = .booleano(v) }
    public init(arrayLiteral v: Json...) { self = .lista(v) }
    public init(dictionaryLiteral v: (String, Json)...) {
        self = .objeto(Dictionary(v, uniquingKeysWith: { _, b in b }))
    }
}

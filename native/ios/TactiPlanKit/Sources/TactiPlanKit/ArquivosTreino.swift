import Foundation

// Material do treino FORA das atividades (não entra em estatísticas):
// - ANEXOS DA SESSÃO (26/11/2026): training_activity_files com activity_id NULL, por período. Até 15 por treino,
//   50 MB; as fotos saem no fim da ficha. POST /api/files/upload com `session_id` (sem `activity_id`).
// - ARQUIVOS DA SEMANA (migration 072): material da comissão ligado ao microciclo. Até 30 por semana, 50 MB.
//   /api/arquivos-semana (GET ?week&club_id · POST multipart {week, club_id, title?, file} · DELETE /:id).
// Os dois aceitam também planilha, Word, PowerPoint e CSV (uploadSessionFile/uploadArquivoSemana do servidor).
// Web: components/training/AnexosSessao.jsx e ArquivosSemana.jsx. Paridade: dados/treino/ArquivosTreino.kt (Android).

public let MAX_ANEXOS_SESSAO = 15
public let MAX_ARQUIVOS_SEMANA = 30

/// Tipos aceitos nos anexos da sessão e nos arquivos da semana (TIPOS_SEMANA do servidor).
public let TIPOS_ARQUIVO_TREINO: Set<String> = TIPOS_ANEXO_ACEITOS.union([
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.ms-powerpoint",
])

public let MSG_ARQUIVO_TIPO = "Tipo de arquivo não aceito. Envie PDF, planilha, Word, PowerPoint, foto ou vídeo."
public let MSG_MAX_ANEXOS_SESSAO = "Máximo de \(MAX_ANEXOS_SESSAO) anexos por treino."
public let MSG_MAX_ARQUIVOS_SEMANA = "Máximo de \(MAX_ARQUIVOS_SEMANA) arquivos por semana."
public let TEXTO_ANEXOS_SESSAO = "Material extra do treino, fora das atividades. Não entra nas estatísticas; as fotos saem no fim da ficha."
public let TEXTO_ARQUIVOS_SEMANA = "Material da comissão para esta semana. Não entra nas estatísticas nem nos relatórios."

/// MIME pela extensão do arquivo escolhido em Arquivos (nil = não aceito).
public func mimeDoArquivo(_ nome: String) -> String? {
    let ext = (nome.split(separator: ".").last.map(String.init) ?? "").lowercased()
    switch ext {
    case "pdf": return "application/pdf"
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    case "xls": return "application/vnd.ms-excel"
    case "csv": return "text/csv"
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case "doc": return "application/msword"
    case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    case "ppt": return "application/vnd.ms-powerpoint"
    case "jpg", "jpeg": return "image/jpeg"
    case "png": return "image/png"
    case "webp": return "image/webp"
    case "gif": return "image/gif"
    case "mp4", "m4v": return "video/mp4"
    case "mov": return "video/quicktime"
    case "webm": return "video/webm"
    default: return nil
    }
}

/// Tipo/tamanho fora do que o servidor aceita → a frase; nil = ok.
public func problemaDoArquivoTreino(tipo: String, tamanho: Int) -> String? {
    if !TIPOS_ARQUIVO_TREINO.contains(tipo.lowercased()) { return MSG_ARQUIVO_TIPO }
    if tamanho > MAX_BYTES_ANEXO { return MSG_ANEXO_GRANDE }
    return nil
}

/// Os anexos da SESSÃO (sem atividade) da lista de GET /api/files/session/:id.
public func anexosDaSessao(_ lista: [Anexo]) -> [Anexo] { lista.filter { ($0.atividadeId ?? "").isEmpty } }

/// "1,2 MB" · "340 KB" ("" sem tamanho) — o `tamanho` do web.
public func tamanhoLegivel(_ bytes: Int?) -> String {
    guard let b = bytes, b > 0 else { return "" }
    if b >= 1_048_576 {
        let mb = (Double(b) / 1_048_576 * 10).rounded() / 10
        return String(format: "%.1f", mb).replacingOccurrences(of: ".", with: ",") + " MB"
    }
    return "\(max(1, Int((Double(b) / 1024).rounded()))) KB"
}

/// Ícone: planilha, documento (PDF/Word/PowerPoint), foto, vídeo ou outro.
public enum EspecieArquivo: String, Equatable, Sendable { case foto, video, planilha, documento, outro }

public func especieDoArquivo(_ mime: String?) -> EspecieArquivo {
    let m = (mime ?? "").lowercased()
    if m.hasPrefix("image/") { return .foto }
    if m.hasPrefix("video/") { return .video }
    if m.contains("sheet") || m.contains("excel") || m == "text/csv" { return .planilha }
    if m == "application/pdf" || m.contains("word") || m.contains("presentation") || m.contains("powerpoint") { return .documento }
    return .outro
}

/// Instante ISO ("2026-11-23T14:05:00.000Z") → "23/11" no fuso de Brasília (nil se inválido).
public func diaMesDoInstante(_ iso: String?) -> String? {
    guard let iso, !iso.isEmpty else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let g = ISO8601DateFormatter()
    guard let d = f.date(from: iso) ?? g.date(from: iso) else {
        return lerData(iso).map { String(format: "%02d/%02d", $0.dia, $0.mes) }
    }
    let data = hojeBrasilia(Int64(d.timeIntervalSince1970 * 1000))
    return lerData(data).map { String(format: "%02d/%02d", $0.dia, $0.mes) }
}

/// Um arquivo da semana (training_microcycle_files).
public struct ArquivoSemana: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var titulo: String?
    public var url: String?
    public var nomeArquivo: String?
    public var tamanho: Int?
    public var tipo: String?
    public var criadoEm: String?
    public var enviadoPor: String?

    public init(id: String, titulo: String? = nil, url: String? = nil, nomeArquivo: String? = nil, tamanho: Int? = nil,
                tipo: String? = nil, criadoEm: String? = nil, enviadoPor: String? = nil) {
        self.id = id; self.titulo = titulo; self.url = url; self.nomeArquivo = nomeArquivo; self.tamanho = tamanho
        self.tipo = tipo; self.criadoEm = criadoEm; self.enviadoPor = enviadoPor
    }

    enum CodingKeys: String, CodingKey {
        case id, titulo = "title", url, nomeArquivo = "file_name", tamanho = "file_size", tipo = "mime_type"
        case criadoEm = "created_at", enviadoPor = "enviado_por"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        titulo = try? c.decodeIfPresent(String.self, forKey: .titulo)
        url = try? c.decodeIfPresent(String.self, forKey: .url)
        nomeArquivo = try? c.decodeIfPresent(String.self, forKey: .nomeArquivo)
        tamanho = c.numeroFlex(.tamanho).map { Int($0) }
        tipo = try? c.decodeIfPresent(String.self, forKey: .tipo)
        criadoEm = try? c.decodeIfPresent(String.self, forKey: .criadoEm)
        enviadoPor = try? c.decodeIfPresent(String.self, forKey: .enviadoPor)
    }

    /// Título para a tela (sem título, o nome do arquivo).
    public var rotulo: String {
        let t = (titulo ?? "").trimmingCharacters(in: .whitespaces)
        return t.isEmpty ? (nomeArquivo ?? "Arquivo") : t
    }

    /// "1,2 MB · Marcos Andrade · 23/11".
    public var detalhe: String {
        [tamanhoLegivel(tamanho), enviadoPor ?? "", diaMesDoInstante(criadoEm) ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    /// Como Anexo (para baixar/abrir com o mesmo QuickLook dos anexos).
    public var comoAnexo: Anexo {
        Anexo(id: id, atividadeId: nil, titulo: titulo, nomeArquivo: nomeArquivo, caminho: url, tipo: tipo, tamanho: tamanho)
    }
}

/// GET /api/arquivos-semana → `{ data: [...] }`.
public func lerArquivosSemana(_ j: Json) throws -> [ArquivoSemana] { try listaOuData(j).decodificar([ArquivoSemana].self) }

/// "Arquivos da semana (3)" — o número só quando > 0.
public func rotuloArquivosSemana(_ n: Int) -> String { n > 0 ? "Arquivos da semana (\(n))" : "Arquivos da semana" }

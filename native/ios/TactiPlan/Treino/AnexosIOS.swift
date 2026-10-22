import SwiftUI
import UIKit
import PhotosUI
import ImageIO
import UniformTypeIdentifiers
import TactiPlanKit

// Anexos do aparelho (padrões do Gestsport, FotoAtestado.swift): galeria pelo PhotosPicker (sem
// pedir acesso à fototeca), câmera pelo UIImagePickerController (só se o aparelho tem câmera) e
// PDF pelo seletor de Arquivos. Foto reduzida fora da thread principal: maior lado ≤ 2000 px, em
// pé (orientação aplicada), JPEG 0,8. Vídeo e PDF sobem como vieram (até 50 MB).

let FOTO_LADO_MAX_IOS = 2000
let FOTO_QUALIDADE_IOS: CGFloat = 0.8

enum PreparoAnexo {
    case pronto(AnexoNovo, ArquivoUpload)
    case falhou(String)
}

enum AnexosIOS {
    @MainActor static var temCamera: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    static let MSG_ILEGIVEL = "Não deu para abrir esse arquivo. Tente outro."

    /// Bytes de imagem (JPEG/HEIC/PNG) → JPEG reduzido.
    static func reduzir(dados: Data) -> Data? {
        let semCache = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let fonte = CGImageSourceCreateWithData(dados as CFData, semCache) else { return nil }
        let opcoes: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: FOTO_LADO_MAX_IOS,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(fonte, 0, opcoes as CFDictionary) else { return nil }
        return UIImage(cgImage: cg).jpegData(compressionQuality: FOTO_QUALIDADE_IOS)
    }

    /// Foto da câmera (UIImage) → JPEG reduzido, desenhado em pé.
    static func reduzir(_ imagem: UIImage) -> Data? {
        let l = imagem.size.width * imagem.scale, a = imagem.size.height * imagem.scale
        let maior = max(l, a)
        guard maior > 0 else { return nil }
        let f = min(1, CGFloat(FOTO_LADO_MAX_IOS) / maior)
        let tamanho = CGSize(width: max(1, (l * f).rounded()), height: max(1, (a * f).rounded()))
        let formato = UIGraphicsImageRendererFormat()
        formato.scale = 1
        formato.opaque = true
        let r = UIGraphicsImageRenderer(size: tamanho, format: formato).image { _ in imagem.draw(in: CGRect(origin: .zero, size: tamanho)) }
        return r.jpegData(compressionQuality: FOTO_QUALIDADE_IOS)
    }

    static func pronto(nome: String, tipo: String, dados: Data) -> PreparoAnexo {
        if let p = problemaDoArquivo(tipo: tipo, tamanho: dados.count) { return .falhou(p) }
        return .pronto(AnexoNovo(nome: nome, tipo: tipo, tamanho: dados.count), ArquivoUpload(nome: nome, tipo: tipo, dados: dados))
    }

    static func foto(_ imagem: UIImage) async -> PreparoAnexo {
        await Task.detached(priority: .userInitiated) {
            guard let d = reduzir(imagem) else { return PreparoAnexo.falhou(MSG_ILEGIVEL) }
            return pronto(nome: "foto-\(carimbo()).jpg", tipo: "image/jpeg", dados: d)
        }.value
    }

    /// Item da galeria: vídeo sobe como veio; imagem é reduzida.
    static func item(_ item: PhotosPickerItem) async -> PreparoAnexo {
        let tipos = item.supportedContentTypes
        let video = tipos.first { $0.conforms(to: .movie) }
        guard let dados = try? await item.loadTransferable(type: Data.self) else { return .falhou(MSG_ILEGIVEL) }
        if let v = video {
            let mime = v.conforms(to: .mpeg4Movie) ? "video/mp4" : "video/quicktime"
            let ext = mime == "video/mp4" ? "mp4" : "mov"
            return pronto(nome: "video-\(carimbo()).\(ext)", tipo: mime, dados: dados)
        }
        return await Task.detached(priority: .userInitiated) {
            guard let d = reduzir(dados: dados) else { return PreparoAnexo.falhou(MSG_ILEGIVEL) }
            return pronto(nome: "foto-\(carimbo()).jpg", tipo: "image/jpeg", dados: d)
        }.value
    }

    /// PDF escolhido em Arquivos (URL com acesso de segurança).
    static func pdf(_ url: URL) -> PreparoAnexo {
        let liberou = url.startAccessingSecurityScopedResource()
        defer { if liberou { url.stopAccessingSecurityScopedResource() } }
        guard let d = try? Data(contentsOf: url) else { return .falhou(MSG_ILEGIVEL) }
        return pronto(nome: url.lastPathComponent, tipo: "application/pdf", dados: d)
    }

    static func carimbo() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyyMMdd-HHmmss"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: Date())
    }
}

/// Câmera do sistema em tela cheia. `aoTerminar(nil)` = cancelou.
struct CameraFoto: UIViewControllerRepresentable {
    let aoTerminar: (UIImage?) -> Void

    func makeCoordinator() -> Coordenador { Coordenador(aoTerminar: aoTerminar) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.cameraCaptureMode = .photo
        p.allowsEditing = false
        p.delegate = context.coordinator
        return p
    }

    func updateUIViewController(_ c: UIImagePickerController, context: Context) {}

    final class Coordenador: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let aoTerminar: (UIImage?) -> Void
        private var terminou = false
        init(aoTerminar: @escaping (UIImage?) -> Void) { self.aoTerminar = aoTerminar }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            terminar(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { terminar(nil) }

        private func terminar(_ i: UIImage?) {
            guard !terminou else { return }
            terminou = true
            aoTerminar(i)
        }
    }
}

/// Ícone por espécie de anexo.
func iconeDoAnexo(_ e: EspecieAnexo) -> String {
    switch e {
    case .foto: return "photo"
    case .video: return "video"
    case .pdf: return "doc.richtext"
    case .outro: return "paperclip"
    }
}

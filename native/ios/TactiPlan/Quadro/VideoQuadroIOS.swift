import SwiftUI
import UIKit
import AVFoundation
import CoreVideo
import TactiPlanKit

// Exportar a animação em MP4 no próprio iPhone (AVAssetWriter, H.264). Mesmo ritmo e duração do
// web (useVideoExport): 30 fps, cada transição com os passos 0…45 (46 imagens) e 1 s parado no
// fim — linha do tempo no Kit (`linhaDoVideo`). Cada imagem é o MESMO desenho da tela
// (`desenharCena`), no tamanho lógico do campo e com escala para caber em 1920×1080 (pares).

enum ErroVideoQuadro: LocalizedError {
    case poucosQuadros, gravador, cancelado
    var errorDescription: String? {
        switch self {
        case .poucosQuadros: return "Crie um 2º quadro para animar (botão +)."
        case .gravador: return "Não foi possível gerar o vídeo neste aparelho."
        case .cancelado: return "Vídeo cancelado."
        }
    }
}

/// Tamanho do arquivo: cabe em 1920×1080 mantendo a proporção do campo, sempre par (H.264).
func tamanhoDoVideo(_ logico: CGSize, maximo: CGSize = CGSize(width: 1920, height: 1080)) -> (w: Int, h: Int, escala: CGFloat) {
    let escala = min(maximo.width / max(1, logico.width), maximo.height / max(1, logico.height), 3)
    let w = Int(logico.width * escala) / 2 * 2, h = Int(logico.height * escala) / 2 * 2
    return (max(2, w), max(2, h), escala)
}

/// Gera o MP4 e devolve o arquivo temporário. `progresso` 0…1 (na fila principal).
func gerarVideoQuadro(quadros: [QuadroJogada], tipo: String, vista: String, corA: String, corB: String,
                      tamanhoLogico: CGSize, nomeArquivo: String,
                      progresso: @escaping @MainActor (Double) -> Void,
                      cancelado: @escaping @Sendable () -> Bool) async throws -> URL {
    guard quadros.count > 1 else { throw ErroVideoQuadro.poucosQuadros }
    let linha = linhaDoVideo(quadros.count)
    let (w, h, escala) = tamanhoDoVideo(tamanhoLogico)
    let dims = dimensoesCanvas(Double(tamanhoLogico.width), Double(tamanhoLogico.height), tipo: tipo, vista: vista)

    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("video-quadro", isDirectory: true)
    try? FileManager.default.removeItem(at: dir)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appendingPathComponent(nomeArquivo)

    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let ajustes: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: w,
        AVVideoHeightKey: h,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: w * h >= 1920 * 1000 ? 8_000_000 : 4_000_000,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoMaxKeyFrameIntervalKey: VIDEO_FPS * 2,
            AVVideoExpectedSourceFrameRateKey: VIDEO_FPS,
        ] as [String: Any],
    ]
    let entrada = AVAssetWriterInput(mediaType: .video, outputSettings: ajustes)
    entrada.expectsMediaDataInRealTime = false
    let adaptador = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: entrada, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: w,
        kCVPixelBufferHeightKey as String: h,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ])
    guard writer.canAdd(entrada) else { throw ErroVideoQuadro.gravador }
    writer.add(entrada)
    guard writer.startWriting() else { throw writer.error ?? ErroVideoQuadro.gravador }
    writer.startSession(atSourceTime: .zero)

    for (i, passo) in linha.enumerated() {
        if cancelado() { writer.cancelWriting(); throw ErroVideoQuadro.cancelado }
        while !entrada.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 5_000_000) }
        guard let pool = adaptador.pixelBufferPool else { throw writer.error ?? ErroVideoQuadro.gravador }
        var buf: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buf)
        guard let pb = buf else { throw ErroVideoQuadro.gravador }
        let final = i >= linha.count - VIDEO_FPS
        let img = imagemDoVideo(quadros, passo, final: final)
        CVPixelBufferLockBaseAddress(pb, [])
        if let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: w, height: h, bitsPerComponent: 8,
                               bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(),
                               bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) {
            // y para baixo, como a tela; escala do tamanho lógico para os pixels do vídeo.
            ctx.translateBy(x: 0, y: CGFloat(h))
            ctx.scaleBy(x: escala, y: -escala)
            desenharCena(ctx, CenaQuadro(dims: dims, tipo: tipo, vista: vista, pecas: img.pecas, desenhos: img.desenhos,
                                         corA: corA, corB: corB))
        }
        CVPixelBufferUnlockBaseAddress(pb, [])
        if !adaptador.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: CMTimeScale(VIDEO_FPS))) {
            throw writer.error ?? ErroVideoQuadro.gravador
        }
        if i % 6 == 0 { let p = Double(i + 1) / Double(linha.count); await progresso(p) }
    }
    entrada.markAsFinished()
    await writer.finishWriting()
    guard writer.status == .completed else { throw writer.error ?? ErroVideoQuadro.gravador }
    await progresso(1)
    return url
}

/// Estado do botão de vídeo (tela de assistir e editor) e a folha de compartilhar no fim.
@MainActor
final class ExportadorVideoQuadro: ObservableObject {
    @Published private(set) var gerando = false
    @Published private(set) var progresso = 0.0
    @Published var arquivo: ArquivoLocal?
    @Published var erro: String?
    private var cancelar = false
    private final class Bandeira: @unchecked Sendable { var v = false }
    private let bandeira = Bandeira()

    func gerar(nome: String, quadros: [QuadroJogada], tipo: String, vista: String, corA: String, corB: String, tamanho: CGSize) {
        guard !gerando else { return }
        guard quadros.count > 1 else { erro = ErroVideoQuadro.poucosQuadros.errorDescription; return }
        gerando = true; progresso = 0; bandeira.v = false
        let b = bandeira
        let hoje = ISO8601DateFormatter.string(from: Date(), timeZone: .current, formatOptions: [.withFullDate])
        Task {
            defer { gerando = false }
            do {
                let url = try await gerarVideoQuadro(quadros: quadros, tipo: tipo, vista: vista, corA: corA, corB: corB,
                                                     tamanhoLogico: tamanho, nomeArquivo: nomeArquivoVideo(nome, hojeISO: hoje),
                                                     progresso: { [weak self] p in self?.progresso = p },
                                                     cancelado: { b.v })
                arquivo = ArquivoLocal(url: url)
            } catch ErroVideoQuadro.cancelado {
                return
            } catch {
                erro = (error as? LocalizedError)?.errorDescription ?? ErroVideoQuadro.gravador.errorDescription
            }
        }
    }

    func parar() { bandeira.v = true }
}

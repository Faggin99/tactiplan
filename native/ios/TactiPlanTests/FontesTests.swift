import XCTest
import UIKit
@testable import TactiPlan

// Roda no simulador (xcodebuild test no Codemagic): os nomes PostScript da
// tabela do Kit (`Fonte.arquivos`, conferidos no Linux contra os TTF) precisam
// CARREGAR de verdade no iOS — arquivo no bundle + listado no UIAppFonts.
// Sem isso o app cai calado na fonte do sistema.
final class FontesTests: XCTestCase {
    func testTodasAsFontesDaTabelaDoKitCarregam() {
        XCTAssertGreaterThan(totalDeFontesDoKit, 0)
        XCTAssertEqual(fontesQueFalharam(), [], "Fontes que o iOS não carregou (UIAppFonts/recurso)")
    }
}

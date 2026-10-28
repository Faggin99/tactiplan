import Testing
@testable import TactiPlanKit

struct ModoTemaTests {
    @Test func `le a preferencia e cai no automatico`() {
        #expect(ModoTema.de("escuro") == .escuro)
        #expect(ModoTema.de("claro") == .claro)
        #expect(ModoTema.de(nil) == .automatico)
        #expect(ModoTema.de("qualquer") == .automatico)
        #expect(ModoTema.automatico.escuroFixo == nil && ModoTema.escuro.escuroFixo == true && ModoTema.claro.escuroFixo == false)
        #expect(ModoTema.allCases.map(\.rotulo) == ["Automático", "Claro", "Escuro"])
    }
}

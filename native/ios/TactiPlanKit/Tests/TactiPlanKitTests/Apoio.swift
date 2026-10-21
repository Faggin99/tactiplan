import Foundation
@testable import TactiPlanKit

/// O /me de verdade (produção, conta de teste temporária de 21/10/2026).
let ME_REAL = """
{"usuario":{"id":"75793062-9efd-4a79-af8b-14cdf8a5658e","nome":"Teste App T0","email":"teste.app.t0@faggin.com.br","foto_url":null,"tem_senha":true},"workspaces":[{"id":"18c87849-226d-4331-91db-e6c490078260","nome":"Demonstração TactiPlan","dono":false,"papel":"assistant_coach","papel_rotulo":"Treinador auxiliar","permissoes":["training:view","training:edit","games:view","athletes:view","tactical:view","stats:view"],"categorias_restritas":false,"somente_leitura":false,"clubes":[{"id":"844e9f5d-558d-4790-90e8-7f98127cb425","nome":"Esporte Clube Vila Nova","modalidade":"football_11","arquivado":false,"categorias":[{"id":"460badf3-7366-492f-bbf5-dc66f8bef916","nome":"Sub-17"}],"personalizacao":{"cor_primaria":{"claro":"#15803d","escuro":"#15803d"},"branding":null,"logo_url":null,"logo_escura_url":null}}]}],"convites":[],"mensagem_somente_leitura":"Somente leitura. Fale com o responsável pela equipe.","campo_novo":123}
"""

func decodificarMe(_ s: String) throws -> Me { try JSONDecoder().decode(Me.self, from: Data(s.utf8)) }

func clube(_ id: String, _ nome: String, arquivado: Bool = false, cor: String? = nil, cats: [String] = []) -> Clube {
    Clube(id: id, nome: nome, modalidade: "football_11", arquivado: arquivado,
          categorias: cats.enumerated().map { Categoria(id: "\(id)-k\($0.offset)", nome: $0.element) },
          personalizacao: Personalizacao(corPrimaria: CorPrimaria(claro: cor, escuro: cor)))
}

func conta(_ id: String, _ nome: String, dono: Bool = true, leitura: Bool = false,
           permissoes: [String] = ["training:view", "training:edit", "tactical:view"], clubes: [Clube]) -> Conta {
    Conta(id: id, nome: nome, dono: dono, papel: dono ? "owner" : "assistant_coach",
          papelRotulo: dono ? "Dono" : "Treinador auxiliar", permissoes: permissoes,
          somenteLeitura: leitura, clubes: clubes)
}

func me(_ contas: [Conta], convites: [Convite] = [], nome: String = "Marcos Andrade") -> Me {
    Me(usuario: Usuario(id: "u1", nome: nome, email: "m@x.com"), workspaces: contas, convites: convites,
       mensagemSomenteLeitura: TEXTO_SO_LEITURA)
}

/// ApiApp de mentira: respostas configuráveis e registro das chamadas.
final class ApiFalsa: ApiApp, @unchecked Sendable {
    private let trava = NSLock()
    private var _chamadas: [String] = []
    var chamadas: [String] { trava.withLock { _chamadas } }
    private func anotar(_ s: String) { trava.withLock { _chamadas.append(s) } }

    var respostaLogin: Result<RespostaLogin, Error> = .failure(ErroApi.offline())
    var respostaMe: Result<Me, Error> = .failure(ErroApi.offline())
    var respostaConvite: Result<RespostaConvite, Error> = .failure(ErroApi.offline())
    var respostaConfig: Result<ConfigApp, Error> = .success(ConfigApp.padrao)
    var erroSair: Error?

    func config() async throws -> ConfigApp { anotar("config"); return try respostaConfig.get() }
    func entrar(email: String, senha: String, aparelho: Aparelho) async throws -> RespostaLogin {
        anotar("entrar:\(email)"); return try respostaLogin.get()
    }
    func entrarComGoogle(idToken: String, aparelho: Aparelho) async throws -> RespostaLogin {
        anotar("google:\(idToken)"); return try respostaLogin.get()
    }
    func entrarComApple(identityToken: String, nome: String?, aparelho: Aparelho) async throws -> RespostaLogin {
        anotar("apple:\(identityToken)"); return try respostaLogin.get()
    }
    func me(token: String) async throws -> Me { anotar("me:\(token)"); return try respostaMe.get() }
    func aceitarConvite(token: String, convite: String) async throws -> RespostaConvite {
        anotar("aceitar:\(convite)"); return try respostaConvite.get()
    }
    var respostaRecusar: Result<Me, Error> = .failure(ErroApi.offline())
    func recusarConvite(token: String, convite: String) async throws -> Me {
        anotar("recusar:\(convite)"); return try respostaRecusar.get()
    }
    func sair(token: String) async throws { anotar("sair:\(token)"); if let erroSair { throw erroSair } }
    func registrarPush(token: String, tokenPush: String, plataforma: String) async throws {
        anotar("push:\(tokenPush):\(plataforma)")
    }
}

func erro(_ status: Int, _ codigo: String?, _ msg: String = "x") -> ErroApi { ErroApi(status: status, codigo: codigo, mensagem: msg) }

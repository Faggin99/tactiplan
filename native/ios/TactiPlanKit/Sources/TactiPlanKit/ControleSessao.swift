import Foundation

// Dono da sessão do app (um por processo). Decide a tela de cima — Entrar, Onde entrar ou as
// abas do clube — e é a porta ÚNICA de entrar, escolher/trocar de clube, atualizar o /me,
// aceitar convite e sair. A tela só observa `estado` (via `aoMudar`). Paridade:
// dados/ControleSessao.kt (Android).

public enum EstadoApp: Equatable, Sendable {
    /// Sem sessão: tela Entrar.
    case entrar
    /// Com sessão, escolhendo o clube. `atual` = o clube em uso (Trocar clube: dá para voltar).
    case ondeEntrar(Sessao, atual: Escolha?)
    /// No clube: as abas, com o tema do clube.
    case noClube(Sessao, ContextoClube)

    public var sessao: Sessao? {
        switch self {
        case .entrar: return nil
        case .ondeEntrar(let s, _), .noClube(let s, _): return s
        }
    }
}

@MainActor
public final class ControleSessao {
    public private(set) var estado: EstadoApp { didSet { if estado != oldValue { aoMudar?(estado) } } }
    /// O último /me não veio (sem rede/servidor fora): a casca mostra a faixa "sem conexão".
    public private(set) var semConexao = false { didSet { if semConexao != oldValue { aoMudarConexao?(semConexao) } } }

    public var aoMudar: ((EstadoApp) -> Void)?
    public var aoMudarConexao: ((Bool) -> Void)?

    private let api: ApiApp
    private let cofre: CofreSessao
    private let relogio: () -> Int64

    public init(api: ApiApp, cofre: CofreSessao, relogio: @escaping () -> Int64 = { agoraMs() }) {
        self.api = api
        self.cofre = cofre
        self.relogio = relogio
        estado = .entrar
        if let s = cofre.ler() { estado = Self.decidir(s, cofre: cofre) }
    }

    public var sessao: Sessao? { estado.sessao }

    /// Com sessão, o clube que vale: a escolha guardada (se ainda existe) ou a automática.
    private static func decidir(_ s: Sessao, cofre: CofreSessao) -> EstadoApp {
        var s = s
        let auto = escolhaAutomatica(s.me, atual: s.escolha, ultima: cofre.lerUltimaEscolha(s.me.usuario.id))
        if let e = auto, let ctx = contextoDe(s.me, e) {
            if s.escolha != e {
                s.escolha = e
                cofre.salvar(s)
                cofre.guardarUltimaEscolha(s.me.usuario.id, e)
            }
            return .noClube(s, ctx)
        }
        if s.escolha != nil {
            s.escolha = nil
            cofre.salvar(s)
        }
        return .ondeEntrar(s, atual: nil)
    }

    private func publicar(_ s: Sessao) {
        cofre.salvar(s)
        estado = Self.decidir(s, cofre: cofre)
    }

    // MARK: entrar / sair

    /// Login aceito pelo servidor (e-mail/senha, Google ou Apple).
    public func entrou(_ r: RespostaLogin) {
        semConexao = false
        let ultima = cofre.lerUltimaEscolha(r.me.usuario.id)
        publicar(Sessao(token: r.token, expiraEm: r.expiraEm, me: r.me, escolha: ultima, meEm: relogio()))
    }

    /// Sair: avisa o servidor (revoga o token; sem rede, segue mesmo assim) e apaga a sessão.
    /// A última escolha de clube fica (entrar de novo volta no mesmo clube).
    public func sair() async {
        let token = sessao?.token
        encerrarLocal()
        if let token { try? await api.sair(token: token) }
    }

    private func encerrarLocal() {
        cofre.limpar()
        semConexao = false
        estado = .entrar
    }

    /// Qualquer erro de chamada feita COM o token `token`: 401 encerra a sessão (só se ainda for
    /// a mesma — resposta atrasada de um token velho não derruba a sessão nova). Devolve true
    /// quando tratou (a tela não mostra nada).
    @discardableResult
    public func tratarErro(_ e: Error, token: String?) -> Bool {
        guard sessaoEncerrada(e), let token, token == sessao?.token else { return false }
        encerrarLocal()
        return true
    }

    // MARK: clube

    /// Escolheu um clube no "Onde entrar".
    public func escolher(_ e: Escolha) {
        guard var s = sessao, contextoDe(s.me, e) != nil else { return }
        s.escolha = e
        cofre.guardarUltimaEscolha(s.me.usuario.id, e)
        cofre.salvar(s)
        if let ctx = contextoDe(s.me, e) { estado = .noClube(s, ctx) }
    }

    /// Mais › Clube › Trocar: abre o "Onde entrar" (com volta para o clube atual).
    public func abrirTroca() {
        guard case .noClube(let s, let ctx) = estado else { return }
        estado = .ondeEntrar(s, atual: ctx.escolha)
    }

    /// Fechou o "Onde entrar" sem escolher: volta ao clube em uso (se houver).
    public func cancelarTroca() {
        guard case .ondeEntrar(let s, let atual) = estado, let atual, let ctx = contextoDe(s.me, atual) else { return }
        estado = .noClube(s, ctx)
    }

    // MARK: servidor

    /// Atualiza o /me (abrir o app, voltar do fundo, puxar para atualizar). Sem rede: mantém o
    /// último dado e liga `semConexao`. 401: sai. O clube em uso continua se ainda existir.
    public func atualizarMe() async {
        guard let s0 = sessao else { return }
        do {
            let me = try await api.me(token: s0.token)
            guard var s = sessao, s.token == s0.token else { return }
            s.me = me
            s.meEm = relogio()
            semConexao = false
            let estavaTrocando: Escolha?? = {
                if case .ondeEntrar(_, let atual) = estado { return .some(atual) }
                return nil
            }()
            cofre.salvar(s)
            if let atual = estavaTrocando {
                // Trocando de clube: continua na lista, com os dados novos.
                let valida = escolhaValida(atual, me) ? atual : nil
                estado = .ondeEntrar(s, atual: valida)
            } else {
                estado = Self.decidir(s, cofre: cofre)
            }
        } catch {
            if tratarErro(error, token: s0.token) { return }
            if semRede(error) { semConexao = true }
        }
    }

    /// Aceita um convite pendente. Entra direto no clube novo quando ele é o único da equipe.
    /// Erro (convite de outro e-mail, equipe cheia…) sobe para a tela mostrar.
    public func aceitarConvite(_ convite: String) async throws {
        guard let s0 = sessao else { return }
        do {
            let r = try await api.aceitarConvite(token: s0.token, convite: convite)
            guard var s = sessao, s.token == s0.token else { return }
            s.me = r.me
            s.meEm = relogio()
            let atual = currentEscolha()
            cofre.salvar(s)
            // Publica o `me` novo ANTES de escolher (o escolher confere a escolha nele).
            estado = .ondeEntrar(s, atual: escolhaValida(atual, r.me) ? atual : nil)
            if let ws = r.workspaceId, let conta = r.me.workspaces.first(where: { $0.id == ws }) {
                let clubes = (conta.clubes ?? []).filter { !($0.arquivado ?? false) }
                if clubes.count == 1 { escolher(Escolha(workspaceId: ws, clubeId: clubes[0].id)) }
            }
        } catch {
            if tratarErro(error, token: s0.token) { return }
            throw error
        }
    }

    private func currentEscolha() -> Escolha? {
        switch estado {
        case .ondeEntrar(_, let atual): return atual
        case .noClube(_, let ctx): return ctx.escolha
        case .entrar: return nil
        }
    }

    /// Push (estrutura pronta, DESLIGADA): só chamado quando o build liga o push e o sistema
    /// entregou um token. Falha não importa (tenta de novo na próxima abertura).
    public func registrarPush(_ tokenPush: String, plataforma: String) async {
        guard let s = sessao, !tokenPush.isEmpty else { return }
        do {
            try await api.registrarPush(token: s.token, tokenPush: tokenPush, plataforma: plataforma)
        } catch {
            tratarErro(error, token: s.token)
        }
    }
}

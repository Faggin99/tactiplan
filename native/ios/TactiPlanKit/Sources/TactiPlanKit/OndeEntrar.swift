import Foundation

// "Onde entrar" (escolha de clube) e o CONTEXTO do clube em uso: papel, permissões, categorias,
// só leitura e personalização. A regra continua no servidor — o app só reflete (esconde o que a
// pessoa não pode fazer). Paridade: dados/OndeEntrar.kt (Android).

/// Uma linha da tela "Onde entrar": conta + clube (no padrão "escolha de perfil" do Gestsport).
public struct OpcaoEntrada: Equatable, Sendable, Identifiable {
    public var id: String { escolha.workspaceId + "|" + (escolha.clubeId ?? "") }
    public let escolha: Escolha
    /// Nome do clube (ou da conta, se ela ainda não tem clube).
    public let titulo: String
    /// "Futebol 11 · Sub-15, Sub-17" / "Futsal · só leitura" / nome da conta.
    public let subtitulo: String
    public let papelRotulo: String
    public let somenteLeitura: Bool
    public let arquivado: Bool
    public let personalizacao: Personalizacao?
}

/// As opções de entrada: uma por clube de cada conta (ativos antes dos arquivados); conta sem
/// clube vira UMA linha com o nome da conta. Na ordem em que o servidor mandou as contas
/// (próprias primeiro).
public func opcoesDeEntrada(_ me: Me) -> [OpcaoEntrada] {
    var saida: [OpcaoEntrada] = []
    for conta in me.workspaces {
        let papel = conta.papelRotulo ?? rotuloPapel(conta.papel)
        let leitura = conta.somenteLeitura ?? true
        // Ativos antes dos arquivados, sem mudar a ordem do servidor dentro de cada grupo.
        let todos = conta.clubes ?? []
        let clubes = todos.filter { !($0.arquivado ?? false) } + todos.filter { $0.arquivado ?? false }
        if clubes.isEmpty {
            saida.append(OpcaoEntrada(
                escolha: Escolha(workspaceId: conta.id, clubeId: nil),
                titulo: conta.nome, subtitulo: leitura ? "Sem clube cadastrado · \(ROTULO_SO_LEITURA)" : "Sem clube cadastrado",
                papelRotulo: papel, somenteLeitura: leitura, arquivado: false, personalizacao: nil))
            continue
        }
        for c in clubes {
            let arquivado = c.arquivado ?? false
            var partes = [rotuloModalidade(c.modalidade)]
            let cats = (c.categorias ?? []).map(\.nome)
            if !cats.isEmpty { partes.append(listaCurta(cats, maximo: 3)) }
            if leitura || arquivado { partes.append(ROTULO_SO_LEITURA) }
            // Quem participa de MAIS de uma conta precisa saber de qual conta é o clube.
            if me.workspaces.count > 1, conta.nome != c.nome { partes.append(conta.nome) }
            saida.append(OpcaoEntrada(
                escolha: Escolha(workspaceId: conta.id, clubeId: c.id),
                titulo: c.nome, subtitulo: partes.filter { !$0.isEmpty }.joined(separator: " · "),
                papelRotulo: papel, somenteLeitura: leitura || arquivado, arquivado: arquivado,
                personalizacao: c.personalizacao))
        }
    }
    return saida
}

/// As duas seções do "Onde entrar": clubes ativos (e contas sem clube) e, à parte, os ARQUIVADOS
/// (consulta, só leitura). A ordem de cada seção é a de `opcoesDeEntrada`.
public func secoesDeEntrada(_ me: Me) -> (ativas: [OpcaoEntrada], arquivadas: [OpcaoEntrada]) {
    let todas = opcoesDeEntrada(me)
    return (todas.filter { !$0.arquivado }, todas.filter { $0.arquivado })
}

/// A escolha ainda existe neste `me`? (o clube pode ter sido apagado ou a pessoa removida da equipe)
public func escolhaValida(_ e: Escolha?, _ me: Me) -> Bool {
    guard let e else { return false }
    return opcoesDeEntrada(me).contains { $0.escolha == e }
}

/// Qual clube abrir sem perguntar, ou nil para mostrar "Onde entrar".
/// - Convite pendente: SEMPRE mostra a tela (o convite fica no topo para aceitar).
/// - A escolha atual (ou a última desta pessoa) ainda vale: entra nela.
/// - Uma opção só: entra nela (quem tem um clube só pula a tela).
public func escolhaAutomatica(_ me: Me, atual: Escolha?, ultima: Escolha?) -> Escolha? {
    guard me.convites.isEmpty else { return nil }
    if escolhaValida(atual, me) { return atual }
    if escolhaValida(ultima, me) { return ultima }
    let opcoes = opcoesDeEntrada(me)
    // Com UMA ativa e o resto arquivado, entra na ativa (arquivado é histórico).
    let ativas = opcoes.filter { !$0.arquivado }
    if ativas.count == 1 { return ativas[0].escolha }
    if opcoes.count == 1 { return opcoes[0].escolha }
    return nil
}

// MARK: contexto do clube em uso

/// Tudo que as telas consultam do clube em uso. Montado do `me` + escolha (`contextoDe`).
public struct ContextoClube: Equatable, Sendable {
    public let conta: Conta
    public let clube: Clube?
    public let permissoes: Set<String>
    /// Conta sem assinatura OU clube arquivado: lê tudo, não muda nada.
    public let somenteLeitura: Bool
    public let mensagemSomenteLeitura: String

    public var escolha: Escolha { Escolha(workspaceId: conta.id, clubeId: clube?.id) }
    public var papelRotulo: String { conta.papelRotulo ?? rotuloPapel(conta.papel) }
    public var categorias: [Categoria] { clube?.categorias ?? [] }
    public var nome: String { clube?.nome ?? conta.nome }

    /// A pessoa tem a permissão (independe de só leitura — para VER).
    public func pode(_ permissao: String) -> Bool { permissoes.contains(permissao) }

    /// Pode MUDAR algo dessa área: tem a permissão e a equipe não está em só leitura.
    public func podeEditar(_ permissao: String) -> Bool { !somenteLeitura && permissoes.contains(permissao) }

    /// Há alguma permissão de edição? (sem nenhuma, os botões de editar nem aparecem)
    public var editaAlgo: Bool { !somenteLeitura && permissoes.contains { PERMISSOES_DE_EDICAO.contains($0) } }
}

/// As permissões que mudam dados (o resto é ver).
public let PERMISSOES_DE_EDICAO: Set<String> = [
    "training:edit", "training:delete", "games:edit", "athletes:edit", "injuries:manage", "tactical:edit",
    "library:edit", "categories:manage", "members:manage", "club_settings:manage",
]

public func contextoDe(_ me: Me, _ escolha: Escolha?) -> ContextoClube? {
    guard let escolha, let conta = me.workspaces.first(where: { $0.id == escolha.workspaceId }) else { return nil }
    let clube = escolha.clubeId.flatMap { id in conta.clubes?.first { $0.id == id } }
    if escolha.clubeId != nil && clube == nil { return nil }
    let leitura = (conta.somenteLeitura ?? true) || (clube?.arquivado ?? false)
    return ContextoClube(
        conta: conta, clube: clube, permissoes: Set(conta.permissoes ?? []), somenteLeitura: leitura,
        mensagemSomenteLeitura: textoSomenteLeitura(me))
}

/// A faixa do topo no modo só leitura. Regra de texto (Apple 3.1.3): sem link, botão, preço,
/// "assine", "plano", "site" ou "upgrade" — vale também para o dono.
public func textoSomenteLeitura(_ me: Me?) -> String {
    if let m = me?.mensagemSomenteLeitura, !m.isEmpty, textoNeutro(m) { return m }
    return TEXTO_SO_LEITURA
}

/// O texto passa na regra 3.1.3 (nada que lembre compra)?
public func textoNeutro(_ texto: String) -> Bool {
    let t = texto.lowercased()
    return !PALAVRAS_DE_COMPRA.contains { t.contains($0) }
}

let PALAVRAS_DE_COMPRA = ["assin", "plano", "preço", "preco", "r$", "site", "upgrade", "compr", "pag", "http", "www"]

/// Rótulo do papel quando o servidor não mandou um (papel novo ou sessão antiga).
public func rotuloPapel(_ papel: String?) -> String {
    switch papel {
    case "owner": return "Dono"
    case "manager": return "Gerente"
    case "head_coach": return "Treinador principal"
    case "assistant_coach": return "Treinador auxiliar"
    case "specialist": return "Especialista"
    case "viewer": return "Observador"
    default: return "Comissão"
    }
}

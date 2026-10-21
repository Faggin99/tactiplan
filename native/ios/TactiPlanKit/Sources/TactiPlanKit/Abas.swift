// As 5 abas (decisão do dono, 21/10): Semana · Jogos · Elenco · Quadro · Mais.
// Sem `tactical:view` a aba Quadro some. Na T0 as quatro primeiras são "Em breve".
// `icone` = SF Symbol no iPhone; o Android usa o mesmo id para escolher o ícone dele.
// Paridade: dados/Abas.kt (Android).

public struct DefAba: Equatable, Sendable, Identifiable {
    public let id: String
    public let rotulo: String
    public let icone: String
    /// O que a aba vai ter (texto do "Em breve").
    public let emBreve: String
    public init(_ id: String, _ rotulo: String, _ icone: String, _ emBreve: String) {
        self.id = id; self.rotulo = rotulo; self.icone = icone; self.emBreve = emBreve
    }
}

public let ABA_SEMANA = DefAba("semana", "Semana", "calendar",
    "A semana de treinos em lista, o dia com os blocos e as atividades, o tema do mês e a ficha do dia em PDF.")
public let ABA_JOGOS = DefAba("jogos", "Jogos", "trophy",
    "Próximos jogos e resultados, escalação por formação, eventos ao vivo com minutagem e a convocação em PDF.")
public let ABA_ELENCO = DefAba("elenco", "Elenco", "person.3",
    "Atletas por grupo, ficha com foto e lesões, e a comissão técnica com convites e permissões.")
public let ABA_QUADRO = DefAba("quadro", "Quadro", "point.topleft.down.to.point.bottomright.curvepath",
    "As jogadas do quadro tático: assistir em pé e editar com o celular deitado.")
public let ABA_MAIS = DefAba("mais", "Mais", "ellipsis", "")

/// Abas do clube em uso, na ordem da barra.
public func abasDoContexto(_ ctx: ContextoClube?) -> [DefAba] {
    var abas = [ABA_SEMANA, ABA_JOGOS, ABA_ELENCO]
    if ctx?.pode("tactical:view") ?? true { abas.append(ABA_QUADRO) }
    abas.append(ABA_MAIS)
    return abas
}

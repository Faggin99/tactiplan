package com.faggin.tactiplan.app.dados

// As 5 abas (decisão do dono, 21/10): Semana · Jogos · Elenco · Quadro · Mais.
// Sem `tactical:view` a aba Quadro some. Na T0 as quatro primeiras são "Em breve".
// `icone` = nome do SF Symbol no iPhone; aqui a casca escolhe o ícone pelo `id`.
// Paridade: TactiPlanKit/Abas.swift.

data class DefAba(val id: String, val rotulo: String, val icone: String, val emBreve: String)

val ABA_SEMANA = DefAba("semana", "Semana", "calendar",
    "A semana de treinos em lista, o dia com os blocos e as atividades, o tema do mês e a ficha do dia em PDF.")
val ABA_JOGOS = DefAba("jogos", "Jogos", "trophy",
    "Próximos jogos e resultados, escalação por formação, eventos ao vivo com minutagem e a convocação em PDF.")
val ABA_ELENCO = DefAba("elenco", "Elenco", "person.3",
    "Atletas por grupo, ficha com foto e lesões, e a comissão técnica com convites e permissões.")
val ABA_QUADRO = DefAba("quadro", "Quadro", "point.topleft.down.to.point.bottomright.curvepath",
    "As jogadas do quadro tático: assistir em pé e editar com o celular deitado.")
val ABA_MAIS = DefAba("mais", "Mais", "ellipsis", "")

/** Abas do clube em uso, na ordem da barra. */
fun abasDoContexto(ctx: ContextoClube?): List<DefAba> {
    val abas = mutableListOf(ABA_SEMANA, ABA_JOGOS, ABA_ELENCO)
    if (ctx?.pode("tactical:view") ?: true) abas += ABA_QUADRO
    abas += ABA_MAIS
    return abas
}

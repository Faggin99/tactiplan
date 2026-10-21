// Textos fixos do app (um lugar só — as duas plataformas usam as mesmas frases).
// Regra (Apple 3.1.3): NENHUM texto fala de plano, preço, assinatura, site ou compra.
// Paridade: dados/Textos.kt (Android).

public let NOME_APP = "TactiPlan"
public let SUBTITULO_ENTRAR = "Treinos, jogos e quadro tático"

/// Faixa do topo no modo só leitura (padrão, se o servidor não mandar a dele).
public let TEXTO_SO_LEITURA = "Somente leitura. Fale com o responsável pela equipe."
/// Quando uma escrita escapa e o servidor responde 402 READ_ONLY.
public let TEXTO_NAO_EDITA = "Não é possível editar agora. Fale com o responsável pela equipe."
public let ROTULO_SO_LEITURA = "só leitura"
/// Escrita em clube arquivado (409 CLUB_ARCHIVED).
public let TEXTO_CLUBE_ARQUIVADO = "Este clube está arquivado: dá para consultar tudo, mas não para mudar."
/// Seção do "Onde entrar" com os clubes arquivados (consulta, só leitura).
public let TITULO_ARQUIVADOS = "Arquivados"

public let DICA_CONVITE_ENTRAR = "Recebeu um convite da comissão? Abra o link do e-mail neste celular."
public let ROTULO_ESQUECI_SENHA = "Esqueci a senha"
public let MSG_SOCIAL_FALHOU = "Não foi possível entrar agora. Tente de novo."
public let MSG_EMAIL_INVALIDO = "Confira o e-mail."
public let MSG_SENHA_VAZIA = "Digite a senha."

public let TITULO_ONDE_ENTRAR = "Onde entrar"
public let TEXTO_TROCAR_DEPOIS = "Você pode trocar a qualquer hora em Mais › Clube, sem sair da conta."
public let TITULO_SEM_EQUIPE = "Você ainda não está em nenhuma equipe"
public let TEXTO_SEM_EQUIPE = "Peça ao responsável pela equipe um convite para o seu e-mail. Assim que ele chegar, o convite aparece aqui."
public let MSG_CONVITE_ACEITO = "Convite aceito."
public let MSG_CONVITE_RECUSADO = "Convite recusado."
public let TITULO_RECUSAR_CONVITE = "Recusar o convite?"
public let TEXTO_RECUSAR_CONVITE = "O convite some daqui e a equipe deixa de ver o seu convite. Para entrar depois, peça um convite novo."

/// Tela da Semana / Dia (T1).
public let TITULO_SEM_ATIVIDADE = "Nada planejado neste dia"
public let TEXTO_SEM_ATIVIDADE_EDITA = "Toque num bloco para adicionar a atividade."
public let TEXTO_SEM_ATIVIDADE_LE = "Quando a comissão planejar este dia, as atividades aparecem aqui."
public let TEXTO_DIA_DESCANSO = "Dia de descanso: sem atividades."
public let TEXTO_JOGO_NO_APP = "A escalação, os eventos e a convocação do jogo chegam numa próxima atualização do app."
public let ROTULO_NAO_RELACIONADOS = "Não relacionados"
public let TEXTO_NAO_RELACIONADOS = "Atividade de quem não foi relacionado para o jogo."
public let TITULO_ERRO_SEMANA = "Não foi possível carregar a semana"

public let TEXTO_EM_BREVE = "Estamos preparando esta parte do app. Ela chega numa próxima atualização."
public let TEXTO_ATUALIZAR_APP = "Há uma versão nova do TactiPlan. Atualize o app na loja para continuar com tudo funcionando."

public let TITULO_DESBLOQUEIO = "Desbloquear o TactiPlan"
public let TEXTO_BLOQUEIO = "Use a biometria ou o código do aparelho para continuar."
public let TEXTO_SEM_BLOQUEIO_APARELHO = "Configure um bloqueio de tela no aparelho para usar."

public let TEXTO_TEMA = "Segue o modo claro ou escuro do aparelho."
public let TEXTO_CORES_CLUBE = "As cores e a logo do clube aparecem no app inteiro. A edição é feita no TactiPlan pelo computador."

public let PRIVACIDADE_URL_PADRAO = "https://tactiplan.faggin.com.br/privacidade.html"
public let TERMOS_URL_PADRAO = "https://tactiplan.faggin.com.br/termos.html"
public let ESQUECI_SENHA_URL_PADRAO = "https://app.tactiplan.faggin.com.br/#/forgot-password"

/// Suporte do TactiPlan (WhatsApp da Faggin).
public let SUPORTE_TELEFONE = "556233003285"
public let SUPORTE_TELEFONE_ROTULO = "(62) 3300-3285"

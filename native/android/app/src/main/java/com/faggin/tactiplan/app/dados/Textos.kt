package com.faggin.tactiplan.app.dados

// Textos fixos do app (um lugar só — as duas plataformas usam as mesmas frases).
// Regra (Apple 3.1.3): NENHUM texto fala de plano, preço, assinatura, site ou compra.
// Paridade: TactiPlanKit/Textos.swift.

const val NOME_APP = "TactiPlan"
const val SUBTITULO_ENTRAR = "Treinos, jogos e quadro tático"

/** Faixa do topo no modo só leitura (padrão, se o servidor não mandar a dele). */
const val TEXTO_SO_LEITURA = "Somente leitura. Fale com o responsável pela equipe."
/** Quando uma escrita escapa e o servidor responde 402 READ_ONLY. */
const val TEXTO_NAO_EDITA = "Não é possível editar agora. Fale com o responsável pela equipe."
const val ROTULO_SO_LEITURA = "só leitura"

const val DICA_CONVITE_ENTRAR = "Recebeu um convite da comissão? Abra o link do e-mail neste celular."
const val ROTULO_ESQUECI_SENHA = "Esqueci a senha"
const val MSG_SOCIAL_FALHOU = "Não foi possível entrar agora. Tente de novo."
const val MSG_EMAIL_INVALIDO = "Confira o e-mail."
const val MSG_SENHA_VAZIA = "Digite a senha."

const val TITULO_ONDE_ENTRAR = "Onde entrar"
const val TEXTO_TROCAR_DEPOIS = "Você pode trocar a qualquer hora em Mais › Clube, sem sair da conta."
const val TITULO_SEM_EQUIPE = "Você ainda não está em nenhuma equipe"
const val TEXTO_SEM_EQUIPE = "Peça ao responsável pela equipe um convite para o seu e-mail. Assim que ele chegar, o convite aparece aqui."
const val MSG_CONVITE_ACEITO = "Convite aceito."

const val TEXTO_EM_BREVE = "Estamos preparando esta parte do app. Ela chega numa próxima atualização."
const val TEXTO_ATUALIZAR_APP = "Há uma versão nova do TactiPlan. Atualize o app na loja para continuar com tudo funcionando."

const val TITULO_DESBLOQUEIO = "Desbloquear o TactiPlan"
const val TEXTO_BLOQUEIO = "Use a biometria ou o código do aparelho para continuar."
const val TEXTO_SEM_BLOQUEIO_APARELHO = "Configure um bloqueio de tela no aparelho para usar."

const val TEXTO_TEMA = "Segue o modo claro ou escuro do aparelho."
const val TEXTO_CORES_CLUBE = "As cores e a logo do clube aparecem no app inteiro. A edição é feita no TactiPlan pelo computador."

const val PRIVACIDADE_URL_PADRAO = "https://tactiplan.faggin.com.br/privacidade.html"
const val TERMOS_URL_PADRAO = "https://tactiplan.faggin.com.br/termos.html"
const val ESQUECI_SENHA_URL_PADRAO = "https://app.tactiplan.faggin.com.br/#/forgot-password"

/** Suporte do TactiPlan (WhatsApp da Faggin). */
const val SUPORTE_TELEFONE = "556233003285"
const val SUPORTE_TELEFONE_ROTULO = "(62) 3300-3285"

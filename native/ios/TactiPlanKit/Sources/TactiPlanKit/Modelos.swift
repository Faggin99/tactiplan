import Foundation

// Contrato do BFF /api/app (backend-node/src/services/appMe.js e routes/appAuth.js).
// No JSON os campos são snake_case (os do servidor); em Swift, camelCase. Campo novo no
// servidor nunca quebra o app (Codable ignora o que não conhece; quase tudo é opcional).
// Paridade: dados/Modelos.kt (Android).

public struct Usuario: Codable, Equatable, Sendable {
    public var id: String
    public var nome: String?
    public var email: String?
    public var fotoUrl: String?
    public var temSenha: Bool?

    public init(id: String, nome: String? = nil, email: String? = nil, fotoUrl: String? = nil, temSenha: Bool? = nil) {
        self.id = id; self.nome = nome; self.email = email; self.fotoUrl = fotoUrl; self.temSenha = temSenha
    }

    enum CodingKeys: String, CodingKey {
        case id, nome, email
        case fotoUrl = "foto_url", temSenha = "tem_senha"
    }
}

public struct Categoria: Codable, Equatable, Hashable, Sendable {
    public var id: String
    public var nome: String
    public init(id: String, nome: String) { self.id = id; self.nome = nome }
}

/// As duas versões da cor primária do clube (claro/escuro). nil = cor padrão do TactiPlan.
public struct CorPrimaria: Codable, Equatable, Sendable {
    public var claro: String?
    public var escuro: String?
    public init(claro: String? = nil, escuro: String? = nil) { self.claro = claro; self.escuro = escuro }
}

/// Personalização do clube (cores + logo). Só se EDITA no web; o app só exibe.
public struct Personalizacao: Codable, Equatable, Sendable {
    public var corPrimaria: CorPrimaria?
    public var logoUrl: String?
    public var logoEscuraUrl: String?

    public init(corPrimaria: CorPrimaria? = nil, logoUrl: String? = nil, logoEscuraUrl: String? = nil) {
        self.corPrimaria = corPrimaria; self.logoUrl = logoUrl; self.logoEscuraUrl = logoEscuraUrl
    }

    enum CodingKeys: String, CodingKey {
        case corPrimaria = "cor_primaria", logoUrl = "logo_url", logoEscuraUrl = "logo_escura_url"
    }
}

public struct Clube: Codable, Equatable, Sendable {
    public var id: String
    public var nome: String
    /// "football_11" | "football_7" | "futsal"
    public var modalidade: String?
    /// Arquivado no web: só leitura (histórico e relatórios).
    public var arquivado: Bool?
    public var categorias: [Categoria]?
    public var personalizacao: Personalizacao?

    public init(id: String, nome: String, modalidade: String? = nil, arquivado: Bool? = nil,
                categorias: [Categoria]? = nil, personalizacao: Personalizacao? = nil) {
        self.id = id; self.nome = nome; self.modalidade = modalidade; self.arquivado = arquivado
        self.categorias = categorias; self.personalizacao = personalizacao
    }
}

/// Uma conta (workspace) que a pessoa acessa: a dela ou a de quem a convidou.
public struct Conta: Codable, Equatable, Sendable {
    public var id: String
    public var nome: String
    public var dono: Bool?
    public var papel: String?
    public var papelRotulo: String?
    /// As 16 permissões do servidor (training:view, games:edit, members:manage…).
    public var permissoes: [String]?
    public var categoriasRestritas: Bool?
    /// Equipe sem assinatura: lê tudo, não muda nada.
    public var somenteLeitura: Bool?
    public var clubes: [Clube]?

    public init(id: String, nome: String, dono: Bool? = nil, papel: String? = nil, papelRotulo: String? = nil,
                permissoes: [String]? = nil, categoriasRestritas: Bool? = nil, somenteLeitura: Bool? = nil,
                clubes: [Clube]? = nil) {
        self.id = id; self.nome = nome; self.dono = dono; self.papel = papel; self.papelRotulo = papelRotulo
        self.permissoes = permissoes; self.categoriasRestritas = categoriasRestritas
        self.somenteLeitura = somenteLeitura; self.clubes = clubes
    }

    enum CodingKeys: String, CodingKey {
        case id, nome, dono, papel, permissoes, clubes
        case papelRotulo = "papel_rotulo", categoriasRestritas = "categorias_restritas", somenteLeitura = "somente_leitura"
    }
}

public struct Convite: Codable, Equatable, Sendable {
    public var token: String
    public var papel: String?
    public var papelRotulo: String?
    public var workspaceNome: String?
    public var clubeNome: String?
    public var convidadoPor: String?

    public init(token: String, papel: String? = nil, papelRotulo: String? = nil, workspaceNome: String? = nil,
                clubeNome: String? = nil, convidadoPor: String? = nil) {
        self.token = token; self.papel = papel; self.papelRotulo = papelRotulo
        self.workspaceNome = workspaceNome; self.clubeNome = clubeNome; self.convidadoPor = convidadoPor
    }

    enum CodingKeys: String, CodingKey {
        case token, papel
        case papelRotulo = "papel_rotulo", workspaceNome = "workspace_nome", clubeNome = "clube_nome"
        case convidadoPor = "convidado_por"
    }
}

/// GET /api/app/me.
public struct Me: Codable, Equatable, Sendable {
    public var usuario: Usuario
    public var workspaces: [Conta]
    public var convites: [Convite]
    public var mensagemSomenteLeitura: String?

    public init(usuario: Usuario, workspaces: [Conta] = [], convites: [Convite] = [], mensagemSomenteLeitura: String? = nil) {
        self.usuario = usuario; self.workspaces = workspaces; self.convites = convites
        self.mensagemSomenteLeitura = mensagemSomenteLeitura
    }

    enum CodingKeys: String, CodingKey {
        case usuario, workspaces, convites
        case mensagemSomenteLeitura = "mensagem_somente_leitura"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        usuario = try c.decode(Usuario.self, forKey: .usuario)
        workspaces = try c.decodeIfPresent([Conta].self, forKey: .workspaces) ?? []
        convites = try c.decodeIfPresent([Convite].self, forKey: .convites) ?? []
        mensagemSomenteLeitura = try c.decodeIfPresent(String.self, forKey: .mensagemSomenteLeitura)
    }
}

/// Resposta de POST /api/app/auth/entrar | google | apple.
public struct RespostaLogin: Codable, Equatable, Sendable {
    public var token: String
    public var expiraEm: String?
    public var me: Me

    public init(token: String, expiraEm: String? = nil, me: Me) { self.token = token; self.expiraEm = expiraEm; self.me = me }

    enum CodingKeys: String, CodingKey { case token, me, expiraEm = "expira_em" }
}

/// Resposta de POST /api/app/convites/:token/aceitar.
public struct RespostaConvite: Codable, Equatable, Sendable {
    public var workspaceId: String?
    public var me: Me

    public init(workspaceId: String? = nil, me: Me) { self.workspaceId = workspaceId; self.me = me }

    enum CodingKeys: String, CodingKey { case me, workspaceId = "workspace_id" }
}

/// GET /api/app/auth/config: quais logins o SERVIDOR liga (o build tem as flags dele).
public struct ConfigApp: Codable, Equatable, Sendable {
    public struct Google: Codable, Equatable, Sendable {
        public var ativo: Bool?
        public var iosClientId: String?
        public var androidServerClientId: String?
        public init(ativo: Bool? = nil, iosClientId: String? = nil, androidServerClientId: String? = nil) {
            self.ativo = ativo; self.iosClientId = iosClientId; self.androidServerClientId = androidServerClientId
        }
        enum CodingKeys: String, CodingKey {
            case ativo, iosClientId = "ios_client_id", androidServerClientId = "android_server_client_id"
        }
    }
    public struct Apple: Codable, Equatable, Sendable {
        public var ativo: Bool?
        public init(ativo: Bool? = nil) { self.ativo = ativo }
    }
    public struct VersaoMinima: Codable, Equatable, Sendable {
        public var ios: String?
        public var android: String?
        public init(ios: String? = nil, android: String? = nil) { self.ios = ios; self.android = android }
    }

    public var google: Google?
    public var apple: Apple?
    public var versaoMinima: VersaoMinima?
    public var privacidadeUrl: String?
    public var termosUrl: String?
    public var esqueciSenhaUrl: String?

    public init(google: Google? = nil, apple: Apple? = nil, versaoMinima: VersaoMinima? = nil,
                privacidadeUrl: String? = nil, termosUrl: String? = nil, esqueciSenhaUrl: String? = nil) {
        self.google = google; self.apple = apple; self.versaoMinima = versaoMinima
        self.privacidadeUrl = privacidadeUrl; self.termosUrl = termosUrl; self.esqueciSenhaUrl = esqueciSenhaUrl
    }

    enum CodingKeys: String, CodingKey {
        case google, apple
        case versaoMinima = "versao_minima", privacidadeUrl = "privacidade_url", termosUrl = "termos_url"
        case esqueciSenhaUrl = "esqueci_senha_url"
    }

    /// Sem resposta do servidor: tudo desligado e os links padrão.
    public static let padrao = ConfigApp()
}

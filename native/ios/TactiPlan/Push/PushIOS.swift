import UIKit
import UserNotifications
import TactiPlanKit

// Push: ESTRUTURA PRONTA, DESLIGADA (decisão do dono, 21/10). Só faz algo no build com
// TACTIPLAN_PUSH_ATIVO=1 (Info.plist TactiPlanPush = YES + entitlement aps-environment, ver
// scripts/gerar-projeto.sh): pede permissão, registra no APNs e manda o token do aparelho ao
// servidor (POST /api/app/push/registrar — que só guarda; não há envio ainda).
// Quando ligar: decidir APNs direto ou FCM (o Gestsport usa FirebaseMessaging nos dois).

enum PushNoBuild {
    static var ativo: Bool {
        (Bundle.main.object(forInfoDictionaryKey: "TactiPlanPush") as? String)?.uppercased() == "YES"
    }
}

@MainActor
final class PushIOS {
    static let shared = PushIOS()
    private(set) var tokenAparelho: String?
    var aoReceberToken: ((String) -> Void)?

    /// Depois do login (com sessão): pede a permissão e registra. Desligado no build = nada.
    func ativarSePossivel() {
        guard PushNoBuild.ativo else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { ok, _ in
            guard ok else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    func recebeu(_ dados: Data) {
        let hex = dados.map { String(format: "%02x", $0) }.joined()
        tokenAparelho = hex
        aoReceberToken?(hex)
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in PushIOS.shared.recebeu(deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {}

    /// Em pé no app todo; deitado só no editor do quadro tático (T5, `forcarOrientacao`).
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        OrientacaoApp.mascara
    }
}

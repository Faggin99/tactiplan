// swift-tools-version:6.0
// Núcleo do app iOS do TactiPlan, sem UIKit/SwiftUI: compila e testa no Linux (VPS) e no
// Xcode. Paridade com native/android (dados/, design/). Base copiada do ClassHubKit (Gestsport).
import PackageDescription

let package = Package(
    name: "TactiPlanKit",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "TactiPlanKit", targets: ["TactiPlanKit"]),
    ],
    targets: [
        .target(name: "TactiPlanKit"),
        .testTarget(name: "TactiPlanKitTests", dependencies: ["TactiPlanKit"]),
    ]
)

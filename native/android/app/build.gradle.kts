plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Push (FCM): o google-services.json NÃO é versionado (o Codemagic grava a partir do segredo
// $GOOGLE_SERVICES_JSON). Sem ele o plugin fica de fora e o app builda igual — push inativo.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

// Base da API no build de desenvolvimento: env TACTIPLAN_API_BASE (ou -PTACTIPLAN_API_BASE),
// padrão = backend local visto do emulador.
val apiBaseDebug: String = (project.findProperty("TACTIPLAN_API_BASE") as String?)
    ?: System.getenv("TACTIPLAN_API_BASE")
    ?: "http://10.0.2.2:3001/api"
val apiBaseRelease = "https://app.tactiplan.faggin.com.br/api"

// Assinatura do release: keystore do Codemagic (reference "tactiplan-app-release") ou o da VPS
// (scripts/aab.sh): CM_KEYSTORE_PATH/CM_KEYSTORE_PASSWORD/CM_KEY_ALIAS/CM_KEY_PASSWORD.
val cmKeystore: String? = System.getenv("CM_KEYSTORE_PATH")?.takeIf { it.isNotBlank() }

// versionCode sobe a cada build; local fica 1.
val numeroBuild: Int = System.getenv("PROJECT_BUILD_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "com.faggin.tactiplan.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.faggin.tactiplan.app"
        minSdk = 26
        targetSdk = 36
        versionCode = numeroBuild
        // Mesma versão de loja do iOS (MARKETING_VERSION do project.yml).
        versionName = "1.0.0"
    }

    signingConfigs {
        if (cmKeystore != null) {
            create("release") {
                storeFile = file(cmKeystore)
                storePassword = System.getenv("CM_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CM_KEY_ALIAS")
                keyPassword = System.getenv("CM_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "API_BASE", "\"$apiBaseDebug\"")
        }
        release {
            isDebuggable = false
            isMinifyEnabled = false
            signingConfigs.findByName("release")?.let { signingConfig = it }
            buildConfigField("String", "API_BASE", "\"$apiBaseRelease\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all {
                it.maxHeapSize = "768m"
                it.maxParallelForks = 1
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)
    // Cofre da sessão: Tink AEAD (AES-256-GCM) com a chave-mestra no Android Keystore.
    implementation(libs.tink.android)
    // Privacidade, termos, "Esqueci a senha": Custom Tabs (navegador in-app).
    implementation(libs.androidx.browser)
    implementation(libs.androidx.fragment.ktx)
    // Push (estrutura pronta, desligada): Firebase Cloud Messaging.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
    // "Continuar com o Google" pelo Credential Manager (ID token do client WEB).
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}

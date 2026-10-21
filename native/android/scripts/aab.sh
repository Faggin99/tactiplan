#!/usr/bin/env bash
# Gera o AAB assinado do app Android do TactiPlan NA VPS (o mesmo que o workflow
# tactiplan-android-aab do Codemagic faz). Adaptado do scripts/android-aab.sh do Gestsport.
#
#   native/android/scripts/aab.sh <versionCode> [destino.aab]
#
# Push (estrutura pronta, DESLIGADA): se existir $FIREBASE_DIR/google-services.json (padrão
# /var/www/arquivos/tactiplan-app-build/firebase/), ele é copiado para app/ SÓ durante o build e
# apagado no fim, mesmo com erro. Nunca vai para o git. Sem ele, o AAB sai sem push.
#
# Assinatura: keystore e senhas em /var/www/arquivos/tactiplan-app-build/android-assinatura/
# (ou CM_KEYSTORE_PATH/CM_KEYSTORE_PASSWORD/CM_KEY_ALIAS/CM_KEY_PASSWORD já exportadas).
#
# VPS de 3,8 GB: NÃO rode junto com `swift test`, build do Vite nem outro Gradle (use o flock
# do build). Memória do Gradle limitada a 1 GB.
set -euo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="/var/www/arquivos/tactiplan-app-build"
FIREBASE_DIR="${FIREBASE_DIR:-$BUILD_DIR/firebase}"
ASSIN="$BUILD_DIR/android-assinatura"
PACOTE="com.faggin.tactiplan.app"

VERSAO="${1:-}"
[ -n "$VERSAO" ] || { echo "uso: $0 <versionCode> [destino.aab]" >&2; exit 2; }
DESTINO="${2:-}"

# ── assinatura ──────────────────────────────────────────────────────────────
if [ -z "${CM_KEYSTORE_PATH:-}" ]; then
  [ -f "$ASSIN/tactiplan-app-release.jks" ] || { echo "keystore ausente em $ASSIN" >&2; exit 1; }
  senha_de() { sed -n "s/^$1: *//p" "$ASSIN/senhas.txt" | head -1; }
  export CM_KEYSTORE_PATH="$ASSIN/tactiplan-app-release.jks"
  export CM_KEYSTORE_PASSWORD="$(senha_de 'Senha do keystore')"
  export CM_KEY_ALIAS="$(senha_de 'Alias')"
  export CM_KEY_PASSWORD="$(senha_de 'Senha da chave')"
fi
export PROJECT_BUILD_NUMBER="$VERSAO"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"

# ── google-services.json opcional (só durante o build) ──────────────────────
ALVO_GS="$APP/app/google-services.json"
COPIADO=0
limpar() {
  if [ "$COPIADO" = 1 ]; then rm -f "$ALVO_GS"; echo "google-services.json removido do app (fica só em $FIREBASE_DIR)."; fi
  (cd "$APP" && ./gradlew --stop >/dev/null 2>&1) || true
}
trap limpar EXIT
if [ -f "$ALVO_GS" ]; then
  echo "AVISO: já existe $ALVO_GS (não foi este script que copiou) — usando ele."
elif [ -f "$FIREBASE_DIR/google-services.json" ]; then
  python3 -I -c 'import json,sys; d=json.load(open(sys.argv[1])); assert any(c["client_info"]["android_client_info"]["package_name"]==sys.argv[2] for c in d["client"]), "sem o app "+sys.argv[2]' \
    "$FIREBASE_DIR/google-services.json" "$PACOTE" || { echo "google-services.json inválido (precisa ter o app $PACOTE)" >&2; exit 1; }
  install -m 600 "$FIREBASE_DIR/google-services.json" "$ALVO_GS"
  COPIADO=1
  echo "google-services.json encontrado — AAB COM push."
else
  echo "Sem $FIREBASE_DIR/google-services.json — AAB SEM push."
fi

cd "$APP"
./gradlew --no-daemon -Dorg.gradle.jvmargs=-Xmx1g bundleRelease
AAB="$APP/app/build/outputs/bundle/release/app-release.aab"
[ -f "$AAB" ] || { echo "AAB não gerado" >&2; exit 1; }
if [ -n "$DESTINO" ]; then cp "$AAB" "$DESTINO"; echo "AAB: $DESTINO"; else echo "AAB: $AAB"; fi

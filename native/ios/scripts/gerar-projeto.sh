#!/usr/bin/env bash
# Gera o spec do XcodeGen e o .entitlements do app conforme as capabilities LIGADAS no build
# (mesmo desenho do Gestsport).
#
#   cd native/ios && bash scripts/gerar-projeto.sh && xcodegen generate --spec project-gerado.yml
#
# Flags (variáveis de ambiente, "1" = ligada; no Codemagic vêm dos grupos de variáveis):
#   TACTIPLAN_APPLE_ATIVO=1 → com.apple.developer.applesignin (Sign in with Apple) +
#                             TACTIPLAN_APPLE_LOGIN=YES no Info.plist (sem ele, Apple e Google somem
#                             no iPhone — regra 4.8)
#   TACTIPLAN_PUSH_ATIVO=1  → aps-environment (Push Notifications) + TACTIPLAN_PUSH=YES
# Cada capability EXIGE o App ID com ela ligada e o profile "tactiplan-app-appstore" REGENERADO
# (e reenviado ao Codemagic) DEPOIS disso — senão a assinatura quebra.
#
# Saída (git-ignored): project-gerado.yml (inclui o project.yml) e Gerado/TactiPlan.entitlements
# (só quando há alguma capability). SAIDA=/outra/pasta muda o destino.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SAIDA="${SAIDA:-$RAIZ}"
ligada() { [ "${!1:-0}" = "1" ]; }

ENT_DIR="$SAIDA/Gerado"
ENT="$ENT_DIR/TactiPlan.entitlements"
SPEC="$SAIDA/project-gerado.yml"

chaves=""
ligadas=()
if ligada TACTIPLAN_APPLE_ATIVO; then
  chaves+=$'\t<key>com.apple.developer.applesignin</key>\n\t<array>\n\t\t<string>Default</string>\n\t</array>\n'
  ligadas+=("Sign in with Apple")
fi
if ligada TACTIPLAN_PUSH_ATIVO; then
  chaves+=$'\t<key>aps-environment</key>\n\t<string>$(APS_ENVIRONMENT)</string>\n'
  ligadas+=("Push")
fi

rm -f "$ENT"
config=()
if [ -n "$chaves" ]; then
  mkdir -p "$ENT_DIR"
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<!-- GERADO por scripts/gerar-projeto.sh — não editar. -->'
    echo '<plist version="1.0">'
    echo '<dict>'
    printf '%s' "$chaves"
    echo '</dict>'
    echo '</plist>'
  } > "$ENT"
  config+=("CODE_SIGN_ENTITLEMENTS: Gerado/TactiPlan.entitlements")
fi
if ligada TACTIPLAN_APPLE_ATIVO; then config+=('TACTIPLAN_APPLE_LOGIN: "YES"'); fi
if ligada TACTIPLAN_PUSH_ATIVO; then config+=('TACTIPLAN_PUSH: "YES"'); fi

{
  echo "# GERADO por scripts/gerar-projeto.sh — não editar (git-ignored)."
  echo "# Capabilities: ${ligadas[*]:-nenhuma}."
  echo "include:"
  echo "  - project.yml"
  if [ "${#config[@]}" -gt 0 ]; then
    echo "targets:"
    echo "  TactiPlan:"
    echo "    settings:"
    echo "      base:"
    for linha in "${config[@]}"; do echo "        $linha"; done
  fi
} > "$SPEC"

echo "project-gerado.yml: capabilities = ${ligadas[*]:-nenhuma}"

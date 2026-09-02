#!/bin/sh
# Creates the two demo tenants. Idempotent: an existing slug is left alone.
#
# Both are the same Next.js app — Pratu picks the tenant from the Host header,
# so the only thing that differs is the hostname you browse.
#
#   acme.pratu.localhost  password + optional second factor
#   otp.pratu.localhost   passwordless: mobile number + One-Time Code (ADR 0007)
set -eu

ADMIN="http://pratu:4434"
AUTH="Authorization: Bearer ${ROOT_KEY}"
JSON="Content-Type: application/json"

# screens {slug} — the ui block that makes browser flows redirect-driven.
# Without it Pratu has nowhere to send an HTML client and answers JSON instead.
screens() {
  origin="http://$1.${BASE_DOMAIN}:${APP_PORT}"
  cat <<EOF
"ui": {
  "login_url":          "${origin}/login",
  "registration_url":   "${origin}/register",
  "recovery_url":       "${origin}/recovery",
  "verification_url":   "${origin}/verify",
  "error_url":          "${origin}/error",
  "default_return_url": "${origin}/dashboard"
}
EOF
}

create_tenant() {
  slug="$1"
  body="$2"
  code=$(curl -s -o /tmp/out -w '%{http_code}' -X POST "${ADMIN}/admin/tenants" \
    -H "${AUTH}" -H "${JSON}" -d "${body}")
  case "${code}" in
    2*)   echo "  tenant ${slug}: created" ;;
    409)  echo "  tenant ${slug}: already exists" ;;
    *)    echo "  tenant ${slug}: FAILED (HTTP ${code})"; cat /tmp/out; echo; exit 1 ;;
  esac
}

# --------------------------------------------------------------------------
# acme — the default: email + password, second factor optional
# --------------------------------------------------------------------------
create_tenant "${ACME_SLUG}" "{
  \"slug\": \"${ACME_SLUG}\", \"name\": \"Acme Inc\",
  $(screens "${ACME_SLUG}")
}"

# --------------------------------------------------------------------------
# otp — passwordless: the mobile number is the identity, a code is the factor
# --------------------------------------------------------------------------
create_tenant "${OTP_SLUG}" "{
  \"slug\": \"${OTP_SLUG}\", \"name\": \"OTP Only\",
  \"first_factor\": [\"code\"],
  $(screens "${OTP_SLUG}")
}"

# Its Identity Schema has one trait: the phone, which is both the login
# identifier and the address the code goes to. No email anywhere.
#
# PUT appends an immutable new version, so only write it when the current
# schema is not already phone-shaped — otherwise every restart adds a version.
current=$(curl -s -H "${AUTH}" "${ADMIN}/admin/tenants/${OTP_SLUG}/schemas/default" || true)
if echo "${current}" | grep -q '"phone"'; then
  echo "  schema ${OTP_SLUG}/default: already phone-only"
else
  curl -s -o /tmp/out -w '  schema %{http_code}\n' \
    -X PUT "${ADMIN}/admin/tenants/${OTP_SLUG}/schemas/default" \
    -H "${AUTH}" -H "${JSON}" -d '{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "required": ["phone"],
      "additionalProperties": false,
      "properties": {
        "phone": {
          "type": "string",
          "title": "Mobile number",
          "pratu": {
            "identifier": true,
            "verification": { "via": "sms" },
            "recovery":     { "via": "sms" }
          }
        }
      }
    }'
fi

echo "ready:"
echo "  password      http://${ACME_SLUG}.${BASE_DOMAIN}:${APP_PORT}"
echo "  passwordless  http://${OTP_SLUG}.${BASE_DOMAIN}:${APP_PORT}"

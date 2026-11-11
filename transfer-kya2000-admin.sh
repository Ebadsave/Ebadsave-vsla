#!/usr/bin/env bash
set -euo pipefail

WORKER_URL="${CLOUDFLARE_API_BASE_URL:-https://ebadsave-vsla-cloudflare.info-ebadsave.workers.dev}"
read -r -s -p "Enter ADMIN_BOOTSTRAP_SECRET (hidden): " ADMIN_BOOTSTRAP_SECRET
printf '\n'
read -r -s -p "Create Twebaze Edwin's new 6-12 digit PIN (hidden): " NEW_ADMIN_PIN
printf '\n'

if [[ ${#ADMIN_BOOTSTRAP_SECRET} -lt 32 ]]; then
  echo "Error: bootstrap secret must be at least 32 characters." >&2
  exit 1
fi
if [[ ! "$NEW_ADMIN_PIN" =~ ^[0-9]{6,12}$ ]]; then
  echo "Error: PIN must contain 6 to 12 digits." >&2
  exit 1
fi

export NEW_ADMIN_PIN
node -e 'process.stdout.write(JSON.stringify({groupId:"kya-2000",groupNumber:"KYA 2000",previousAdminMemberNumber:"KYA2000001",newAdminMemberNumber:"KYA2000217",newAdminName:"Twebaze Edwin",newPin:process.env.NEW_ADMIN_PIN}))' \
  | curl --fail-with-body --silent --show-error \
      -X POST "${WORKER_URL%/}/v1/auth/transfer-kya2000-admin" \
      -H "content-type: application/json" \
      -H "x-admin-bootstrap-secret: ${ADMIN_BOOTSTRAP_SECRET}" \
      --data-binary @-
status=$?
unset NEW_ADMIN_PIN ADMIN_BOOTSTRAP_SECRET
exit "$status"

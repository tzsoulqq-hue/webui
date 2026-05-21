#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_ROOT="${SOURCE_ROOT:-$(cd "${ROOT}/.." && pwd)}"
WEBUI_PROTO_DIR="${WEBUI_PROTO_DIR:-${ROOT}/proto}"
GPT_PROTO_DIR="${GPT_PROTO_DIR:-${SOURCE_ROOT}/gpt/proto}"
MAILBOX_PROTO_DIR="${MAILBOX_PROTO_DIR:-${SOURCE_ROOT}/mailbox/proto}"
SMS_PROTO_DIR="${SMS_PROTO_DIR:-${SOURCE_ROOT}/sms/proto}"
WEBUI_DASHBOARD_PROTO="${WEBUI_PROTO_DIR}/dashboard.proto"
MAILBOX_EMAIL_PROTO="${MAILBOX_PROTO_DIR}/email.proto"
MAILBOX_SERVICE_PROTO="${MAILBOX_PROTO_DIR}/mailbox_service.proto"
SMS_CONTRACT_PROTO="${SMS_PROTO_DIR}/byte/v/forge/contracts/sms/v1/sms.proto"
SMS_INTERNAL_PROTO="${SMS_PROTO_DIR}/byte/v/forge/sms/internal/v1/sms_internal.proto"
OUT_DIR="${ROOT}/src/proto"
GO_OUT_DIR="${ROOT}/server/pb"
PLUGIN="${ROOT}/node_modules/.bin/protoc-gen-ts_proto"

if [[ ! -d "${GPT_PROTO_DIR}" ]]; then
  printf 'gpt proto dir not found: %s\n' "${GPT_PROTO_DIR}" >&2
  exit 1
fi
if [[ ! -f "${WEBUI_DASHBOARD_PROTO}" ]]; then
  printf 'webui dashboard proto not found: %s\n' "${WEBUI_DASHBOARD_PROTO}" >&2
  exit 1
fi
if [[ ! -f "${MAILBOX_EMAIL_PROTO}" || ! -f "${MAILBOX_SERVICE_PROTO}" ]]; then
  printf 'mailbox proto not found under: %s\n' "${MAILBOX_PROTO_DIR}" >&2
  exit 1
fi
if [[ ! -f "${SMS_CONTRACT_PROTO}" || ! -f "${SMS_INTERNAL_PROTO}" ]]; then
  printf 'sms proto not found under: %s\n' "${SMS_PROTO_DIR}" >&2
  exit 1
fi

if [[ ! -x "${PLUGIN}" ]]; then
  printf 'ts-proto plugin not found at %s; run npm install first\n' "${PLUGIN}" >&2
  exit 1
fi

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"
rm -rf "${GO_OUT_DIR}"
mkdir -p "${GO_OUT_DIR}"

ORCHESTRATOR_PROTOS=("${GPT_PROTO_DIR}"/orchestrator*.proto)
PROTOS=(
  "${WEBUI_DASHBOARD_PROTO}"
  "${GPT_PROTO_DIR}/account_db.proto"
  "${MAILBOX_EMAIL_PROTO}"
  "${GPT_PROTO_DIR}/gopay_app.proto"
  "${GPT_PROTO_DIR}/payment.proto"
  "${MAILBOX_SERVICE_PROTO}"
  "${SMS_CONTRACT_PROTO}"
  "${SMS_INTERNAL_PROTO}"
  "${ORCHESTRATOR_PROTOS[@]}"
)

PROTO_INCLUDES=("-I" "${WEBUI_PROTO_DIR}" "-I" "${GPT_PROTO_DIR}" "-I" "${MAILBOX_PROTO_DIR}" "-I" "${SMS_PROTO_DIR}")
if [[ -d /usr/include/google/protobuf ]]; then
  PROTO_INCLUDES+=("-I" "/usr/include")
fi

protoc "${PROTO_INCLUDES[@]}" \
  --plugin="protoc-gen-ts_proto=${PLUGIN}" \
  --ts_proto_out="${OUT_DIR}" \
  --ts_proto_opt=onlyTypes=true,outputServices=none,esModuleInterop=true,useJsonWireFormat=true,snakeToCamel=false \
  "${PROTOS[@]}"

if [[ "${GENERATE_GO_PROTO:-true}" != "false" ]]; then
  protoc "${PROTO_INCLUDES[@]}" \
    --go_opt=Mbyte/v/forge/contracts/sms/v1/sms.proto=./\;pb \
    --go_opt=Mbyte/v/forge/sms/internal/v1/sms_internal.proto=./\;pb \
    --go_out="${GO_OUT_DIR}" \
    --go-grpc_opt=Mbyte/v/forge/contracts/sms/v1/sms.proto=./\;pb \
    --go-grpc_opt=Mbyte/v/forge/sms/internal/v1/sms_internal.proto=./\;pb \
    --go-grpc_out="${GO_OUT_DIR}" \
    "${PROTOS[@]}"
fi

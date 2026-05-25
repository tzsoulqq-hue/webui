FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS web-builder

WORKDIR /web
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends libprotobuf-dev protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*
COPY webui/package.json webui/package-lock.json* ./
RUN npm ci
COPY webui/index.html webui/vite.config.ts webui/tsconfig.json webui/components.json ./
COPY webui/public ./public
COPY gpt/proto /gpt/proto
COPY mailbox/proto /mailbox/proto
COPY sms/proto /sms/proto
COPY webui/proto ./proto
COPY webui/scripts ./scripts
COPY webui/src ./src
RUN find ./scripts -type f -name '*.sh' -exec sed -i 's/\r$//' {} \;
RUN SOURCE_ROOT=/ GENERATE_GO_PROTO=false npm run build

FROM docker.m.daocloud.io/library/golang:1.26-alpine AS go-builder

WORKDIR /app
ENV GOPROXY=https://goproxy.cn,direct
ENV PATH=/root/go/bin:$PATH
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
    && apk add --no-cache git protobuf-dev \
    && go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.11 \
    && go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.5.1
COPY webui/server/go.mod webui/server/go.sum* ./
RUN go mod download
COPY gpt/proto ./proto
COPY webui/proto/dashboard.proto ./proto/dashboard.proto
COPY mailbox/proto/email.proto ./proto/email.proto
COPY mailbox/proto/mailbox_service.proto ./proto/mailbox_service.proto
COPY sms/proto/byte ./proto/byte
COPY webui/server ./
COPY --from=web-builder /web/dist ./web/dist
RUN mkdir -p pb \
    && rm -f pb/*.pb.go pb/*_grpc.pb.go \
    && protoc -I proto -I /usr/include \
      --go_opt=Mbyte/v/forge/contracts/sms/v1/sms.proto=./\;pb \
      --go_opt=Mbyte/v/forge/sms/internal/v1/sms_internal.proto=./\;pb \
      --go_out=pb \
      --go-grpc_opt=Mbyte/v/forge/contracts/sms/v1/sms.proto=./\;pb \
      --go-grpc_opt=Mbyte/v/forge/sms/internal/v1/sms_internal.proto=./\;pb \
      --go-grpc_out=pb \
      proto/*.proto \
      proto/byte/v/forge/contracts/sms/v1/sms.proto \
      proto/byte/v/forge/sms/internal/v1/sms_internal.proto
RUN go build -o webui .

FROM docker.m.daocloud.io/library/alpine:latest

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories \
    && apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=go-builder /app/webui .
COPY --from=go-builder /app/web/dist ./web/dist

EXPOSE 8080
CMD ["./webui"]

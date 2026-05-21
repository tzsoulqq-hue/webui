# AGENTS.md

本仓是 `webui` 前端骨架和共享 UI 基础仓。

- 本仓只提供 dashboard shell、布局、主题、导航、基础组件、module-kit/uikit、通用数据驱动组件和 service catalog Web/API 基础入口。
- 本仓不依赖基础设施仓或业务仓，不 import sibling repo 源码，不沉淀业务页面、基础设施页面、业务数据请求、业务动作、资源详情抽屉或 provider 分支。
- 本仓后端 server 也只提供 dashboard shell/API gateway/service catalog 基础能力；不得沉淀业务执行逻辑、provider adapter、业务状态机或业务动作条件。
- 最终业务 dashboard 组合由 `deploy` 的声明式配置完成；本仓只暴露稳定装载接口、基础组件和前端工具。
- 基础组件必须数据驱动：列表、表格、toolbar、tabs、详情、动作区等接收 columns、actions、filters、capabilities、render hooks 等配置，不写业务分支。
- 能力差异由调用方传入声明式 capabilities/actions/required fields/required statuses 等元数据；本仓不得硬编码 Outlook、Cloudflare、GPT、GoPay 等业务/provider 判断。
- 通用组件优先使用 shadcn/Radix/Tailwind 官方组件或轻量组装；不得手写已有官方组件能覆盖的基础 UI。
- 表单基础能力使用 React Hook Form 结合 shadcn/Radix 官方表单、输入、选择和校验组件；本仓只提供可复用包装，不写业务字段。
- 前端查询统一使用 TanStack Query；SSE/事件推送通过共享事件适配层进入 QueryClient cache 或通用 hook。
- 手写前端源文件（`.ts`、`.tsx`、`.css`）单文件不得超过 200 行；超过时先拆分组件、hook、utils 或 module-kit 能力。
- Mac 本机禁止前端构建；需要构建、镜像或部署验证时走远程宿主机和 `deploy` 脚本。

# dashboard

`dashboard` 是注册系统的前端聚合入口，负责 shell、导航、环境切换、状态聚合和跨业务可视化。

## 职责

- 承载前端 shell、导航、环境切换、状态聚合和跨业务页面组合。
- 前端通过 `contracts/servicecatalog` 发现业务服务、能力和入口引用，并按目录元数据驱动页面动作。
- 通过服务目录、gRPC-Web、HTTP gateway 或事件投影边界完成业务协作。
- 使用独立 `uikit` 仓提供的通用 UI 组件和基础组件。

## 技术栈

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- TanStack Query

## 本地开发

```bash
pnpm install
pnpm dev
```

## 验证

```bash
pnpm lint
pnpm build
```

## 生成物

`dist/`、测试报告、覆盖率报告和其他可再生成产物属于构建输出。

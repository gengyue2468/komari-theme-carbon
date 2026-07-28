# Komari Carbon

IBM [Carbon Design System](https://carbondesignsystem.com/) + IBM Plex 风格的 [Komari Monitor](https://github.com/komari-monitor/komari) 主题。

信息密度参考 Emerald，视觉与组件完全走 Carbon token / `@carbon/react`。

[English](./README.en.md)

[![Release](https://img.shields.io/github/v/release/gengyue2468/komari-theme-carbon?display_name=tag&sort=semver)](https://github.com/gengyue2468/komari-theme-carbon/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Komari](https://img.shields.io/badge/Komari-theme-0f62fe)](https://github.com/komari-monitor/komari)

**作者：** [gengyue2468](https://github.com/gengyue2468)  
**仓库：** https://github.com/gengyue2468/komari-theme-carbon

> 推荐：从 [Releases](https://github.com/gengyue2468/komari-theme-carbon/releases/latest) 下载 zip，在 Komari 后台 → 主题管理中上传并启用。

## 预览

| 浅色 | 深色 |
| --- | --- |
| ![浅色](./images/preview-light.png) | ![深色](./images/preview-dark.png) |

## 特性

- **Carbon 设计语言**：`@carbon/react` 组件 + Carbon token / SCSS，IBM Plex 字体
- **实时监控**：RPC2 `common:getNodesLatestStatus` 轮询（间隔可配置），REST 回退
- **首页总览**：统计卡片、世界地图（国旗 → 国家质心 + 同址聚合）、节点卡片 / 表格
- **节点详情**：硬件信息、账单与剩余价值、负载 / 延迟历史图
- **财务浮层**：多币种换算与汇总（CNY 基准）
- **i18n**：中 / 英，`language` + `appearance` localStorage，兼容默认主题约定
- **托管主题配置**（Komari ≥ 1.0.5）：默认视图、uptime、图表时长、密度、刷新间隔、RPC 传输
- **主题包规范**：`komari-theme.json` + `dist/`，标题 / 描述占位符与页脚 `Powered by Komari Monitor.`

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | React 19 + React Router 8（SPA，`ssr: false`） |
| 语言 | TypeScript（strict） |
| UI | `@carbon/react`、`@carbon/styles`、`@ibm/plex` |
| 图表 | `@carbon/charts-react` |
| 状态 | Zustand（库存 / 实时）+ TanStack Query（历史） |
| 地图 | `react-simple-maps` + `country-flag-icons` |
| 数据 | 同源 `fetch` → `/api/rpc2` + REST，无 axios |

## 安装

1. 打开 [Latest Release](https://github.com/gengyue2468/komari-theme-carbon/releases/latest)
2. 下载 `komari-theme-carbon-v*.zip`
3. Komari 管理后台 → **主题** → 上传 zip → 设为当前主题

包结构：

```text
komari-theme-carbon-v0.1.0.zip
├── komari-theme.json
├── preview.png
└── dist/
    ├── index.html
    └── assets/
```

## 本地开发

需要 **Node.js 22+** 与 **pnpm**，以及可访问的 Komari 后端。

```bash
pnpm install
pnpm dev
```

默认把 `/api`、`/favicon.ico` 代理到 `https://st.gy.run`。可改上游：

```bash
# PowerShell
$env:VITE_PROXY_TARGET="https://your-komari.example"; pnpm dev
```

或写 `.env.development`：

```env
VITE_PROXY_TARGET=https://your-komari.example
```

### 构建主题包

```bash
pnpm release
# 等价于 pnpm build && pnpm package
```

生成根目录 `komari-theme-carbon-v<version>.zip`。`scripts/package.mjs` 会：

- 同步 `package.json` 版本到 `komari-theme.json`
- 拷贝 `build/client` → `dist/`
- 校验 `index.html` 的 Komari 占位符
- 打入 `komari-theme.json`、可选 `preview.png`

### 脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 开发服务器 |
| `pnpm build` | 生产构建 |
| `pnpm typecheck` | 类型检查 |
| `pnpm package` | 仅打包（需先 build） |
| `pnpm release` | 构建 + 打包 |

## 主题设置（managed）

| Key | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `defaultView` | select | `grid` | 首页 `grid` / `table` |
| `showUptime` | switch | `true` | 卡片是否显示 uptime |
| `defaultChartHours` | number | `4` | 详情页默认历史范围（小时） |
| `density` | select | `comfortable` | `comfortable` / `compact` |
| `dataUpdateInterval` | number | `3` | 实时轮询秒数（建议 1–60） |
| `rpcTransportMode` | select | `websocket` | `websocket` / `http`（失败会降级） |

配置经 `/api/public` 的 `theme_settings` 公开，**不要**放入密钥。

## 合规清单

| 要求 | 状态 |
| --- | --- |
| 根目录 `komari-theme.json`（`name` + `short` 为字符串） | ✅ |
| `dist/index.html` 含 `<title>Komari Monitor</title>` | ✅ |
| description 占位 `A simple server monitor tool.` | ✅ |
| 页脚保留 `Powered by Komari Monitor.` | ✅ |
| 不接管 `/admin`、`/terminal` | ✅ |
| SPA 路由 `/`、`/node/:uuid` | ✅ |
| `configuration.type = managed` | ✅ |
| localStorage `appearance` / `language` | ✅ |

详见 [Komari 主题开发指南](https://www.komari.wiki/dev/theme)。

## 致谢

- [Komari Monitor](https://github.com/komari-monitor/komari) — 监控后端与主题机制
- [IBM Carbon](https://carbondesignsystem.com/) — 设计系统
- [komari-theme-emerald](https://github.com/Tokinx/komari-theme-emerald) 等社区主题

## License

[MIT](./LICENSE) © gengyue2468

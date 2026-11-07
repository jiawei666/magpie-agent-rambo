# Magpie Rambo 插件工作规则

## 图标与 Agent 元数据

- 插件卡片和 Agent 列表使用两个独立图标入口。修改 Rambo logo、调整圆角或发布新版本时，必须同时核对并修改两处：
  1. `package.json` 的 `magpie.icon` 控制“插件 → 已安装”卡片。保持为自包含的 SVG data URL，使用 `viewBox="0 0 24 24"`，圆角矩形为 `rx="7.636"`，并通过同名 `clipPath` 裁切内嵌 PNG。参考 RSSHub 的实现。
  2. `assets/rambo.png` 控制“使用 → Agent”列表行，由三个 `agents/rambo-*.mjs` 的 `agent.icon` 引用。PNG 必须为 RGBA，四个角的 alpha 必须为 0，并在 24、40、80 像素显示时保持圆角。
- Agent 图标 URL 使用与 `package.json.version` 完全一致的 Git tag，例如 `v0.1.7`。修改版本时同步更新 macOS、Windows、Linux 三个 Agent 文件中的 URL，避免 `main` 分支缓存导致 Magpie 显示旧图标。
- 发布前分别验证插件卡片的 SVG 圆角和 Agent 列表 PNG 的透明圆角。只验证其中一处不算完成。

## Magpie 加载环境

- `agents/*.mjs` 由 Magpie 的 MoeJS 脚本环境读取，不等同于 Node.js。保持 `agent` 和 `connect` 为静态 ES module 导出，不使用 `URL`、`import.meta`、`process`、`Buffer` 或 `require`。
- Magpie 内置 Codex 适配器会直接修改 `~/.codex/config.toml`，并保存原值用于断开恢复。第三方 Agent 插件协议当前支持 `json`、`yaml` 和 `env`，暂不支持 TOML；不能把内置 Codex 的直写能力当成第三方 Agent 插件同样可用。
- Magpie 通过 `agent.dir` 检查本机安装。macOS 为 `/Applications/Rambo.app`，Windows 为 `$LOCALAPPDATA/Programs/Rambo`，Linux 为 `~/.config/Rambo`。
- 架构边界：Magpie 是接入方，由本插件适配 Rambo；Rambo 不读取 `magpie.json`，也不认识 Magpie 专属状态。
- 第三方 Agent 声明把连接状态写到 Magpie 自己的 `~/.config/magpie/agent-state/rambo/bridge.json`；包的 Bun `main` 模块轮询该桥接文件，并原地合并 Rambo 的标准 `codex-home/config.toml`（macOS 为 `~/Library/Application Support/Rambo/codex-home/config.toml`，Windows 为 `%APPDATA%/Rambo/codex-home/config.toml`）。
- 插件只拥有顶层 `model`、`model_provider` 与 `[model_providers.magpie]` 及其子表。首次写入前只把这些 owned 字段保存到 Magpie 私有状态；断开后只恢复这些字段，连接期间由 Rambo 或其他工具改动的无关配置与注释必须保留，未连接时不修改 Rambo。
- API Key 只写入 Magpie 私有状态目录中权限为 `0600` 的 token 文件，并通过 Codex command-backed auth（`[model_providers.magpie.auth]`）读取；不得使用 `experimental_bearer_token`、环境变量注入或把密钥写入 TOML。
- `main` 只通过轮询桥接文件适应 Magpie 当前的第三方 Agent 协议；Rambo 只消费标准 `config.toml`，不得增加 Magpie 文件监听、Bridge 路径、专属设置、专属 IPC 或 UI 分支。
- `~/.config/magpie/plugins/node_modules/magpie-agent-rambo` 是 Magpie 的本机安装副本。修改、验证或发布仓库时保持该目录不变，由用户在 Magpie 中更新插件。

## 发布检查

依次完成：

1. 更新 `package.json.version`。
2. 同步三个 `agents/rambo-*.mjs` 的版本化图标 URL。
3. 运行 `npm test` 和 `git diff --check`。
4. 检查发布包同时包含 `package.json`、三个 Agent 文件及 `assets/rambo.png`。
5. 提交后创建与包版本一致的 tag，并推送 `main` 和 tag。

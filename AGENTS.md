# Magpie Rambo 插件工作规则

## 图标与 Agent 元数据

- 插件卡片和 Agent 列表使用两个独立图标入口。修改 Rambo logo、调整圆角或发布新版本时，必须同时核对并修改两处：
  1. `package.json` 的 `magpie.icon` 控制“插件 → 已安装”卡片。保持为自包含的 SVG data URL，使用 `viewBox="0 0 24 24"`，圆角矩形为 `rx="7.636"`，并通过同名 `clipPath` 裁切内嵌 PNG。参考 RSSHub 的实现。
  2. `assets/rambo.png` 控制“使用 → Agent”列表行，由三个 `agents/rambo-*.mjs` 的 `agent.icon` 引用。PNG 必须为 RGBA，四个角的 alpha 必须为 0，并在 24、40、80 像素显示时保持圆角。
- Agent 图标 URL 使用与 `package.json.version` 完全一致的 Git tag，例如 `v0.1.6`。修改版本时同步更新 macOS、Windows、Linux 三个 Agent 文件中的 URL，避免 `main` 分支缓存导致 Magpie 显示旧图标。
- 发布前分别验证插件卡片的 SVG 圆角和 Agent 列表 PNG 的透明圆角。只验证其中一处不算完成。

## Magpie 加载环境

- `agents/*.mjs` 由 Magpie 的 MoeJS 脚本环境读取，不等同于 Node.js。保持 `agent` 和 `connect` 为静态 ES module 导出，不使用 `URL`、`import.meta`、`process`、`Buffer` 或 `require`。
- Magpie 通过 `agent.dir` 检查本机安装。macOS 为 `/Applications/Rambo.app`，Windows 为 `$LOCALAPPDATA/Programs/Rambo`，Linux 为 `~/.config/Rambo`。
- Magpie 通过 `agent.config` 写入专属桥接文件 `magpie.json`；`connect` 只返回 `baseURL`、`apiKey` 和 `managedBy: "magpie"`。桥接凭据不进入 Rambo 的 `config.toml`。
- `~/.config/magpie/plugins/node_modules/magpie-agent-rambo` 是 Magpie 的本机安装副本。修改、验证或发布仓库时保持该目录不变，由用户在 Magpie 中更新插件。

## 发布检查

依次完成：

1. 更新 `package.json.version`。
2. 同步三个 `agents/rambo-*.mjs` 的版本化图标 URL。
3. 运行 `npm test` 和 `git diff --check`。
4. 检查发布包同时包含 `package.json`、三个 Agent 文件及 `assets/rambo.png`。
5. 提交后创建与包版本一致的 tag，并推送 `main` 和 tag。

# Magpie Agent for Rambo

这个插件把 Magpie 选中的模型、网关地址和专属访问密钥写入 Rambo 的用户配置目录。Rambo 启动时读取这份桥接文件，并通过 Codex App Server 的 Responses Provider 把请求发给 Magpie 网关。

插件不会把提示词、聊天记录、Skills、MCP 配置或其他资源同步到 Magpie。请求正文会按模型请求正常经过 Magpie 网关。

## 安装

仓库带有 GitHub `magpie-plugin` topic，可在 Magpie 的 Plugins → Discover → Unofficial 中发现。macOS 用户可以直接添加仓库：

```sh
magpie plugin add ./magpie-agent-rambo
```

克隆仓库后，Windows 用户使用平台对应的 Agent 文件：

```sh
magpie plugin add ./magpie-agent-rambo/agents/rambo-windows.mjs
```

Linux 用户（社区构建）使用：

```sh
magpie plugin add ./magpie-agent-rambo/agents/rambo-linux.mjs
```

macOS 插件写入 `~/Library/Application Support/Rambo/magpie.json`；Windows 使用 `%APPDATA%/Rambo/magpie.json`；Linux 使用 `~/.config/Rambo/magpie.json`。这些路径对应 Electron 默认的 Rambo 用户数据目录。

安装后在 Magpie 的 Agents 页面为 Rambo 选择模型。连接成功后重启 Rambo 生效；更换模型或在 Magpie 中断开后，也需要重启 Rambo。

## 配置与凭证

桥接文件由 Magpie 管理，包含 `model`、`baseURL`、`apiKey` 和 `managedBy` 字段。`apiKey` 是 Magpie 网关为 Rambo Agent 生成的访问密钥。Rambo 从该文件读取密钥，并仅通过进程环境传给 App Server；它不会把此密钥写入 Codex TOML。

禁用或断开 Magpie Agent 后，Magpie 会将这些字段恢复到连接前的值。重启 Rambo 后，原模型来源恢复。

## 开发

```sh
npm test
```

GitHub 发现使用 `magpie-plugin` topic。插件 logo 由 `package.json` 的 `magpie.icon` 提供。

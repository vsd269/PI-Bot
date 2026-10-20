# 连接器与 GitHub 令牌建议

## 支持范围

本项目的内置 GitHub 连接器使用远程 GitHub MCP。其他应用可通过本地 stdio 或远程 Streamable HTTP MCP 接入，分别选择授权的 Bot 和工具。Notion 提供预填配置入口；邮箱需要对应服务及其账号授权。安装插件或添加配置不等于已经登录。

## Notion

设置 → 连接器 → 配置 Notion，已预填 Notion 官方地址 `https://mcp.notion.com/mcp`。

选择授权 Bot，检查工具授权后保存。模板默认停用，`allowedTools: []` 不允许工具调用。先明确允许的工具后再启用；按需授权具体工具名称，只有确实需要时才使用 `["*"]`。

保存并启用后，对需要使用的 Bot 点击“网页登录”，再点击“打开授权页面”，在浏览器内完成账号授权；返回后点“检查工具”。凭据使用现有 Windows 加密密钥库，不放进聊天。当前未使用真实 Notion 账号实测，服务商账号策略、OAuth 兼容性和权限会影响最终结果。

## 邮箱

Gmail、Outlook 或其他邮箱需要对应 MCP 服务和该邮箱的授权设置；当前没有内置邮箱的一键登录。可以在“配置邮箱 MCP”中接入已准备好的服务。某些方案需要自己的 Google / Microsoft OAuth 客户端配置；不同邮箱不能共用一个默认授权。不会因添加入口就自动获得邮箱访问权限。

## GitHub 仓库选哪种

推荐 Fine-grained personal access token + **仅选定的仓库**，选 Bot 需要处理的项目。

- 只处理公共项目且只需读取时，可用“公共仓库”。
- “所有仓库”也能用，但范围涵盖该资源所有者的现有和未来仓库，通常没有必要。它不等于自动授予所有操作；能做什么仍取决于下面的具体权限。
- 公司组织可能要求管理员审批或有令牌有效期限制。

| 使用方式 | Repository permissions |
| --- | --- |
| 查看代码 | Contents: Read-only |
| 查看 Issue | Issues: Read-only |
| 查看 PR | Pull requests: Read-only |
| 修改文件、提交分支 | Contents: Read and write |
| 创建或修改 PR | Pull requests: Read and write，通常还需 Contents 写权限以提交分支 |
| 创建或修改 Issue | Issues: Read and write |

Metadata 为 GitHub 必需读取权限。平时不用开启 Administration、Workflows、Secrets 等额外权限。令牌设置有效期，后续需要哪个操作再补对应权限。GitHub MCP 中看得到某个工具不代表令牌有权执行它；fine-grained token 最终由 GitHub API 校验。

## 查证来源

- Notion 官方 MCP 接入：https://developers.notion.com/docs/get-started-with-mcp
- GitHub 官方令牌管理：https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- GitHub MCP 官方配置与令牌过滤：https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md

公开资料通过 AnySearch 查阅，并与本地源码核对。未访问或修改用户账号、仓库、邮件或 Notion 内容。

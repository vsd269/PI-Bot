# 参与贡献

欢迎反馈问题、改进文档和提交补丁。PI Bot 是面向 PI Desktop 的学习与适配项目，改动应保留 DeepSeek-Bot 的来源说明、许可证以及已有数据的兼容性。

## 本地验证

需要 Node.js 20 或更新版本。当前构建和单元测试没有需要安装的 npm 依赖；运行时包含的 `ws` 源码与许可证已收录。

```powershell
npm run check
npm test
npm run package
npm run verify:package
```

Windows 是主要验证平台。涉及麦克风、Windows 加密、浏览器和原生 Agent 的修改，还需要在 PI Desktop 测试配置中人工验证；模拟测试通过不代表外部服务已验证。

提交 PR 时说明问题、行为变化、验证方法和限制。不要提交团队备份、录音、个人聊天、`.env`、API 密钥、生成的安装包或本地运行目录。当前插件 ID 为 `local.pi-bot`。修改身份标识必须提供完整的数据迁移和回归验证；保留 `local.ds-bot` 仅用于旧版本兼容。

上游实现的移植应保留署名并更新 `NOTICE` 或来源记录。请把新的第三方依赖及其许可证一并说明。

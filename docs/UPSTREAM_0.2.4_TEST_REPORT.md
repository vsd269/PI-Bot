# PI Bot 0.3.88 本地验证记录

日期：2026-10-30（Asia/Shanghai）。源码目录：`F:\claude code\PI-Bot-release-0.3.82`。开发分支：`execution-engine/phase-1`；修改基于 `98d7f65` 的 0.3.87 本地候选代码。目录旧名称不是本次插件版本号，manifest/package/关于页均为 0.3.88。

## 已验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| npm test | 213 项：212 通过、0 失败、1 跳过 | output/upstream-024-full-tests.txt |
| npm run check | 201 个脚本语法检查通过，版本一致 | output/upstream-024-check.txt |
| 新版 UI 回归 | 9 个场景通过，0 页面异常 | output/playwright/upstream-024/results.json |
| 既有 UI 回归 | 14 个场景通过，0 页面异常 | output/playwright/upstream-021/results.json |
| Office 实际 CLI 操作 | 6 项通过；真实临时 OOXML 文件读写/检查，非模型模拟 | tests/office.cjs、output/office-tests.txt |
| 当前开发机 Office 环境 | 检测到独立 Node.js 24.11.0；指南响应约 4.3 KB | src/office.js 检测；不代表安装到其他电脑后环境相同 |

群聊测试覆盖：排队用户输入、管理员规划晚返回、成员会话慢创建、成员 prompt 晚接受、启动保存期间取消、未确认的 abort、不相关任务保留、自动交接保存失败回滚与迟到群报告。使用 mock PI API 验证调用顺序和状态，不冒充真实宿主中止验收。

经验提案测试覆盖：预览不写入、拒绝、重复确认、能力保存失败回滚、同名/共享能力保护、并发能力编辑、AGENTS.md 原文冲突、目录变化、成员消失、文件已写但最终状态保存失败后的核对恢复、密钥样式内容阻止保存、自动复盘开关/空闲/频率、备份验证和分块传输。

跳过的 1 项：本 Windows 账号无法创建文件符号链接，AGENTS.md 符号链接实文件场景未运行。代码包含 lstat/isSymbolicLink 拒绝逻辑，但不将未运行的测试算作通过。

界面检查通过本地 HTTP 服务与隔离的 headless Chromium 运行，截图已目视核对：提案弹窗、群详情、窄窗侧栏。没有操控用户正在运行的可见 PI Desktop 窗口。

Office 测试保留原样上游 CLI 哈希；Word 在新文件替换内容/修改单元格后重新读取并比较检查结果，失败批次不产生部分输出；PPT 重排/复制后验证包，布局异常返回 findings；Excel 比较公式/缓存值，解包/重新打包后读取结果一致；原始样例文件不变。没有执行完整渲染、公式重算或真实模型文档工作流。

## 打包验证

交付前运行 `npm run package`、`npm run verify:package` 与 `npm run preflight:market`。安装包报告、源文件校验、SHA-256 和桌面副本校验随交付目录保留。市场预检仅重现已知包名和动态导入规则，不能代替平台完整审计。

## 未验证及发布状态

- 未在真实 PI Desktop 会话与真实模型服务端到端测试本次新增按钮、原生权限确认或自动复盘产物。
- 未安装/覆盖用户当前 PI Bot、未重启 PI Desktop、未修改现有聊天/模型/密钥。
- 未验证私密 Bot 执行拦截，所以本版未提供该功能。
- 未上传 GitHub 或 PI Desktop 插件市场。

## 来源与范围

保留 DS Bot Apache-2.0 来源及历史 NOTICE；Office CLI 字节保持原样，内嵌 @xmldom/xmldom 的 MIT 许可已加入安装包。没有导入上游独立桌面宿主、安装器或完整文档运行环境。

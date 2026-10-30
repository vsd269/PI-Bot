# PI Bot 0.3.89 私密 Bot 本地验证记录

日期：2026-10-31（Asia/Shanghai）。公开发布分支：release/v0.3.89；此前本地私密功能验证记录沿用。

## 已运行

- npm run check：195 个公开源码脚本语法检查通过，manifest/package/关于页面版本为 0.3.89。
- npm test：238 项，237 通过、0 失败、1 跳过。唯一跳过项为原有 AGENTS.md 文件符号链接用例，此 Windows 账户不能创建该符号链接。
- 其中 tests/privacy.cjs：25 项全部通过，实际调用 Team、工具包装器、派发路径、备份校验与记忆适配器。
- tests/privacy-ui.cjs：7 个隔离 Chromium 界面场景通过，页面 JavaScript 错误为 0。
- tests/upstream-024-ui.cjs：9 个界面场景通过，页面错误为 0。
- tests/upstream-021-ui.cjs：14 个界面场景通过，页面错误为 0。
- Office 的 6 项回归测试包含在 npm test 中，本轮均通过。
- npm run package、npm run verify:package：通过；插件 ZIP 为 STORE 格式，228 个文件，227 个源文件内容及校验和逐项一致，版本 0.3.89。
- npm run preflight:market：已知 PKG012 / SEC003 模式阻断项为 0；不代表完整市场审计通过。
- 插件包：8,496,105 字节；SHA-256：7a82f3f630e06048b75feb49867c44e2bd849cd716ee355ecde785b32166885c。

## 私密测试覆盖

- 普通成员开启并持久保存、切换时归档旧会话、保存失败回滚。
- 主 Bot、无目录、非法开关、目录重叠、已有群成员、关联任务未结束的拒绝路径。
- 用户 UI 保留管理权；私密开关重新打开仍保留；错误保存不错误显示已关闭。
- list_bots 和管理员模型输入不包含私密 Bot 的资料/任务内容。
- 普通及 request_id 派发、重试、直接私聊/排队、延迟执行路径均检查私密条件。
- 管理员/普通 Bot 的设置修改、能力分配和中断工具受限；私密 Bot 不能直接保存共享 Skill。
- recall、remember、forget 不能越权访问私密记忆；私密 Bot 自己可使用记忆，用户可通过记忆面板管理。
- 新私密日志不写入共享 journal，删除后保留私密归档与目录约束；删除私密成员后，旧结果不向其他成员转发。
- 私密目录消失后不回退公共工作区；公共会话也不能在私密目录内启动。
- 新建/修改群聊在 UI 和后端两层排除私密成员；复制后不继承私密目录、会话或记忆。
- 备份保留有效私密标记，拒绝非法标记/群聊私密成员。
- 私密 Skill 提案只有经用户明确批准才进入共享库，界面在确认前显示共享范围。

## 本地证据

- output/privacy-check.txt
- output/privacy-full-tests.txt
- output/privacy-tests.txt
- output/playwright/privacy/results.json
- output/playwright/privacy/private-setting.png
- output/privacy-024-ui.txt
- output/privacy-021-ui.txt
- output/privacy-package.txt
- output/privacy-package-verify.txt
- output/privacy-market-preflight.txt

## 未检查 / 限制

- 未将本版安装到正在运行的 PI Desktop，未使用用户实际 API 密钥进行模型联调。
- 未验证宿主原生文件、shell/命令、MCP、会话/子 Agent 的全面拦截；本版不宣称系统级沙箱。
- 未执行跨平台 macOS/Linux 实机测试。
- npm run preflight:market 仅复现此前见过的打包名称与动态导入检查，不等于平台完整审计。
- GitHub 发布与插件市场上架分开；旧版桌面包保留，本次没有替换用户实际安装的插件。

公开发布源码复跑 npm run check / npm test / package / verify:package / preflight:market 均通过，输出保存在发布工作区 output/release-*.txt。195 个脚本是公开源码计数；早期本地开发工作区含额外临时脚本，曾为 204 个。

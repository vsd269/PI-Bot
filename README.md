<div align="center">
  <img src="icon.svg" width="80" alt="PI Bot" />
  <h1>PI Bot</h1>
  <p>在 PI Desktop 中，让一组长期协作的 Bot 一起工作。</p>
  <p>
    <a href="https://github.com/vsd269/PI-Bot/releases"><img alt="Release" src="https://img.shields.io/github/v/release/vsd269/PI-Bot" /></a>
    <a href="https://github.com/vsd269/PI-Bot/actions/workflows/ci.yml"><img alt="Validate" src="https://github.com/vsd269/PI-Bot/actions/workflows/ci.yml/badge.svg" /></a>
    <a href="LICENSE"><img alt="Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue" /></a>
  </p>
  <p>简体中文 · <a href="README.en.md">English</a></p>
</div>

PI Bot 是基于 [DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot) 学习、迁移和持续调整的 **PI Desktop 适配项目**。项目保留上游的 Bot 团队、群聊协作等设计思路，并将运行、工具、权限和界面接入 PI Desktop 的插件接口。

感谢原作者的开源工作。本项目是独立维护的衍生适配版，不是 DeepSeek-Bot 的官方发行版，也不声称所有能力与上游完全一致。

## 可以做什么

| 能力 | 说明 |
| --- | --- |
| 私聊与团队协作 | 多 Bot 私聊、群聊、管理员派发任务，执行成员可按群聊串行或并行工作 |
| 流式消息 | 接收过程中的文字更新，支持消息引用、局部文字选择、聊天查找与历史搜索 |
| 长期记忆 | 每 Bot 及每个群聊独立的文件化记忆、自动提取、查看和维护；自动提取会调用模型 |
| 交互卡片 | 私聊中展示文本、指标、表格和进度，或通过选项、确认、短表单收集答案；需模型支持工具调用 |
| 消息时间 | 显示本机时区的消息时间与已有记录中的 Bot 回复耗时 |
| Skill 与能力包 | 导入本地 Skill，管理共享能力，并批量分配给指定 Bot |
| 应用与 MCP | GitHub 连接器，以及按 Bot 配置和授权的本地或远程 MCP；Notion 提供配置入口 |
| 语音 | 语音输入、实时转写对话、麦克风选择和状态波形；云服务需自行配置 |
| 本地工作流 | 定时任务、任务恢复入口、浏览器工具、用量与备份管理 |
| 界面 | 明暗模式、主题、自定义头像和会话侧栏 |

## 界面预览

0.3.82 新功能入口与示例见 [版本说明](docs/RELEASE-0.3.82.md)：群详情中的“群聊记忆”、消息旁的时间/耗时，以及私聊中的 `show_view` 交互卡片。

![PI Bot 能力页](docs/images/capabilities.png)

演示界面使用虚构 Bot 与测试目录，不代表已连接外部服务。

## 安装

1. 安装 [PI Desktop](https://github.com/vsd269/PI-Desktop)，配置可用的模型。
2. 从 [Releases](https://github.com/vsd269/PI-Bot/releases/latest) 下载 `local.pi-bot-版本号.piplug`。
3. 在 PI Desktop 的插件管理页选择从本地安装插件包，检查并授予所需权限。
4. 重启 PI Desktop，打开 **PI Bot**，创建 Bot 和群聊。

插件声明的最低接口版本为 PI Desktop **0.18.0**；本次安装包在 Windows 的 **0.20.1 原生安装器**上做过隔离安装校验。Windows 是主要开发和验证平台，其他平台尚未进行完整验证。

从 **0.3.81** 起，插件 ID 和正式包名统一使用 **`local.pi-bot`**，界面名称为 **PI Bot**。从 0.3.80 或更早版本升级：

1. 在 PI Desktop 插件管理中先**停用旧版 PI Bot**，暂不要卸载。
2. 导入 `local.pi-bot-版本号.piplug`，授予权限并重启。
3. 首次启动自动复制旧 Bot、群聊、聊天、记忆、Skill、上传附件、浏览器资料和同一 Windows 用户的加密密钥，并保留旧数据。新版已有团队或备份时不会再次导入旧数据。
4. 确认新版正常后，可继续保留停用的旧版。完整备份仍建议保留。

迁移只处理当前 PI 数据根目录下已知的旧插件目录，不扫描其他用户资料。迁移先在临时目录验证完整性，再提交；中断后可重试，不合并或覆盖已有新团队。两个版本同时启用时，新版会提示先停用旧版，以免重复执行任务。安装包不携带作者的 Bot、聊天或密钥。

## 接收新版本提醒

从 **0.3.79** 起，打开 PI Bot 后会在后台检查本仓库的正式 GitHub Release。发现新版时，侧栏显示提醒；在「设置 → 关于」可手动检查、查看发布说明并下载插件包，也可关闭自动检查。

更新流程是 **收到提醒 → 下载 .piplug → 在 PI Desktop 插件管理中导入 → 重启**，不会静默替换运行中的插件。0.3.78 及更早版本需要先手动安装一次带检查功能的版本。自动检查只在 PI Bot 页面运行时进行，正常结果缓存 6 小时；离线或 GitHub 限流时不会误报“已是最新”。检查只访问公开 Releases API，不使用用户的 GitHub 连接器令牌。

维护者发布时，`manifest.json`、`package.json`、Git 标签和包名需对应同一个更高版本；创建 **非草稿、非预发布** 的 Release，并附上 `local.pi-bot-X.Y.Z.piplug`。仅推送源码或创建没有安装包的标签不会触发可安装更新提示。

上传插件中心时，选择 `local.pi-bot-版本号.piplug`，文件名必须与插件 ID 和版本一致。GitHub 同时保留内容相同的 `PI-bot-版本号.piplug` 兼容附件，供 0.3.79 的更新检测使用；它不用于插件中心上传。关于页名称仍为 PI Bot，安装 ID 不变。

`npm run preflight:market` 对照已遇到的文件名和动态导入提示做本地检查，不代表已经通过平台完整审核。

## 使用与边界

- **模型**：使用你在 PI Desktop 中配置的模型和账号，不附带模型额度。
- **语音**：语音输入用于录音后转写，语音对话可使用实时识别。服务商、模型、密钥和费用需自行配置；朗读可用系统语音或配置的服务。识别、打断和降噪效果受设备及服务影响。
- **连接器**：GitHub 使用令牌连接；Notion、邮箱等需要相应 MCP 服务及账号授权。配置入口不等于已经完成服务接入。详见 [连接器说明](CONNECTORS.md)。
- **定时任务**：依赖 PI Desktop 运行、插件启用和相应工作区；不是独立的云端调度服务。
- **任务恢复**：依据已保存会话核对、继续或重试；不保证任意工具执行中途无损恢复。
- **权限与数据**：原生工具继续受 PI Desktop 会话权限控制。本地 MCP 可运行你授权的程序。Windows 密钥使用当前用户加密，跨电脑须单独加密导出；不要把团队备份发布到 GitHub。

## 本地构建

需要 Node.js **20+** 和 Git。构建与下列测试不需要安装 npm 依赖。

```powershell
git clone https://github.com/vsd269/PI-Bot.git
cd PI-Bot
npm run check
npm test
npm run package
npm run verify:package
```

产物位于 `dist/local.pi-bot-版本号.piplug`，校验值位于 `dist/SHA256SUMS.txt`。`.piplug` 使用 PI 安装器需要的 ZIP STORE 格式；不要直接改用普通压缩包代替。

```text
renderer/   插件界面、交互与来源记录
src/        团队、Agent、记忆、能力及平台适配
scripts/    语法检查、打包和包校验
tests/      使用测试数据的功能回归
manifest.json  PI Desktop 插件声明
```

## 验证与反馈

本仓库提供无需真实账号的回归测试和 Windows CI。语音、模型、OAuth、浏览器与原生工具的真实效果仍需要在自己的配置中验证；测试通过不代表没有缺陷。

问题请提交到 [PI Bot Issues](https://github.com/vsd269/PI-Bot/issues)，附版本、复现步骤和脱敏后的截图。使用方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题见 [SECURITY.md](SECURITY.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## 致谢与许可证

- 上游项目：[Fei2411 / DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)，历史来源与移植记录保存在 [NOTICE](NOTICE) 和 [provenance.json](renderer/upstream/provenance.json)。
- 宿主客户端：[PI Desktop](https://github.com/vsd269/PI-Desktop)。本仓库不包含或修改其客户端二进制。
- 随包收录的 `ws` 使用 MIT 许可证，见 [依赖许可证](src/vendor/ws/LICENSE)。
- PI Bot 随附用户提供的头像素材；保留原有素材与第三方来源说明，不主张对第三方商标或标识的权利。

代码按 [Apache License 2.0](LICENSE) 发布，保留上游版权、署名与许可证。欢迎以学习、交流和改进适配为目的参与贡献。

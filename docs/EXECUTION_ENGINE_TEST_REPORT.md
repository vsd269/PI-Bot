# 执行层首批补丁测试报告

日期：2026-10-30（Asia/Shanghai）。开发分支 `execution-engine/phase-1`。基线为用户指定的 PI Bot 0.3.86；本地候选版本 0.3.87。

## 结论与证据边界

以下是实际 PI Bot 模块、真实临时文件保存、故障注入和模拟宿主界面测试；没有访问用户真实 API key，没有调用真实大模型。构建成功不等于真实 PI Desktop 验收成功。当前不满足“全部升级完成/无 bug/自动完成任意任务”的承诺。

## 已运行

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 0.3.86 基线 npm test | 153 通过，0 失败 | output/execution-engine-research/baseline-tests.txt |
| 0.3.86 基线 npm run check | 181 项语法/版本检查通过 | 首轮基线命令输出 |
| 候选版 npm test | **176 通过，0 失败，0 跳过** | output/execution-engine-research/phase1-tests.txt |
| 候选版 npm run check | **184 项语法检查通过，版本一致 0.3.87** | output/execution-engine-research/phase1-check.txt |
| 扩展既有 Playwright UI 脚本 | **14 个场景通过，pageErrors=[]** | output/playwright/upstream-021/results.json；phase1-ui.txt |
| npm run package | 成功 | phase1-package.txt；dist/package-report.json |
| npm run verify:package | **218 个条目、217 个源文件校验通过** | phase1-verify.txt |
| npm run preflight:market | 观察到的 PKG012/SEC003 阻断为 0 | phase1-market.txt；不是市场全量审计或审核通过证明 |
| Git 差异空白检查 | git -c core.whitespace=cr-at-eol diff --check 通过 | 采用仓库现有 CRLF 换行约定 |

候选安装包：`local.pi-bot-0.3.87.piplug`，8,107,860 字节。

SHA-256：`3ad5c75585dcea078423d9d66fa3ae617a6f602f60916804537f00896076cc5a`。

桌面目录：`C:\Users\Administrator\Desktop\PI Bot 0.3.87 执行层第一阶段测试版`。原 0.3.86 安装包未覆盖，其哈希仍为 `4832381dfb4306f0bde9e74f8c713f81279862fe8e967372b3f48a847cee11bc`。

## 新增 23 项测试覆盖

`tests/execution-engine.cjs` 通过真实 Team.save/enqueue 与临时 team.json 验证：

- 并发同编号调用只产生一个任务；第一执行前磁盘中已有 accepted 回执、job 和父子关联。
- 同编号改正文拒绝；不同来源 Bot 的相同编号互不冲突。
- 最终 rename 失败不启动执行，回滚子任务/父关联；之后排队的保存也不能把失败 job 写回，并保留并发聊天。
- 首次预留保存失败、无人交接 40 次上限均不产生执行任务。
- 准入期间停止、AbortSignal、目标删除、群成员移除、父任务取消共 5 种场景不启动执行。
- 重建实例读取磁盘后重复请求返回旧回执，不再入队；只允许查询自己派发的请求。
- 启动核对必须同时匹配预留 jobId 和 messageRequestKey；旧未绑定请求标中断，不补发。
- 实际调用 Team.load，经备份校验/能力/记忆初始化后，已接收但排队的任务仍标中断，没有执行者被调用。
- accepted 记录缺少对应 job 时显示 needs_review，不伪造完成。
- 管理员 planner 保留兼容行为、不透传单个预留 jobId；只标规划返回。
- 拒绝重复键、畸形回执和畸形备份；旧数据缺少新字段可读取。
- 事件 seq 单调、最多 512 条、无正文/密钥/错误文本；无变化保存不重复加事件，replyDelivered 有单独事件。
- 失败保存不推进已提交日志序号；旧数据启动不补造历史。
- 日志与去重账本不进入常规 UI snapshot；恢复中心按需取历史，未知 jobId 拒绝。
- 完整备份往返保留历史和回执，恢复后暂停任务，不自动重放。
- 缺号或混入正文的事件不能进入正常备份。
- 极长多字节元数据下，历史响应仍小于 32 KiB，为宿主 64 KiB 封装留余量。

另外，原 `message_bot` 去重测试改为实际 enqueue/save 执行路径，不再用 privateChat 返回固定 jobId 的桩绕过关键逻辑。

## 界面覆盖与视觉检查

复用 `tests/upstream-021-ui.cjs` 的隔离 headless Chromium / 本地 HTTP harness，在现有真实 renderer 上模拟宿主调用，不打开用户浏览器配置。

覆盖本地计算器状态/提交、HTML 隔离与主题、图表下载/CSV 安全、侧问删除、共享头像原图、外观/思考开关、触屏工具、右面板互斥、密钥用途、执行记录、继续群交接、窄窗口，共 14 个场景。检查执行记录按钮请求了指定 jobId，并显示排队/执行中/中断及验收限制说明。

截图：`output/playwright/upstream-021/execution-history.png`。截图等待页面过渡结束；不把动画中间帧当作最终界面。旧界面几何与主题沿用原样。

## 调试时发现并解决的问题

- 原有去重测试只监视 privateChat 桩，新实现按真实队列准入，改为检查实际执行次数、磁盘任务和重复回执。
- 新备份测试一度误用 payload.state，已按真实 archive 格式修正为 payload.team。
- 新 UI 场景一度使用错误的 CSS 定位器，已修正为现有 bt-set-row，并通过可见入口点击，不用隐藏菜单绕过路由。

这些中间失败均已修复并重新运行。最终结果见上表，不能用中间运行记录代替最终结果。

## 未运行与已知限制

- **未运行**：用户实际 PI Desktop 版本确认、安装/重载、真实模型/网络流式输出、真实权限弹窗、真实语音和附件的人工联调。
- **未运行**：真实进程 kill/断电恢复、硬盘损坏和 fsync 耐久性实验。当前模拟的是异步写入/rename 失败和重新加载；不是 OS 崩溃所有时机的证明。
- **未运行**：Windows/macOS/Linux 三平台真实宿主矩阵、长时间压力/费用/首字延迟基准。
- **未实现**：完整 DAG、产物验收器、逐工具检查点、自动安全重试、永久消息事件库、精确费用硬限制。
- **范围限制**：原子接收改造针对带 request_id 的执行者派发；planner 和无编号旧调用的兼容边界见架构文档。不保证外部副作用 exactly-once。
- **数据上限**：最近 512 条事件、10,000 条去重回执。没有静默清理去重键；达到上限会明确停止新编号派发。
- **公开发布**：未推送 GitHub、未创建 Release、未上传 PI Desktop 市场、未替换用户已安装插件。

真实宿主放行清单和下一阶段顺序见 `EXECUTION_ENGINE_PLAN.md`。

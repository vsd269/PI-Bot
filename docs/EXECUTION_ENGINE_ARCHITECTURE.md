# PI Bot 执行层：首批可靠性补丁架构

日期：2026-10-30（Asia/Shanghai）。基线 0.3.86，候选版本 0.3.87。这里只描述已经写入代码的范围；后续 DAG、验收器和自动调度仍是计划。

## 一、继续使用一套运行时

`PI 原生 Agent → message_bot → message-requests → Team.enqueue → 原生 session/agent`

持久数据仍在 `team.json`，由 `Team.save` 的 promise 写队列统一保存：克隆当前状态 → 写临时文件 → rename 替换 → 提交日志基线 → 原有备份 checkpoint。没有新数据库、后台进程或外部队列。临时文件加 rename 降低半写入风险，但不承诺硬盘断电级 fsync 持久性。

`jobs` 是现有任务实体；保持 queued、launching、running、waiting、waiting_teammates 和终态的原有语义。`completed` 指原生回合结束，不是产物验收通过。不强行为现有任务加上原方案的 14 个状态，也未建立工具级检查点。

## 二、执行者派发的提交顺序

仅作用于提供 `request_id` 的 `message_bot` 执行者分支：

1. 校验目标、群成员和祖先关系。来源 Bot 与请求编号构成唯一键，目标/正文/回复目标/群/原生会话参与摘要。
2. 若编号正在处理中，复用同一 promise；若已保存，返回旧回执；同编号不同内容直接拒绝。
3. 先预留 jobId，保存 `admitting` 回执，再经过现有无人交接限额检查。
4. 在 `Team.save(rollback, prepare)` 的同一写队列回调中创建 job、建立父子关联，并把回执改为 `accepted`；`prepare` 只能同步修改本次状态，不在其中 await 或递归调用 save。
5. enqueue 的 execution admission promise 暂时阻止执行。只有带完整 job/关联/accepted 的快照 rename 成功后，promise 才返回 true，沿原有每 Bot/群串并行链执行。
6. 保存失败则在写队列内部回滚本次 job 与父子字段；promise 返回 false，执行者不会启动。保留脱敏失败回执，不自动重试。后续排队的保存不能把失败 job 重新写入。

在最终提交前再次核对停止/取消、目标与来源 Bot、群是否还存在、目标成员资格和父任务取消状态。此检查不替代 PI Desktop 原生权限审批。

现有限额计数发生在最终任务提交之前；后续派发失败时可能已消耗一次无人交接额度。这是保守限制，不会据此自动执行任务。

## 三、管理员规划分支与旧调用

管理员 planner 沿用 `privateChat`，以保留原有规划和流式呈现。记录 kind=planner，规划返回后保存 accepted；它没有执行者 job 检查点，不把预留编号透传给规划产生的多个子任务。查询返回 `planner_returned`，不表示子任务完成。

管理员生成与子任务入队不在上述单个 worker 提交事务内；若中途崩溃，可能有部分派发或结果未知，保留中断并人工核对。未携带 request_id 的旧工具兼容分支也继续使用既有路径。不能把首批改动宣传成“所有入口 exactly-once”。

## 四、重启与恢复

- `admitting` 回执只有在预留 jobId 和 job.messageRequestKey 同时匹配时，才能核对为 accepted。
- 不匹配或旧版本没有绑定 jobId 的记录标为 interrupted；不重新发送工具/模型请求。
- accepted 是“任务已接收”的事实；对应 job 在重启后可能为 interrupted，两个状态分别展示，不伪造完成。
- 保留 Team.load 对 queued/launching 的中断策略、running/waiting 的原生状态核对，以及现有 Handoffs 回交路径。
- 恢复中心 inspect/adopt 核对原生会话；continue/retry 创建新任务且需确认，仍可能重复部分外部操作，不是工具级断点恢复。

该机制防止同一稳定编号产生第二个执行者 job；无法确保邮件、发布、支付等外部操作只执行一次。外部服务需要自己的幂等键或操作凭证。

## 五、状态事件与只读观察

`src/execution-log.js` 保存 version=1、sequence 和最多 512 条 metadata 事件；内容为 job/message 状态变化与 reply_delivered。seq 在 rename 成功后提交；失败保存不推进已提交基线。一次保存之间发生的短暂内存状态可能被合并，不是逐工具完整审计。

只保存 id、botId、roomId、taskId、fromBotId、status、seq、at，不保存正文、提示词、错误正文、工具参数或密钥。启动旧数据建立当前基线，不补造过去事件。已存在的记录随完整备份保存；备份恢复保留历史并暂停任务，不假设归档中的最后事件就是当前执行状态。

常规 snapshot/startup 增量同步排除 executionLog 与 messageBotRequests；不把日志送入每次 UI 刷新。恢复 history 默认返回最多 40 条，允许 1–100 条，同时限制事件序列化内容为 24 KiB，为宿主 64 KiB 调用封装留余量；responseTruncated 表示因字节限制省略了较早记录。

模型工具 `check_delegation(request_id)` 只查询调用 Bot 自己发出的记录，返回派发状态、实际执行状态和结果回交标记，明确 `not_independently_verified`。不应循环轮询；结果继续通过原有自动回交交付。

## 六、数据兼容与回滚

- 不改变 schema version、插件 ID、原生权限、记忆路径、头像库和现有数据目录。
- 旧数据缺少新字段时正常启动；已有回执仍可读取。记录不要求对应 Bot 永远存在，避免删除成员后把正常团队误判损坏、恢复旧名单。
- 新日志和回执在备份校验中验证形状、引用长度和重复键；不扩大普通备份中的密钥内容。
- 回执保留上限仍为 10,000，不自动丢弃历史编号，避免旧请求在清理后再次执行。长期运行的归档/保留策略留待后续设计。
- 安装候选版前先导出完整备份；原 0.3.86 安装包保留。回退前停止任务，卸载候选插件后导入原包。旧版不展示执行记录，新旧包不要同时启用。

## 七、后续设计门槛

1. 任务依赖：在现有 jobs 增加逻辑任务/attempt 映射；拒绝环和跨任务非法引用，验收前不解锁依赖任务；旧计划继续工作。
2. 成果验收：独立保存 acceptance 与 evidence；文件存在只是一类证据，需绑定本次 workspace/attempt。执行验证命令仍经过宿主权限，不让模型随意扩大验证权限。
3. 恢复：只从已核实的执行凭证恢复；未知副作用暂停等待核对，禁止把重新发提示词称为无损续跑。
4. 效率：先测真实任务延迟/额外模型调用/重复率；使用现有能力库、用量和增量同步。预算缺失价格时显示 unknown，不伪造精确费用。

以上须经独立故障测试和真实宿主验证后再实现和发布，不随本候选包自动开启。

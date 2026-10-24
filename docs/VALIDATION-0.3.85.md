# PI Bot 0.3.85 验证记录

验证日期：2026-10-24（Asia/Shanghai）。测试使用临时团队、模拟模型和隔离浏览器，不读取维护者的真实聊天、密钥或浏览器登录资料。

| 检查 | 结果 |
| --- | --- |
| `npm test` | 148 项通过，0 失败 |
| `npm run check` | 180 个 JavaScript 模块语法检查通过，版本一致 |
| `npm run test:upstream-021-ui` | 通过：公式实时更新、刷新保留草稿、答案提交、五种图表、CSV/SVG 下载、CSV 公式防护、静态 HTML 隔离及主题跟随、侧问取消/关闭、外观/思考、触屏消息工具、面板互斥、用途备注、群聊继续、窄窗口；无 pageerror |
| `npm run test:upstream-ui` | 通过：已有卡片、回答失败重试、表单、多选、确认、群记忆和窄窗口；无 pageerror |
| `npm run test:attachments-ui` | 通过：长文展开、文件粘贴/上传、会话切换、20 张图片与混合文件边界、明暗主题；无 pageerror |
| `npm run test:sidebar` | 通过：共享入口补位、两种加载顺序、重启用、隐藏、卸载清理和空闲观察器；无 pageerror |
| `npm run verify:package` | STORE 包结构、CRC、清单及 214 个源文件逐一比对通过；正式与旧版兼容包一致 |
| `npm run preflight:market` | 已知 PKG012 / SEC003 模式 0 阻断；不等于插件市场完整审核 |
| PI 原生安装器 | PI Desktop host-core 0.20.1，在新临时数据目录安装成功；插件 ID、0.3.85 版本及 214 个安装文件哈希核对通过；临时目录清理 |

记忆保护、群交接队列保存失败回滚/重载/去重、侧问上下文隔离和延迟答案处理、偏好原子保存、密钥用途保留与加密迁移均有自动化覆盖。

浏览器使用本地 Chromium 和真实 renderer 模块，模型返回及宿主操作通过测试桩提供。原生安装检查不等于用户当前 PI 窗口中真实模型的全流程验收。未对用户当前安装执行覆盖或重启；未进行 macOS、Linux、Android 运行验证。测试通过不代表不存在其他缺陷。

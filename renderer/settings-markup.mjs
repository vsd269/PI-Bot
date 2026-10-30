// PI controls follow the upstream BotSettingsForm / GroupSettingsForm cards.
// Values are assigned through DOM properties, never interpolated as HTML.
const copy=(label,hint='')=>`<span class="bt-set-copy"><span class="bt-bs-label">${label}</span>${hint?`<span class="bt-set-hint">${hint}</span>`:''}</span>`;
const card=(title,body,id='')=>`<section class="bt-set-section"${id?` id="${id}"`:''}><h3>${title}</h3><div class="bt-set-card">${body}</div></section>`;
const row=(label,control,hint='',stack=false)=>`<label class="bt-set-row bt-bs-row${stack?' bt-bs-stack':''}">${copy(label,hint)}${control}</label>`;
const input=(id,label,extra='')=>`<input id="${id}" class="bt-bs-input" aria-label="${label}" ${extra}>`;
const area=(id,label,extra='')=>`<textarea id="${id}" class="bt-bs-input bt-bs-area" rows="4" aria-label="${label}" ${extra}></textarea>`;
const link=(id,label,hint='',danger=false)=>`<button type="button" id="${id}" class="bt-set-row bt-bs-row${danger?' bt-bs-danger':''}">${copy(label,hint)}<span class="bt-chevron">›</span></button>`;
const toggle=(id,label,hint='')=>`<div class="bt-set-row bt-bs-row">${copy(label,hint)}<button id="${id}" type="button" class="bt-switch" role="switch" aria-checked="false" aria-label="${label}"><span class="bt-switch-knob"></span></button></div>`;
const footer=kind=>`<div class="bt-set-hint settings-save-status" id="${kind}-save-status" role="status"></div><footer id="${kind}-footer"><button type="button" data-close="${kind}-dialog">取消</button><button type="submit">创建</button></footer>`;
const folder=(kind,label)=>row('文件夹',input(kind+'-work-dir',label,'list="work-directories" placeholder="使用当前 PI 工作区"'),'留空使用当前 PI 工作区；切换目录后新建会话，旧记录保留。',true);
export const botSettingsMarkup=`<dialog id="bot-dialog"><form id="bot-form"><div class="bt-bs">
  <div class="bt-bs-hero"><div id="avatar-anchor" class="bt-avatar-anchor"></div><div class="bt-bs-who"><span id="bs-name" class="bt-bs-name"></span><span id="bs-sub" class="bt-bs-sub"></span></div></div><input id="bot-id" type="hidden"><select id="bot-role" hidden><option value="Worker">执行成员</option><option value="Administrator">管理员</option></select><textarea id="bot-memory" hidden></textarea>
  ${card('个人资料',row('名称',input('bot-name','名称','required maxlength="200"'))+row('标签',input('bot-role-label','职责标签','maxlength="200" placeholder="研究、管理…"'),'可选，显示在名称下方。'))}
  ${card('模型',row('模型','<select id="bot-model" class="bt-bs-input" aria-label="模型"></select>')+row('思考强度','<select id="bot-thinking" class="bt-bs-input" aria-label="思考强度"><option value="off">关闭</option></select>'))}
  ${card('工作文件夹',folder('bot','工作目录'))}
  ${card('隐私',toggle('bot-private','私密 Bot','阻止其他 Bot 通过 PI Bot 工具读取它的聊天和记忆；不能加入群聊或自动共享内容。请先设置独立工作目录。这是插件层隔离，PI Desktop 原生文件、命令和 MCP 工具仍由宿主权限控制。'),'bot-privacy-section')}
  ${card('指令',row('这个 Bot 做什么',area('bot-instructions','职责与操作要求','maxlength="16000" placeholder="这个 Bot 在团队中负责什么…"'),'它在团队中的职责，会作为系统提示的一部分。',true))}
  ${card('能力',link('bot-capabilities','能力配置','为这个 Bot 分配 Skill 与能力包。')+link('bot-mcp','MCP 授权','独立授权本地连接器和工具。')+link('bot-secrets','密钥管理','加密保存此 Bot 的凭据，支持加密迁移。'),'bot-abilities-section')}
  ${card('记忆',link('memory-open','长期记忆','<span id="memory-count">管理记忆条目</span>'),'bot-memory-section')}
  ${card('任务',link('bot-schedules','自动化任务','查看和管理发送给这个 Bot 的定时任务。'),'bot-tasks-section')}
  ${card('主机器人',toggle('bot-main','主机器人','可以管理团队、分派和汇总任务。')+row('私聊执行方式','<select id="bot-agent-mode" class="bt-bs-input" aria-label="主机器人私聊执行方式"><option value="planner">只规划与分派</option><option value="agent">原生 Agent · 可以直接执行</option></select>','群聊仍由管理员规划与汇总；串行／并行设置继续控制执行成员。',true))}
  ${card('侧栏',toggle('bot-pinned','置顶','保持在其他会话上方。')+toggle('bot-hidden','从侧栏隐藏','仍然可以搜索到这个 Bot。'),'bot-sidebar-section')}
  ${card('管理',link('bot-duplicate','复制这个机器人','复制职责与模型，使用新的记忆。')+link('bot-delete','删除机器人','从团队中移除，原生会话保留。',true),'bot-manage-section')}
  ${footer('bot')}
</div></form></dialog>`;
export const roomSettingsMarkup=`<dialog id="room-dialog"><form id="room-form"><div class="bt-bs">
  <div class="bt-bs-hero"><div id="room-avatar"></div><div class="bt-bs-who"><span id="rs-name" class="bt-bs-name"></span><span id="rs-sub" class="bt-bs-sub"></span></div></div><input id="room-id" type="hidden"><select id="room-admin" aria-label="管理员" hidden></select>
  ${card('个人资料',row('名称',input('room-name','群聊名称','maxlength="200" placeholder="使用成员名称"'),'留空时使用群成员的名字。')+row('公告',area('room-notice','群公告','maxlength="16000" placeholder="所有成员发言前都会阅读的共同指令…"'),'每位成员在群里发言前都会阅读。',true))}
  ${card('谁来回复','<div class="bt-set-row bt-bs-row bt-bs-stack"><div class="pi-segment" role="group" aria-label="普通消息回复方式"><button type="button" data-reply="admin">管理员主导</button><button type="button" data-reply="everyone">所有执行成员</button></div><span id="room-reply-hint" class="bt-set-hint"></span><select id="room-reply" hidden><option value="admin">管理员主导</option><option value="everyone">所有执行成员</option></select></div>')}
  ${card('工作文件夹',folder('room','群聊工作目录'))}
  ${card('权限',toggle('room-uniform-permissions','所有成员使用同一权限','主动修改时应用到群内已有会话，由 PI 确认；新会话使用 PI 默认权限，发消息不会自动修改。')+'<div id="room-permission-row">'+row('PI 权限','<select id="room-permission-mode" class="bt-bs-input" aria-label="群聊统一权限"><option value="inherit">跟随 PI 设置</option><option value="ask">操作前询问</option><option value="accept-edits">自动接受编辑</option><option value="auto">自动批准</option></select>','保存的选择不代表新会话已授权。成员新加入或切换模型后，可点击下方按钮手动应用。',true)+'<button type="button" id="room-permission-apply" class="bt-more">应用到当前群聊会话</button></div>')}
  ${card('执行方式',row('运行方式','<select id="room-execution" class="bt-bs-input" aria-label="执行方式"><option value="parallel">并行 · 多 Bot 独立执行</option><option value="serial">串行 · 依次读取前面的结果</option></select>','并行同时执行；串行等待前一位完成，再读取结果。',true))}
  ${card('成员 · <span id="room-member-count">0</span>','<div id="room-members"></div><div id="room-add-picker" hidden></div><button type="button" id="room-add-member" class="bt-set-row bt-bs-row bt-gs-add">＋ 添加成员</button><div class="bt-set-row bt-gs-note"><span id="room-admin-hint" class="bt-set-hint"></span></div>')}
  ${card('侧栏',toggle('room-pinned','置顶','保持在其他会话上方。')+toggle('room-hidden','从侧栏隐藏','搜索仍然可以找到这个群聊。'),'room-sidebar-section')}
  ${card('管理',link('room-delete','删除群聊','只移除这个群聊，机器人保留。',true),'room-manage-section')}
  ${footer('room')}
</div></form></dialog><datalist id="work-directories"></datalist></div>`;

# TeleBox AI 开发规范提示词

## 🏗️ 项目架构概述

TeleBox 是一个现代化的 Telegram Bot 开发框架，基于 Node.js 和 TypeScript 构建，采用插件化架构设计。

### 📁 核心目录结构
```
telebox/
├── src/
│   ├── index.ts              # 应用入口
│   ├── plugin/               # 内置插件
│   └── utils/                # 核心工具库
├── plugins/                  # 用户插件目录
├── assets/                   # 静态资源
└── package.json             # 项目配置
```

## 🔌 插件开发规范

### 基础接口定义
```typescript
interface Plugin {
  command: string[];                                    // 命令列表 (必需)
  description?: string;                                 // 功能描述 (可选)
  cmdHandler: (msg: Api.Message) => Promise<void>;     // 命令处理器 (必需)
  listenMessageHandler?: (msg: Api.Message) => Promise<void>; // 消息监听器 (可选)
}
```

### 📋 开发规范要求

#### 1. 导入规范
```typescript
import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { getEntityWithHash } from "@utils/entityHelpers";
import { Api, TelegramClient } from "telegram";
```

#### 2. 命令前缀系统
- **生产环境**: `.` `。` `$`
- **开发环境**: `!` `！`
- 支持多命令别名: `["cmd", "command", "c"]`

#### 3. 错误处理标准
```typescript
try {
  // 核心逻辑
} catch (error: any) {
  console.error("[插件名] 操作失败:", error);
  await msg.edit({ 
    text: `❌ <b>操作失败:</b> ${error.message}`,
    parseMode: "html"
  });
}
```

#### 4. 消息编辑规范
```typescript
// HTML 转义函数
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

// 消息更新
await msg.edit({
  text: "🔄 处理中...",
  parseMode: "html"
});
```

#### 5. 规范化Plugin类结构（人形标准 + 向后兼容）
```typescript
import { Plugin, PluginParameter, parsePluginArgs, validatePluginArgs } from "@utils/pluginBase";

// 🚨 新标准Plugin结构：完全规范化
const newStylePlugin: Plugin = {
  command: ["cmd", "command"],
  
  // ✅ 必填字段：完整帮助文档
  description: `<b>🛡️ 插件名称 - 版本号</b>

<b>用法:</b> <code>.命令 [参数] [选项]</code>

<b>核心特性:</b>
• 🧠 <b>特性1</b>：详细说明
• ⚡ <b>特性2</b>：详细说明

<b>示例:</b>
• <code>.命令 参数</code> - 基础用法
• <code>.命令 参数 -f</code> - 带选项用法

<b>工作流程:</b>
1️⃣ 步骤1 → 2️⃣ 步骤2 → 3️⃣ 步骤3`,

  // ✅ 可选字段：参数定义（向后兼容）
  parameters: [
    {
      name: "count",
      type: "number",
      required: true,
      description: "要处理的数量",
      example: "10"
    },
    {
      name: "force",
      type: "flag",
      required: false,
      description: "强制模式",
      alias: "-f"
    }
  ],

  cmdHandler: async (msg: Api.Message) => {
    const text = msg.message || "";
    
    // 🚀 新标准：使用参数解析工具（向后兼容）
    const parsed = parsePluginArgs(text, newStylePlugin.parameters);
    
    const client = await getGlobalClient();
    if (!client) {
      await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
      return;
    }
    
    // 帮助显示（仅明确请求时）
    if (parsed.showHelp) {
      await msg.edit({
        text: newStylePlugin.description,
        parseMode: "html",
        linkPreview: false
      });
      return;
    }
    
    // 🔍 自动参数验证（基于parameters定义）
    const validationError = validatePluginArgs(parsed, newStylePlugin.parameters);
    if (validationError) {
      await msg.edit({ 
        text: `❌ <b>参数错误:</b> ${validationError}\n\n💡 使用 <code>.cmd help</code> 查看帮助`, 
        parseMode: "html" 
      });
      return;
    }
    
    // 🎯 业务逻辑：获取解析后的参数和标志
    const count = parseInt(parsed.args[0]);
    const forceMode = parsed.flags.force || false;
    
    console.log(`处理数量: ${count}, 强制模式: ${forceMode}`);
    // 其他业务逻辑...
  }
};

// 📦 向后兼容：旧版插件结构仍然支持
const oldStylePlugin: Plugin = {
  command: ["old"],
  description: "旧版插件仍然正常工作", // 现在必填
  // parameters 字段可选，不影响现有插件
  
  cmdHandler: async (msg: Api.Message) => {
    // 旧版手工解析方式仍然有效
    const args = msg.message.trim().split(/\s+/);
    // ... 原有逻辑不变
  }
}
};
```

#### 6. 向后兼容策略
**🔄 确保旧插件无缝运行：**

- **字段兼容**: `description` 和 `parameters` 都是可选字段，不强制现有插件修改
- **渐进升级**: 新插件推荐使用完整参数系统，旧插件可逐步迁移
- **参数解析**: 提供新工具函数，但旧的手工解析方式仍然有效
- **帮助系统**: 自动检测并使用 `parameters` 字段，无定义时使用传统模式

#### 7. 帮助文档触发方式（严格标准）
**⚠️ 强制规范：所有插件必须严格遵循以下模式**

- **外部调用**: `.help 插件名` - 通过帮助系统
- **内部调用**: `.插件名 help`、`.插件名 h` - 仅在明确请求时显示
- **参数错误**: 无参数或错误参数时显示错误提示，引导用户使用 `.插件名 help`
- **禁止行为**: 绝对不允许无参数时自动显示帮助文档

#### 8. 完整参数系统实现
```typescript
// 🎯 使用新参数系统的完整示例
import { Plugin, parsePluginArgs, validatePluginArgs } from "@utils/pluginBase";

const advancedPlugin: Plugin = {
  command: ["demo"],
  description: `<b>🎮 高级参数演示插件</b>

<b>用法:</b> <code>.demo &lt;数量&gt; [选项]</code>

<b>特性:</b>
• 🔍 自动参数验证
• 🛡️ 类型安全检查  
• 📝 自动帮助生成`,

  parameters: [
    {
      name: "count",
      type: "number", 
      required: true,
      description: "处理数量",
      example: "10"
    },
    {
      name: "force",
      type: "flag",
      required: false, 
      description: "强制模式",
      alias: "-f"
    },
    {
      name: "output",
      type: "string",
      required: false,
      description: "输出格式",
      example: "json"
    }
  ],

  cmdHandler: async (msg: Api.Message) => {
    const text = msg.message || "";
    
    // 🚀 一行解析所有参数
    const parsed = parsePluginArgs(text, advancedPlugin.parameters);
    
    const client = await getGlobalClient();
    if (!client) {
      await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
      return;
    }
    
    if (parsed.showHelp) {
      await msg.edit({
        text: advancedPlugin.description,
        parseMode: "html", 
        linkPreview: false
      });
      return;
    }
    
    // 🔍 自动验证（零手工代码）
    const error = validatePluginArgs(parsed, advancedPlugin.parameters);
    if (error) {
      await msg.edit({ 
        text: `❌ <b>参数错误:</b> ${error}\n\n💡 使用 <code>.demo help</code> 查看帮助`,
        parseMode: "html" 
      });
      return;
    }
    
    // 🎯 直接使用解析结果
    const count = parseInt(parsed.args[0]);
    const forceMode = parsed.flags.force;
    const outputFormat = parsed.args[1] || "default";
    
    await msg.edit({
      text: `✅ 参数解析成功:\\n数量: ${count}\\n强制: ${forceMode}\\n格式: ${outputFormat}`,
      parseMode: "html"
    });
  }
};
```

#### 9. 两种开发模式（向后兼容）

##### 🆕 推荐模式：使用参数系统
```typescript
// 新插件推荐使用完整参数系统
import { Plugin, parsePluginArgs, validatePluginArgs } from "@utils/pluginBase";

const modernPlugin: Plugin = {
  command: ["modern"],
  description: "完整描述内容", // 推荐填写
  parameters: [ /* 参数定义 */ ], // 可选但推荐
  
  cmdHandler: async (msg: Api.Message) => {
    const text = msg.message || "";
    const parsed = parsePluginArgs(text, modernPlugin.parameters);
    
    const client = await getGlobalClient();
    if (!client) {
      await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
      return;
    }
    
    if (parsed.showHelp) {
      await msg.edit({
        text: modernPlugin.description,
        parseMode: "html",
        linkPreview: false  
      });
      return;
    }
    
    // 自动验证
    const error = validatePluginArgs(parsed, modernPlugin.parameters);
    if (error) {
      await msg.edit({ 
        text: `❌ <b>参数错误:</b> ${error}\n\n💡 使用 <code>.modern help</code> 查看帮助`,
        parseMode: "html" 
      });
      return;
    }
    
    // 直接使用解析结果
    const arg1 = parsed.args[0];
    const flagValue = parsed.flags.flagName;
  }
};
```

##### 🔄 兼容模式：手工解析（现有插件）
```typescript
// 现有插件完全不需要修改，零改动运行
const legacyPlugin: Plugin = {
  command: ["legacy"],
  // description 可选，旧插件无需添加
  // parameters 可选，旧插件无需添加
  
  cmdHandler: async (msg: Api.Message) => {
    // 原有的手工解析逻辑完全不变
    const args = msg.message.trim().split(/\s+/);
    let showHelp = false;
    
    const filteredArgs = args.slice(1).filter(arg => {
      if (arg === 'help' || arg === 'h') {
        showHelp = true;
        return false;
      }
      return true;
    });
    
    // 原有逻辑保持不变...
  }
};
```

#### 8. 🚨 严格通用规范强制执行标准

**所有插件必须100%遵循以下规范，无例外：**

### 📋 强制检查清单（零容忍）

#### ✅ **帮助文档规范（强制）**
- [ ] ✋ **禁止**: `cmdHandler` 中硬编码帮助文本
- [ ] ✋ **禁止**: 无参数时自动显示帮助
- [ ] ✅ **必须**: `description` 字段包含完整帮助内容
- [ ] ✅ **必须**: 使用 HTML 格式 `<b>`, `<code>` 标签
- [ ] ✅ **必须**: 包含表情符号和清晰的用法示例

#### ✅ **参数处理规范（强制）**
- [ ] ✅ **必须**: 使用统一的 `filteredArgs` 过滤模式
- [ ] ✅ **必须**: `help`/`h` 检查优先级最高
- [ ] ✅ **必须**: 客户端验证在帮助检查之后
- [ ] ✋ **禁止**: 跳过参数验证步骤
- [ ] ✋ **禁止**: 使用不一致的错误消息格式

#### ✅ **错误处理规范（强制）**
- [ ] ✅ **必须**: 所有错误消息以 `❌ <b>` 开头
- [ ] ✅ **必须**: 提供具体错误说明和解决方案
- [ ] ✅ **必须**: 使用 `parseMode: "html"`
- [ ] ✅ **必须**: 错误时引导 `.插件名 help`

#### ✅ **代码结构规范（强制）**
- [ ] ✅ **必须**: 遵循5步处理流程（解析→客户端→帮助→验证→业务）
- [ ] ✅ **必须**: 使用 `getGlobalClient()` 获取客户端
- [ ] ✅ **必须**: TypeScript 严格类型定义
- [ ] ✅ **必须**: 统一的变量命名约定

### 🔍 违规检测模式
**以下模式视为违规，必须立即修复：**

```typescript
// ❌ 违规模式1: 无参数自动显示帮助
if (!args[0]) {
  await msg.edit({ text: "帮助内容..." });
}

// ❌ 违规模式2: 硬编码帮助文本
if (args[0] === 'help') {
  await msg.edit({ text: "硬编码的帮助文本..." });
}

// ❌ 违规模式3: 不一致的错误格式
await msg.edit({ text: "错误：请提供参数" });

// ❌ 违规模式4: 跳过客户端验证
const args = msg.message.split(' ');
// 直接处理业务逻辑...
```

### ✅ 标准合规模式
```typescript
// ✅ 标准模式: 严格按模板执行
const text = msg.message || "";
const args = text.trim().split(/\s+/);
let showHelp = false;

const filteredArgs = args.slice(1).filter(arg => {
  if (arg === 'help' || arg === 'h') {
    showHelp = true;
    return false;
  }
  return true;
});

const client = await getGlobalClient();
if (!client) {
  await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
  return;
}

if (showHelp) {
  await msg.edit({
    text: pluginName.description!,
    parseMode: "html",
    linkPreview: false
  });
  return;
}

if (!filteredArgs[0]) {
  await msg.edit({ 
    text: "❌ <b>参数错误:</b> [错误说明]\n\n💡 使用 <code>.插件名 help</code> 查看帮助", 
    parseMode: "html" 
  });
  return;
}
```

## 🛠️ 核心工具函数

### 客户端管理
```typescript
// 获取全局客户端实例
const client = await getGlobalClient();
if (!client) {
  await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
  return;
}
```

### 实体处理
```typescript
// 安全获取实体 (自动处理 access hash)
const chatEntity = await getEntityWithHash(client, chatId);

// 解析实体ID
const entityId = parseEntityId(input, currentChatId);
```

### 路径管理
```typescript
// 在 assets 目录创建子目录
const pluginDir = createDirectoryInAssets("plugin_name");

// 在 temp 目录创建临时目录
const tempDir = createDirectoryInTemp("temp_data");
```

### 数据库操作
```typescript
import Database from "better-sqlite3";

// 初始化数据库
const db = new Database(path.join(createDirectoryInAssets("plugin"), "data.db"));

// 创建表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS table_name (
    id INTEGER PRIMARY KEY,
    field TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
```

## 📝 代码模式与最佳实践

### 0. 帮助文档格式规范
```typescript
// ✅ 正确: 简洁的description，让help.ts自动添加格式
const plugin: Plugin = {
  command: ["example"],
  description: `示例插件功能说明

参数说明:
• [参数1] - 参数说明
• -f - 选项说明

核心特性:
• 特性1
• 特性2

示例:
• .example 123 - 示例用法

注意事项:
• 重要提醒`,
  
  cmdHandler: async (msg) => {
    // help.ts会自动添加:
    // 🔧 EXAMPLE (标题)
    // 📝 功能描述: (前缀)
    // 🏷️ 命令别名: .example
    // ⚡ 使用方法: .example [参数]
    // 💡 提示: 使用 .help 查看所有命令
  }
};

// ❌ 错误: 重复格式化导致显示混乱
const badPlugin: Plugin = {
  description: `🔧 插件标题  // ← 重复! help.ts已自动添加
  
用法: .example [参数]  // ← 重复! help.ts已自动添加

📝 功能描述:  // ← 重复! help.ts已自动添加
插件说明`
};
```

**帮助系统统一规范:**
- ✅ `description` 只包含纯文本说明，无HTML标签和重复格式
- ✅ `help.ts` 自动处理标题、前缀、命令别名、使用方法
- ✅ `.help [插件]` 和 `.[插件] help` 显示完全一致
- ✅ 参数和示例使用简洁文本，避免 `<code>` 标签冲突

### 1. 参数解析模式
```typescript
const text = msg.message || "";
const args = text.trim().split(/\s+/);

// 解析选项标志
let forceMode = false;
const filteredArgs = args.slice(1).filter(arg => {
  if (arg === '-f') {
    forceMode = true;
    return false;
  }
  return true;
});

const countArg = filteredArgs[0];
```

### 2. 进度条实现
```typescript
function generateProgressBar(percentage: number, length: number = 20): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `🔄 <b>进度条:</b> [${bar}] ${percentage}%`;
}

// 使用示例
await msg.edit({ 
  text: `📦 正在处理...\n\n${generateProgressBar(progress)}`,
  parseMode: "html"
});
```

### 3. 批量操作模式
```typescript
const BATCH_SIZE = 50;
const RATE_LIMIT_DELAY = 2000;

for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  
  try {
    // 批量处理
    await processBatch(batch);
    
    // 更新进度
    const progress = Math.round(((i + batch.length) / items.length) * 100);
    await updateProgress(progress);
    
    // 避免 API 限制
    await sleep(RATE_LIMIT_DELAY);
  } catch (error: any) {
    if (error.message?.includes("FLOOD_WAIT")) {
      const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
      await sleep(waitTime * 1000);
      i -= BATCH_SIZE; // 重试当前批次
    }
  }
}
```

### 4. API 限制处理
```typescript
async function handleFloodWait<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      if (error.message?.includes("FLOOD_WAIT")) {
        const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
        console.log(`[Plugin] 触发API限制，休眠 ${waitTime} 秒...`);
        await sleep((waitTime + 1) * 1000);
        continue;
      }
      throw error;
    }
  }
  throw new Error("超过最大重试次数");
}
```

### 5. 数据库模式
```typescript
class PluginDB {
  private db: Database.Database;

  constructor() {
    this.db = new Database(path.join(createDirectoryInAssets("plugin"), "plugin.db"));
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public set(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET 
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(key, value);
  }

  public get(key: string): string | null {
    const stmt = this.db.prepare(`SELECT value FROM settings WHERE key = ?`);
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value || null;
  }

  public close(): void {
    this.db.close();
  }
}
```

## 🎨 UI/UX 设计规范

### 1. 消息格式化标准
```typescript
const messageTemplate = `<b>🔧 插件标题</b>

<b>状态:</b> ✅ 成功 / ❌ 失败 / 🔄 处理中

<b>详细信息:</b>
• 项目1: 值1
• 项目2: 值2

<b>操作结果:</b>
✅ 成功项目
❌ 失败项目

💡 <b>提示:</b> 额外说明信息`;
```

### 2. 图标使用规范
- ✅ 成功操作
- ❌ 错误/失败  
- 🔄 进行中
- 💡 提示信息
- 📊 统计数据
- 🔧 配置/设置
- 📦 安装/包管理
- 🛡️ 安全/权限
- 🌐 网络相关
- 📁 文件操作

### 3. 交互设计模式
```typescript
// 渐进式信息展示
await msg.edit({ text: "🔄 初始化..." });
await msg.edit({ text: "🔍 搜索中..." });
await msg.edit({ text: "📊 处理数据..." });
await msg.edit({ text: "✅ 完成!" });

// 删除命令消息 (保持聊天整洁)
try {
  await client.deleteMessages(chatEntity, [msg.id], { revoke: true });
} catch {}
```

## 🔐 安全与权限

### 权限检查模式
```typescript
import { SudoDB } from "@utils/sudoDB";

async function checkPermission(userId: number): Promise<boolean> {
  const sudoDB = new SudoDB();
  const users = sudoDB.ls().map(user => user.uid);
  sudoDB.close();
  return users.includes(userId);
}
```

### 频道权限检测
```typescript
const isChannel = chatEntity.className === 'Channel';
if (isChannel) {
  const me = await client.getMe();
  const participant = await client.invoke(
    new Api.channels.GetParticipant({
      channel: chatEntity,
      participant: me.id
    })
  );
  
  const isAdmin = participant.participant.className === 'ChannelParticipantAdmin' || 
                  participant.participant.className === 'ChannelParticipantCreator';
}
```

## 🧪 测试与调试

### 日志记录规范
```typescript
console.log(`[插件名] 操作开始: ${operationName}`);
console.error(`[插件名] 错误详情:`, error);
console.log(`[插件名] 完成统计: 成功 ${successCount}, 失败 ${failedCount}`);
```

### 开发调试模式
```typescript
const isDev = process.env.NODE_ENV === "development";
if (isDev) {
  console.log("[DEBUG] 调试信息:", debugData);
}
```

## 📋 必须遵循的开发清单

### ✅ 代码质量要求
- [ ] 使用 TypeScript 严格类型检查
- [ ] 实现完整的错误处理机制
- [ ] 提供详细的帮助文档
- [ ] 使用 async/await 异步模式
- [ ] 遵循 HTML 安全渲染规范

### ✅ 用户体验要求
- [ ] 提供实时进度反馈
- [ ] 使用统一的图标和格式
- [ ] 支持多语言提示 (中英文)
- [ ] 删除命令消息保持整洁
- [ ] 友好的错误信息展示

### ✅ 性能优化要求
- [ ] 实现批量操作避免API限制
- [ ] 使用智能延迟控制请求频率
- [ ] 合理使用缓存机制
- [ ] 处理 FLOOD_WAIT 错误重试

### ✅ 安全规范要求
- [ ] 验证用户权限
- [ ] 安全的HTML渲染
- [ ] 避免敏感信息泄露
- [ ] 实现操作审计日志

## 🚀 标准插件模板

```typescript
import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { getEntityWithHash } from "@utils/entityHelpers";
import { createDirectoryInAssets } from "@utils/pathHelpers";
import { Api, TelegramClient } from "telegram";
import Database from "better-sqlite3";
import path from "path";

// HTML转义工具
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

// 延迟工具
const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

// 插件实现
const pluginTemplate: Plugin = {
  command: ["cmd", "command"],
  description: `插件功能描述
- 功能点1
- 功能点2
- 支持的操作类型`,
  
  cmdHandler: async (msg: Api.Message) => {
    const client = await getGlobalClient();
    if (!client) {
      await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
      return;
    }

    const text = msg.message || "";
    const args = text.trim().split(/\s+/);
    
    // 参数解析
    if (args.length < 2) {
      const helpMsg = `<b>🔧 插件帮助</b>

<b>用法:</b> <code>.cmd [参数]</code>

<b>示例:</b>
• <code>.cmd example</code> - 示例用法`;
      
      await msg.edit({
        text: helpMsg,
        parseMode: "html",
        linkPreview: false
      });
      return;
    }

    try {
      // 删除命令消息
      try {
        await client.deleteMessages(msg.peerId, [msg.id], { revoke: true });
      } catch {}

      // 核心逻辑实现
      await msg.edit({ text: "🔄 处理中...", parseMode: "html" });
      
      // 具体业务逻辑
      const result = await processCommand(args[1]);
      
      await msg.edit({ 
        text: `✅ <b>操作完成</b>\n\n📊 结果: ${htmlEscape(result)}`,
        parseMode: "html"
      });
      
    } catch (error: any) {
      console.error("[PluginName] 操作失败:", error);
      await msg.edit({ 
        text: `❌ <b>操作失败:</b> ${htmlEscape(error.message)}`,
        parseMode: "html"
      });
    }
  },

  // 可选: 消息监听器
  listenMessageHandler: async (msg: Api.Message) => {
    // 全局消息监听逻辑
  }
};

async function processCommand(param: string): Promise<string> {
  // 具体业务逻辑实现
  return "处理结果";
}

export default pluginTemplate;
```

## 🔧 常用工具函数库

### 文件操作
```typescript
import * as fs from "fs";
import * as path from "path";

// 确保目录存在
const ensureDir = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};
```

### API 调用封装
```typescript
async function safeApiCall<T>(
  operation: () => Promise<T>,
  errorMsg: string = "API调用失败"
): Promise<T | null> {
  try {
    return await operation();
  } catch (error: any) {
    if (error.message?.includes("FLOOD_WAIT")) {
      const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
      console.log(`[API] FloodWait ${waitTime}s`);
      await sleep((waitTime + 1) * 1000);
      return await safeApiCall(operation, errorMsg);
    }
    console.error(`[API] ${errorMsg}:`, error);
    return null;
  }
}
```

### 配置管理
```typescript
interface PluginConfig {
  [key: string]: any;
}

class ConfigManager {
  private configPath: string;

  constructor(pluginName: string) {
    this.configPath = path.join(createDirectoryInAssets(pluginName), "config.json");
  }

  load(): PluginConfig {
    if (!fs.existsSync(this.configPath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(this.configPath, "utf-8"));
  }

  save(config: PluginConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }
}
```

## 🎯 开发检查清单

使用此清单确保插件符合 TeleBox 标准:

### 📋 基础结构
- [ ] 实现 Plugin 接口
- [ ] 导入必要的工具函数
- [ ] 定义清晰的命令数组
- [ ] 提供详细的 description

### 📋 功能实现
- [ ] 参数验证和解析
- [ ] 完整的帮助文档
- [ ] 渐进式用户反馈
- [ ] 错误处理和重试机制

### 📋 用户体验
- [ ] HTML 格式化消息
- [ ] 进度条或状态指示
- [ ] 清理命令消息
- [ ] 友好的错误提示

### 📋 性能与安全
- [ ] API 限制处理
- [ ] 权限验证
- [ ] 资源清理
- [ ] 日志记录

## 💡 AI 开发助手指南

当你为 TeleBox 开发插件时，请严格遵循以上规范:

1. **首先** 阅读并理解项目架构
2. **然后** 参考现有插件实现模式
3. **确保** 遵循所有代码质量要求
4. **测试** 在不同场景下的功能表现
5. **优化** 用户体验和性能表现

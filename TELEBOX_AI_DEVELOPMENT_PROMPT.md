# TeleBox AI 开发规范

> 📌 **版本**: 2.1 | **更新日期**: 2025-01-09 | **适用于**: TeleBox 插件开发

## 🎯 快速导航

| 章节 | 说明 | 适合人群 |
|------|------|----------|
| **[项目概述](#项目概述)** | 架构介绍和目录结构 | 📖 了解项目 |
| **[快速上手](#快速上手)** | 5分钟创建第一个插件 | 🆕 新手开发者 |
| **[核心依赖](#核心依赖)** | 内部模块和工具函数 | 📚 开发参考 |
| **[开发规范](#开发规范)** | 必须遵循的标准 | ⚠️ 所有开发者 |
| **[插件模板](#插件模板)** | 标准实现模板 | 🚀 快速开发 |
| **[检查清单](#检查清单)** | 开发质量保证 | 🔧 代码审查 |

---

## 项目概述

TeleBox 是基于 Telegram 的 TypeScript 插件化机器人框架，支持热重载、权限管理、定时任务和多种数据存储。

### 🏗️ 核心架构
- **插件系统** - 模块化设计，支持热重载
- **权限管理** - sudo系统和命令转发
- **定时任务** - cron表达式调度
- **数据存储** - SQLite + JSON(lowdb)
- **实体处理** - 安全的Telegram实体操作

### 📁 核心目录
```
telebox/
├── src/
│   ├── utils/          # 核心工具模块
│   ├── plugin/         # 内置插件(tpm等)
│   ├── hook/           # 钩子系统
│   └── index.ts        # 入口文件
├── plugins/            # 用户插件目录
├── assets/             # 资源文件目录
├── temp/               # 临时文件目录
├── logs/               # 日志目录
└── config.json         # API配置
```

### 🔧 关键工具模块
- **pluginBase.ts** - 插件基类和接口定义
- **globalClient.ts** - Telegram客户端管理
- **pluginManager.ts** - 插件加载和命令处理
- **pathHelpers.ts** - 目录创建工具
- **entityHelpers.ts** - 实体安全操作
- **数据库模块** - aliasDB, sudoDB, sureDB等

---

## 快速上手

### 🚀 5分钟创建第一个插件

在 `plugins/` 目录创建 `hello.ts`：

```typescript
import { Plugin } from "@utils/pluginBase";
import { Api } from "telegram";
import { getPrefixes } from "@utils/pluginManager";

// 必需工具函数
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

const prefixes = getPrefixes();
const mainPrefix = prefixes[0];

class HelloPlugin extends Plugin {
  description = `👋 Hello World\n\n使用: <code>${mainPrefix}hello [名字]</code>`;
  
  cmdHandlers = {
    hello: async (msg: Api.Message) => {
      const args = msg.text?.split(' ') || [];
      const name = args[1] || 'World';
      
      await msg.edit({ 
        text: `✨ Hello, <b>${htmlEscape(name)}</b>!`, 
        parseMode: "html" 
      });
    }
  };
}

export default new HelloPlugin();
```

**使用步骤：**
1. 发送 `.reload` 重载插件
2. 发送 `.hello TeleBox` 测试

---

## 核心依赖

### 📦 内部模块清单

**必须优先使用项目已有的内部模块，不要重新实现或引入外部库：**

| 模块 | 路径 | 功能说明 |
|------|------|----------|
| **Plugin基类** | `@utils/pluginBase` | 插件基类定义 |
| **客户端管理** | `@utils/globalClient` | 全局Telegram客户端 |
| **插件管理** | `@utils/pluginManager` | 命令处理和前缀管理 |
| **路径工具** | `@utils/pathHelpers` | 目录创建和管理 |
| **实体处理** | `@utils/entityHelpers` | 安全的实体操作 |
| **别名系统** | `@utils/aliasDB` | 命令别名数据库 |
| **权限系统** | `@utils/sudoDB` | sudo用户管理 |
| **确认系统** | `@utils/sureDB` | 操作确认管理 |
| **日志系统** | `@utils/sendLogDB` | 发送日志记录 |
| **定时任务** | `@utils/cronManager` | cron任务管理 |
| **对话管理** | `@utils/conversation` | 对话状态管理 |
| **TL对象** | `@utils/tlRevive` | TL对象序列化 |
| **依赖安装** | `@utils/npm_install` | 动态npm包安装 |
| **API配置** | `@utils/apiConfig` | API配置管理 |
| **登录管理** | `@utils/loginManager` | 登录状态管理 |

### 📦 标准导入模板

⚠️ **重要提示**：
- 插件文件位于 `plugins/` 目录时，使用 `@utils/` 别名路径
- 部分旧插件可能使用相对路径 `../src/utils/`，但推荐使用别名路径

```typescript
// 核心插件系统（必需）
import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { getPrefixes } from "@utils/pluginManager";

// Telegram API
import { Api } from "telegram";

// 路径和实体工具
import { createDirectoryInAssets, createDirectoryInTemp } from "@utils/pathHelpers";
import { getEntityWithHash, parseEntityId, safeForwardMessage } from "@utils/entityHelpers";

// 数据库（按需选择）
import { AliasDB } from "@utils/aliasDB";
import { SudoDB } from "@utils/sudoDB";
import { SureDB } from "@utils/sureDB";
import { SendLogDB } from "@utils/sendLogDB";
import Database from "better-sqlite3";

// 已内置的常用库（直接导入，无需npm_install）
import axios from "axios";
import _ from "lodash";
import dayjs from "dayjs";
import sharp from "sharp";
import * as cron from "cron";
import { JSONFilePreset } from "lowdb/node";

// 必需工具函数
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

const prefixes = getPrefixes();
const mainPrefix = prefixes[0];
```

### 🔧 核心工具函数

```typescript
// 文件上传
import { CustomFile } from "telegram/client/uploads.js";
const file = new CustomFile("filename.ext", buffer.length, "", buffer);
await client.sendFile(msg.peerId, { file, caption: "说明" });

// 获取回复消息
const replied = await msg.getReplyMessage();

// 下载媒体
const buffer = await msg.downloadMedia();

// 批量获取消息
const messages = await client.getMessages(msg.peerId, { limit: 10 });

// 实体格式化
const entity = await getEntityWithHash(client, userId);
```

### 🛠️ 常用操作示例

```typescript
// 客户端检查
const client = await getGlobalClient();
if (!client) {
  await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
  return;
}

// 创建插件目录
const pluginDir = createDirectoryInAssets("plugin_name");
const tempDir = createDirectoryInTemp("plugin_name");

// 数据库初始化
const dbPath = path.join(pluginDir, "data.db");
const db = new Database(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY)`);

// JSON数据库
const configPath = path.join(pluginDir, "config.json");
const db = await JSONFilePreset<ConfigType>(configPath, defaultConfig);

// 权限检查
const sudoDB = new SudoDB();
const isSudo = await sudoDB.isSudoUser(msg.senderId!.toString());

// 定时任务注册
import { cronManager } from "@utils/cronManager";
cronTasks = {
  daily: {
    schedule: "0 0 * * *",
    handler: async () => { /* 任务逻辑 */ }
  }
};
```

### ⚠️ 避免重复引入

以下功能已在内部模块中实现，**不要重新实现或引入外部库**：

- **路径管理** - 使用 `@utils/pathHelpers`
- **客户端管理** - 使用 `@utils/globalClient`
- **权限系统** - 使用 `@utils/sudoDB`
- **别名系统** - 使用 `@utils/aliasDB`
- **定时任务** - 使用 `@utils/cronManager`
- **实体处理** - 使用 `@utils/entityHelpers`
- **对话管理** - 使用 `@utils/conversation`
- **TL序列化** - 使用 `@utils/tlRevive`
- **常用包** - axios、sharp、lodash、dayjs、cron等已内置


## 开发规范

### 📜 必须遵循的标准

1. **参数解析** - 使用 acron.ts 模式，无参数时显示错误提示
2. **帮助显示** - 仅在明确请求 help/h 时显示
3. **HTML转义** - 所有用户输入必须转义
4. **错误处理** - 所有异步操作使用 try-catch
5. **命令前缀** - 使用 `getPrefixes()` 动态获取

### 🛠️ 标准插件结构

```typescript
import { Plugin } from "@utils/pluginBase";
import { Api } from "telegram";
import { getGlobalClient } from "@utils/globalClient";
import { getPrefixes } from "@utils/pluginManager";

// 必需工具函数
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

const prefixes = getPrefixes();
const mainPrefix = prefixes[0];

class YourPlugin extends Plugin {
  description = `🚀 插件名称\n\n使用: <code>${mainPrefix}cmd [param]</code>`;
  
  cmdHandlers = {
    cmd: async (msg: Api.Message) => {
      const client = await getGlobalClient();
      if (!client) {
        await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
        return;
      }

      // acron.ts 模式参数解析
      const lines = msg.text?.trim()?.split(/\r?\n/g) || [];
      const parts = lines?.[0]?.split(/\s+/) || [];
      const [, ...args] = parts;
      const sub = (args[0] || "").toLowerCase();

      try {
        // 无参数时显示错误提示
        if (!sub) {
          await msg.edit({
            text: `❌ <b>参数不足</b>\n\n💡 使用 <code>${mainPrefix}cmd help</code> 查看帮助`,
            parseMode: "html"
          });
          return;
        }

        // 明确请求帮助时才显示
        if (sub === "help" || sub === "h") {
          await msg.edit({ text: this.description, parseMode: "html" });
          return;
        }

        // 业务逻辑
        await msg.edit({ text: "🔄 处理中...", parseMode: "html" });
        // ...
        await msg.edit({ text: "✅ 完成", parseMode: "html" });
        
      } catch (error: any) {
        await msg.edit({ 
          text: `❌ <b>操作失败:</b> ${htmlEscape(error.message)}`,
          parseMode: "html" 
        });
      }
    }
  };
}

export default new YourPlugin();
```

### 🎨 UI/UX 设计规范

#### 消息格式化
- **状态图标**: 🔄 处理中 → ✅ 成功 / ❌ 失败
- **HTML标签**: `<b>` 强调、`<code>` 命令、`<pre>` 代码块
- **错误格式**: `❌ <b>错误:</b> 详情`

#### 帮助文档模板
```typescript
const help_text = `🚀 <b>插件名称</b>

<b>📝 功能:</b>
• 功能描述1
• 功能描述2

<b>🔧 使用:</b>
• <code>${mainPrefix}cmd param</code> - 说明

<b>💡 示例:</b>
• <code>${mainPrefix}cmd test</code>`;
```

### 🔒 安全规范

```typescript
// 权限检查
import { SudoDB } from "@utils/sudoDB";
const sudoDB = new SudoDB();
const isSudo = await sudoDB.isSudoUser(msg.senderId!.toString());

// 输入验证（必须）
const userInput = args.join(" ");
const safeInput = htmlEscape(userInput);
```

### 💾 数据存储

```typescript
// SQLite 数据库
import Database from "better-sqlite3";
const dbPath = path.join(createDirectoryInAssets("plugin"), "data.db");
const db = new Database(dbPath);

// JSON 数据库
import { JSONFilePreset } from "lowdb/node";
const configPath = path.join(pluginDir, "config.json");
const config = await JSONFilePreset(configPath, { enabled: true });

// 内置数据库
const aliasDB = new AliasDB();
const sudoDB = new SudoDB();
```

### 📋 已内置的常用包

**以下包已在 package.json 中配置，直接导入使用，无需 npm_install()：**

```typescript
// 网络请求
import axios from "axios";

// 工具库
import _ from "lodash";
import dayjs from "dayjs";

// 图像处理
import sharp from "sharp";

// 数据库
import Database from "better-sqlite3";
import { JSONFilePreset } from "lowdb/node";

// 定时任务
import * as cron from "cron";

// 文件下载
import * as download from "download";

// 中文转换
import * as OpenCC from "opencc-js";

// 翻译API
import translate from "@vitalets/google-translate-api";

// YouTube相关
import { Innertube } from "youtubei.js";
import ytdl from "@distube/ytdl-core";
```

### 🌐 网络请求

```typescript
// 使用已内置的 axios
const response = await axios.get(url, {
  timeout: 10000,
  headers: { 'User-Agent': 'TeleBox/1.0' }
});

// 仅特殊包才使用 npm_install
// import { npm_install } from "@utils/npm_install";
// npm_install("special-package");
```

---

## 插件模板

### 🚀 完整模板示例

```typescript
import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { getPrefixes } from "@utils/pluginManager";
import { createDirectoryInAssets } from "@utils/pathHelpers";
import { Api } from "telegram";
import axios from "axios";
import Database from "better-sqlite3";
import path from "path";

// 必需工具函数
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

const prefixes = getPrefixes();
const mainPrefix = prefixes[0];

const help_text = `🚀 <b>示例插件</b>

<b>📝 功能:</b>
• 数据查询和处理
• 统计信息显示

<b>🔧 使用:</b>
• <code>${mainPrefix}demo query &lt;关键词&gt;</code> - 查询数据
• <code>${mainPrefix}demo stats</code> - 查看统计
• <code>${mainPrefix}demo help</code> - 显示帮助`;

class DemoPlugin extends Plugin {
  description = help_text;
  
  cmdHandlers = {
    demo: async (msg: Api.Message) => {
      const client = await getGlobalClient();
      if (!client) {
        await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
        return;
      }

      // acron.ts 模式参数解析
      const lines = msg.text?.trim()?.split(/\r?\n/g) || [];
      const parts = lines?.[0]?.split(/\s+/) || [];
      const [, ...args] = parts;
      const sub = (args[0] || "").toLowerCase();

      try {
        // 无参数时显示错误提示
        if (!sub) {
          await msg.edit({
            text: `❌ <b>参数不足</b>\n\n💡 使用 <code>${mainPrefix}demo help</code> 查看帮助`,
            parseMode: "html"
          });
          return;
        }

        // 明确请求帮助时才显示
        if (sub === "help" || sub === "h") {
          await msg.edit({ text: help_text, parseMode: "html" });
          return;
        }

        // 查询功能
        if (sub === "query") {
          const keyword = args.slice(1).join(" ").trim();
          if (!keyword) {
            await msg.edit({
              text: `❌ <b>查询关键词不能为空</b>`,
              parseMode: "html"
            });
            return;
          }

          await msg.edit({ text: "🔍 正在查询...", parseMode: "html" });
          
          // 模拟API调用
          const result = `✅ <b>查询结果</b>\n\n<b>关键词:</b> <code>${htmlEscape(keyword)}</code>\n<b>结果数:</b> 42`;
          await msg.edit({ text: result, parseMode: "html" });
          return;
        }

        // 统计功能
        if (sub === "stats") {
          await msg.edit({ text: "📈 正在生成统计...", parseMode: "html" });
          
          const stats = `📈 <b>统计信息</b>\n\n<b>总计:</b> 1,234\n<b>今日:</b> 56\n<b>活跃:</b> 789`;
          await msg.edit({ text: stats, parseMode: "html" });
          return;
        }

        // 未知子命令
        await msg.edit({
          text: `❌ <b>未知命令:</b> <code>${htmlEscape(sub)}</code>\n\n💡 使用 <code>${mainPrefix}demo help</code> 查看帮助`,
          parseMode: "html"
        });

      } catch (error: any) {
        console.error("[demo] 插件执行失败:", error);
        await msg.edit({
          text: `❌ <b>插件执行失败:</b> ${htmlEscape(error.message)}`,
          parseMode: "html"
        });
      }
    }
  };

  // 可选：消息监听器
  listenMessageHandler = async (msg: Api.Message) => {
    if (!msg.text || !msg.text.includes("demo")) return;
    
    try {
      console.log("检测到demo关键词:", msg.text);
    } catch (error) {
      console.error("消息监听处理失败:", error);
    }
  };

  // 可选：定时任务
  cronTasks = {
    dailyReport: {
      schedule: "0 9 * * *", // 每天上午9点
      handler: async () => {
        try {
          const client = await getGlobalClient();
          if (!client) return;
          
          await client.sendMessage("me", {
            message: "📈 每日报告已生成",
            parseMode: "html"
          });
          
          console.log("每日报告任务执行成功");
        } catch (error) {
          console.error("每日报告任务执行失败:", error);
        }
      }
    }
  };
}

export default new DemoPlugin();
```

### 📚 常用工具函数

```typescript
// HTML转义（每个插件必须）
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

// 延迟函数
import { sleep } from "telegram/Helpers";

// 已内置的常用包
import axios from "axios";                    // HTTP请求
import Database from "better-sqlite3";         // SQLite数据库
import _ from "lodash";                        // 工具函数库
import dayjs from "dayjs";                     // 日期处理
import { JSONFilePreset } from "lowdb/node";   // JSON数据库
```

### 🛠️ 管理命令

- `.tpm install/update/list` - 插件包管理
- `.reload` - 重载所有插件
- `.alias set/del/ls` - 命令别名管理

---

## 检查清单

### ✅ 必须遵循
- [ ] 使用acron.ts参数解析模式
- [ ] 无参数时显示错误提示，不自动显示帮助
- [ ] 明确请求help时才显示帮助文档
- [ ] 所有用户输入必须HTML转义
- [ ] 错误消息格式: `❌ <b>错误:</b> 详情`
- [ ] 使用`parseMode: "html"`
- [ ] 实现完整的错误处理

### ✅ 推荐实现
- [ ] 渐进式用户反馈
- [ ] API限制处理
- [ ] 日志记录
- [ ] 权限验证（如需要）

---

## 高级开发技巧

### 动态代码执行

### JavaScript 动态执行

#### 使用 Data URL 动态导入模块
```typescript
// 动态执行 JavaScript 代码的安全方式
async function exec(code: string, context: any) {
  return await (
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(
        `export default async (context) => { 
          const { msg, client, Api, _, axios, sleep, dayjs } = context;
          {{ ... }}
  `return msg.sender?.username === 'admin'`,
  { msg, client, Api, _, axios, sleep, dayjs }
);

// 使用示例
const result = await exec(
  `return msg.sender?.username === 'admin'`,
  { msg, client, Api, _, axios, sleep, dayjs }
);
```

#### 构建执行上下文
```typescript
// 为动态代码提供丰富的执行环境
const executionContext = {
  msg: Api.Message,           // 当前消息
  chat: msg?.chat,            // 当前对话
  sender: msg?.sender,        // 发送者
  trigger: Api.Message,       // 触发消息（sudo模式）
  reply: await msg.getReplyMessage(), // 回复的消息
  client: msg?.client,        // Telegram客户端
  
  // 工具库
  _: lodash,                  // lodash工具库
  axios: axios,               // HTTP请求
  dayjs: dayjs,               // 日期处理
  
  // 辅助函数
  formatEntity: formatEntity, // 实体格式化
  sleep: sleep,               // 延迟函数
  run: runCommand,            // 执行命令
  Api: Api,                   // Telegram API
};
```

### 消息实体处理

```typescript
// 转换Telegram消息实体
function convertEntities(entities: Api.TypeMessageEntity[]): any[] {
  if (!entities) return [];
  
  return entities.map((entity) => {
    const baseEntity = { offset: entity.offset, length: entity.length };
    
    if (entity instanceof Api.MessageEntityBold) {
      return { ...baseEntity, type: "bold" };
    } else if (entity instanceof Api.MessageEntityCode) {
      return { ...baseEntity, type: "code" };
    } else if (entity instanceof Api.MessageEntityCustomEmoji) {
      return {
        ...baseEntity,
        type: "custom_emoji",
        custom_emoji_id: (entity as any).documentId?.toString() || ""
      };
    }
    return baseEntity;
  });
}

// 处理回复消息和引用
const replied = await msg.getReplyMessage();
if (replied) {
  const sender = await replied.getSender();
  const quoteText = msg.replyTo?.quoteText;
}

// 批量获取消息
const messages = await client.getMessages(msg.peerId, {
  offsetId: msg.id - 1,
  limit: 10,
  reverse: true
});
```

### 性能优化

```typescript
// 超时控制
const response = await axios({
  url: apiUrl,
  timeout: 30000,
  data: requestData
});

// 批量操作优化
for (const [index, item] of items.entries()) {
  await msg.edit({ text: `处理中... (${index + 1}/${items.length})` });
  await processItem(item);
}

// API限制处理
async function handleFloodWait<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (error.message?.includes("FLOOD_WAIT")) {
      const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
      await sleep((waitTime + 1) * 1000);
      return await operation();
    }
    throw error;
  }
}
```

### 外部API调用

```typescript
// Base64编码的配置隐藏
const config = JSON.parse(
  Buffer.from("<BASE64_ENCODED_CONFIG>", "base64").toString("utf-8")
);

// 处理二进制响应数据
const response = await axios({
  url: imageUrl,
  responseType: "arraybuffer",
  timeout: 30000,
  ...config
});

const buffer = Buffer.from(response.data);
const base64 = buffer.toString("base64");
const dataUrl = `data:image/webp;base64,${base64}`;
```

### 消息实体高级处理

#### 完整的实体类型映射
```typescript
function convertEntities(entities: Api.TypeMessageEntity[]): any[] {
  if (!entities) return [];
  
  return entities.map((entity) => {
    const baseEntity = {
      offset: entity.offset,
      length: entity.length,
    };
    
    // 文本格式
    if (entity instanceof Api.MessageEntityBold) {
      return { ...baseEntity, type: "bold" };
    } else if (entity instanceof Api.MessageEntityItalic) {
      return { ...baseEntity, type: "italic" };
    } else if (entity instanceof Api.MessageEntityUnderline) {
      return { ...baseEntity, type: "underline" };
    } else if (entity instanceof Api.MessageEntityStrike) {
      return { ...baseEntity, type: "strikethrough" };
    } else if (entity instanceof Api.MessageEntitySpoiler) {
      return { ...baseEntity, type: "spoiler" };
    }
    
    // 代码格式
    else if (entity instanceof Api.MessageEntityCode) {
      return { ...baseEntity, type: "code" };
    } else if (entity instanceof Api.MessageEntityPre) {
      return { ...baseEntity, type: "pre", language: (entity as any).language };
    }
    
    // 链接和提及
    else if (entity instanceof Api.MessageEntityUrl) {
      return { ...baseEntity, type: "url" };
    } else if (entity instanceof Api.MessageEntityTextUrl) {
      return { ...baseEntity, type: "text_link", url: (entity as any).url };
    } else if (entity instanceof Api.MessageEntityMention) {
      return { ...baseEntity, type: "mention" };
    } else if (entity instanceof Api.MessageEntityMentionName) {
      return { ...baseEntity, type: "text_mention", user: { id: (entity as any).userId }};
    }
    
    // 特殊类型
    else if (entity instanceof Api.MessageEntityCustomEmoji) {
      const documentId = (entity as any).documentId;
      const custom_emoji_id = documentId?.value?.toString() || documentId?.toString() || "";
      return { ...baseEntity, type: "custom_emoji", custom_emoji_id };
    } else if (entity instanceof Api.MessageEntityHashtag) {
      return { ...baseEntity, type: "hashtag" };
    } else if (entity instanceof Api.MessageEntityCashtag) {
      return { ...baseEntity, type: "cashtag" };
    } else if (entity instanceof Api.MessageEntityBotCommand) {
      return { ...baseEntity, type: "bot_command" };
    } else if (entity instanceof Api.MessageEntityEmail) {
      return { ...baseEntity, type: "email" };
    } else if (entity instanceof Api.MessageEntityPhone) {
      return { ...baseEntity, type: "phone_number" };
    }
    
    return baseEntity;
  });
}
```

### 高级字符串处理

#### 提取命令参数的高级方法
```typescript
// 从消息中提取指定位置后的所有内容
function getRemarkFromMsg(msg: Api.Message | string, skipCount: number): string {
  const text = typeof msg === "string" ? msg : msg?.message || "";
  // 构建正则：跳过命令和指定数量的参数
  const regex = new RegExp(`^\\S+${Array(skipCount).fill("\\s+\\S+").join("")}`);
  return text.replace(regex, "").trim();
}

// 使用示例
const remark = getRemarkFromMsg(msg, 1); // 跳过命令和第一个参数
```

#### 多行命令解析
```typescript
// 解析多行命令格式
const lines = msg.message.split(/\r?\n/g).map(l => l.trim());
const args = lines[0].split(/\s+/g);
const command = args[1];
const param1 = lines[1]; // 第二行作为参数1
const param2 = lines[2]; // 第三行作为参数2

// 示例：添加任务命令
// .plugin add 任务备注
// 匹配条件代码
// 执行动作代码
```

### 实体格式化与显示

#### 完整的实体格式化函数
```typescript
async function formatEntity(
  target: any,
  mention?: boolean,
  throwErrorIfFailed?: boolean
) {
  const client = await getGlobalClient();
  if (!client) throw new Error("Telegram 客户端未初始化");
  if (!target) throw new Error("无效的目标");
  
  let id: any;
  let entity: any;
  
  try {
    // 支持直接传入实体对象或ID/用户名
    entity = target?.className
      ? target
      : await client?.getEntity(target);
      
    if (!entity) throw new Error("无法获取 entity");
    id = entity.id;
    if (!id) throw new Error("无法获取 entity id");
  } catch (e: any) {
    console.error(e);
    if (throwErrorIfFailed) {
      throw new Error(
        `无法获取 ${target} 的 entity: ${e?.message || "未知错误"}`
      );
    }
  }
  
  const displayParts: string[] = [];
  
  // 构建显示名称
  if (entity?.title) displayParts.push(entity.title);           // 群组/频道标题
  if (entity?.firstName) displayParts.push(entity.firstName);   // 名
  if (entity?.lastName) displayParts.push(entity.lastName);     // 姓
  
  // 用户名处理
  if (entity?.username) {
    displayParts.push(
      mention 
        ? `@${entity.username}`                    // 纯文本提及
        : `<code>@${entity.username}</code>`      // HTML格式
    );
  }
  
  // ID链接处理
  if (id) {
    displayParts.push(
      entity instanceof Api.User
        ? `<a href="tg://user?id=${id}">${id}</a>`        // 用户链接
        : `<a href="https://t.me/c/${id}">${id}</a>`      // 群组/频道链接
    );
  } else if (!target?.className) {
    displayParts.push(`<code>${target}</code>`);
  }
  
  return {
    id,
    entity,
    display: displayParts.join(" ").trim(),
  };
}

// 使用示例
const formatted = await formatEntity(msg.sender);
await msg.reply({ 
  message: `用户信息: ${formatted.display}`,
  parseMode: "html" 
});
```

### 正则表达式解析

#### 智能正则解析器
```typescript
function tryParseRegex(input: string): RegExp {
  const trimmed = input.trim();
  
  // 检查是否为 /pattern/flags 格式
  if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
    const lastSlash = trimmed.lastIndexOf("/");
    const pattern = trimmed.slice(1, lastSlash);
    const flags = trimmed.slice(lastSlash + 1);
    return new RegExp(pattern, flags);
  }
  
  // 否则作为普通字符串创建正则
  return new RegExp(trimmed);
}

// 使用示例
const regex1 = tryParseRegex("/hello/i");     // 不区分大小写
const regex2 = tryParseRegex("world");        // 普通匹配
const regex3 = tryParseRegex("/^test$/m");    // 多行模式
```

### 性能优化技巧

#### 超时控制
```typescript
const timeout = 60000; // 60秒超时

// 在axios请求中设置超时
const response = await axios({
  method: "post",
  url: apiUrl,
  timeout: timeout,
  data: requestData,
});

// 在Telegram操作中使用计时
const start = Date.now();
try {
  // 执行操作...
  await someOperation();
} finally {
  const end = Date.now();
  console.log(`操作耗时: ${end - start}ms`);
}
```

#### 批量操作优化
```typescript
// 使用for...of配合entries()进行索引遍历
for (const [index, item] of items.entries()) {
  await msg.edit({ 
    text: `处理中... (${index + 1}/${items.length})` 
  });
  // 处理每个项目
  await processItem(item);
}
```

## 完整插件开发示例

### 高级消息处理

#### 处理复杂参数模式
```typescript
// 支持多种参数格式的解析
const args = msg.message.split(/\s+/);
let mode = "default";
let includeReply = false;
let fakeMessage = null;
let fakeSender = null;

// 解析参数模式
if (args[1] === "r") {
  includeReply = true;
  // 其他参数...
} else if (["f", "fr"].includes(args[1]) && args[2]) {
  includeReply = args[1] === "fr";
  // 处理伪造消息
  const text = msg.message || "";
  const match = text.match(/^(\S+)\s+fr?\s+/);
  if (match) {
    const cutLen = match[0].length;
    const content = text.slice(cutLen);
    // 调整实体偏移...
  }
} else if (["u", "ur"].includes(args[1]) && args[2]) {
  // 处理伪造发送者
  try {
    fakeSender = await msg.client?.getEntity(args[2]);
  } catch (e) {
    await msg.edit({ text: `无法获取用户信息: ${args[2]}` });
    return;
  }
}
```

#### 获取实体信息
```typescript
// 获取用户/频道/群组实体
try {
  const entity = await client.getEntity("@username");
  // 或使用ID
  const entity2 = await client.getEntity(123456789);
  
  // 获取实体的详细信息
  const userId = entity.id.toString();
  const firstName = (entity as any).firstName || (entity as any).title || "";
  const lastName = (entity as any).lastName || "";
  const username = (entity as any).username || "";
  const emojiStatus = (entity as any).emojiStatus?.documentId?.toString() || null;
} catch (e) {
  console.error("获取实体失败", e);
}
```

### 完整插件实现示例

以下是一个展示所有核心功能和最佳实践的完整插件实现：

```typescript
import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { getPrefixes } from "@utils/pluginManager";
import { Api } from "telegram";
import axios from "axios";

// HTML转义工具
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

// 获取命令前缀
const prefixes = getPrefixes();
const mainPrefix = prefixes[0];

// 帮助文档
const help_text = `🚀 <b>完整插件示例</b>

<b>🔧 使用方法:</b>
• <code>${mainPrefix}example query &lt;关键词&gt;</code> - 查询数据
• <code>${mainPrefix}example process &lt;数据&gt;</code> - 处理数据
• <code>${mainPrefix}example help</code> - 显示帮助`;

class ExamplePlugin extends Plugin {
  description: string = help_text;
  
  cmdHandlers = {
    example: async (msg: Api.Message) => {
      const client = await getGlobalClient();
      if (!client) {
        await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
        return;
      }

      // 参数解析（严格按acron.ts模式）
      const lines = msg.text?.trim()?.split(/\r?\n/g) || [];
      const parts = lines?.[0]?.split(/\s+/) || [];
      const [, ...args] = parts;
      const sub = (args[0] || "").toLowerCase();

      try {
        // 无参数时显示错误提示
        if (!sub) {
          await msg.edit({
            text: `❌ <b>参数不足</b>\n\n💡 使用 <code>${mainPrefix}example help</code> 查看帮助`,
            parseMode: "html"
          });
          return;
        }

        // 明确请求帮助时才显示
        if (sub === "help" || sub === "h") {
          await msg.edit({ text: help_text, parseMode: "html" });
          return;
        }

        // 查询功能
        if (sub === "query") {
          const keyword = args.slice(1).join(" ").trim();
          if (!keyword) {
            await msg.edit({
              text: `❌ <b>查询关键词不能为空</b>`,
              parseMode: "html"
            });
            return;
          }

          await msg.edit({ text: "🔍 正在查询...", parseMode: "html" });
          
          // 模拟API调用
          const result = `✅ <b>查询结果</b>\n\n<b>关键词:</b> <code>${htmlEscape(keyword)}</code>`;
          await msg.edit({ text: result, parseMode: "html" });
          return;
        }

        // 处理功能
        if (sub === "process") {
          const data = args.slice(1).join(" ").trim();
          if (!data) {
            await msg.edit({
              text: `❌ <b>处理数据不能为空</b>`,
              parseMode: "html"
            });
            return;
          }

          await msg.edit({ text: "⚡ 正在处理...", parseMode: "html" });
          
          const processed = data.toUpperCase();
          const result = `✅ <b>处理完成</b>\n\n<b>结果:</b> <code>${htmlEscape(processed)}</code>`;
          await msg.edit({ text: result, parseMode: "html" });
          return;
        }

        // 未知子命令
        await msg.edit({
          text: `❌ <b>未知命令:</b> <code>${htmlEscape(sub)}</code>`,
          parseMode: "html"
        });

      } catch (error: any) {
        console.error("[example] 插件执行失败:", error);
        await msg.edit({
          text: `❌ <b>插件执行失败:</b> ${htmlEscape(error.message)}`,
          parseMode: "html"
        });
      }
    }
  };
}

export default new ExamplePlugin();
```

### 高级命令执行

```typescript
import { 
  getCommandFromMessage,
  dealCommandPluginWithMessage 
} from "@utils/pluginManager";

// 在插件内执行其他命令
async function runCommand(
  commandText: string, 
  msg: Api.Message, 
  trigger?: Api.Message
) {
  const cmd = await getCommandFromMessage(commandText);
  const cmdMsg = await msg.client?.sendMessage(msg.peerId, {
    message: commandText,
    replyTo: msg.replyToMsgId,
  });
  
  if (cmd && cmdMsg) {
    await dealCommandPluginWithMessage({ cmd, msg: cmdMsg, trigger: msg });
  }
}
```

### 数据类型转换工具

```typescript
// 安全的类型转换
function toInt(value: any): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

// 时区处理
const CN_TIME_ZONE = "Asia/Shanghai";
function formatDate(date: Date): string {
  return date.toLocaleString("zh-CN", { timeZone: CN_TIME_ZONE });
}
```

### 插件配置管理

```typescript
// 使用 lowdb 管理配置
import { JSONFilePreset } from "lowdb/node";
import { createDirectoryInAssets } from "@utils/pathHelpers";

type Config = {
  enabled: boolean;
  settings: { timeout: number; retries: number; };
};

const configPath = path.join(createDirectoryInAssets("plugin_name"), "config.json");
const db = await JSONFilePreset<Config>(configPath, { enabled: true, settings: { timeout: 30000, retries: 3 } });

// 使用 SQLite 管理数据
import Database from "better-sqlite3";

const dbPath = path.join(createDirectoryInAssets("plugin_name"), "data.db");
const db = new Database(dbPath);

db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
```

### 任务管理系统

```typescript
// 定义任务数据结构
type Task = {
  id: string;
  remark?: string;
  match: string;
  action: string;
  status?: string; // "0" 表示禁用
};

// 初始化任务数据库
async function getTaskDB() {
  const filePath = path.join(createDirectoryInAssets("plugin_name"), "tasks.json");
  return await JSONFilePreset<{ tasks: Task[]; index: string }>(filePath, {
    tasks: [],
    index: "0",
  });
}

// 添加任务
const db = await getTaskDB();
db.data.index = (parseInt(db.data.index) + 1).toString();
db.data.tasks.push({
  id: db.data.index,
  remark: "任务说明",
  match: "return msg.text === 'hello'",
  action: "await msg.reply({ message: 'world' })",
});
await db.write();
```

### 消息批量处理与用户筛选

```typescript
// 批量获取消息并收集用户
const messages = await client.getMessages(msg.peerId, {
  offsetId: (msg.id || 1) - 1,
  limit: scanCount,
});

const uniqueUserIds: number[] = [];
const seen = new Set<number>();

for (const m of messages) {
  const from = (m as any).fromId as any;
  const uid = from?.userId ? Number(from.userId) : undefined;
  if (!uid || !Number.isFinite(uid) || seen.has(uid)) continue;
  
  const entity = (await formatEntity(uid))?.entity;
  if (entity && !entity.bot && !entity.deleted && !entity.fake) {
    seen.add(uid);
    uniqueUserIds.push(uid);
  }
}

// Fisher-Yates 洗牌算法
function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
```

### 用户实体验证与过滤

```typescript
// 验证用户有效性
function isValidUser(entity: any): boolean {
  if (!entity) return false;
  return !entity.bot && !entity.deleted && !entity.fake && !entity.scam;
}

// 从消息中提取发送者ID
function extractSenderId(message: Api.Message): number | undefined {
  const from = (message as any).fromId as any;
  const userId = from?.userId ? Number(from.userId) : undefined;
  return Number.isFinite(userId) ? userId : Number(message.senderId);
}
```

### 性能计时与监控

```typescript
// 精确计时
const startAt = Date.now();
try {
  await someOperation();
} finally {
  const duration = Math.round(((Date.now() - startAt) / 1000) * 100) / 100;
  console.log(`操作耗时: ${duration} 秒`);
}

// 进度反馈类
class ProgressTracker {
  private startTime = Date.now();
  
  async updatePhase(msg: Api.Message, phase: string) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    await msg.edit({ text: `${phase}... (${elapsed}s)`, parseMode: "html" });
  }
}
```

### 概率计算与展示

```typescript
// 计算选中概率
function calculateProbability(selected: number, total: number): string {
  if (total === 0) return "0.00";
  const probability = (selected / total) * 100;
  return (Math.round(probability * 100) / 100).toString();
}

// 格式化大数字
function formatNumber(n: number): string {
  return n.toLocaleString("zh-CN");
}
```

### 标准插件实现模板

```typescript
class SafePlugin extends Plugin {
  cmdHandlers = {
    command: async (msg: Api.Message, trigger?: Api.Message) => {
      try {
        // 主要业务逻辑
        await this.executeCommand(msg);
      } catch (error: any) {
        await msg.edit({
          text: `❌ 执行失败: <code>${htmlEscape(error?.message || String(error))}</code>`,
          parseMode: "html",
        });
      } finally {
        // 清理触发消息（sudo模式）
        if (trigger) {
          try { await trigger.delete(); } catch {}
        }
      }
    },
  };
}
```

### 基于acron.ts的标准参数解析

```typescript
import { getPrefixes } from "@utils/pluginManager";
import { Plugin } from "@utils/pluginBase";
import { Api } from "telegram";
import { getGlobalClient } from "@utils/globalClient";
import { createDirectoryInAssets } from "@utils/pathHelpers";
import axios from "axios";  // 已内置，直接导入

// 获取命令前缀
const prefixes = getPrefixes();
const mainPrefix = prefixes[0];

// HTML转义工具
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

// 帮助文档（等宽处理）
const help_text = `🚀 <b>示例插件 - 完整标准实现</b>

<b>📝 功能描述:</b>
• 🔍 <b>查询功能</b>：支持多种查询方式
• ⚡ <b>处理功能</b>：快速数据处理
• 📊 <b>统计功能</b>：详细数据分析

<b>🔧 使用方法:</b>
• <code>${mainPrefix}example query &lt;关键词&gt;</code> - 查询数据
• <code>${mainPrefix}example process &lt;数据&gt; [选项]</code> - 处理数据
• <code>${mainPrefix}example stats [类型]</code> - 查看统计

<b>💡 示例:</b>
• <code>${mainPrefix}example query bitcoin</code> - 查询比特币信息
• <code>${mainPrefix}example process data --format json</code> - 处理数据为JSON格式
• <code>${mainPrefix}example stats daily</code> - 查看每日统计

<b>🔄 管理命令:</b>
• <code>${mainPrefix}example list</code> - 列出所有记录
• <code>${mainPrefix}example clear</code> - 清空数据
• <code>${mainPrefix}example help</code> - 显示此帮助`;

class ExamplePlugin extends Plugin {
  description: string = help_text;
  
  cmdHandlers: Record<string, (msg: Api.Message, trigger?: Api.Message) => Promise<void>> = {
    example: async (msg: Api.Message) => {
      const client = await getGlobalClient();
      if (!client) {
        await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
        return;
      }

      // 参数解析（严格按acron.ts模式）
      const lines = msg.text?.trim()?.split(/\r?\n/g) || [];
      const parts = lines?.[0]?.split(/\s+/) || [];
      const [, ...args] = parts; // 跳过命令本身
      const sub = (args[0] || "").toLowerCase();

      try {
        // 无参数时不显示帮助，显示错误提示
        if (!sub) {
          await msg.edit({
            text: `❌ <b>参数不足</b>\n\n💡 使用 <code>${mainPrefix}example help</code> 查看帮助`,
            parseMode: "html"
          });
          return;
        }

        // 明确请求帮助时才显示
        if (sub === "help" || sub === "h") {
          await msg.edit({
            text: help_text,
            parseMode: "html"
          });
          return;
        }

        // 查询功能
        if (sub === "query") {
          const keyword = args.slice(1).join(" ").trim();
          if (!keyword) {
            await msg.edit({
              text: `❌ <b>查询关键词不能为空</b>\n\n<b>用法:</b> <code>${mainPrefix}example query &lt;关键词&gt;</code>`,
              parseMode: "html"
            });
            return;
          }

          await msg.edit({ text: "🔍 正在查询...", parseMode: "html" });

          try {
            // 直接使用axios（已在文件顶部导入）
            
            // 模拟API调用
            const response = await axios.get(`https://api.example.com/search`, {
              params: { q: keyword },
              timeout: 10000,
              headers: {
                'User-Agent': 'TeleBox/1.0'
              }
            });

            const result = `✅ <b>查询结果</b>\n\n<b>关键词:</b> <code>${htmlEscape(keyword)}</code>\n<b>结果数:</b> ${response.data?.total || 0}`;
            
            await msg.edit({
              text: result,
              parseMode: "html"
            });
          } catch (error: any) {
            await msg.edit({
              text: `❌ <b>查询失败:</b> ${htmlEscape(error.message)}`,
              parseMode: "html"
            });
          }
          return;
        }

        // 处理功能
        if (sub === "process") {
          const data = args.slice(1).join(" ").trim();
          if (!data) {
            await msg.edit({
              text: `❌ <b>处理数据不能为空</b>\n\n<b>用法:</b> <code>${mainPrefix}example process &lt;数据&gt;</code>`,
              parseMode: "html"
            });
            return;
          }

          await msg.edit({ text: "⚡ 正在处理...", parseMode: "html" });

          try {
            // 模拟数据处理
            const processed = data.toUpperCase();
            const result = `✅ <b>处理完成</b>\n\n<b>原始数据:</b> <code>${htmlEscape(data)}</code>\n<b>处理结果:</b> <code>${htmlEscape(processed)}</code>`;
            
            await msg.edit({
              text: result,
              parseMode: "html"
            });
          } catch (error: any) {
            await msg.edit({
              text: `❌ <b>处理失败:</b> ${htmlEscape(error.message)}`,
              parseMode: "html"
            });
          }
          return;
        }

        // 统计功能
        if (sub === "stats") {
          const type = args[1] || "all";
          
          await msg.edit({ text: "📊 正在生成统计...", parseMode: "html" });

          try {
            const stats = {
              total: 1234,
              today: 56,
              active: 789
            };

            const result = `📊 <b>统计信息</b>\n\n<b>类型:</b> <code>${htmlEscape(type)}</code>\n<b>总计:</b> ${stats.total}\n<b>今日:</b> ${stats.today}\n<b>活跃:</b> ${stats.active}`;
            
            await msg.edit({
              text: result,
              parseMode: "html"
            });
          } catch (error: any) {
            await msg.edit({
              text: `❌ <b>统计失败:</b> ${htmlEscape(error.message)}`,
              parseMode: "html"
            });
          }
          return;
        }

        // 列表功能
        if (sub === "list") {
          await msg.edit({ text: "📋 正在获取列表...", parseMode: "html" });

          try {
            const items = ["项目1", "项目2", "项目3"];
            const result = `📋 <b>记录列表</b>\n\n${items.map((item, i) => `${i + 1}. <code>${htmlEscape(item)}</code>`).join("\n")}`;
            
            await msg.edit({
              text: result,
              parseMode: "html"
            });
          } catch (error: any) {
            await msg.edit({
              text: `❌ <b>获取列表失败:</b> ${htmlEscape(error.message)}`,
              parseMode: "html"
            });
          }
          return;
        }

        // 清空功能
        if (sub === "clear") {
          await msg.edit({ text: "🧹 正在清空数据...", parseMode: "html" });

          try {
            // 模拟清空操作
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            await msg.edit({
              text: "✅ <b>数据已清空</b>",
              parseMode: "html"
            });
          } catch (error: any) {
            await msg.edit({
              text: `❌ <b>清空失败:</b> ${htmlEscape(error.message)}`,
              parseMode: "html"
            });
          }
          return;
        }

        // 未知子命令
        await msg.edit({
          text: `❌ <b>未知命令:</b> <code>${htmlEscape(sub)}</code>\n\n💡 使用 <code>${mainPrefix}example help</code> 查看帮助`,
          parseMode: "html"
        });

      } catch (error: any) {
        console.error("[example] 插件执行失败:", error);
        await msg.edit({
          text: `❌ <b>插件执行失败:</b> ${htmlEscape(error.message)}`,
          parseMode: "html"
        });
      }
    }
  };

  // 可选：消息监听器
  listenMessageHandler = async (msg: Api.Message) => {
    // 只处理包含特定关键词的消息
    if (!msg.text || !msg.text.includes("example")) {
      return;
    }
    
    try {
      // 处理逻辑
      console.log("检测到example关键词:", msg.text);
    } catch (error) {
      console.error("消息监听处理失败:", error);
    }
  };

  // 可选：定时任务
  cronTasks = {
    dailyReport: {
      schedule: "0 0 9 * * *", // 每天上午9点
      handler: async () => {
        try {
          const client = await getGlobalClient();
          if (!client) return;
          
          // 发送每日报告到指定聊天
          await client.sendMessage("me", {
            message: "📊 每日报告已生成",
            parseMode: "html"
          });
          
          console.log("每日报告任务执行成功");
        } catch (error) {
          console.error("每日报告任务执行失败:", error);
        }
      }
    }
  };
}

export default new ExamplePlugin();
```

### 关键规范要点

#### 1. 命令前缀处理
```typescript
import { getPrefixes } from "@utils/pluginManager";
const prefixes = getPrefixes();
const mainPrefix = prefixes[0];
```

#### 2. 帮助文档等宽处理
```typescript
const help_text = `🚀 <b>插件名称</b>

<b>🔧 使用方法:</b>
• <code>${mainPrefix}command param</code> - 功能说明`;
```

#### 3. 严格的参数解析模式（参考acron.ts）
```typescript
const lines = msg.text?.trim()?.split(/\r?\n/g) || [];
const parts = lines?.[0]?.split(/\s+/) || [];
const [, ...args] = parts; // 跳过命令本身
const sub = (args[0] || "").toLowerCase();
```

#### 4. 帮助显示规范
- **无参数时**: 显示错误提示，引导使用help命令
- **明确请求时**: `help` 或 `h` 子命令才显示帮助
- **绝不自动显示**: 避免无参数时自动显示帮助

#### 5. 错误处理标准
```typescript
try {
  // 业务逻辑
} catch (error: any) {
  console.error("[插件名] 操作失败:", error);
  await msg.edit({
    text: `❌ <b>操作失败:</b> ${htmlEscape(error.message)}`,
    parseMode: "html"
  });
}
```

#### 6. HTML转义必须
```typescript
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));
```

---

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

---

## 📝 核心开发规范

### 1. 错误处理标准
```typescript
try {
  // 业务逻辑
} catch (error: any) {
  console.error("[插件名] 操作失败:", error);
  await msg.edit({
    text: `❌ <b>操作失败:</b> ${htmlEscape(error.message)}`,
    parseMode: "html"
  });
}
```

### 2. 进度反馈模式
```typescript
// 渐进式信息展示
await msg.edit({ text: "🔄 初始化..." });
await msg.edit({ text: "🔍 搜索中..." });
await msg.edit({ text: "✅ 完成!" });
```

### 3. API限制处理
```typescript
async function handleFloodWait<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    if (error.message?.includes("FLOOD_WAIT")) {
      const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
      await sleep((waitTime + 1) * 1000);
      return await operation();
    }
    throw error;
  }
}
```

---

## 🚀 标准插件模板

```typescript
import { Plugin } from "@utils/pluginBase";
import { getGlobalClient } from "@utils/globalClient";
import { Api } from "telegram";

// HTML转义工具
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

class TemplatePlugin extends Plugin {
  description: string = `插件功能描述

参数说明:
• [参数1] - 参数说明
• -f - 选项说明

示例:
• .cmd example - 示例用法`;
  
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    cmd: async (msg: Api.Message) => {
      const client = await getGlobalClient();
      if (!client) {
        await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
        return;
      }

      // 参数解析（严格按acron.ts模式）
      const lines = msg.text?.trim()?.split(/\r?\n/g) || [];
      const parts = lines?.[0]?.split(/\s+/) || [];
      const [, ...args] = parts;
      const sub = (args[0] || "").toLowerCase();

      try {
        // 无参数时显示错误提示
        if (!sub) {
          await msg.edit({
            text: `❌ <b>参数不足</b>\n\n💡 使用 <code>.cmd help</code> 查看帮助`,
            parseMode: "html"
          });
          return;
        }

        // 明确请求帮助时才显示
        if (sub === "help" || sub === "h") {
          await msg.edit({
            text: this.description,
            parseMode: "html"
          });
          return;
        }

        // 业务逻辑
        await msg.edit({ text: "🔄 处理中...", parseMode: "html" });
        
        const result = await this.processCommand(sub, args.slice(1));
        
        await msg.edit({ 
          text: `✅ <b>操作完成</b>\n\n📊 结果: ${htmlEscape(result)}`,
          parseMode: "html"
        });
        
      } catch (error: any) {
        console.error("[TemplatePlugin] 操作失败:", error);
        await msg.edit({ 
          text: `❌ <b>操作失败:</b> ${htmlEscape(error.message)}`,
          parseMode: "html"
        });
      }
    }
  };

  private async processCommand(command: string, args: string[]): Promise<string> {
    // 具体业务逻辑实现
    return `处理命令: ${command}`;
  }
}

export default new TemplatePlugin();
```

---

## 📋 开发检查清单

### ✅ 必须遵循
- [ ] 使用acron.ts参数解析模式
- [ ] 无参数时显示错误提示，不自动显示帮助
- [ ] 明确请求help时才显示帮助文档
- [ ] 所有用户输入必须HTML转义
- [ ] 错误消息格式: `❌ <b>错误:</b> 详情`
- [ ] 使用`parseMode: "html"`
- [ ] 实现完整的错误处理

### ✅ 推荐实现
- [ ] 渐进式用户反馈
- [ ] API限制处理
- [ ] 日志记录
- [ ] 权限验证（如需要）

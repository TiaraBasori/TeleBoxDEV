# TeleBox AI 开发规范

## 项目概述

TeleBox 是一个基于 Telegram 的插件化机器人框架，采用 TypeScript 开发。本文档基于实际代码分析，定义了 AI 助手在开发 TeleBox 插件时必须遵循的标准和规范。

### 📁 核心目录结构
```
telebox/
├── src/
│   ├── index.ts              # 程序入口：执行登录和插件加载
│   ├── utils/                # 核心工具类
│   │   ├── pluginManager.ts  # 插件管理器：加载、注册、调度插件
│   │   ├── pluginBase.ts     # 插件基类：定义Plugin抽象类和接口
│   │   ├── globalClient.ts   # 全局客户端：单例TelegramClient管理
│   │   ├── loginManager.ts   # 登录管理：交互式Telegram登录
│   │   ├── apiConfig.ts      # API配置：管理config.json和session
│   │   ├── aliasDB.ts        # 别名数据库：SQLite命令别名管理
│   │   ├── sudoDB.ts         # 权限数据库：SQLite sudo用户管理
│   │   ├── cronManager.ts    # 定时任务管理：node-cron任务调度
│   │   ├── conversation.ts   # 对话管理：消息发送和响应等待
│   │   ├── pathHelpers.ts    # 路径工具：assets和temp目录创建
│   │   ├── entityHelpers.ts  # 实体工具：安全实体获取和消息转发
│   │   ├── sureDB.ts         # 确认数据库：消息重定向白名单管理
│   │   ├── sendLogDB.ts      # 日志发送数据库：日志目标配置
│   │   ├── tlRevive.ts       # TL对象恢复：JSON到TL类实例转换
│   │   └── npm_install.ts    # NPM安装工具：动态依赖安装检查
│   ├── plugin/               # 内置插件目录
│   │   ├── help.ts           # 帮助插件：命令列表和详细帮助
│   │   ├── ping.ts           # 网络测试：API延迟、ICMP、HTTP、DNS
│   │   ├── test.ts           # 测试插件：简单命令和定时任务示例
│   │   ├── debug.ts          # 调试插件：用户、消息、聊天信息获取
│   │   ├── exec.ts           # 命令执行：异步shell命令执行
│   │   ├── sudo.ts           # 权限管理：sudo用户管理和命令转发
│   │   ├── sure.ts           # 消息确认：白名单和消息重定向管理
│   │   ├── alias.ts          # 别名管理：命令别名设置和删除
│   │   ├── reload.ts         # 插件重载：动态重新加载所有插件
│   │   ├── tpm.ts            # 插件包管理器：远程插件安装更新
│   │   ├── update.ts         # 系统更新：git拉取和依赖更新
│   │   ├── sysinfo.ts        # 系统信息：详细系统状态监控
│   │   ├── sendLog.ts        # 日志发送：输出和错误日志转发
│   │   ├── re.ts             # 消息重复：多次转发消息功能
│   │   └── bf.ts             # 备份插件：plugins和assets备份恢复
│   └── hook/
│       └── listen.ts         # 消息监听钩子：拦截sudo用户消息编辑
├── plugins/                  # 用户插件目录（包含rate.ts等）
├── assets/                   # 资源文件目录
├── temp/                     # 临时文件目录
├── config.json               # Telegram API配置和session
├── package.json              # 项目依赖和脚本配置
├── tsconfig.json             # TypeScript编译配置
└── ecosystem.config.js       # PM2进程管理配置
```

## 核心架构

### 插件系统架构

#### 插件基类 (pluginBase.ts)
```typescript
abstract class Plugin {
  abstract description: string | ((...args: any[]) => string | void | Promise<string | void>);
  abstract cmdHandlers: Record<string, (msg: Api.Message, trigger?: Api.Message) => Promise<void>>;
  listenMessageHandler?: (msg: Api.Message) => Promise<void>;
  cronTasks?: Record<string, CronTask>;
}

interface CronTask {
  schedule: string;
  handler: () => Promise<void>;
}
```

#### 插件管理器 (pluginManager.ts)
- 负责插件的加载、注册和调度
- 支持命令前缀配置 (生产环境: `.`, 开发环境: `..`)
- 提供别名系统支持
- 管理定时任务和消息监听

## 开发规范

### 1. 插件开发标准

#### 基本结构
```typescript
import { Plugin } from "@utils/pluginBase";
import { Api } from "telegram";
import { getGlobalClient } from "@utils/globalClient";

class YourPlugin extends Plugin {
  description: string = "插件功能描述";
  
  cmdHandlers = {
    command: async (msg: Api.Message) => {
      // 命令处理逻辑
    }
  };
  
  // 可选：消息监听器
  listenMessageHandler = async (msg: Api.Message) => {
    // 消息监听逻辑
  };
  
  // 可选：定时任务
  cronTasks = {
    taskName: {
      schedule: "0 0 * * *", // cron表达式
      handler: async () => {
        // 定时任务逻辑
      }
    }
  };
}

export default YourPlugin;
```

#### 必须遵循的规范

1. **错误处理**：所有异步操作必须使用 try-catch
2. **消息编辑**：使用 `msg.edit()` 更新消息状态
3. **HTML转义**：用户输入必须进行HTML转义
4. **客户端获取**：使用 `getGlobalClient()` 获取Telegram客户端
5. **参数解析**：统一使用 `msg.message.split(" ")` 解析参数

### 2. 错误处理规范

```typescript
cmdHandlers = {
  command: async (msg: Api.Message) => {
    const client = await getGlobalClient();
    if (!client) {
      await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
      return;
    }
    
    try {
      await msg.edit({ text: "🔄 处理中...", parseMode: "html" });
      // 业务逻辑
      await msg.edit({ text: "✅ 操作成功", parseMode: "html" });
    } catch (error) {
      await msg.edit({ 
        text: `❌ <b>操作失败:</b> ${error.message}`, 
        parseMode: "html" 
      });
    }
  }
};
```

### 3. 参数解析规范

```typescript
const args = msg.message.trim().split(/\s+/);
const command = args[0]; // 命令本身
const params = args.slice(1); // 参数数组

// 参数验证
if (params.length < 1) {
  await msg.edit({ 
    text: "❌ 参数不足\n\n使用方法: <code>.command &lt;参数&gt;</code>", 
    parseMode: "html" 
  });
  return;
}
```

### 4. UI/UX 设计规范

#### 消息格式化
- 使用HTML格式化消息
- 状态图标：🔄 处理中、✅ 成功、❌ 失败、⚠️ 警告
- 使用 `<b>` 标签强调重要信息
- 使用 `<code>` 标签显示代码或命令
- 使用 `<pre>` 标签显示多行代码块

#### 帮助信息格式
```typescript
const helpText = `🚀 <b>插件名称</b>

<b>📝 功能描述:</b>
• 功能点1
• 功能点2

<b>🔧 使用方法:</b>
• <code>.command param1</code> - 功能说明
• <code>.command param2</code> - 功能说明

<b>💡 示例:</b>
• <code>.command example</code>`;
```

### 5. 安全规范

#### 权限检查
```typescript
import { SudoDB } from "@utils/sudoDB";

// 检查sudo权限
const sudoDB = new SudoDB();
const isSudo = await sudoDB.isSudoUser(msg.senderId!.toString());
if (!isSudo) {
  await msg.edit({ text: "❌ 权限不足", parseMode: "html" });
  return;
}
```

#### 输入验证
```typescript
// HTML转义
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

// 使用转义后的文本
await msg.edit({ 
  text: `结果: ${htmlEscape(userInput)}`, 
  parseMode: "html" 
});
```

### 6. 数据库操作规范

#### 使用现有数据库类
```typescript
import { AliasDB } from "@utils/aliasDB";
import { SudoDB } from "@utils/sudoDB";
import { SureDB } from "@utils/sureDB";
import { SendLogDB } from "@utils/sendLogDB";

// 别名操作
const aliasDB = new AliasDB();
await aliasDB.setAlias("oldName", "newName");

// 权限操作
const sudoDB = new SudoDB();
await sudoDB.addSudoUser("userId");
```

### 7. 文件操作规范

#### 路径管理
```typescript
import { createDirectoryInAssets, createDirectoryInTemp } from "@utils/pathHelpers";

// 在assets目录创建子目录
const assetsDir = createDirectoryInAssets("pluginName");

// 在temp目录创建子目录
const tempDir = createDirectoryInTemp("pluginName");
```

### 8. 网络请求规范

#### 动态导入axios
```typescript
import { npm_install } from "@utils/npm_install";

// 确保依赖可用
npm_install("axios");

// 动态导入
const axios = (await import("axios")).default;

// 使用axios
const response = await axios.get(url, {
  timeout: 10000,
  headers: {
    'User-Agent': 'TeleBox/1.0'
  }
});
```

### 9. 定时任务规范

```typescript
cronTasks = {
  dailyTask: {
    schedule: "0 0 * * *", // 每天午夜执行
    handler: async () => {
      try {
        // 定时任务逻辑
        console.log("定时任务执行成功");
      } catch (error) {
        console.error("定时任务执行失败:", error);
      }
    }
  }
};
```

### 10. 消息监听规范

```typescript
listenMessageHandler = async (msg: Api.Message) => {
  // 只处理特定条件的消息
  if (!msg.text || !msg.text.includes("关键词")) {
    return;
  }
  
  try {
    // 处理逻辑
  } catch (error) {
    console.error("消息监听处理失败:", error);
  }
};
```

## 插件管理命令

- **TPM**: `.tpm install/update/list` - 插件包管理
- **重载**: `.reload` - 动态重新加载所有插件
- **别名**: `.alias set/del/ls` - 命令别名管理

## 常用工具函数

```typescript
// HTML转义
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ 
    '&': '&amp;', '<': '&lt;', '>': '&gt;', 
    '"': '&quot;', "'": '&#x27;' 
  }[m] || m));

// 延迟函数
const sleep = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));
```

## 完整插件开发示例

### 基于acron.ts的标准实现

以下是严格参考 `acron.ts` 插件的完整标准实现，展示所有必需的开发规范：

```typescript
import { getPrefixes } from "@utils/pluginManager";
import { Plugin } from "@utils/pluginBase";
import { Api } from "telegram";
import { getGlobalClient } from "@utils/globalClient";
import { createDirectoryInAssets } from "@utils/pathHelpers";
import { npm_install } from "@utils/npm_install";

// 确保依赖可用
npm_install("axios");

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
  description: string = `示例插件 - 展示TeleBox标准开发规范\n\n${help_text}`;
  
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
            // 动态导入axios
            const axios = (await import("axios")).default;
            
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

import {
  listCommands,
  getPluginEntry,
  getPrefixes,
} from "@utils/pluginManager";
import { Plugin } from "@utils/pluginBase";
import fs from "fs";
import path from "path";
import { Api } from "telegram";
import { AliasDB } from "@utils/aliasDB";

const prefixes = getPrefixes();
const mainPrefix = prefixes[0];

function readVersion(): string {
  try {
    const packagePath = path.join(process.cwd(), "package.json");
    const packageJson = fs.readFileSync(packagePath, "utf-8");
    const packageData = JSON.parse(packageJson);
    return packageData.version || "未知版本";
  } catch (error) {
    console.error("Failed to read version:", error);
    return "未知版本";
  }
}

function formatCommandList(commands: string[]): string {
  const sortedCommands = commands.sort((a, b) => a.localeCompare(b));

  // 分析插件，找出多子指令插件
  const pluginGroups = new Map<string, string[]>();
  const singleCommands: string[] = [];

  sortedCommands.forEach((cmd) => {
    const pluginEntry = getPluginEntry(cmd);
    if (pluginEntry && pluginEntry.plugin.cmdHandlers) {
      const cmdHandlerKeys = Object.keys(pluginEntry.plugin.cmdHandlers);
      if (cmdHandlerKeys.length > 0) {
        const mainCommand = cmdHandlerKeys[0];
        if (
          cmdHandlerKeys.length === 1 &&
          !singleCommands.includes(mainCommand)
        ) {
          singleCommands.push(mainCommand);
        } else {
          if (!pluginGroups.has(mainCommand)) {
            pluginGroups.set(mainCommand, cmdHandlerKeys);
          }
        }
      }
    }
  });

  const result: string[] = [];
  const aliasDB = new AliasDB();
  // 基础命令显示
  if (singleCommands.length > 0) {
    const formattedCommands = singleCommands
      .map((cmd) => {
        const alias = aliasDB.getOriginal(cmd);
        return `<code>${cmd}</code>${
          alias?.length > 0
            ? ` (<code>${alias
                .map((a) => `<code>${a}</code>`)
                .join(", ")}</code>)`
            : ""
        }`;
      })
      .join(" • ");
    result.push(`📋 <b>基础命令:</b> ${formattedCommands}`);
  }

  // 添加多子指令插件组
  if (pluginGroups.size > 0) {
    result.push(`\n🔧 <b>功能模块:</b>`);
    for (const [mainCommand, subCommands] of pluginGroups) {
      const formattedSubs = subCommands
        .map((cmd) => {
          const alias = aliasDB.getOriginal(cmd);
          return `<code>${cmd}</code>${
            alias?.length > 0
              ? ` (<code>${alias
                  .map((a) => `<code>${a}</code>`)
                  .join(", ")}</code>)`
              : ""
          }`;
        })
        .join(" • ");
      result.push(`<b>${mainCommand}:</b> ${formattedSubs}`);
    }
  }
  aliasDB.close();
  return result.join("\n");
}

function htmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

class HelpPlugin extends Plugin {
  description: string = "查看帮助信息和可用命令列表";
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    help: this.handleHelp,
    h: this.handleHelp,
  };

  private async handleHelp(msg: Api.Message): Promise<void> {
    try {
      const args = msg.text.split(" ").slice(1);

      if (args.length === 0) {
        // 显示所有命令列表
        const commands = listCommands();
        const version = readVersion();
        const totalCommands = commands.length;

        const helpText = [
          `🚀 <b>TeleBox v${htmlEscape(version)}</b> | ${totalCommands} 个命令`,
          "",
          formatCommandList(commands),
          "",
          `❕ <b>指令前缀：</b> ${prefixes
            .map((p) => `<code>${htmlEscape(p)}</code>`)
            .join(" • ")}`,
          `💡 <code>${mainPrefix}help [命令]</code> 查看详情 | <code>${mainPrefix}tpm search</code> 显示远程插件列表`,
          "🔗 <a href='https://github.com/TeleBoxDev/TeleBox'>📦仓库</a> | <a href='https://github.com/TeleBoxDev/TeleBox_Plugins'>🔌插件</a> | <a href='https://t.me/teleboxdevgroup'>👥群组</a> | <a href='https://t.me/teleboxdev'>📣频道</a>",
        ].join("\n");

        await msg.edit({
          text: helpText,
          parseMode: "html",
          linkPreview: false,
        });
        return;
      }

      // 显示特定命令的帮助
      const command = args[0].toLowerCase();
      const pluginEntry = getPluginEntry(command);

      if (!pluginEntry?.plugin) {
        await msg.edit({
          text: `❌ 未找到命令 <code>${htmlEscape(
            command
          )}</code>\n\n💡 使用 <code>.help</code> 查看所有命令`,
          parseMode: "html",
        });
        return;
      }

      const plugin = pluginEntry.plugin;
      const commands = Object.keys(plugin.cmdHandlers);

      // 格式化命令
      const aliasDB = new AliasDB();
      const cmds = Array.isArray(commands) ? commands : [commands];
      const cmdsText = cmds
        .map((cmd) => {
          const alias = aliasDB.getOriginal(cmd);

          return `<code>${mainPrefix}${cmd}</code>${
            alias?.length > 0
              ? ` (<code>${alias
                  .map((a) => `<code>${a}</code>`)
                  .join(", ")}</code>)`
              : ""
          }`;
        })
        .join(" • ");
      aliasDB.close();
      let description: string | void;

      if (!plugin.description) {
        description = "暂无描述信息";
      } else if (typeof plugin.description === "string") {
        description = plugin.description;
      } else {
        try {
          description =
            (await plugin.description({ plugin: pluginEntry })) ||
            "暂无描述信息";
        } catch (e: any) {
          console.error("Error getting plugin description:", e);
          description = `生成描述信息出错: ${e?.message || "未知错误"}`;
        }
      }

      let cronTasksInfo = "";
      if (plugin.cronTasks && Object.keys(plugin.cronTasks).length > 0) {
        const cronTasks = Object.entries(plugin.cronTasks)
          .map(([key, task]) => {
            return `• <code><b>${htmlEscape(key)}:</b></code> ${htmlEscape(
              task.description
            )} <code>(${htmlEscape(task.cron)})</code>`;
          })
          .join("\n");
        cronTasksInfo = `\n📅 <b>定时任务:</b>\n${cronTasks}\n`;
      }

      const commandHelpText = [
        `🔧 <b>${htmlEscape(command.toUpperCase())}</b>`,
        "",
        `📝 <b>功能描述:</b>`,
        `${description || "暂无描述信息"}`,
        "",
        `🏷️ <b>命令:</b>`,
        `${cmdsText}`,
        "",
        `⚡ <b>使用方法:</b>`,
        `<code>${mainPrefix}${command} [参数]</code>`,
        cronTasksInfo,
        "💡 <i>提示: 使用</i> <code>.help</code> <i>查看所有命令</i>",
      ].join("\n");

      await msg.edit({
        text: commandHelpText,
        parseMode: "html",
        linkPreview: false,
      });
    } catch (error: any) {
      console.error("Help plugin error:", error);
      const errorMsg =
        error.message?.length > 100
          ? error.message.substring(0, 100) + "..."
          : error.message;
      await msg.edit({
        text: [
          "⚠️ <b>系统错误</b>",
          "",
          "📋 <b>错误详情:</b>",
          `<code>${htmlEscape(errorMsg || "未知系统错误")}</code>`,
          "",
          "🔧 <b>解决方案:</b>",
          "• 稍后重试命令",
          "• 重启 TeleBox 服务",
          "• 检查系统日志",
          "",
          "🆘 <a href='https://github.com/TeleBoxDev/TeleBox/issues'>反馈问题</a>",
        ].join("\n"),
        parseMode: "html",
      });
    }
  }
}

const helpPlugin = new HelpPlugin();

export default helpPlugin;

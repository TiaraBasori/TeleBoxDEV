import { listCommands, getPlugin } from "@utils/pluginManager";
import { Plugin } from "@utils/pluginBase";
import fs from "fs";
import path from "path";

function readVersion(): string {
  try {
    const packagePath = path.join(process.cwd(), "package.json");
    const packageJson = fs.readFileSync(packagePath, "utf-8");
    const packageData = JSON.parse(packageJson);
    return packageData.version || "未知版本";
  } catch (error) {
    console.error('Failed to read version:', error);
    return "未知版本";
  }
}

function formatCommandList(commands: string[]): string {
  const sortedCommands = commands.sort((a, b) => a.localeCompare(b));
  
  // 分析插件，找出多子指令插件
  const pluginGroups = new Map<string, string[]>();
  const singleCommands: string[] = [];
  
  sortedCommands.forEach(cmd => {
    const plugin = getPlugin(cmd);
    if (plugin && Array.isArray(plugin.command) && plugin.command.length > 1) {
      const mainCommand = plugin.command[0];
      if (!pluginGroups.has(mainCommand)) {
        pluginGroups.set(mainCommand, plugin.command);
      }
    } else {
      singleCommands.push(cmd);
    }
  });
  
  const result: string[] = [];
  
  // 基础命令显示
  if (singleCommands.length > 0) {
    const formattedCommands = singleCommands.map(cmd => `<code>${cmd}</code>`).join(' • ');
    result.push(`📋 <b>基础命令:</b> ${formattedCommands}`);
  }
  
  // 添加多子指令插件组
  if (pluginGroups.size > 0) {
    result.push(`\n🔧 <b>功能模块:</b>`);
    for (const [mainCommand, subCommands] of pluginGroups) {
      // 特殊处理：speedtest插件以speedtest为主命令显示
      if (mainCommand === 's' && subCommands.includes('speedtest')) {
        const otherCommands = subCommands.filter(cmd => cmd !== 'speedtest');
        const formattedSubs = otherCommands.map(cmd => `<code>${cmd}</code>`).join(' • ');
        result.push(`<b>speedtest:</b> ${formattedSubs}`);
      } else {
        const formattedSubs = subCommands.map(cmd => `<code>${cmd}</code>`).join(' • ');
        result.push(`<b>${mainCommand}:</b> ${formattedSubs}`);
      }
    }
  }
  
  return result.join('\n');
}

function htmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const helpPlugin: Plugin = {
  command: ["h", "help", "?"],
  description: "查看帮助信息和可用命令列表",
  cmdHandler: async (msg) => {
    try {
      const args = msg.text.split(' ').slice(1);
      
      if (args.length === 0) {
        // 显示所有命令列表
        const commands = listCommands();
        const version = readVersion();
        const totalCommands = commands.length;
        
        const helpText = [
          `🚀 <b>TeleBox v${htmlEscape(version)}</b> | ${totalCommands}个命令`,
          "",
          formatCommandList(commands),
          "",
          "💡 <code>.help [命令]</code> 查看详情 | <code>.npm search</code> 显示远程插件列表",
          "🔗 <a href='https://github.com/TeleBoxDev/TeleBox'>📦仓库</a> | <a href='https://github.com/TeleBoxDev/TeleBox_Plugins'>🔌插件</a>"
        ].join('\n');
        
        await msg.edit({ text: helpText, parseMode: "html" });
        return;
      }
      
      // 显示特定命令的帮助
      const command = args[0].toLowerCase();
      const plugin = getPlugin(command);
      
      if (!plugin) {
        await msg.edit({
          text: `❌ 未找到命令 <code>${htmlEscape(command)}</code>\n\n💡 使用 <code>.help</code> 查看所有命令`,
          parseMode: "html"
        });
        return;
      }
      
      // 格式化命令别名
      const aliases = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
      const aliasText = aliases.map(alias => `<code>.${alias}</code>`).join(' • ');
      
      const commandHelpText = [
        `🔧 <b>${htmlEscape(command.toUpperCase())}</b>`,
        "",
        `📝 <b>功能描述:</b>`,
        `${htmlEscape(plugin.description || '暂无描述信息')}`,
        "",
        `🏷️ <b>命令别名:</b>`,
        `${aliasText}`,
        "",
        `⚡ <b>使用方法:</b>`,
        `<code>.${command} [参数]</code>`,
        "",
        "💡 <i>提示: 使用</i> <code>.help</code> <i>查看所有命令</i>"
      ].join('\n');
      
      await msg.edit({ text: commandHelpText, parseMode: "html" });
      
    } catch (error: any) {
      console.error('Help plugin error:', error);
      const errorMsg = error.message?.length > 100 ? error.message.substring(0, 100) + '...' : error.message;
      await msg.edit({
        text: [
          "⚠️ <b>系统错误</b>",
          "",
          "📋 <b>错误详情:</b>",
          `<code>${htmlEscape(errorMsg || '未知系统错误')}</code>`,
          "",
          "🔧 <b>解决方案:</b>",
          "• 稍后重试命令",
          "• 重启 TeleBox 服务",
          "• 检查系统日志",
          "",
          "🆘 <a href='https://github.com/TeleBoxDev/TeleBox/issues'>反馈问题</a>"
        ].join('\n'),
        parseMode: "html"
      });
    }
  },
};

export default helpPlugin;

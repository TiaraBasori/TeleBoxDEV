import { listCommands, getPlugin } from "@utils/pluginManager";
import { Plugin } from "@utils/pluginBase";

function readVersion(): string {
  const fs = require("fs");
  const packageJson = fs.readFileSync("package.json");
  const packageData = JSON.parse(packageJson);
  return packageData.version;
}

const helpPlugin: Plugin = {
  command: ["h", "help"],
  description: "查看帮助信息",
  cmdHandler: async (msg) => {
    const [, ...args] = msg.message.split(" ");
    if (args.length === 0) {
      const commands = listCommands();
      await msg.edit({
        text:
          `可用命令列表:\n${commands
            .sort((a, b) => a.localeCompare(b))
            .join(", ")}\n使用 .help <命令> 查看具体帮助信息\n\n` +
          `当前版本: ${readVersion()}`,
      });
      return;
    }
    const command = args[0];
    const plugin = getPlugin(command);
    await msg.edit({
      text: plugin
        ? `插件 ${plugin.command} 的帮助信息:\n${
            plugin.description || "无描述"
          }`
        : `未找到命令 ${command} 的帮助信息`,
    });
  },
};

export default helpPlugin;

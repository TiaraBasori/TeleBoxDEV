import { NewMessageEvent } from "telegram/events";
import { listCommands, getPlugin } from "@utils/pluginManager";

const helpPlugin = {
  command: "help",
  description: "查看帮助信息",
  commandHandler: async (event: NewMessageEvent) => {
    const msg = event.message;
    const [, ...args] = msg.message.slice(1).split(" ");
    if (args.length === 0) {
      const commands = listCommands();
      await msg.edit({
        text: `
                可用命令列表:\n${commands
                  .sort((a, b) => a.localeCompare(b))
                  .join(", ")}\n使用 .help <命令> 查看具体帮助信息`,
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

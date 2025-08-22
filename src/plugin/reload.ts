import { Plugin } from "@utils/pluginBase";
import { loadPlugins } from "@utils/pluginManager";

const reloadPlugin: Plugin = {
  command: "reload",
  description: "重新加载插件",
  cmdHandler: async (msg) => {
    try {
      await loadPlugins();
      await msg.edit({ text: "插件已重新加载" });
    } catch (error) {
      await msg.edit({ text: `插件重新加载失败，请检查控制台日志，${error}` });
    }
  },
};

export default reloadPlugin;

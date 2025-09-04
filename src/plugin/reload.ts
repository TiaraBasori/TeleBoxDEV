import { Plugin } from "@utils/pluginBase";
import { loadPlugins } from "@utils/pluginManager";
import { Api } from "telegram";

class ReloadPlugin extends Plugin {
  description: string | (() => string) | (() => Promise<string>) =
    "重新加载所有插件";
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    reload: async (msg) => {
      // Show loading message for better UX
      await msg.edit({ text: "🔄 正在重新加载插件..." });

      try {
        const startTime = Date.now();
        await loadPlugins();
        const loadTime = Date.now() - startTime;
        await msg.edit({
          text: `✅ 插件已重新加载完成 (耗时: ${loadTime}ms)`,
        });
      } catch (error) {
        console.error("Plugin reload failed:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await msg.edit({
          text: `❌ 插件重新加载失败\n错误信息: ${errorMessage}\n请检查控制台日志获取详细信息`,
        });
      }
    },
  };
}

const reloadPlugin = new ReloadPlugin();

export default reloadPlugin;

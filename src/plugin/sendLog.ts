import { Plugin } from "@utils/pluginBase";
import os from "os";
import path from "path";

const sendLogPlugin: Plugin = {
  command: ["sendlog"],
  description: "发送日志",
  cmdHandler: async (msg) => {
    try {
      await msg.client?.sendFile("me", {
        file: path.join(os.homedir(), ".pm2/logs/telebox-out.log"),
      });
      await msg.client?.sendFile("me", {
        file: path.join(os.homedir(), ".pm2/logs/telebox-err.log"),
      });
      await msg.edit({
        text: "日志已经发送到 [我的收藏] 中，请前往查看",
      });
    } catch (err) {
      console.log(err);
    }
  },
};

export default sendLogPlugin;

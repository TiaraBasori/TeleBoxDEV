import { Plugin } from "@utils/pluginBase";
import { Api, client, TelegramClient } from "telegram";

class TestPlugin extends Plugin {
  description: string = "ceshi";
  cmdHandlers: Record<string, (msg: Api.Message) => Promise<void>> = {
    tst: async (msg) => {},
    test: async (msg) => {
      await msg.edit({ text: "原来是我没做" });
    },
  };
  cronTasks?:
    | Record<
        string,
        { cron: string; handler: (client: TelegramClient) => Promise<void> }
      >
    | undefined = {
    kkk: {
      cron: "*/5 * * * * *",
      handler: async (client) => {
        await client.sendMessage("me", {
          message: "cron 任务开始， 每5s发一次",
        });
      },
    },
  };
  listenMessageHandler?: ((msg: Api.Message) => Promise<void>) | undefined =
    async (msg) => {
      if (msg.text == "what can i say") {
        await msg.client?.sendMessage(msg.peerId, { message: "man" });
      }
    };
}

const plugin = new TestPlugin();

export default plugin;

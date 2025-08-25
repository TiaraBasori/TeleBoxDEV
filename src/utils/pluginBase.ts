import { Api } from "telegram";

abstract class Plugin {
  abstract command: string[];
  abstract description?: string;
  abstract cmdHandler: (msg: Api.Message) => Promise<void>;
  abstract listenMessageHandler?: (msg: Api.Message) => Promise<void>;
}

export { Plugin };

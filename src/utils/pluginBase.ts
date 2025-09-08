import { Api, TelegramClient } from "telegram";

type CronTask = {
  cron: string;
  description: string;
  handler: (client: TelegramClient) => Promise<void>;
};

abstract class Plugin {
  abstract description:
    | string
    | ((...args: any[]) => string | void)
    | ((...args: any[]) => Promise<string | void>);
  abstract cmdHandlers: Record<
    string,
    (msg: Api.Message, trigger?: Api.Message) => Promise<void>
  >;
  listenMessageHandler?: (msg: Api.Message) => Promise<void>;
  eventHandlers?: Array<{
    event?: any;
    handler: (event: any) => Promise<void>;
  }>;
  cronTasks?: Record<string, CronTask>;
}

// ✅ 运行时校验函数
function isValidPlugin(obj: any): obj is Plugin {
  if (!obj) return false;

  // description
  const desc = obj.description;
  const isValidDescription =
    typeof desc === "string" || typeof desc === "function";

  if (!isValidDescription) return false;

  // cmdHandlers
  if (typeof obj.cmdHandlers !== "object" || obj.cmdHandlers === null) {
    return false;
  }
  for (const key of Object.keys(obj.cmdHandlers)) {
    if (typeof obj.cmdHandlers[key] !== "function") {
      return false;
    }
  }

  // listenMessageHandler (optional)
  if (
    obj.listenMessageHandler &&
    typeof obj.listenMessageHandler !== "function"
  ) {
    return false;
  }

  // cronTasks (optional)
  if (obj.cronTasks) {
    if (typeof obj.cronTasks !== "object") return false;
    for (const key of Object.keys(obj.cronTasks)) {
      const task = obj.cronTasks[key];
      if (typeof task.cron !== "string") return false;
      if (typeof task.handler !== "function") return false;
    }
  }

  return true;
}

export { Plugin, isValidPlugin };

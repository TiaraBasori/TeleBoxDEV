import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { getApiConfig } from "./apiConfig";
import { readAppName } from "./teleboxInfoHelper";

let client: TelegramClient;

async function initializeClient() {
  let api = await getApiConfig();
  const proxy = api.proxy;
  if (proxy) {
    console.log("使用代理连接 Telegram:", proxy);
  }
  client = new TelegramClient(
    new StringSession(api.session),
    api.api_id!,
    api.api_hash!,
    { connectionRetries: 5, deviceModel: readAppName(), proxy }
  );
}

export async function getGlobalClient(): Promise<TelegramClient> {
  if (!client) {
    await initializeClient();
    return client;
  }
  return client;
}

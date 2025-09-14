import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { getApiConfig } from "./apiConfig";
import { readAppName } from "./teleboxInfoHelper";

let client: TelegramClient;

async function initializeClient() {
  let api = await getApiConfig();
  client = new TelegramClient(
    new StringSession(api.session),
    api.api_id!,
    api.api_hash!,
    { connectionRetries: 5, deviceModel: readAppName() }
  );
}

export async function getGlobalClient(): Promise<TelegramClient> {
  if (!client) {
    await initializeClient();
    return client;
  }
  return client;
}

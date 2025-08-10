import { TelegramClient } from "telegram";
import { StoreSession } from "telegram/sessions";
import getApiConfig from "./apiConfig";

let client: TelegramClient;

async function initializeClient() {
  let api = await getApiConfig();
  client = new TelegramClient(
    new StoreSession("my_session"),
    api.api_id,
    api.api_hash,
    { connectionRetries: 5 }
  );
}

export async function getGlobalClient(): Promise<TelegramClient> {
  if (!client) {
    await initializeClient();
    return client;
  }
  return client;
}

import "dotenv/config";
import { login } from "@utils/loginManager";
import { loadPlugins } from "@utils/pluginManager";
import { patchMsgEdit } from "hook/listen";
import "./hook/patches/telegram.patch";

// patchMsgEdit();

async function run() {
  await login();
  await loadPlugins();
}

run();

import { login } from "@utils/loginManager";
import { loadPlugins } from "@utils/pluginManager";
import { patchMsgEdit } from "hook/listen";

// patchMsgEdit();

async function run() {
  await login();
  await loadPlugins();
}

run();

import { login } from "@utils/loginManager";
import { loadPlugins } from "@utils/pluginManager";
import { patchMsgEdit } from "hook/listen";
import "./hook/message"

// patchMsgEdit();

async function run() {
  await login();
  await loadPlugins();
}

run();

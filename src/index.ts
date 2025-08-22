import { login } from "@utils/loginManager";
import { loadPlugins } from "@utils/pluginManager";

async function run() {
  await login();
  await loadPlugins();
}

run();

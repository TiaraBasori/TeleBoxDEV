import readline from "readline";
import { getGlobalClient } from "@utils/globalClient";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

export async function login() {
  console.log("Loading interactive example...");

  let client = await getGlobalClient();
  await client.start({
    phoneNumber: async () =>
      new Promise((resolve) =>
        rl.question("Please enter your number: ", resolve)
      ),
    password: async () =>
      new Promise((resolve) =>
        rl.question("Please enter your password: ", resolve)
      ),
    phoneCode: async () =>
      new Promise((resolve) =>
        rl.question("Please enter the code you received: ", resolve)
      ),
    onError: (err) => console.log(err),
  });
  console.log("You should now be connected.");
}
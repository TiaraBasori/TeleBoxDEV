import { NewMessageEvent } from "telegram/events";

export abstract class Plugin {
  abstract command: string;
  abstract description?: string;
  abstract commandHandler: (event: NewMessageEvent) => Promise<void>;
}
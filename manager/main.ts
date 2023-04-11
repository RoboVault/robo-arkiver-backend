import "https://deno.land/std@0.180.0/dotenv/load.ts";
import { arkiver, log } from "./deps.ts";
import { ArkiveManager } from "./packages/manager/manager.ts";

if (import.meta.main) {
  log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler("DEBUG"),
    },
    loggers: {
      arkiver: {
        level: "DEBUG",
        handlers: ["console"],
      },
    },
  });
  arkiver.logger().info("Starting Arkiver...");
  const manager = new ArkiveManager();
  await manager.init();
}

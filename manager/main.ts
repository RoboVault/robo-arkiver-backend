import "https://deno.land/std@0.180.0/dotenv/load.ts";
import { arkiver } from "./deps.ts";
import { ArkiveManager } from "./packages/manager/manager.ts";

if (import.meta.main) {
  arkiver.logger.info("Starting Arkiver...");
  const manager = new ArkiveManager();
  await manager.init();
}

import { load } from "https://deno.land/std@0.173.0/dotenv/mod.ts";
import { getEnv } from "./utils.ts";
if (getEnv('ENVIRONMENT') === 'dev') {
  await load()
}
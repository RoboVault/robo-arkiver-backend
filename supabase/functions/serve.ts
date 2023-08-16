import { Hono } from "./_shared/deps.ts";
import { app as Arkives } from "./arkives/routes.ts";
import { app as Logs } from "./logs/routes.ts";
import { app as ApiKey } from "./api-key/routes.ts";
import "https://deno.land/std@0.173.0/dotenv/load.ts";

const app = new Hono()

app.route('/arkives', Arkives)
app.route('/logs', Logs)
app.route('/api-key', ApiKey)

Deno.serve(app.fetch)


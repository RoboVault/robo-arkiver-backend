import { app } from "./routes.ts";

Deno.serve(app.fetch)

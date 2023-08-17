import { app } from "./routes.ts";

app.basePath('/api-key')

Deno.serve(app.fetch)

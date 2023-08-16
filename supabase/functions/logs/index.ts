import { app } from "./routes.ts"

app.basePath('/logs')

Deno.serve(app.fetch)

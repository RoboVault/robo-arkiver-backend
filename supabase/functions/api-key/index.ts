import { app as route } from "./routes.ts"
import { Hono } from "../_shared/deps.ts";

const app = new Hono()

app
	.basePath('/api-key')
	.route('*', route)

Deno.serve(app.fetch)

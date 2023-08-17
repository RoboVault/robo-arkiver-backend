import { serve } from "https://deno.land/std@0.189.0/http/server.ts";
import { app } from "./routes.ts";

app.basePath('/arkives')
serve(app.fetch)

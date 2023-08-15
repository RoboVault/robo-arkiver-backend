// url_test.ts
import { assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import "https://deno.land/std@0.173.0/dotenv/load.ts";
import { getEnv } from "../functions/_shared/utils.ts";

const URL = 'http://0.0.0.0:8000' // use getEnv("SUPABASE_FUNCTION_URL") to run on prod
const ANON_KEY = getEnv("SUPABASE_ANON_KEY")

Deno.test({ 
  name: "test get arkives",
  fn: async () => {
    const url = `${URL}/arkives`
    console.log(url)
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    assertEquals(response.status, 200)
    console.log(response)
  },
  sanitizeResources: false,
  sanitizeOps: false
});
import { assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import "https://deno.land/std@0.173.0/dotenv/load.ts";
import { getEnv } from "../functions/_shared/utils.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.5.0";

const FUNCTIONS_URL = 'http://0.0.0.0:8000'
const ANON_KEY = getEnv("SUPABASE_ANON_KEY")
const headers = (token: string = ANON_KEY) => {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

/** TODO Tests:
 * - Successfully creates key ✔
 * - Successfully reads key
 * - Successfully deletes key
 * - Unauthenticated fails to read key
 * - Unauthenticated fails to create key
 * - Unauthenticated fails to delete key
 * - Fails to read another users api key
 * - Fails to create API Key for another user
 * - Fails to delete another users api key
 */

async function getAccessToken() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const email = getEnv("SUPABASE_EMAIL");
  const password = getEnv("SUPABASE_PASSWORD");
  const supabase = createClient(supabaseUrl, ANON_KEY)
  const login = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (login.data.session === null) throw new Error('')
  return login.data.session.access_token
}

Deno.test({ 
  name: "Successfully creates key",
  fn: async () => {
    const url = `${FUNCTIONS_URL}/api-key`
    const token = await getAccessToken()
    const body = JSON.stringify({ name: 'unit test key!' })
    const response = await fetch(url, {
      method: "POST",
      headers: headers(token),
      body
    });
    assertEquals(response.status, 200)
    const { name, apiKey } = await response.json()
    assertEquals(name, 'unit test key!')
    assertEquals(apiKey.length, 64)
  },
  sanitizeResources: false,
  sanitizeOps: false
});


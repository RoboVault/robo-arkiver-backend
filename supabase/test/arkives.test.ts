// url_test.ts
import { assertEquals } from 'https://deno.land/std@0.174.0/testing/asserts.ts'
import 'https://deno.land/std@0.173.0/dotenv/load.ts'
import { getEnv } from '../functions/_shared/utils.ts'
import { z } from 'https://deno.land/x/zod@v3.21.4/mod.ts'

const URL = 'http://0.0.0.0:8000'
const ANON_KEY = getEnv('SUPABASE_ANON_KEY')

const ARKIVE_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
  user_id: z.string(),
  public: z.boolean(),
  thumbnail_url: z.string().nullable(),
  code_repo_url: z.string().nullable(),
  project_url: z.string().nullable(),
  environment: z.string(),
  username: z.string(),
  featured: z.boolean(),
  deployments: z.array(z.object({
    id: z.string(),
    created_at: z.string(),
    major_version: z.string(),
    minor_version: z.string(),
    status: z.string(),
    manifest: z.any(),
  })),
})

Deno.test({
  name: 'test get arkives',
  fn: async () => {
    const url = `${URL}/arkives`
    console.log(url)
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    })
    assertEquals(response.status, 200)
    const arkives = await response.json()
    assertEquals(arkives.length > 10, true)
    const { success } = z.array(ARKIVE_SCHEMA).safeParse(arkives)
    assertEquals(success, true)
  },
  sanitizeResources: false,
  sanitizeOps: false,
})

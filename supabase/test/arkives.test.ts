// url_test.ts
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.174.0/testing/asserts.ts'
import { getEnv } from '../functions/_shared/utils.ts'
import { z } from 'https://deno.land/x/zod@v3.21.4/mod.ts'
import { Arkive } from '../functions/_shared/models/arkive.ts'

import 'https://deno.land/std@0.173.0/dotenv/load.ts'

const ARKIVES_URL = 'http://localhost:8000/arkives'

const ANON_KEY = getEnv('SUPABASE_ANON_KEY')
const getHeaders = (token: string = ANON_KEY) => {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

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

/**
 * TODO:
 * Study/Learn how to setup mockData instead of using live data.
 * Then add the following tests:
 * 
 * - CREATE arkive with valid input
 * - CREATE arkive with invalid/missing properties
 * - CREATE arkive with an existing arkiveName (unique constraint)
 * 
 * - UPDATE an arkive with valid inputs
 * - UPDATE a non-existent arkive
 * - UPDATE an arkive with invalid/missing/empty properties
 * - UPDATE arkive and change name to existing arkiveName (unique constraint)
 * 
 * - DELETE a non-existent arkive
 * - DELETE an existing arkive
 */

/**
 * Happy Path Tests:
 * - GET Arkives with no path parameters
 * - GET all Arkives of a user
 * - GET arkive using arkiveName
 */

Deno.test({
  name: 'GET all Arkives with no path parameters',
  fn: async () => {
    const url = `${ARKIVES_URL}`

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders()
    })

    assertEquals(response.status, 200)

    const arkives = await response.json()
    assertNotEquals(arkives.length, 0)

    const { success } = z.array(ARKIVE_SCHEMA).safeParse(arkives)
    assertEquals(success, true)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET all Arkives of a user',
  fn: async () => {
    const url = `${ARKIVES_URL}/robolabs`

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders()
    })

    assertEquals(response.status, 200)

    const arkives = await response.json()

    // check if arkives has other user
    const otherUserArkives = arkives.find((arkive: Arkive) => {
      return arkive.username === 's_battenally'
    })

    // It should NOT return arkives owned by other user
    assertEquals(otherUserArkives, undefined)

    // check if arkives owned by the user
    const userArkives = arkives.find((arkive: Arkive) => {
      return arkive.username === 'robolabs'
    })

    // It should return arkives owned by user
    assertNotEquals(userArkives.length, 0)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET arkive using arkiveName',
  fn: async () => {
    // use public arkive
    const url = `${ARKIVES_URL}/robolabs/aave-hourly-data`

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders()
    })

    assertEquals(response.status, 200)

    const arkive = await response.json()

    // It should return arkive
    assertEquals(arkive.name, 'aave-hourly-data')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

/**
 * Negative Tests:
 * 
 * - GET Arkive using invalid username
 * - GET Arkive using invalid arkiveName 
 */

Deno.test({
  name: 'GET arkive using invalid username',
  fn: async () => {
    const url = `${ARKIVES_URL}/invalid`

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders()
    })

    // It should still throw 200 since this is not specific search
    assertEquals(response.status, 200)

    const arkives = await response.json()

    // It should NOT return arkives
    assertEquals(arkives.length, 0)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET arkive using invalid arkiveName',
  fn: async () => {
    const url = `${ARKIVES_URL}/robolabs/invalid`

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders()
    })

    // It should throw 404 NOT FOUND since there is no "invalid" arkiveName
    assertEquals(response.status, 404)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})
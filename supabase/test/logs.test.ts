import { assertEquals } from 'https://deno.land/std@0.174.0/testing/asserts.ts'
import 'https://deno.land/std@0.173.0/dotenv/load.ts'
import { getEnv } from '../functions/_shared/utils.ts'

const FUNCTIONS_URL = 'http://localhost:8000'
const ANON_KEY = getEnv('SUPABASE_ANON_KEY')
const headers = (token: string = ANON_KEY) => {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/** TODO Tests:
 * - Successfully reads logs
 * - all query params are optional
 * - Successful start and stop 
 * - Successful source
 * - Successful level
 * - Successful page
 * - Fails to read logs with invalid arkiveId
 * - Fails to read logs with invalid version
 * - Fails to read logs with invalid start
 * - Fails to read logs with invalid stop
 * - Fails to read logs with invalid source
 * - Fails to read logs with invalid level
 * - Fails to read logs with invalid page
 * - Fails to read logs with invalid env
 * - Fails to read logs with invalid token
 */

Deno.test({
  name: 'Successfully creates key',
  fn: async () => {
    // const { start, stop, source, level, page } = c.req.query()
    const url = new URL(`${FUNCTIONS_URL}/logs/82/1.1`)
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
    const stop = new Date()
    url.searchParams.append('start', start.toISOString())
    url.searchParams.append('stop', stop.toISOString())
    // url.searchParams.append('source', 'staging')
    // url.searchParams.append('level', 'staging')
    // url.searchParams.append('page', 'staging')
    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })
    console.log(response)
    assertEquals(response.status, 200)
    const res = await response.json()
    console.log(res)
    // assertEquals(name, 'unit test key!')
    // assertEquals(apiKey.length, 64)
  },
  sanitizeResources: false,
  sanitizeOps: false,
})

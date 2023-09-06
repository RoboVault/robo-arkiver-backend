import {
  assertEquals,
  assertNotEquals
} from 'https://deno.land/std@0.174.0/testing/asserts.ts'
import 'https://deno.land/std@0.173.0/dotenv/load.ts'
import { getEnv } from '../functions/_shared/utils.ts'

const LOGS_URL = 'http://localhost:8000/logs'

// TODO: Remove this - do not use this
// const LOGS_URL = 'https://egutsbjqffrqmhqbbfia.functions.supabase.co/logs-test'

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
  name: 'GET logs with no parameters',
  fn: async () => {
    const url = new URL(`${LOGS_URL}/82/1.1`)
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
    const stop = new Date()

    url.searchParams.append('start', start.toISOString())
    url.searchParams.append('stop', stop.toISOString())

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 200)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with empty severity parameters',
  fn: async () => {
    const url = new URL(`${LOGS_URL}/82/1.1`)
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
    const stop = new Date()

    url.searchParams.append('start', start.toISOString())
    url.searchParams.append('stop', stop.toISOString())
    url.searchParams.append('level', '[]')

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 200)

    const res = await response.json()

    // It should return empty since there is no severity provided
    assertEquals(res.length, 0)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with severity parameters',
  fn: async () => {
    const url = new URL(`${LOGS_URL}/82/1.1`)
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
    const stop = new Date()

    url.searchParams.append('start', start.toISOString())
    url.searchParams.append('stop', stop.toISOString())
    url.searchParams.append('level', '["INFO"]')

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 200)

    const res = await response.json()

    // It should NOT return empty (expecting data from source)
    assertNotEquals(res.length, 0)

    // Check if there is severity other than INFO
    const otherSeverity = res.find((item: any) => {
      return item.level_name === 'DEBUG' || item.level_name === 'ERROR'
    })

    // It should NOT return level_name other than INFO
    assertEquals(otherSeverity, undefined)

    // Check if there is INFO severity
    const infoSeverity = res.find((item: any) => {
      // return on the first instance of INFO
      return item.level_name === 'INFO'
    })

    // It should return level_name INFO
    assertEquals(infoSeverity.level_name, 'INFO')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with empty source parameters',
  fn: async () => {
    const url = new URL(`${LOGS_URL}/82/1.1`)
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
    const stop = new Date()

    url.searchParams.append('start', start.toISOString())
    url.searchParams.append('stop', stop.toISOString())
    url.searchParams.append('source', '[]')

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 200)

    const res = await response.json()

    // It should return empty since there is no source provided
    assertEquals(res.length, 0)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with source parameters',
  fn: async () => {
    const url = new URL(`${LOGS_URL}/82/1.1`)
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
    const stop = new Date()

    url.searchParams.append('start', start.toISOString())
    url.searchParams.append('stop', stop.toISOString())
    url.searchParams.append('source', '["arkive"]')

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 200)

    const res = await response.json()

    // It should NOT return empty (expecting data from source)
    assertNotEquals(res.length, 0)

    // Check if there is source other than INFO
    const otherSource = res.find((item: any) => {
      return item.source === 'optimism'
    })

    // It should NOT return source other than arkive
    assertEquals(otherSource, undefined)

    // Check if there is arkive source
    const arkiveSource = res.find((item: any) => {
      // return on the first instance of arkive
      return item.source === 'arkive'
    })

    // It should return source arkive
    assertEquals(arkiveSource.source, 'arkive')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

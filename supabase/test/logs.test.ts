import {
  assertEquals,
  assertNotEquals
} from 'https://deno.land/std@0.174.0/testing/asserts.ts'
import 'https://deno.land/std@0.173.0/dotenv/load.ts'
import { getEnv } from '../functions/_shared/utils.ts'

// const LOGS_URL = 'http://localhost:8000/logs'

// TODO: Remove this - do not use this
const LOGS_URL = 'https://egutsbjqffrqmhqbbfia.functions.supabase.co/logs-test'

const ANON_KEY = getEnv('SUPABASE_ANON_KEY')
const headers = (token: string = ANON_KEY) => {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

const baseSetup = (urlParam?: string) => {
  const defaultUrl = `${LOGS_URL}/82/1.1`
  const url = new URL(`${urlParam ? urlParam : defaultUrl}`)
  const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
  const stop = new Date()

  url.searchParams.append('start', start.toISOString())
  url.searchParams.append('stop', stop.toISOString())

  return url
}

/**
 * Happy Path Tests:
 * 1. GET Logs without any parameters
 * 2. GET Logs with start and stop date parameters
 * 3. GET Logs with valid severity parameters
 * 4. GET Logs with valid source parameters
 */

Deno.test({
  name: 'GET logs with no parameters',
  fn: async () => {
    const url = new URL(`${LOGS_URL}/82/1.1`)

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
  name: 'GET logs with start and stop date parameters',
  fn: async () => {
    const url = baseSetup()

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 200)

    const res = await response.json()
    assertNotEquals(res.length, 0)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with severity parameters',
  fn: async () => {
    const url = baseSetup()
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
  name: 'GET logs with source parameters',
  fn: async () => {
    const url = baseSetup()
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

/**
 * Negative Test
 * 
 * - GET Logs of an invalid arkiveId
 * - GET Logs of an invalid arkive version
 * - GET Logs with inalid start and stop date
 * - GET Logs with invalid source options
 * - GET Logs with invalid level_name options
 * - GET Logs with empty severity
 * - GET Logs with empty source
 * - GET Logs with invalid page
 * - GET Logs with invalid token
 * 
 * TODO: 
 * - Fails to read logs with invalid env
 */

Deno.test({
  name: 'GET logs of an invalid arkiveId',
  fn: async () => {
    const url = baseSetup(`${LOGS_URL}/invalid-id/1.1`)

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    // TODO: Probably better to return 404 error for specific arkive check
    assertEquals(response.status, 200)

    const res = await response.json()

    // It should return empty since the id is not valid
    assertEquals(res.length, 0)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs of an invalid version',
  fn: async () => {
    const url = baseSetup(`${LOGS_URL}/82/11`)

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 400)

    const errorMessage = await response.text()

    assertEquals(errorMessage, 'version must be in the format of major.minor')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with invalid start and stop date',
  fn: async () => {
    const url = new URL(`${LOGS_URL}/82/1.1`)
    const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
    const stop = new Date()

    // invalid
    url.searchParams.append('start', stop.toISOString())
    url.searchParams.append('stop', start.toISOString())

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 500)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with invalid source',
  fn: async () => {
    const url = baseSetup()
    url.searchParams.append('source', '["invalid"]')

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 200)

    const res = await response.json()

    // It should return empty since there is no valid source provided
    assertEquals(res.length, 0)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with invalid severity',
  fn: async () => {
    const url = baseSetup()
    url.searchParams.append('level', '["invalid"]')

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    assertEquals(response.status, 200)

    const res = await response.json()
    assertEquals(res.length, 0)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with empty severity parameters',
  fn: async () => {
    const url = baseSetup()
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
  name: 'GET logs with empty source parameters',
  fn: async () => {
    const url = baseSetup()
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
  name: 'GET logs with invalid page',
  fn: async () => {
    const url = baseSetup()
    url.searchParams.append('page', '-1')

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(),
    })

    // Throw internal server error
    assertEquals(response.status, 500)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET logs with invalid token',
  fn: async () => {
    const url = baseSetup()
    url.searchParams.append('page', '-1')

    const response = await fetch(url, {
      method: 'GET',
      headers: headers('invalid'),
    })

    // Throw internal server error
    assertEquals(response.status, 500)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})


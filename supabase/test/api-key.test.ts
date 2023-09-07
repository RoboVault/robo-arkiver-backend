import { assertEquals } from 'https://deno.land/std@0.174.0/testing/asserts.ts'
import { getEnv } from '../functions/_shared/utils.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.5.0'
import { assertNotEquals } from 'https://deno.land/std@0.132.0/testing/asserts.ts'
import 'https://deno.land/std@0.173.0/dotenv/load.ts'

type Token = {
  name?: string,
  api_key?: string
}

const API_URL = 'http://localhost:8000/api-key'

const ANON_KEY = getEnv('SUPABASE_ANON_KEY')
const headers = (token: string = ANON_KEY) => {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function getAccessToken(email = '', password = '') {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const emailEnv = email || getEnv('SUPABASE_EMAIL')
  const passwordEnv = password || getEnv('SUPABASE_PASSWORD')

  const supabase = createClient(supabaseUrl, ANON_KEY, {
    auth: { persistSession: false },
  })

  const login = await supabase.auth.signInWithPassword({
    email: emailEnv,
    password: passwordEnv,
  })

  return login.data.session?.access_token
}

/**
 * Happy Path Tests:
 * 
 * NOTE: These tests should follow this order strictly
 * Create test data, read the created test data, then delete it,
 * Otherwise, the tests will fail.
 * 
 * - CREATE API keys successfully
 * - GET API keys of the user
 * - DELETE API key successfully
 * 
 */

Deno.test({
  name: 'CREATE API Keys Successfully',
  fn: async () => {
    const url = `${API_URL}`
    const token = await getAccessToken()
    const body = JSON.stringify({ name: 'Test-Token' })

    const response = await fetch(url, {
      method: 'POST',
      headers: headers(token),
      body,
    })

    assertEquals(response.status, 200)
    const { name, apiKey } = await response.json()

    assertEquals(name, 'Test-Token')
    assertEquals(apiKey.length, 64)

    // Always clean up test data right after creating,
    // delete the created key in DELETE test
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'GET API Keys of the user',
  fn: async () => {
    const url = `${API_URL}`
    const token = await getAccessToken()

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(token),
    })

    assertEquals(response.status, 200)
    const tokens = await response.json()

    assertNotEquals(tokens, 0)

    // Find the token initially created for testing
    const testToken: Token = tokens.find((token: Token) => {
      // always have the same name here in CREATE test
      return token.name === 'Test-Token'
    })

    assertEquals(testToken.name, 'Test-Token')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'DELETE API Key Successfully',
  fn: async () => {
    const url = `${API_URL}`
    const token = await getAccessToken()

    const getResponse = await fetch(url, {
      method: 'GET',
      headers: headers(token),
    })

    const tokens = await getResponse.json()
    // Find the token initially created for testing
    const testToken: Token = tokens.find((token: Token) => {
      return token.name === 'Test-Token'
    })

    const body = JSON.stringify({ apiKey: testToken.api_key })

    // Delete the token that was created
    const deleteResponse = await fetch(url, {
      method: 'DELETE',
      headers: headers(token),
      body
    })

    // It should send 200 status
    assertEquals(deleteResponse.status, 200)

    const getDeletedToken = await fetch(url, {
      method: 'GET',
      headers: headers(token),
    })

    // validate if the token is really deleted
    const validateTokens = await getDeletedToken.json()
    const testDeletedToken: Token = validateTokens.find((token: Token) => {
      return token.name === 'Test-Token'
    })

    // The token should NOT exist
    assertEquals(testDeletedToken, undefined)
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

/**
 * Negative Tests:
 * 
 * - GET keys with incorrect credentials
 * - CREATE API key with incorrect credentials
 * - DELETE API key with incorrect credentials
 * - DELETE non-existent API Key
 * - DELETE API key without body
 * 
 * TODO:
 * - READ another users api key
 * - CREATE API key for other user
 * - DELETE API key owned by other user
 */

Deno.test({
  name: 'GET keys with incorrect credentials',
  fn: async () => {
    const url = `${API_URL}`
    const token = await getAccessToken(
      'invalid@gmail.com',
      'invalid1234!'
    )

    const response = await fetch(url, {
      method: 'GET',
      headers: headers(token),
    })

    const error = await response.text()
    const parsedError = JSON.parse(error)

    assertEquals(response.status, 401)
    assertEquals(parsedError.name, 'AuthApiError')
    assertEquals(parsedError.error, 'invalid claim: missing sub claim')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'CREATE API key with incorrect credentials',
  fn: async () => {
    const url = `${API_URL}`
    const token = await getAccessToken(
      'invalid@gmail.com',
      'invalid1234!'
    )

    const body = JSON.stringify({ name: 'Invalid-Test-Token' })

    const response = await fetch(url, {
      method: 'POST',
      headers: headers(token),
      body,
    })

    const error = await response.text()
    const parsedError = JSON.parse(error)

    assertEquals(response.status, 401)
    assertEquals(parsedError.name, 'AuthApiError')
    assertEquals(parsedError.error, 'invalid claim: missing sub claim')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'DELETE API key with incorrect credentials',
  fn: async () => {
    const url = `${API_URL}`
    const token = await getAccessToken(
      'invalid@gmail.com',
      'invalid1234!'
    )

    const body = JSON.stringify({ apiKey: 'invalid-token' })

    const response = await fetch(url, {
      method: 'DELETE',
      headers: headers(token),
      body
    })

    const error = await response.text()
    const parsedError = JSON.parse(error)

    assertEquals(response.status, 401)
    assertEquals(parsedError.name, 'AuthApiError')
    assertEquals(parsedError.error, 'invalid claim: missing sub claim')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'DELETE non-existent API Key',
  fn: async () => {
    const url = `${API_URL}`
    const token = await getAccessToken()

    const body = JSON.stringify({ apiKey: 'invalid-token' })

    const response = await fetch(url, {
      method: 'DELETE',
      headers: headers(token),
      body
    })

    const error = await response.text()
    const parsedError = JSON.parse(error)

    assertEquals(response.status, 400)
    assertEquals(parsedError.error, 'Invalid apiKey')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})

Deno.test({
  name: 'DELETE Api key without body',
  fn: async () => {
    const url = `${API_URL}`
    const token = await getAccessToken()

    const response = await fetch(url, {
      method: 'DELETE',
      headers: headers(token),
    })

    const error = await response.text()
    const parsedError = JSON.parse(error)

    assertEquals(response.status, 400)
    assertEquals(parsedError.message, 'Malformed JSON in request body')
  },

  sanitizeResources: false,
  sanitizeOps: false,
})
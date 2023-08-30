// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getEnv } from '../_shared/utils.ts'
import { createClient } from '../_shared/deps.ts'
import { SUPABASE_TABLES } from '../../../manager/packages/constants.ts'

serve(async (req) => {
  const { username } = await req.json()

  const supabaseUrl = getEnv('SUPABASE_URL')
  const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY')
  const token = req.headers.get('Authorization') ??
    `Bearer ${supabaseAnonKey}`
  const supabase = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: { Authorization: token },
      },
    },
  )

  const userRes = await supabase.auth.getUser(token)
  if (!userRes.data) {
    return new Response('Unauthorized', { status: 401 })
  }

  const updateRes = await supabase
    .from(SUPABASE_TABLES.USER_PROFILE)
    .upsert({ username, id: userRes.data.user?.id })

  if (updateRes.error) {
    return new Response(updateRes.error.message, { status: 500 })
  }

  return new Response(`Successfully updated profile for ${username}`)
})

// To invoke:
// curl -i --location --request POST 'http://localhost:54321/functions/v1/' \
//   --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
//   --header 'Content-Type: application/json' \
//   --data '{"name":"Functions"}'

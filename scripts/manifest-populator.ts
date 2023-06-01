import 'https://deno.land/std@0.189.0/dotenv/load.ts'
import { getSupabaseClient } from '../manager/packages/utils.ts'

const supabase = getSupabaseClient()

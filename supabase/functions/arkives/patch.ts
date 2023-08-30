import { SUPABASE_TABLES } from '../../../manager/packages/constants.ts'
import { SupabaseClient, z } from '../_shared/deps.ts'
import { Arkive } from '../_shared/types.ts'

export const patchSchema = z.object({
  visibility: z.optional(z.literal('public')),
  name: z.optional(z.string()),
  public: z.optional(z.boolean()),
})

export type PatchParams = z.infer<typeof patchSchema> & {
  arkiveName: string
  userId: string
}

// update existing arkive in db
export const patch = async (
  supabase: SupabaseClient,
  params: PatchParams,
) => {
  // remove arkiveName and userId in params
  const { arkiveName, userId, ...partialParams } = params

  // check if arkive exists
  const selectedArkive = await supabase
    .from(SUPABASE_TABLES.ARKIVE)
    .select<'*', Arkive>('*')
    .eq('user_id', userId)
    .eq('name', arkiveName)
    .single()

  if (selectedArkive.error) {
    throw selectedArkive.error
  }

  // override old properties with new values
  const patchedArkive = {
    ...selectedArkive.data,
    ...partialParams,
  }

  // update arkive in db
  const updateRes = await supabase
    .from(SUPABASE_TABLES.ARKIVE)
    .update({ ...patchedArkive })
    .eq('user_id', userId)
    .eq('name', arkiveName)
    .select<'*', Arkive>('*')

  if (updateRes.error) {
    throw updateRes.error
  }

  return updateRes.data
}

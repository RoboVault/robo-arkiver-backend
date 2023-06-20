import { SUPABASE_TABLES } from '../../../manager/src/constants.ts'
import { SupabaseClient, z } from '../_shared/deps.ts'
import { Arkive } from '../_shared/types.ts'

export const patchSchema = z.object({
	visibility: z.optional(z.literal('public')),
	name: z.optional(z.string()),
})

export type PatchParams = z.infer<typeof patchSchema> & {
	arkivename: string
	userId: string
}

// update existing arkive in db
export const patch = async (
	supabase: SupabaseClient,
	params: PatchParams,
) => {
	// check params
	const { arkivename } = params

	// check if arkive exists
	const selectRes = await supabase
		.from(SUPABASE_TABLES.ARKIVE)
		.select<'*', Arkive>('*')
		.eq('user_id', params.userId)
		.eq('name', arkivename)
		.single()

	if (selectRes.error) {
		throw selectRes.error
	}

	// update arkive in db
	const updateRes = await supabase
		.from(SUPABASE_TABLES.ARKIVE)
		.update<{ name: string; public: boolean }>({
			name: params.name ? params.name : selectRes.data.name,
			public: params.visibility
				? params.visibility === 'public'
				: selectRes.data.public,
		})
		.eq('user_id', params.userId)
		.eq('name', arkivename)
		.select<'*', Arkive>('*')

	if (updateRes.error) {
		throw updateRes.error
	}

	return updateRes.data
}

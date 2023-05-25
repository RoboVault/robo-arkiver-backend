import { SUPABASE_TABLES } from '../../../manager/packages/constants.ts'
import { SupabaseClient } from '../_shared/deps.ts'

export const del = async (
	supabase: SupabaseClient,
	params: { arkivename: string; userId: string },
) => {
	const { arkivename, userId } = params

	const arkiveRes = await supabase.from(SUPABASE_TABLES.ARKIVE)
		.select('*')
		.eq('name', arkivename)
		.eq('user_id', userId)

	if (arkiveRes.error) {
		throw arkiveRes.error
	}

	const id = arkiveRes.data[0].id

	const delDeploymentRes = await supabase
		.from(SUPABASE_TABLES.DEPLOYMENTS)
		.delete()
		.eq('arkive_id', parseInt(id))
		.select()

	if (delDeploymentRes.error) {
		throw delDeploymentRes.error
	}

	const delDbRes = await supabase
		.from(SUPABASE_TABLES.ARKIVE)
		.delete()
		.eq('id', parseInt(id))
		.select()

	if (delDbRes.error) {
		throw delDbRes.error
	}

	// delete from storage
	const path = `${userId}/${id}`
	const readStorageRes = await supabase.storage
		.from(SUPABASE_TABLES.PACKAGES)
		.list(path)

	if (readStorageRes.error) {
		throw readStorageRes.error
	}

	const deleteStorageRes = await supabase.storage
		.from(SUPABASE_TABLES.PACKAGES)
		.remove(readStorageRes.data.map((f) => `${path}/${f.name}`))

	if (deleteStorageRes.error) {
		throw deleteStorageRes.error
	}

	return delDbRes.data
}

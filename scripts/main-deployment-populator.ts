import "https://deno.land/std@0.191.0/dotenv/load.ts";
import { SUPABASE_TABLES } from "../manager/src/constants.ts";
import { SupabaseProvider } from "../manager/src/providers/supabase.ts";
import { filterRawArkives, getSupabaseClient } from "../manager/src/utils.ts";

const supabase = getSupabaseClient()

const provider = new SupabaseProvider({
	environment: 'staging',
	supabase,
})

const rawArkives = await provider.getRawArkives()

const deployments = filterRawArkives(rawArkives, ['retired'])

const latestDeployments = deployments.reduce((acc, deployment) => {
	const current = acc.get(deployment.id)
	if (!current || current.deployment.major_version < deployment.deployment.major_version || (current.deployment.major_version === deployment.deployment.major_version && current.deployment.minor_version < deployment.deployment.minor_version)) {
		acc.set(deployment.id, deployment)
	}
	return acc
}, new Map<number, typeof deployments[0]>())

const latestDeploymentsArray = Array.from(latestDeployments.values())

latestDeploymentsArray.forEach(async (deployment) => {
	try {
		console.log(`Updating main deployment for ${deployment.id}: ${deployment.deployment.id}`)
		await supabase
			.from(SUPABASE_TABLES.ARKIVE)
			.update({
				main_deployment_id: deployment.deployment.id,
			})
			.eq('id', deployment.id)
	} catch (e) {
		console.log(e)
	}
})
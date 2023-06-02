import 'https://deno.land/std@0.189.0/dotenv/load.ts'
import { getSupabaseClient, rm, unpack } from '../manager/packages/utils.ts'
import { SUPABASE_TABLES } from '../manager/packages/constants.ts'
import { path as denoPath } from '../manager/deps.ts'
import { RawArkive } from '../manager/packages/providers/supabase.ts'
import {
	JSONBigIntReplacer,
	parseArkiveManifest,
} from '../../robo-arkiver/mod.ts'

const supabase = getSupabaseClient()

const columns = `*, ${SUPABASE_TABLES.DEPLOYMENTS}(*)` as const

const { data, error } = await supabase
	.from(SUPABASE_TABLES.ARKIVE)
	.select<typeof columns, RawArkive>(columns)

if (error) throw error

for (const arkive of data) {
	for (const deployment of arkive.deployments) {
		pull(arkive, deployment)
	}
}

async function pull(
	arkive: RawArkive,
	deployment: RawArkive['deployments'][number],
) {
	const path = `${arkive.user_id}/${arkive.id}`
	const version = `${deployment.major_version}_${deployment.minor_version}`

	const { data, error } = await supabase.storage
		.from(SUPABASE_TABLES.PACKAGES)
		.download(
			`${path}/${version}.tar.gz`,
		)
	if (error) {
		throw error
	}

	const localDir = new URL(
		denoPath.join('./arkives', `/${path}/${version}`),
		import.meta.url,
	)
	const localPath = new URL(
		denoPath.join('./arkives', `/${path}/${version}.tar.gz`),
		import.meta.url,
	)

	await Deno.mkdir(localDir, { recursive: true })
	await Deno.writeFile(localPath, new Uint8Array(await data.arrayBuffer()))
	await unpack(localPath.pathname, localDir.pathname)
	await rm(localPath.pathname)

	const manifestPath = new URL(
		denoPath.join('./arkives', `/${path}/${version}/manifest.ts`),
		import.meta.url,
	)

	let manifestImport
	try {
		manifestImport = await import(manifestPath.href)
	} catch (e) {
		console.log(`Error importing ${manifestPath.href}: ${e}`)
		return
	}
	const manifest = manifestImport.default ?? manifestImport.manifest

	const { problems, data: parsedManifest } = parseArkiveManifest.manifest(
		manifest,
	)

	if (problems) {
		console.log(`Problems with ${manifestPath.href}: ${problems}`)
		return
	}

	const serializedManifest = JSON.parse(
		JSON.stringify(parsedManifest, JSONBigIntReplacer),
	)

	const { data: updateData, error: updateError } = await supabase
		.from(SUPABASE_TABLES.DEPLOYMENTS)
		.update({ manifest: serializedManifest })
		.eq('id', deployment.id)
		.select('*')

	if (updateError) {
		console.log(`Error updating ${manifestPath.href}: ${updateError}`)
		return
	}

	console.log(`Updated ${manifestPath.href}: ${updateData}`)
}

// deno-lint-ignore-file no-explicit-any
import { SupabaseClient, z } from '../_shared/deps.ts'
import { Arkive } from '../_shared/types.ts'
import { HttpError } from '../_shared/http_error.ts'
import { SUPABASE_TABLES } from '../../../manager/packages/constants.ts'
import { parseArkiveManifest } from '../../../../robo-arkiver/src/arkiver/manifest-validator.ts'

export const postSchema = z.object({
	name: z.string(),
	pkg: z.instanceof(File),
	isPublic: z.optional(z.string()),
	update: z.enum(['major', 'minor']),
	manifest: z.string(),
	environment: z.optional(z.string()),
})

export type PostParams = z.infer<typeof postSchema> & { userId: string }

export const post = async (
	supabase: SupabaseClient,
	params: PostParams,
) => {
	const { userId, name, pkg, isPublic, update, manifest, environment } = params
	const parsedManifest = JSON.parse(manifest)
	const { problems, data: validatedManifest } = parseArkiveManifest.manifest(
		parsedManifest,
	)
	if (problems) {
		throw new HttpError(400, `Bad Request: ${problems}`)
	}

	// check if arkive already exists
	const selectRes = await supabase
		.from(SUPABASE_TABLES.ARKIVE)
		.select<
			'id, environment, deployments(major_version, minor_version)',
			{
				id: string
				environment: string
				deployments: { major_version: number; minor_version: number }[]
			}
		>('id, environment, deployments(major_version, minor_version)')
		.eq('user_id', userId)
		.eq('name', name)

	if (selectRes.error) {
		throw selectRes.error
	}

	if (selectRes.data.length > 0) {
		if (update === undefined) {
			throw new HttpError(400, 'Bad Request')
		}
		return await updateDeployment(
			supabase,
			selectRes.data[0],
			{
				pkg,
				userId,
				update,
				manifest: validatedManifest,
				environment,
			},
		)
	} else {
		return await createDeployment(
			{
				supabase,
				userId,
				name,
				pkg,
				isPublic,
				manifest: validatedManifest,
				environment,
			},
		)
	}
}

const updateDeployment = async (
	supabase: SupabaseClient,
	arkive: {
		id: string
		deployments: { major_version: number; minor_version: number }[]
		environment: string
	},
	params: {
		userId: string
		pkg: File
		update: 'major' | 'minor'
		manifest: any
		environment?: string
	},
) => {
	// check params
	const { userId, pkg, update, manifest, environment } = params
	if (
		(update !== 'major' && update !== 'minor')
	) {
		throw new HttpError(400, 'Bad Request')
	}

	// get new version number
	const { major_version, minor_version } = arkive.deployments.reduce(
		(acc, cur) => {
			let minor_version: number
			if (acc.major_version === cur.major_version) {
				minor_version = Math.max(acc.minor_version, cur.minor_version)
			} else if (acc.major_version < cur.major_version) {
				minor_version = cur.minor_version
			} else {
				minor_version = acc.minor_version
			}
			return {
				major_version: Math.max(acc.major_version, cur.major_version),
				minor_version,
			}
		},
		{ major_version: 0, minor_version: 0 },
	)
	const newVersion = update === 'minor'
		? {
			major_version,
			minor_version: minor_version + 1,
		}
		: {
			major_version: major_version + 1,
			minor_version: 0,
		}

	const path =
		`${userId}/${arkive.id}/${newVersion.major_version}_${newVersion.minor_version}`
	// upload package to storage
	const uploadRes = await supabase.storage
		.from(SUPABASE_TABLES.PACKAGES)
		.upload(`${path}.tar.gz`, pkg, {
			contentType: 'application/gzip',
		})

	if (uploadRes.error) {
		throw uploadRes.error
	}

	// insert new deployment into db
	const insertRes = await supabase
		.from(SUPABASE_TABLES.DEPLOYMENTS)
		.insert({
			arkive_id: arkive.id,
			major_version: newVersion.major_version,
			minor_version: newVersion.minor_version,
			status: 'pending',
			file_path: path,
			manifest,
		})
		.select<'*', Arkive>('*')

	if (insertRes.error) {
		throw insertRes.error
	}

	if (environment && environment !== arkive.environment) {
		const updateRes = await supabase
			.from(SUPABASE_TABLES.ARKIVE)
			.update<{ environment: string }>({
				environment,
			})
			.eq('id', arkive.id)

		if (updateRes.error) {
			throw updateRes.error
		}
	}

	return insertRes.data
}

const createDeployment = async (
	params: {
		supabase: SupabaseClient
		userId: string
		name: string
		pkg: File
		isPublic: string | undefined
		manifest: any
		environment?: string
	},
) => {
	const { supabase, userId, name, pkg, isPublic, manifest, environment } =
		params

	// insert new row to arkive table
	const insertArkiveRes = await supabase
		.from(SUPABASE_TABLES.ARKIVE)
		.insert({
			user_id: userId,
			name,
			public: isPublic !== undefined,
			environment: environment ?? 'staging',
		})
		.select<'id', { id: string }>('id')

	if (insertArkiveRes.error) {
		throw insertArkiveRes.error
	}

	// upload package to storage
	const path = `${userId}/${insertArkiveRes.data[0].id}/1_0`
	const uploadRes = await supabase.storage
		.from(SUPABASE_TABLES.PACKAGES)
		.upload(`${path}.tar.gz`, pkg, {
			contentType: 'application/gzip',
			upsert: true,
		})

	if (uploadRes.error) {
		throw uploadRes.error
	}

	// insert new deployment into db
	const insertDeploymentRes = await supabase
		.from(SUPABASE_TABLES.DEPLOYMENTS)
		.insert({
			arkive_id: insertArkiveRes.data[0].id,
			major_version: 1,
			minor_version: 0,
			status: 'pending',
			file_path: path,
			manifest,
		})

	if (insertDeploymentRes.error) {
		throw insertDeploymentRes.error
	}

	return insertDeploymentRes.data
}

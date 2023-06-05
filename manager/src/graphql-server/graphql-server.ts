import {
	arkiver,
	arkiverMetadata,
	arkiverTypes,
	grapQLYoga,
	http,
	mongoose,
	path as denoPath,
	redis,
	supabase,
} from '../../deps.ts'
import { ERROR_CODES } from '../constants.ts'
import { logger } from '../logger/logger.ts'
import { getEnv } from '../utils.ts'
import { arkivesDir } from '../manager/manager.ts'
import { apiKeyLimiter, createIpLimiter } from './rate-limiter.ts'
import {
	ApiAuthProvider,
	ArkiveActor,
	ArkiveProvider,
} from '../providers/interfaces.ts'
import { SupabaseAuthProvider } from '../providers/supabase-auth.ts'
import { SupabaseProvider } from '../providers/supabase.ts'

export class GraphQLServer implements ArkiveActor {
	private pathToYoga: Map<
		string,
		{
			// deno-lint-ignore ban-types
			handler: grapQLYoga.YogaServerInstance<{}, {}>
			arkive: arkiverTypes.Arkive
		}
	> = new Map()
	private arkiveIdToHighestVersion: Map<number, number> = new Map()
	private apiAuthProvider: ApiAuthProvider
	private arkiveProvider: ArkiveProvider
	private redis?: redis.Redis

	constructor(
		params: { supabase: supabase.SupabaseClient; environment: string },
	) {
		this.apiAuthProvider = new SupabaseAuthProvider(params.supabase)
		this.arkiveProvider = new SupabaseProvider({
			environment: params.environment,
			supabase: params.supabase,
		})
	}

	async run() {
		logger('graphql-server').info('[GraphQL Server] Connecting to Redis')
		this.redis = await redis.connect({
			hostname: getEnv('REDIS_HOSTNAME'),
			port: Number(getEnv('REDIS_PORT')),
		})
		logger('graphql-server').info('[GraphQL Server] Connected to Redis')

		http.serve(
			async (req, connInfo) => await this.handleRequest(req, connInfo),
			{
				port: Number(getEnv('GRAPHQL_SERVER_PORT')),
				onListen: () => {
					logger('graphql-server').info(
						`[GraphQL Server] Running on port ${getEnv('GRAPHQL_SERVER_PORT')}`,
					)
				},
			},
		)
	}

	async newDeploymentHandler(
		arkive: arkiverTypes.Arkive,
	): Promise<void> {
		try {
			await this.addDeployment(arkive)
		} catch (e) {
			logger('graphql-server').error(
				`[GraphQL Server] error adding deployment: ${e}`,
			)
		}
	}

	deletedArkiveHandler(arkiveId: { id: number }) {
		for (const [path, { arkive }] of this.pathToYoga.entries()) {
			if (arkive.id == arkiveId.id) {
				logger('graphql-server').info(
					`[GraphQL Server] Removing arkive: ${path}`,
				)
				this.pathToYoga.delete(path)
			}
		}
	}

	async updatedDeploymentHandler(
		arkive: arkiverTypes.Arkive,
	): Promise<void> {
		switch (arkive.deployment.status) {
			case 'retired': {
				const highestVersion = this.arkiveIdToHighestVersion.get(
					arkive.id,
				)
				const username = await this.arkiveProvider.getUsername(arkive.user_id)
				if (
					highestVersion && highestVersion == arkive.deployment.major_version
				) {
					const key = `${username}/${arkive.name}/graphql`
					const highestYoga = this.pathToYoga.get(key)
					if (
						highestYoga &&
						highestYoga.arkive.deployment.id == arkive.deployment.id
					) {
						logger('graphql-server').info(
							`[GraphQL Server] Removing arkive: ${key}`,
						)
						this.pathToYoga.delete(key)
					}
				}
				const key =
					`${username}/${arkive.id}/${arkive.deployment.major_version}/graphql`
				this.pathToYoga.delete(key)
			}
		}
	}

	async addDeployment(arkive: arkiverTypes.Arkive) {
		await this.arkiveProvider.pullDeployment(arkive)
		const username = await this.arkiveProvider.getUsername(arkive.user_id)
		const manifestPath = new URL(
			denoPath.join(
				arkivesDir,
				`/${arkive.user_id}/${arkive.id}/${arkive.deployment.major_version}_${arkive.deployment.minor_version}/manifest.ts`,
			),
			import.meta.url,
		).href
		let manifestDefault
		let manifestExport
		try {
			const { default: md, manifest: me } = await import(
				manifestPath
			)
			manifestDefault = md
			manifestExport = me
		} catch (e) {
			logger('graphql-server').error(
				`[GraphQL Server] error importing manifest for ${arkive.id}-${arkive.deployment.major_version}-${arkive.deployment.minor_version}: ${e}`,
			)
			return
		}
		const manifest = manifestExport ?? manifestDefault
		if (!manifest) {
			logger('graphql-server').error(
				`[GraphQL Server] manifest not found for ${arkive.id}-${arkive.deployment.major_version}-${arkive.deployment.minor_version} at ${manifestPath}`,
			)
			return
		}
		const { problems } = arkiver.parseArkiveManifest.manifest(manifest)
		if (problems) {
			logger('graphql-server').error(
				`[GraphQL Server] manifest for ${arkive.id}-${arkive.deployment.major_version}-${arkive.deployment.minor_version} has problems: ${problems}`,
			)
			return
		}
		const connection = mongoose.connections[0].useDb(
			`${arkive.id}-${arkive.deployment.major_version}`,
		)
		const models = manifest.entities.map((
			entity: { model: mongoose.Model<unknown>; list: boolean },
		) => ({
			model: connection.model(entity.model.modelName, entity.model.schema),
			list: entity.list,
		}))
		const metadata = {
			model: connection.model(
				arkiverMetadata.ArkiverMetadata.modelName,
				arkiverMetadata.ArkiverMetadata.schema,
			),
			list: true,
		}
		const schema = arkiver.buildSchemaFromEntities([
			...models,
			metadata,
		])

		const options = {
			schema,
			fetchAPI: { Response },
			graphiql: { title: `${username}/${arkive.name}` },
			landingPage: false,
		}

		const path = `/${username}/${arkive.name}`
		const pathWithVersion = `${path}/${arkive.deployment.major_version}`
		logger('graphql-server').info(
			`[GraphQL Server] Adding new arkive: ${pathWithVersion}`,
		)

		const yogaWithVersion = grapQLYoga.createYoga({
			...options,
			graphqlEndpoint: `${pathWithVersion}/graphql`,
		})
		const yoga = grapQLYoga.createYoga({
			...options,
			graphqlEndpoint: `${path}/graphql`,
		})

		this.pathToYoga.set(`${pathWithVersion}/graphql`, {
			handler: yogaWithVersion,
			arkive,
		})

		const highestVersion = this.arkiveIdToHighestVersion.get(arkive.id)

		if (!highestVersion || highestVersion < arkive.deployment.major_version) {
			this.arkiveIdToHighestVersion.set(
				arkive.id,
				arkive.deployment.major_version,
			)
			this.pathToYoga.set(`${path}/graphql`, { handler: yoga, arkive })
			logger('graphql-server').info(
				`[GraphQL Server] Updating highest version for ${path} to ${arkive.deployment.major_version}`,
			)
		}
	}

	async handleRequest(req: Request, connInfo: http.ConnInfo) {
		const url = new URL(req.url)

		const yoga = this.pathToYoga.get(url.pathname)
		if (!yoga) {
			return new Response('Not Found', { status: 404 })
		}

		if (!this.redis) {
			return new Response(
				`Internal Server Error: ${ERROR_CODES.REDIS_CLIENT_NOT_SET}`,
				{ status: 500 },
			)
		}

		const apiKey = url.searchParams.get('apiKey')

		if (apiKey) {
			const [, username, arkivename] = url.pathname.split('/')
			const apiKeyLimited = await apiKeyLimiter({
				redis: this.redis,
				apiKey,
				username,
				apiAuthProvider: this.apiAuthProvider,
				arkivename,
			})
			if (apiKeyLimited instanceof Response) {
				return apiKeyLimited
			}
			const { hfMax, hfWindow } = apiKeyLimited

			const ipLimiter = createIpLimiter(this.redis, {
				max: hfMax,
				window: hfWindow,
			})

			const ipLimited = await ipLimiter(req, connInfo)
			if (ipLimited) {
				return ipLimited
			}
		} else {
			const ipLimiter = createIpLimiter(this.redis, {
				max: 10,
				window: 5,
			})
			const ipLimited = await ipLimiter(req, connInfo)
			if (ipLimited) {
				return ipLimited
			}
			const dayIpLimit = createIpLimiter(this.redis, {
				max: 5000,
				window: 24 * 60 * 60,
			})
			const dayIpLimited = await dayIpLimit(req, connInfo)
			if (dayIpLimited) {
				return dayIpLimited
			}
		}

		return await yoga.handler(req)
	}

	cleanUp() {
	}
}

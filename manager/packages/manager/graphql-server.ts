import {
	arkiver,
	arkiverMetadata,
	arkiverTypes,
	grapQLYoga,
	http,
	mongoose,
	path as denoPath,
} from '../../deps.ts'
import { logger } from '../logger.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'
import { getEnv } from '../utils.ts'
import { arkivesDir } from './manager.ts'

export class GraphQLServer {
	private pathToYoga: Map<
		string,
		// deno-lint-ignore ban-types
		grapQLYoga.YogaServerInstance<{}, {}>
	> = new Map()
	arkiverProvider: ArkiveProvider

	constructor(arkiveProvider: ArkiveProvider) {
		this.arkiverProvider = arkiveProvider
	}

	async run() {
		logger('graphQLServer').info('[GraphQL Server] Connecting to MongoDB')
		await mongoose.connect(getEnv('MONGO_CONNECTION'))
		logger('graphQLServer').info('[GraphQL Server] Connected to MongoDB')

		http.serve(async (req) => await this.handleRequest(req), {
			port: Number(getEnv('GRAPHQL_SERVER_PORT')),
			onListen: () => {
				logger('graphQLServer').info(
					`[GraphQL Server] Running on port ${getEnv('GRAPHQL_SERVER_PORT')}`,
				)
			},
		})
	}

	async addNewArkive(arkive: arkiverTypes.Arkive) {
		const username = await this.arkiverProvider.getUsername(arkive.user_id)
		const path = `/${username}/${arkive.name}`
		const pathWithVersion = `${path}/${arkive.deployment.major_version}`
		logger('graphQLServer').info(
			`[GraphQL Server] Adding new arkive: ${pathWithVersion}, ${path}`,
		)
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
			logger('graphQLServer').error(
				`[GraphQL Server] error importing manifest for ${arkive.id}-${arkive.deployment.major_version}-${arkive.deployment.minor_version}: ${e}`,
			)
			return
		}
		const manifest = manifestExport ?? manifestDefault
		if (!manifest) {
			logger('graphQLServer').error(
				`[GraphQL Server] manifest not found for ${arkive.id}-${arkive.deployment.major_version}-${arkive.deployment.minor_version} at ${manifestPath}`,
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

		const yogaWithVersion = grapQLYoga.createYoga({
			...options,
			graphqlEndpoint: `${pathWithVersion}/graphql`,
		})
		const yoga = grapQLYoga.createYoga({
			...options,
			graphqlEndpoint: `${path}/graphql`,
		})

		this.pathToYoga.set(`${pathWithVersion}/graphql`, yogaWithVersion)
		this.pathToYoga.set(`${path}/graphql`, yoga)
	}

	async handleRequest(req: Request) {
		const url = new URL(req.url)
		const yoga = this.pathToYoga.get(url.pathname)
		if (!yoga) {
			return new Response('Not Found', { status: 404 })
		}
		return await yoga(req)
	}
}

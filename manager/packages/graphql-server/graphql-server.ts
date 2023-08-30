import {
  arkiver,
  arkiverMetadata,
  arkiverTypes,
  graphQLCompose,
  grapQLYoga,
  mongoose,
  path as denoPath,
  redis,
  supabase,
} from '../../deps.ts'
import { ERROR_CODES } from '../constants.ts'
import { logger } from '../logger.ts'
import { getEnv } from '../utils.ts'
import { arkivesDir } from '../manager/manager.ts'
import { apiKeyLimiter, createIpLimiter } from './rate-limiter.ts'
import { ApiAuthProvider, ArkiveProvider } from '../providers/interfaces.ts'
import { SupabaseAuthProvider } from '../providers/supabase-auth.ts'
import { SupabaseProvider } from '../providers/supabase.ts'

export class GraphQLServer {
  private pathToYoga: Map<
    string,
    // deno-lint-ignore ban-types
    grapQLYoga.YogaServerInstance<{}, {}>
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
    logger('graphQLServer').info('[GraphQL Server] Connecting to Redis')
    this.redis = await redis.connect({
      hostname: getEnv('REDIS_HOSTNAME'),
      port: Number(getEnv('REDIS_PORT')),
    })
    logger('graphQLServer').info('[GraphQL Server] Connected to Redis')

    Deno.serve(
      {
        port: Number(getEnv('GRAPHQL_SERVER_PORT')),
        onListen: () => {
          logger('graphQLServer').info(
            `[GraphQL Server] Running on port ${getEnv('GRAPHQL_SERVER_PORT')}`,
          )
        },
      },
      async (req, connInfo) => await this.handleRequest(req, connInfo),
    )
  }

  async removeDeployment(arkive: arkiverTypes.Arkive) {
    const username = await this.arkiveProvider.getUsername(arkive.user_id)
    const pathWithVersion =
      `/${username}/${arkive.name}/${arkive.deployment.major_version}`
    logger('graphQLServer').info(
      `[GraphQL Server] Removing arkive: ${pathWithVersion}`,
    )
    this.pathToYoga.delete(pathWithVersion)
  }

  async addNewDeployment(arkive: arkiverTypes.Arkive) {
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
      logger('graphQLServer').error(
        `[GraphQL Server] error importing manifest for ${arkive.id}-${arkive.deployment.major_version}-${arkive.deployment.minor_version}: ${e}`,
      )
      return
    }
    const manifest: arkiver.ArkiveManifest = manifestExport ?? manifestDefault
    if (!manifest) {
      logger('graphQLServer').error(
        `[GraphQL Server] manifest not found for ${arkive.id}-${arkive.deployment.major_version}-${arkive.deployment.minor_version} at ${manifestPath}`,
      )
      return
    }
    const { problems } = arkiver.parseArkiveManifest.manifest(manifest)
    if (problems) {
      logger('graphQLServer').error(
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

    const schemaComposer = new graphQLCompose.SchemaComposer()
    arkiver.buildSchemaFromEntities(schemaComposer, [
      ...models,
      metadata,
    ])
    if (manifest.schemaComposerCustomizer) {
      manifest.schemaComposerCustomizer(schemaComposer)
    }
    const schema = schemaComposer.buildSchema()

    const options = {
      schema,
      fetchAPI: { Response },
      graphiql: { title: `${username}/${arkive.name}` },
      landingPage: false,
    }

    const path = `/${username}/${arkive.name}`
    const pathWithVersion = `${path}/${arkive.deployment.major_version}`
    logger('graphQLServer').info(
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

    this.pathToYoga.set(`${pathWithVersion}/graphql`, yogaWithVersion)

    const highestVersion = this.arkiveIdToHighestVersion.get(arkive.id)

    if (!highestVersion || highestVersion < arkive.deployment.major_version) {
      this.arkiveIdToHighestVersion.set(
        arkive.id,
        arkive.deployment.major_version,
      )
      this.pathToYoga.set(`${path}/graphql`, yoga)
      logger('graphQLServer').info(
        `[GraphQL Server] Updating highest version for ${path} to ${arkive.deployment.major_version}`,
      )
    }
  }

  async handleRequest(req: Request, connInfo: Deno.ServeHandlerInfo) {
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

    const apiKey = url.searchParams.get('apiKey') ||
      req.headers.get('x-api-key')
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
        name: 'apikey',
        max: hfMax,
        window: hfWindow,
        message:
          `Too many requests for this api key. Max ${hfMax} req every ${hfWindow} seconds. Please try again in ${hfWindow} seconds or upgrade your account.`,
      })

      const ipLimited = await ipLimiter(req, connInfo)
      if (ipLimited) {
        return ipLimited
      }
    } else {
      const ipLimiter = createIpLimiter(this.redis, {
        name: '5sec',
        max: 10,
        window: 5,
        message:
          'Too many requests from this IP. Max 10 req every 5 seconds. Please try again in 5 seconds or use an api key.',
      })
      const ipLimited = await ipLimiter(req, connInfo)
      if (ipLimited) {
        return ipLimited
      }
      const dayIpLimit = createIpLimiter(this.redis, {
        name: 'daily',
        max: 5000,
        window: 24 * 60 * 60,
        message:
          'Too many requests from this IP. Max 5000 req per day. Please use an api key for more requests.',
      })
      const dayIpLimited = await dayIpLimit(req, connInfo)
      if (dayIpLimited) {
        return dayIpLimited
      }
    }

    return await yoga(req)
  }
}

import { redis, supabase } from '../../deps.ts'
import { ArkiveRunner } from '../arkive-runner/arkive-runner.ts'
import { GraphQLServer } from '../graphql-server/graphql-server.ts'
import { ArkiveMessenger } from '../messenger/messenger.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'
import { moduleConfig } from './utils.ts'

export const getModuleActors = <TModule extends keyof typeof moduleConfig>(
	moduleName: TModule,
): typeof moduleActors[TModule] => {
	return moduleActors[moduleName]
}

const moduleActors = {
	ARKIVE_RUNNER: (provider: ArkiveProvider, redis: redis.Redis) => [
		{
			actor: new ArkiveRunner({
				arkiveProvider: provider,
				redis,
			}),
			name: moduleConfig['ARKIVE_RUNNER'].name,
		},
	],
	MESSENGER: (provider: ArkiveProvider, redis: redis.Redis) => [
		{
			actor: new ArkiveMessenger({
				redis,
				arkiveProvider: provider,
			}),
			name: moduleConfig['MESSENGER'].name,
		},
	],
	GRAPHQL_SERVER: (
		params: { environment: string; supabase: supabase.SupabaseClient },
	) => [
		{
			actor: new GraphQLServer({
				...params,
			}),
			name: moduleConfig['GRAPHQL_SERVER'].name,
		},
	],
} as const

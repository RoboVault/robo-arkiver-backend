import { supabase } from '../../deps.ts'
import { ArkiveRunner } from '../arkive-runner/arkive-runner.ts'
import { GraphQLServer } from '../graphql-server/graphql-server.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'
import { moduleConfig } from './utils.ts'

export const getModuleActors = <TModule extends keyof typeof moduleConfig>(
	moduleName: TModule,
): typeof moduleActors[TModule] => {
	return moduleActors[moduleName]
}

const moduleActors = {
	ARKIVE_RUNNER: (provider: ArkiveProvider) => [
		{
			actor: new ArkiveRunner({
				arkiveProvider: provider,
			}),
			name: 'arkive-runner',
		},
	],
	GRAPHQL_SERVER: (
		params: { environment: string; supabase: supabase.SupabaseClient },
	) => [
		{
			actor: new GraphQLServer({
				...params,
			}),
			name: 'graphql-server',
		},
	],
} as const

import { arkiverTypes, delay, redis } from '../../deps.ts'
import {
	RawArkive,
	SupabaseProvider,
	SupabaseProviderParams,
} from './supabase.ts'
import {
	INNER_DEPLOYMENTS_SELECTOR,
	MESSENGER_REDIS_KEYS,
	SUPABASE_TABLES,
} from '../constants.ts'
import { filterRawArkives } from '../utils.ts'
import { logger } from '../logger/logger.ts'

export interface RunnerProviderParams {
	redis: redis.Redis
}

export class RunnerProvider extends SupabaseProvider {
	#redis: redis.Redis
	#hostname: string

	constructor(params: RunnerProviderParams & SupabaseProviderParams) {
		super(params)
		this.#redis = params.redis
		this.#hostname = Deno.hostname()
	}

	public async getRawArkives() {
		logger('runner-provider').info('Getting raw arkives')
		const runnerActiveDeploymentIds = await this.#redis.smembers(
			`${MESSENGER_REDIS_KEYS.ACTIVE_DEPLOYMENTS}:${this.#hostname}`,
		)
		const deploymentIds = runnerActiveDeploymentIds.map(Number)

		const { data, error } = await this.supabase
			.from(SUPABASE_TABLES.ARKIVE)
			.select<string, RawArkive>(
				`*, ${INNER_DEPLOYMENTS_SELECTOR}`,
			)
			.in(`${SUPABASE_TABLES.DEPLOYMENTS}.id`, deploymentIds)

		if (error) {
			throw error
		}

		const flatIds = data.flatMap((d) => d.deployments.map((d) => d.id)).map(
			String,
		)
		const deletedIds = runnerActiveDeploymentIds.filter((id) =>
			!flatIds.includes(id)
		)
		deletedIds.forEach((id) =>
			this.#redis.srem(
				`${MESSENGER_REDIS_KEYS.ACTIVE_DEPLOYMENTS}:${this.#hostname}`,
				id,
			)
		)

		return data
	}

	public listenNewDeployment(
		callback: (arkive: arkiverTypes.Arkive) => Promise<void>,
	) {
		const listen = () =>
			this.#redis.xreadgroup(
				[{ key: MESSENGER_REDIS_KEYS.NEW_DEPLOYMENTS, xid: '>' }],
				{
					consumer: this.#hostname,
					group: MESSENGER_REDIS_KEYS.ARKIVE_RUNNERS_GROUP,
					block: 0,
					count: 1,
				},
			)
				.then(async (res) => {
					const newDeploymentIds = res[0]?.messages?.map((message) => ({
						deploymentId: message.fieldValues.deploymentId,
						messageId: message.xid,
					}))

					if (newDeploymentIds) {
						logger('runner-provider').info('New deployment received: ', res)
						for (const { deploymentId, messageId } of newDeploymentIds) {
							const { data, error } = await this.supabase
								.from(SUPABASE_TABLES.ARKIVE)
								.select<string, RawArkive>(
									`*, ${INNER_DEPLOYMENTS_SELECTOR}`,
								)
								.eq(`${SUPABASE_TABLES.DEPLOYMENTS}.id`, deploymentId)

							if (error) {
								throw error
							}

							const deployment =
								filterRawArkives(data, ['error', 'paused', 'retired'])[0]

							if (deployment) {
								callback(deployment).then(() => {
									this.#redis.xack(
										MESSENGER_REDIS_KEYS.NEW_DEPLOYMENTS,
										MESSENGER_REDIS_KEYS.ARKIVE_RUNNERS_GROUP,
										messageId,
									)
								}).catch((e) => logger('runner-provider').error(e))
							}
						}
					}

					await delay(1000)
					listen().catch((e) => logger('runner-provider').error(e))
				})
		listen().catch((e) => logger('runner-provider').error(e))
	}

	public listenDeletedDeployment(callback: (deploymentId: number) => void) {
		const listen = (latestId: string) =>
			this.#redis.xread([{
				key: MESSENGER_REDIS_KEYS.DELETED_DEPLOYMENTS,
				xid: latestId,
			}], { block: 0 }).then((res) => {
				const deletedDeploymentIds = res[0]?.messages?.map((message) =>
					message.fieldValues.deploymentId
				)

				deletedDeploymentIds?.forEach((id) => callback(parseInt(id)))

				const messages = res[0]?.messages
				const xid = messages?.at(-1)?.xid
				listen(xid ? `${xid.unixMs}-${xid.seqNo}` : latestId).catch((e) =>
					logger('runner-provider').error(e)
				)
			})
		listen('$').catch((e) => logger('runner-provider').error(e))
	}

	public listenUpdatedDeployment(
		_callback: (deployment: arkiverTypes.Arkive) => void | Promise<void>,
	): void {}
}

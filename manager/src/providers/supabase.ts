import { ArkiveProvider } from './interfaces.ts'
import { arkiverTypes, path as denoPath, supabase } from '../../deps.ts'
import { rm, unpack } from '../utils.ts'
import { arkivesDir } from '../manager/manager.ts'
import { logger } from '../logger/logger.ts'
import { SUPABASE_TABLES } from '../constants.ts'

export interface RawArkive extends Omit<arkiverTypes.Arkive, 'deployment'> {
	deployments: arkiverTypes.Deployment[]
}

export interface SupabaseProviderParams { environment: string; supabase: supabase.SupabaseClient }

export class SupabaseProvider implements ArkiveProvider {
	protected supabase: supabase.SupabaseClient
	private newArkiveListener?: supabase.RealtimeChannel
	private deletedDeploymentListener?: supabase.RealtimeChannel
	private updateDeploymentListener?: supabase.RealtimeChannel
	private environment: string

	constructor(
		params: SupabaseProviderParams,
	) {
		this.supabase = params.supabase
		this.environment = params.environment
	}

	public async getRawArkives() {
		const arkivesRes = await this.supabase
			.from(SUPABASE_TABLES.ARKIVE)
			.select<'*, deployments(*)', RawArkive>('*, deployments(*)')
			.eq('environment', this.environment)

		if (arkivesRes.error) {
			throw arkivesRes.error
		}

		return arkivesRes.data
	}

	public listenNewDeployment(
		callback: (arkive: arkiverTypes.Arkive) => Promise<void>,
	): void {
		const listener = this.supabase
			.channel('new-deployment')
			.on<Omit<arkiverTypes.Deployment, 'arkive'>>(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: SUPABASE_TABLES.DEPLOYMENTS,
				},
				async (payload) => {
					const { data, error: e } = await this.supabase.from(
						SUPABASE_TABLES.ARKIVE,
					)
						.select<'*', Omit<arkiverTypes.Arkive, 'deployment'>>('*')
						.eq('id', payload.new.arkive_id)
						.eq('environment', this.environment)
					if (e) {
						const error = {
							...e,
							name: 'SupabaseProvider.listenNewArkive',
						} satisfies Error
						logger('supabase-provider').error(error, {
							source: 'SupabaseProvider.listenNewArkive',
						})
						return
					}
					if (data.length === 0) return
					const newArkive = {
						...data[0],
						deployment: payload.new,
					}
					await callback(newArkive)
				},
			)
			.subscribe()

		this.newArkiveListener = listener
	}

	public listenDeletedDeployment(
		callback: (deploymentId: number) => void,
	): void {
		const listener = this.supabase
			.channel('deleted-arkives')
			.on<arkiverTypes.Deployment>(
				'postgres_changes',
				{
					event: 'DELETE',
					schema: 'public',
					table: SUPABASE_TABLES.DEPLOYMENTS,
				},
				(payload) => {
					callback(payload.old.id!)
				},
			)
			.subscribe()

		this.deletedDeploymentListener = listener
	}

	public listenUpdatedDeployment(
		callback: (
			deployment: arkiverTypes.Arkive,
		) => void | Promise<void>,
	): void {
		const listener = this.supabase
			.channel('updated-deployment')
			.on<arkiverTypes.Deployment>(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: SUPABASE_TABLES.DEPLOYMENTS,
				},
				async (payload) => {
					const { data, error: e } = await this.supabase.from(
						SUPABASE_TABLES.ARKIVE,
					)
						.select<'*', Omit<arkiverTypes.Arkive, 'deployment'>>('*')
						.eq('id', payload.new.arkive_id)
						.eq('environment', this.environment)
					if (e) {
						const error = {
							...e,
							name: 'SupabaseProvider.listenUpdatedDeployment',
						} satisfies Error
						logger('supabase-provider').error(error, {
							source: 'SupabaseProvider.listenUpdatedDeployment',
						})
						return
					}
					if (data.length === 0) return
					const newArkive = {
						...data[0],
						deployment: payload.new,
					}
					await callback(newArkive)
				},
			)
			.subscribe()

		this.updateDeploymentListener = listener
	}

	public async pullDeployment(arkive: arkiverTypes.Arkive): Promise<void> {
		const path = `${arkive.user_id}/${arkive.id}`
		const version =
			`${arkive.deployment.major_version}_${arkive.deployment.minor_version}`

		const { data, error } = await this.supabase.storage
			.from(SUPABASE_TABLES.PACKAGES)
			.download(
				`${path}/${version}.tar.gz`,
			)
		if (error) {
			throw error
		}

		const localDir = new URL(
			denoPath.join(arkivesDir, `/${path}/${version}`),
			import.meta.url,
		)
		const localPath = new URL(
			denoPath.join(arkivesDir, `/${path}/${version}.tar.gz`),
			import.meta.url,
		)

		await Deno.mkdir(localDir, { recursive: true })
		await Deno.writeFile(localPath, new Uint8Array(await data.arrayBuffer()))
		await unpack(localPath.pathname, localDir.pathname)
		await rm(localPath.pathname)
	}

	public async updateDeploymentStatus(
		arkive: arkiverTypes.Arkive,
		status: string,
	): Promise<void> {
		const { error } = await this.supabase
			.from(SUPABASE_TABLES.DEPLOYMENTS)
			.update({ status })
			.eq('arkive_id', arkive.id)
			.eq('major_version', arkive.deployment.major_version)
			.eq('minor_version', arkive.deployment.minor_version)
		if (error) {
			throw error
		}
	}

	public async getUsername(userId: string) {
		const { data, error } = await this.supabase
			.from(SUPABASE_TABLES.USER_PROFILE)
			.select('username')
			.eq('id', userId)
			.single()
		if (error) {
			throw error
		}
		return data.username
	}

	public cleanUp(): void {
		if (this.newArkiveListener) {
			this.newArkiveListener.unsubscribe()
		}
		if (this.deletedDeploymentListener) {
			this.deletedDeploymentListener.unsubscribe()
		}
		if (this.updateDeploymentListener) {
			this.updateDeploymentListener.unsubscribe()
		}
		logger('supabase-provider').info('closed')
	}
}
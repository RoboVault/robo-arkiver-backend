import { ArkiveProvider } from './interfaces.ts'
import { arkiverTypes, path as denoPath, supabase } from '../../deps.ts'
import { rm, unpack } from '../utils.ts'
import { arkivesDir } from '../manager/manager.ts'
import { logger } from '../logger.ts'
import { SUPABASE_TABLES } from '../constants.ts'

interface RawArkive extends Omit<arkiverTypes.Arkive, 'deployment'> {
	deployments: arkiverTypes.Deployment[]
}

export class SupabaseProvider implements ArkiveProvider {
	private supabase: supabase.SupabaseClient
	private newArkiveListener?: supabase.RealtimeChannel
	private deletedArkiveListener?: supabase.RealtimeChannel
	private environment: string

	constructor(
		params: { environment: string; supabase: supabase.SupabaseClient },
	) {
		this.supabase = params.supabase
		this.environment = params.environment
	}

	public async getDeployments(): Promise<arkiverTypes.Arkive[]> {
		const arkivesRes = await this.supabase
			.from(SUPABASE_TABLES.ARKIVE)
			.select<'*, deployments(*)', RawArkive>('*, deployments(*)')
			.eq('environment', this.environment)

		if (arkivesRes.error) {
			throw arkivesRes.error
		}

		const arkives: arkiverTypes.Arkive[] = arkivesRes.data.flatMap((arkive) => {
			// get highest deployment minor_version(s)
			const deployments = arkive.deployments.reduce((prev, curr) => {
				if (curr.status === 'retired') {
					return prev
				}

				const highestPrev = prev[curr.major_version]

				if (
					(!highestPrev || highestPrev.minor_version < curr.minor_version)
				) {
					return {
						...prev,
						[curr.major_version]: curr,
					}
				} else {
					return prev
				}
			}, {} as Record<number, arkiverTypes.Deployment>)

			return Object.values(deployments).map((deployment) => ({
				id: arkive.id,
				name: arkive.name,
				user_id: arkive.user_id,
				public: arkive.public,
				created_at: arkive.created_at,
				deployment,
			}))
		})

		return arkives
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
						logger('manager').error(error, {
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

	public listenDeletedArkive(
		callback: (arkiveId: { id: number }) => void,
	): void {
		const listener = this.supabase
			.channel('deleted-arkives')
			.on<arkiverTypes.Arkive>(
				'postgres_changes',
				{
					event: 'DELETE',
					schema: 'public',
					table: SUPABASE_TABLES.ARKIVE,
				},
				(payload) => {
					callback(payload.old as { id: number })
				},
			)
			.subscribe()

		this.deletedArkiveListener = listener
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

	public close(): void {
		if (this.newArkiveListener) {
			this.newArkiveListener.unsubscribe()
		}
		if (this.deletedArkiveListener) {
			this.deletedArkiveListener.unsubscribe()
		}
		logger('manager').info('closed')
	}
}

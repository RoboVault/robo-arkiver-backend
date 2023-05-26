import { serve } from 'https://deno.land/std@0.183.0/http/mod.ts'
import { copy, emptyDir } from 'https://deno.land/std@0.183.0/fs/mod.ts'
import { join } from 'https://deno.land/std@0.183.0/path/mod.ts'
import { arkiverTypes } from '../../deps.ts'
import { ApiLimits, ArkiveProvider } from '../providers/interfaces.ts'
import { arkivesDir } from '../manager/manager.ts'
import { logger } from '../logger.ts'

export class LocalArkiveProvider implements ArkiveProvider {
	newArkiveHandler?: (arkive: arkiverTypes.Arkive) => Promise<void>
	delArkiveHandler?: (arkiveId: { id: number }) => void
	currentId = 0
	idToDeploymentId = new Map<number, number>()
	nameToArkive = new Map<
		string,
		{ id: number; majorVersion: number; minorVersion: number; status: string }
	>()

	constructor() {
		this.handleRequest = this.handleRequest.bind(this)
		serve(this.handleRequest, {
			port: 42069,
			onListen: ({ hostname, port }) => {
				logger('manager').info(
					`[Local Arkive Provider] Running on ${hostname}:${port}`,
				)
			},
		})
		const localDir = join(
			new URL(import.meta.url).pathname,
			'../',
			arkivesDir,
			'dev',
		)

		emptyDir(localDir)
	}

	async handleRequest(req: Request): Promise<Response> {
		if (req.method === 'GET') {
			const arkives = []

			for (const [name, arkive] of this.nameToArkive.entries()) {
				arkives.push({
					created_at: new Date().toISOString(),
					id: arkive.id,
					name,
					public: true,
					user_id: 'dev',
					deployments: [{
						arkive_id: arkive.id,
						status: arkive.status,
						id: 0,
						created_at: new Date().toISOString(),
						file_path: join(
							new URL(import.meta.url).pathname,
							'../',
							arkivesDir,
							'dev',
							arkive.id.toString(),
							`${arkive.majorVersion}_${arkive.minorVersion}`,
						),
						major_version: arkive.majorVersion,
						minor_version: arkive.minorVersion,
					}],
				})
			}

			return new Response(JSON.stringify(arkives))
		}

		if (req.method === 'POST') {
			if (!this.newArkiveHandler) {
				console.log(this.newArkiveHandler)
				return new Response('No handler for new arkive', { status: 500 })
			}

			logger('manager').info(`[Local Arkive Provider] New arkive request`)

			const arkiveData = await req.json() as {
				name: string
				absolutePath: string
				majorUpdate: boolean
			}

			let arkive = this.nameToArkive.get(arkiveData.name)

			let deploymentId = 0

			if (arkive) {
				if (arkiveData.majorUpdate) {
					arkive.minorVersion = 0
					arkive.majorVersion++
				} else {
					arkive.minorVersion++
				}
				deploymentId = (this.idToDeploymentId.get(arkive.id) ?? 0) + 1
				this.idToDeploymentId.set(arkive.id, deploymentId)
			} else {
				arkive = {
					id: this.currentId,
					majorVersion: 1,
					minorVersion: 0,
					status: 'pending',
				}
				this.currentId++
				this.nameToArkive.set(arkiveData.name, arkive)
				this.idToDeploymentId.set(arkive.id, deploymentId)
			}

			const localDir = join(
				new URL(import.meta.url).pathname,
				'../',
				arkivesDir,
				'dev',
				arkive.id.toString(),
				`${arkive.majorVersion}_${arkive.minorVersion}`,
			)

			await copy(arkiveData.absolutePath, localDir)

			await this.newArkiveHandler({
				created_at: new Date().toISOString(),
				id: arkive.id,
				name: arkiveData.name,
				public: true,
				user_id: 'dev',
				deployment: {
					arkive_id: arkive.id,
					id: deploymentId,
					created_at: new Date().toISOString(),
					file_path: localDir,
					major_version: arkive.majorVersion,
					minor_version: arkive.minorVersion,
					status: 'pending',
				},
			})

			return new Response('OK')
		}

		if (req.method === 'DELETE') {
			if (!this.delArkiveHandler) {
				return new Response('No handler for deleted arkive', { status: 500 })
			}

			const { name } = await req.json() as { name: string }

			const arkive = this.nameToArkive.get(name)

			if (!arkive) {
				return new Response('Arkive not found', { status: 404 })
			}

			await this.delArkiveHandler({ id: arkive.id })

			this.nameToArkive.delete(name)

			return new Response('OK')
		}

		return new Response('Invalid request', { status: 400 })
	}

	getDeployments(): Promise<arkiverTypes.Arkive[]> {
		return Promise.resolve([])
	}
	listenNewDeployment(
		callback: (arkive: arkiverTypes.Arkive) => Promise<void>,
	): void {
		this.newArkiveHandler = callback
	}
	listenDeletedArkive(
		callback: (arkiveId: { id: number }) => void,
	): void {
		this.delArkiveHandler = callback
	}

	async pullDeployment(_arkives: arkiverTypes.Arkive): Promise<void> {}

	getLimits(_username: string): Promise<ApiLimits | null> {
		const now = Date.now()
		return Promise.resolve({
			count: 0,
			max: 0,
			dayTimestamp: now - (now % 86400000),
			hfMax: 20,
			hfWindow: 2,
		})
	}

	validateApiKey(_apiKey: string): Promise<boolean> {
		return Promise.resolve(true)
	}

	// deno-lint-ignore require-await
	async updateDeploymentStatus(
		arkive: arkiverTypes.Arkive,
		status: string,
	): Promise<void> {
		const arkiveData = this.nameToArkive.get(arkive.name)

		if (!arkiveData) {
			return
		}

		arkiveData.status = status
	}

	getUsername(userId: string): Promise<string> {
		return Promise.resolve(userId)
	}

	close(): void {}
}

import { serve } from 'https://deno.land/std@0.183.0/http/mod.ts'
import { copy, emptyDir } from 'https://deno.land/std@0.183.0/fs/mod.ts'
import { join } from 'https://deno.land/std@0.183.0/path/mod.ts'
import { arkiver, arkiverTypes } from '../../deps.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'
import { arkivesDir } from '../manager/manager.ts'

export class LocalArkiveProvider implements ArkiveProvider {
	newArkiveHandler?: (arkive: arkiverTypes.Arkive) => Promise<void>
	delArkiveHandler?: (arkiveId: { id: number }) => Promise<void>
	currentId = 0
	nameToArkive = new Map<
		string,
		{ id: number; majorVersion: number; minorVersion: number; status: string }
	>()

	constructor() {
		this.handleRequest = this.handleRequest.bind(this)
		serve(this.handleRequest, {
			port: 42069,
			onListen: ({ hostname, port }) => {
				arkiver.logger().info(
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

			arkiver.logger().info(`[Local Arkive Provider] New arkive request`)

			const arkiveData = await req.json() as {
				name: string
				absolutePath: string
				majorUpdate: boolean
			}

			let arkive = this.nameToArkive.get(arkiveData.name)

			if (arkiveData.majorUpdate && arkive) {
				arkive.minorVersion = 0
				arkive.majorVersion++
			} else if (arkive) {
				arkive.minorVersion++
			}

			if (!arkive) {
				arkive = {
					id: this.currentId,
					majorVersion: 1,
					minorVersion: 0,
					status: 'pending',
				}
				this.currentId++
				this.nameToArkive.set(arkiveData.name, arkive)
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
					id: 0,
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

	getArkives(): Promise<arkiverTypes.Arkive[]> {
		return Promise.resolve([])
	}
	listenNewArkive(
		callback: (arkive: arkiverTypes.Arkive) => Promise<void>,
	): void {
		this.newArkiveHandler = callback
	}
	listenDeletedArkive(
		callback: (arkiveId: { id: number }) => Promise<void>,
	): void {
		this.delArkiveHandler = callback
	}

	async pullArkive(_arkives: arkiverTypes.Arkive): Promise<void> {}

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

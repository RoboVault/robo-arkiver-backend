import { serve } from 'https://deno.land/std@0.183.0/http/mod.ts'
import { copy } from 'https://deno.land/std@0.183.0/fs/mod.ts'
import { join } from 'https://deno.land/std@0.183.0/path/mod.ts'
import { arkiver, arkiverTypes } from '../../deps.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'
import { arkivesDir } from '../manager/manager.ts'

export class LocalArkiveProvider implements ArkiveProvider {
	newArkiveHandler?: (arkive: arkiverTypes.Arkive) => Promise<void>
	delArkiveHandler?: (arkiveId: { id: number }) => Promise<void>
	currentId = 0

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
	}

	async handleRequest(req: Request): Promise<Response> {
		if (req.method === 'POST') {
			if (!this.newArkiveHandler) {
				console.log(this.newArkiveHandler)
				return new Response('No handler for new arkive', { status: 500 })
			}

			arkiver.logger().info(`[Local Arkive Provider] New arkive request`)

			const arkiveData = await req.json() as {
				name: string
				absolutePath: string
			}

			const localDir = join(
				new URL(import.meta.url).pathname,
				'../',
				arkivesDir,
				'dev',
				this.currentId.toString(),
				'1_0',
			)

			await copy(arkiveData.absolutePath, localDir)

			await this.newArkiveHandler({
				created_at: new Date().toISOString(),
				id: this.currentId,
				name: arkiveData.name,
				public: true,
				user_id: 'dev',
				deployment: {
					arkive_id: this.currentId,
					id: 0,
					created_at: new Date().toISOString(),
					file_path: localDir,
					major_version: 1,
					minor_version: 0,
					status: 'pending',
				},
			})

			this.currentId++

			return new Response('OK')
		}

		if (req.method === 'DELETE') {
			if (!this.delArkiveHandler) {
				return new Response('No handler for deleted arkive', { status: 500 })
			}

			const arkiveId = await req.json() as { id: number }

			await this.delArkiveHandler(arkiveId)

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

	async updateDeploymentStatus(
		_arkive: arkiverTypes.Arkive,
		_status: string,
	): Promise<void> {}

	getUsername(userId: string): Promise<string> {
		return Promise.resolve(userId)
	}

	close(): void {}
}

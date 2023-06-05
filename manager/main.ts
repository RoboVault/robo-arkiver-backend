import 'https://deno.land/std@0.180.0/dotenv/load.ts'
import { logger } from './src/logger/logger.ts'
import { ArkiveManager } from './src/manager/manager.ts'
import { getInfluxWriter } from './src/utils.ts'
import { getModuleConfig } from './src/module-config/utils.ts'
import { setupLogger } from './src/logger/utils.ts'

if (import.meta.main) {
	const {
		actors,
		name,
		provider,
	} = getModuleConfig()

	const managerName = `manager-${name}`

	setupLogger({
		writer: getInfluxWriter(),
		actorNames: actors.map(({ name }) => name),
		managerName,
		providerName: provider.name,
	})

	logger(managerName).info(`Starting ${managerName}`)

	const manager = new ArkiveManager({
		name: managerName,
		actors: actors.map(({ actor }) => actor),
		arkiveProvider: provider.provider,
	})

	await manager.init()
}

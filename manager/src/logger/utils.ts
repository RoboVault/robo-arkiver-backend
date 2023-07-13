import { arkiver, arkiverTypes, influx, log, logHandlers } from '../../deps.ts'
import { ArkiveInfluxLogger } from '../logger/influx.ts'

export const createManifestHandlers = (
	arkive: arkiverTypes.Arkive,
	manifest: arkiverTypes.ArkiveManifest,
	writer: influx.WriteApi,
) => {
	let manifestHandlers: Record<string, logHandlers.BaseHandler> = {}
	let manifestLoggers: Record<string, log.LoggerConfig> = {}

	for (const [name, dataSource] of Object.entries(manifest.dataSources)) {
		const { handlers: contractHandlers, loggers: contractLoggers } =
			createContractHandlers({
				chain: name,
				dataSource,
				handlers: manifestHandlers,
				loggers: manifestLoggers,
				writer,
				arkive,
			})
		manifestHandlers = contractHandlers
		manifestLoggers = contractLoggers

		const { handlers: blockHandlers, loggers: blockLoggers } =
			createBlockHandlers({
				chain: name,
				dataSource,
				handlers: manifestHandlers,
				loggers: manifestLoggers,
				writer,
				arkive,
			})
		manifestHandlers = blockHandlers
		manifestLoggers = blockLoggers

		const { handlers: chainHandlers, loggers: chainLoggers } =
			createChainHandlers({
				chain: name,
				handlers: manifestHandlers,
				loggers: manifestLoggers,
				writer,
				arkive,
			})
		manifestHandlers = chainHandlers
		manifestLoggers = chainLoggers
	}

	return { loggers: manifestLoggers, handlers: manifestHandlers }
}

const createContractHandlers = (
	params: {
		writer: influx.WriteApi
		handlers: Record<string, logHandlers.BaseHandler>
		loggers: Record<string, log.LoggerConfig>
		chain: string
		dataSource: arkiverTypes.DataSource
		arkive: arkiverTypes.Arkive
	},
) => {
	const { chain, dataSource, handlers, writer, arkive, loggers } = params

	if (!dataSource.contracts) return { handlers, loggers }

	for (const contract of dataSource.contracts) {
		for (const event of contract.events) {
			const key = `${chain}-${contract.id}-${event.name}`
			handlers[key] = new ArkiveInfluxLogger('DEBUG', {
				writer,
				tags: {
					source: key,
					id: arkive.id.toString(),
					majorVersion: arkive.deployment.major_version.toString(),
					minorVersion: arkive.deployment.minor_version.toString(),
				},
			})
			handlers[`console-${key}`] = new arkiver.ArkiveConsoleLogHandler(
				'INFO',
				{
					arkive: {
						name: arkive.name,
						id: arkive.id,
						majorVersion: arkive.deployment.major_version,
						minorVersion: arkive.deployment.minor_version,
					},
					contract: contract.id,
					chain,
					event: event.name,
				},
			)
			loggers[key] = {
				handlers: [key, `console-${key}`],
				level: 'DEBUG',
			}
		}
	}

	return { handlers, loggers }
}

const createBlockHandlers = (
	params: {
		writer: influx.WriteApi
		handlers: Record<string, logHandlers.BaseHandler>
		loggers: Record<string, log.LoggerConfig>
		chain: string
		dataSource: arkiverTypes.DataSource
		arkive: arkiverTypes.Arkive
	},
) => {
	const { arkive, chain, dataSource, handlers, writer, loggers } = params

	if (!dataSource.blockHandlers) return { handlers, loggers }

	for (const blockHandler of dataSource.blockHandlers) {
		const key = `${chain}-${blockHandler.name}`
		handlers[key] = new ArkiveInfluxLogger('DEBUG', {
			writer,
			tags: {
				source: key,
				id: arkive.id.toString(),
				majorVersion: arkive.deployment.major_version.toString(),
				minorVersion: arkive.deployment.minor_version.toString(),
			},
		})
		handlers[`console-${key}`] = new arkiver.ArkiveConsoleLogHandler('INFO', {
			arkive: {
				name: arkive.name,
				id: arkive.id,
				majorVersion: arkive.deployment.major_version,
				minorVersion: arkive.deployment.minor_version,
			},
			chain,
			blockHandler: blockHandler.name,
		})
		loggers[key] = {
			handlers: [key, `console-${key}`],
			level: 'DEBUG',
		}
	}

	return { handlers, loggers }
}

const createChainHandlers = (
	params: {
		writer: influx.WriteApi
		handlers: Record<string, logHandlers.BaseHandler>
		loggers: Record<string, log.LoggerConfig>
		chain: string
		arkive: arkiverTypes.Arkive
	},
) => {
	const { arkive, chain, handlers, loggers, writer } = params

	const key = `${chain}`
	handlers[key] = new ArkiveInfluxLogger('DEBUG', {
		writer,
		tags: {
			source: key,
			id: arkive.id.toString(),
			majorVersion: arkive.deployment.major_version.toString(),
			minorVersion: arkive.deployment.minor_version.toString(),
		},
	})
	handlers[`console-${key}`] = new arkiver.ArkiveConsoleLogHandler('INFO', {
		arkive: {
			name: arkive.name,
			id: arkive.id,
			majorVersion: arkive.deployment.major_version,
			minorVersion: arkive.deployment.minor_version,
		},
		chain,
	})
	loggers[key] = {
		handlers: [key, `console-${key}`],
		level: 'DEBUG',
	}

	return { handlers, loggers }
}

export const setupLogger = (params: {
	writer: influx.WriteApi
	managerName: string
	providerName: string
	actorNames: string[]
}) => {
	const { actorNames, managerName, providerName, writer } = params
	log.setup({
		handlers: {
			console: new log.handlers.ConsoleHandler('DEBUG'),
			managerInflux: new ArkiveInfluxLogger('DEBUG', {
				writer,
				tags: {
					source: managerName,
				},
			}),
			providerInflux: new ArkiveInfluxLogger('DEBUG', {
				writer,
				tags: {
					source: providerName,
				},
			}),
			...actorNames.reduce((acc, name) => ({
				...acc,
				[name]: new ArkiveInfluxLogger('DEBUG', {
					writer,
					tags: {
						source: name,
					},
				}),
			}), {} as Record<string, ArkiveInfluxLogger>),
		},
		loggers: {
			[managerName]: {
				level: 'DEBUG',
				handlers: ['console', 'managerInflux'],
			},
			[providerName]: {
				level: 'DEBUG',
				handlers: ['console', 'providerInflux'],
			},
			...actorNames.reduce((acc, name) => ({
				...acc,
				[name]: {
					level: 'DEBUG',
					handlers: ['console', name],
				},
			}), {} as Record<string, log.LoggerConfig>),
		},
	})
}

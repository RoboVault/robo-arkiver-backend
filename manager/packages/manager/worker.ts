import { ArkiveMessageEvent } from '../manager/types.ts'
import { arkiver, influx, log, mongoose, path as denoPath } from '../../deps.ts'
import { logger } from '../logger.ts'
import { ArkiveInfluxLogger } from './logger.ts'
import { createManifestHandlers, getEnv } from '../utils.ts'
import { arkivesDir } from './manager.ts'

declare const self: Worker

self.onmessage = async (e: MessageEvent<ArkiveMessageEvent>) => {
	switch (e.data.topic) {
		case 'initArkive': {
			const { arkive, mongoConnection, rpcUrls } = e.data.data

			const writer = new influx.InfluxDB({
				url: getEnv('INFLUX_URL'),
				token: getEnv('INFLUX_TOKEN'),
			}).getWriteApi(getEnv('INFLUX_ORG'), getEnv('INFLUX_BUCKET'))

			const consoleHandler = new arkiver.ArkiveConsoleLogHandler('INFO', {
				arkive: {
					name: arkive.name,
					id: arkive.id,
					majorVersion: arkive.deployment.major_version,
					minorVersion: arkive.deployment.minor_version,
				},
			})
			const arkiverInfluxHandler = new ArkiveInfluxLogger('DEBUG', {
				writer,
				tags: {
					source: 'arkive',
					id: arkive.id.toString(),
					majorVersion: arkive.deployment.major_version.toString(),
					minorVersion: arkive.deployment.minor_version.toString(),
				},
			})
			const baseLogConfig = {
				handlers: {
					console: consoleHandler,
					arkiverInflux: arkiverInfluxHandler,
				},
				loggers: {
					arkiver: {
						level: 'DEBUG',
						handlers: ['console', 'arkiverInflux'],
					},
				},
			} satisfies log.LogConfig

			log.setup(baseLogConfig)

			logger('arkiver').info('initializing arkive', arkive)

			const manifestPath = new URL(
				denoPath.join(
					arkivesDir,
					`/${arkive.user_id}/${arkive.id}/${arkive.deployment.major_version}_${arkive.deployment.minor_version}/manifest.ts`,
				),
				import.meta.url,
			).href
			let manifestDefault
			let manifestExport
			try {
				const { default: md, manifest: me } = await import(
					manifestPath
				)
				manifestDefault = md
				manifestExport = me
			} catch (e) {
				logger('arkiver').error(
					`error importing manifest for ${arkive.id}@${arkive.deployment.major_version}.${arkive.deployment.minor_version}: ${e.stack}`,
				)
				return
			}
			const manifest: arkiver.ArkiveManifest = manifestExport ?? manifestDefault
			if (!manifest) {
				logger('arkiver').error(
					`manifest not found for ${arkive.id}@${arkive.deployment.major_version}.${arkive.deployment.minor_version} at ${manifestPath}`,
				)
				return
			}
			const { problems } = arkiver.parseArkiveManifest.manifest(manifest)
			if (problems) {
				logger('arkiver').error(
					`manifest for ${arkive.id}@${arkive.deployment.major_version}.${arkive.deployment.minor_version} has problems: ${problems}`,
				)
				return
			}

			const { handlers, loggers } = createManifestHandlers(
				arkive,
				manifest,
				writer,
			)

			const extendedLogConfig = {
				handlers: {
					...baseLogConfig.handlers,
					...handlers,
				},
				loggers: {
					...baseLogConfig.loggers,
					...loggers,
				},
			} satisfies log.LogConfig

			log.setup(extendedLogConfig)

			await mongoose.connect(mongoConnection, {
				dbName: `${arkive.id}-${arkive.deployment.major_version}`,
			})

			const instance = new arkiver.Arkiver({
				manifest,
				noDb: false,
				rpcUrls,
				arkiveData: arkive,
			})
			instance.addEventListener('synced', () => {
				self.postMessage({ topic: 'synced', data: { arkive } })
			})
			instance.addEventListener('handlerError', () => {
				self.postMessage({ topic: 'handlerError', data: { arkive } })
			})
			await instance.run()
			break
		}
	}
}

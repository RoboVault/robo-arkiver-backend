import { arkiver, influx, supabase } from '../deps.ts'

export const getEnv = (key: string, defaultValue?: string): string => {
	const value = Deno.env.get(key)
	if (!value && !defaultValue) {
		throw new Error(`Missing environment variable: ${key}`)
	}
	return value || defaultValue || ''
}

export const rm = async (path: string, options?: Deno.RemoveOptions) => {
	await Deno.remove(path, options)
}

export const getSupabaseClient = () => {
	return supabase.createClient(
		getEnv('SUPABASE_URL'),
		getEnv('SUPABASE_SERVICE_KEY'),
		{
			auth: { storage: localStorage },
		},
	)
}

export const unpack = async (path: string, target: string) => {
	const command = new Deno.Command('tar', {
		args: ['xzf', path, '-C', target],
	})
	const { success, stderr } = await command.output()
	if (!success) {
		throw new Error(
			`Failed to unpack ${path} | ${new TextDecoder().decode(stderr)}`,
		)
	}
}

export const collectRpcUrls = () => {
	const rpcUrls: Record<string, string> = {}
	for (const chain of Object.keys(arkiver.supportedChains)) {
		const rpcUrl = Deno.env.get(`${chain.toUpperCase()}_RPC_URL`)
		if (!rpcUrl) continue
		rpcUrls[chain] = rpcUrl
	}
	return rpcUrls
}

export const buildObjectFromArray = (values: string[]) => {
	const res = values.reduce((acc, value, i) => {
		if (i % 2 === 0) {
			acc[1] = value
		} else {
			acc[0][acc[1]] = value
		}
		return acc
	}, [{}, ''] as [Record<string, string>, string])
	return res[0]
}

export const getInfluxWriter = () => {
	return new influx.InfluxDB({
		url: getEnv('INFLUX_URL'),
		token: getEnv('INFLUX_TOKEN'),
	}).getWriteApi(getEnv('INFLUX_ORG'), getEnv('INFLUX_BUCKET'))
}

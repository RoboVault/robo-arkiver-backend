import { log } from '../deps.ts'

export const logger = (loggerName: string) => {
  return log.getLogger(loggerName as string)
}

export type Logger =
  | 'manager'
  | 'arkiver'
  | 'graphQLServer'

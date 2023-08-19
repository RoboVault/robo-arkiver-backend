import { arkiverTypes } from '../../deps.ts'

export type ArkiveMessageEvent =
  | NewArkiveMessageEvent
  | HandlerErrorEvent
  | ArkiveSyncedEvent

export interface NewArkiveMessageEvent {
  topic: 'initArkive'
  data: {
    arkive: arkiverTypes.Arkive
    mongoConnection: string
    rpcUrls: Record<string, string>
  }
}

export interface HandlerErrorEvent {
  topic: 'handlerError'
  data: {
    error: Error
    arkive: arkiverTypes.Arkive
  }
}

export interface ArkiveSyncedEvent {
  topic: 'synced'
  data: {
    arkive: arkiverTypes.Arkive
  }
}

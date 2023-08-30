import { scope } from './deps.ts'

export interface Arkive {
  id: number
  user_id: string
  name: string
  public: boolean
  created_at: string
}

export interface Deployment {
  id: number
  arkive_id: number
  major_version: number
  minor_version: number
  created_at: string
  status: 'pending' | 'synced' | 'error' | 'syncing'
  file_path: string
}

export const parseSerializedManifest = scope({
  serializedManifest: {
    name: /^[a-zA-Z0-9_-]*$/,
    'version?': /^v\d+$/,
    dataSources: {
      'string?': 'dataSource',
    },
    entities: 'entity[]',
  },
  dataSource: {
    options: 'chainOptions',
    'contracts?': 'contract[]',
    'blockHandlers?': 'blockHandler[]',
  },
  entity: {
    list: 'boolean',
    name: 'string',
  },
  chainOptions: {
    blockRange: '_bigint',
    rpcUrl: 'string',
  },
  contract: {
    id: 'string',
    abi: 'any[]',
    sources: 'source[]',
    events: 'eventSource[]',
  },
  blockHandler: {
    startBlockHeight: '_bigint|"live"',
    blockInterval: '_bigint',
    name: 'string',
  },
  source: {
    address: /^0x[a-fA-F0-9]{40}$/,
    startBlockHeight: '_bigint',
  },
  eventSource: {
    name: 'string',
  },
  _bigint: {
    _bigint: 'string',
  },
}).compile()

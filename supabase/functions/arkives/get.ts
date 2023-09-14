import { postgres, SupabaseClient } from '../_shared/deps.ts'
import { HttpError } from '../_shared/http_error.ts'
import { Arkive } from "../_shared/models/arkive.ts";
import { getUsernameFromUserId } from '../_shared/username.ts'
import { getEnv, getLimitOffset } from '../_shared/utils.ts'

export async function get(
  supabase: SupabaseClient,
  params: {
    username?: string
    arkivename?: string
    minimal: boolean
    publicOnly: boolean
    page?: string,
    rows?: string
  },
) {
  const {
    username,
    arkivename,
    minimal,
    publicOnly,
    page,
    rows
  } = params

  const { limit, offset } = getLimitOffset(parseInt(page ?? '0'), parseInt(rows ?? '50'))

  const _publicOnly = !publicOnly
    ? await shouldReturnOnlyPublic(supabase, params)
    : publicOnly

  const sql = postgres(getEnv('SUPABASE_DB_URL'), {
    database: 'postgres',
    username: 'postgres',
    port: 6543,
    password: getEnv('SUPABASE_DB_PASSWORD'),
  })

  const minimalColumns = [
    'a.name',
    'a.user_id',
    'a.public',
    'a.thumbnail_url',
    'a.code_repo_url',
    'a.project_url',
    'a.environment',
    'a.featured',
    'up.username',
  ]

  const extraColumns = [
    'd.created_at',
    'd.major_version',
    'd.minor_version',
    'd.status',
    'd.arkive_id',
    'd.manifest',
  ]

  // latest deployment data
  const deploymentColumns = [
    'd.deployment_date',
    'd.major_version',
    'd.minor_version',
    'd.status',
    'd.arkive_id',
  ]

  const columns = minimal
    ? minimalColumns.concat(deploymentColumns)
    : minimalColumns.concat(extraColumns)

  const latestDeployment = sql`
    SELECT
      d.arkive_id,
      d.created_at as deployment_date,
      d.major_version,
      d.minor_version,
      d.status
    FROM public.deployments d
    INNER JOIN (
        SELECT
          arkive_id,
          MAX(created_at) as deployment_date
          FROM public.deployments
          GROUP BY arkive_id
    ) ld 
      ON d.arkive_id = ld.arkive_id 
      AND d.created_at = ld.deployment_date
  `

  const arkivesRaw = await sql`
		SELECT
			${sql(columns)}
		FROM
			public.arkive a
		JOIN
			public.user_profile up ON a.user_id = up.id

		${minimal
      ? sql`LEFT JOIN (${latestDeployment}) d ON a.id = d.arkive_id`
      : sql`LEFT JOIN public.deployments d ON a.id = d.arkive_id`
    }

		${_publicOnly
      ? username
        ? arkivename
          ? sql`WHERE a.public = true AND up.username = ${username} AND a.name = ${arkivename}`
          : sql`WHERE a.public = true AND up.username = ${username}`
        : sql`WHERE a.public = true`
      : username
        ? arkivename
          ? sql`WHERE up.username = ${username} AND a.name = ${arkivename}`
          : sql`WHERE up.username = ${username}`
        : sql`WHERE a.public = true` // return empty array
    }

    ORDER BY d.deployment_date DESC
    LIMIT ${limit}
    OFFSET ${offset}
	`

  let arkives

  if (!minimal) {
    const grouped: Record<number, Arkive> = {}

    arkivesRaw.forEach((arkive) => {
      const deployment = {
        'id': arkive.id,
        'created_at': arkive.created_at,
        'major_version': arkive.major_version,
        'minor_version': arkive.minor_version,
        'status': arkive.status,
        'file_path': arkive.file_path,
        'manifest': arkive.manifest,
      }

      if (!grouped[arkive.arkive_id]) {
        grouped[arkive.arkive_id] = {
          'id': arkive.arkive_id,
          'name': arkive.name,
          'user_id': arkive.user_id,
          'public': arkive.public,
          'thumbnail_url': arkive.thumbnail_url,
          'code_repo_url': arkive.code_repo_url,
          'project_url': arkive.project_url,
          'environment': arkive.environment,
          'username': arkive.username,
          'featured': arkive.featured,
          'deployments': [deployment],
        }
      } else {
        grouped[arkive.arkive_id].deployments.push(deployment)
      }
    })

    arkives = Object.values(grouped)
  } else {
    arkives = arkivesRaw
  }

  if (username && arkivename && arkives.length === 0) {
    throw new HttpError(404, 'Arkive not found')
  }

  if (username && arkivename) {
    return arkives[0]
  }

  return arkives
}

const shouldReturnOnlyPublic = async (client: SupabaseClient, params: {
  username?: string
}) => {
  const { username } = params

  if (!username) {
    return true
  }

  if (username) {
    const { data: { user } } = await client.auth.getUser()

    if (!user) {
      return true
    }

    const userNameFromUserId = await getUsernameFromUserId(client, user.id)
    return userNameFromUserId !== username
  }
}

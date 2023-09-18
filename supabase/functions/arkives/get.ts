import { postgres, SupabaseClient } from '../_shared/deps.ts'
import { HttpError } from '../_shared/http_error.ts'
import { arkiveMapper } from "../_shared/mappers.ts";
import { deploymentMapper } from "../_shared/mappers.ts";
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

  const deploymentColumns = [
    'd.created_at',
    'd.major_version',
    'd.minor_version',
    'd.status',
    'd.arkive_id',
  ]

  const extraColumns = [
    'd.manifest',
  ]

  const columns = minimal
    ? minimalColumns.concat(deploymentColumns)
    : minimalColumns
      .concat(deploymentColumns)
      .concat(extraColumns)

  const latestDeployment = sql`
    SELECT
    ${sql(deploymentColumns)}
    FROM public.deployments d
    INNER JOIN (
        SELECT
          arkive_id,
          MAX(created_at) as created_at
          FROM public.deployments
          GROUP BY arkive_id
    ) ld 
      ON d.arkive_id = ld.arkive_id 
      AND d.created_at = ld.created_at
  `

  // TODO: Fix total count
  // Why does it return more count when !minimal?
  const arkivesRaw = await sql`
		SELECT
			${sql(columns)},
      ${(!username && !arkivename) && sql`COUNT(*) OVER() AS total_arkives`}
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

    LIMIT ${limit}
    OFFSET ${offset}
	`

  let arkives

  if (!minimal) {
    const grouped: Record<number, Arkive> = {}

    arkivesRaw.forEach((arkive) => {
      const deployment = {
        ...deploymentMapper(arkive),
        'file_path': arkive.file_path,
        'manifest': arkive.manifest,
      }

      if (!grouped[arkive.arkive_id]) {
        grouped[arkive.arkive_id] = {
          ...arkiveMapper(arkive),
          'deployments': [deployment],
        }
      } else {
        grouped[arkive.arkive_id].deployments.push(deployment)
      }
    })


    arkives = Object.values(grouped)
  } else {
    const mappedArkives = arkivesRaw.map((arkive) => {
      return {
        ...arkiveMapper(arkive),
        latest_deployment: {
          ...deploymentMapper(arkive)
        }
      }
    })

    arkives = mappedArkives
  }

  if (username && arkivename && arkives.length === 0) {
    throw new HttpError(404, 'Arkive not found')
  }

  if (username && arkivename) {
    return arkives[0]
  }

  return {
    total_arkives: arkives.length ? arkivesRaw[0].total_arkives : 0,
    arkives
  }
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

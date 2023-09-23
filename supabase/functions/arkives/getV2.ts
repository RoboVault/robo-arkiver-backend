import { postgres, SupabaseClient } from '../_shared/deps.ts'
import { HttpError } from "../_shared/http_error.ts";
import { arkiveMapper, deploymentMapper } from "../_shared/mappers.ts";
import { Arkive } from '../_shared/models/arkive.ts';
import { getEnv, getLimitOffset, hasActiveUser } from '../_shared/utils.ts'

/**
 * 
 * [x] getArkives
 * [x] getArkivesByUser
 * [x] getArkiveByName
 */

// Keep all interfaces here:
interface Params {
    username?: string,
    /** user excluded in the query */
    excludeduser?: string,
    arkivename?: string,
    isMinimal?: boolean,
    isPublic?: boolean | string,
    isFeatured?: boolean | string,
    page?: string,
    rows?: string
}

export interface ArkivesProps {
    supabase?: SupabaseClient,
    params: Params
}

export interface ConfigProps {
    sql: postgres.Sql<{}>,

    /** All columns */
    columns?: string[],
    deploymentColumns?: string[],

    latestDeployment?: postgres.PendingQuery<postgres.Row[]>,
    selectQuery?: postgres.PendingQuery<postgres.Row[]>,
    minimalQuery?: postgres.PendingQuery<postgres.Row[]>,

    params: Params
}

const initDbConnection = () => {
    const sql = postgres(getEnv('SUPABASE_DB_URL'), {
        database: 'postgres',
        username: 'postgres',
        port: 6543,
        password: getEnv('SUPABASE_DB_PASSWORD'),
    })

    return { sql }
}

const getColumns = (isMinimal = false) => {
    /**
     * Make sure the prefix is matched with the tables' alias.
     * See: getLatestDeployment and getSelectClause
     */
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

    const columns = isMinimal
        ? minimalColumns.concat(deploymentColumns)
        : minimalColumns
            .concat(deploymentColumns)
            .concat(extraColumns)

    return {
        columns,
        minimalColumns,
        deploymentColumns,
        extraColumns,
    }
}

const getLatestDeployment = (sql: postgres.Sql, columns: string[]) => {
    const latestDeployment = sql`
    SELECT
        ${sql(columns)}
    FROM 
        public.deployments d
    INNER JOIN (
        SELECT
          arkive_id,
          MAX(created_at) as created_at
          FROM public.deployments
          GROUP BY arkive_id
    ) ld ON d.arkive_id = ld.arkive_id AND d.created_at = ld.created_at
    `

    return latestDeployment
}

const getSelectClause = (sql: postgres.Sql, columns: string[]) => {
    const query = sql`
    SELECT
		${sql(columns)},
        COUNT(*) OVER() AS total_arkives
	FROM
		public.arkive a
	JOIN
		public.user_profile up ON a.user_id = up.id
    `

    return query
}

const getMinimalQuery = (sql: postgres.Sql, columns: postgres.PendingQuery<postgres.Row[]>, isMinimal = false) => {
    const query = sql`${isMinimal
        ? sql`LEFT JOIN (${columns}) d ON a.id = d.arkive_id`
        : sql`LEFT JOIN public.deployments d ON a.id = d.arkive_id`
        }`

    return query
}

// deno-lint-ignore no-explicit-any
const mapToArkivesSchema = (response: any[], isMinimal = false) => {
    let mappedResponse = response

    if (isMinimal) {
        mappedResponse = response.map((arkive) => {
            return {
                ...arkiveMapper(arkive),
                latest_deployment: {
                    ...deploymentMapper(arkive)
                }
            }
        })
    } else {
        const grouped: Record<number, Arkive> = {}
        response.forEach((arkive) => {
            const { arkive_id: id, file_path, manifest } = arkive

            const deployment = {
                ...deploymentMapper(arkive),
                file_path,
                manifest,
            }

            if (!grouped[id]) {
                grouped[id] = {
                    ...arkiveMapper(arkive),
                    'deployments': [deployment],
                }
            } else {
                grouped[id].deployments.push(deployment)
            }
        })
        mappedResponse = Object.values(grouped)
    }

    return mappedResponse
}

/**
 * Always return public arkives when the endpoint is /arkives,
 * the only private arkives that can be returned are the arkives owned by the active user
 * and this can be fetched using /arkives/:username.
 * 
 * Endpoint: /arkives
 * 
 * Query params:
 * 1. featured: /arkives?featured=true
 *   - use this to get the list of featured arkives
 *   - if this param is not provided, do not include this in where clause.
 * 
 * 2. excludeduser: /arkives?excludeduser=robolabs
 *   - this is a very specific case that will be used in UI
 *   - use this to get only the public arkives of other users aka "Community Arkives"
 *   - if this is not provided, all public arkives will be returned
 * 
 * 3. page: /arkives?page=0
 * 4. page: /arkives?rows=0
 *   - this will serve as the offset or skip
 * 
 * @param props
 * @returns 
 */
export const getArkives = async (props: ArkivesProps) => {
    const {
        params: {
            isFeatured,
            page,
            rows,
            isMinimal,
            excludeduser
        }
    } = props

    const { sql } = initDbConnection()

    const { columns, deploymentColumns } = getColumns(isMinimal)
    const { limit, offset } = getLimitOffset(page, rows)

    const latestDeployment = getLatestDeployment(sql, deploymentColumns)
    const selectQuery = getSelectClause(sql, columns)
    const minimalQuery = getMinimalQuery(sql, latestDeployment, isMinimal)

    let arkives = []

    const data = await sql`
        ${selectQuery}
        ${minimalQuery}

        WHERE a.public = true
        ${typeof isFeatured !== 'undefined'
            ? sql`AND a.featured = ${isFeatured === 'true'}`
            : sql``
        }
        ${typeof excludeduser !== 'undefined'
            ? sql`AND up.username != ${excludeduser}`
            : sql``
        }

        LIMIT ${limit}
        OFFSET ${offset}
        `

    arkives = mapToArkivesSchema(data, isMinimal)

    const totalArkives = isMinimal
        ? arkives.length ? data[0].total_arkives : 0
        : arkives.length

    return {
        total_arkives: totalArkives,
        arkives
    }
}

/**
 * Returns all private and public arkives owned by the active user.
 * 
 * Endpoint: /arkives/:username
 * 
 * Path param:
 * 1. username: /arkives/:username
 *   - if username is not provided or there is no active user (no authenticated user),
 *     only public arkives will be returned.
 * 
 * Query params:
 * 1. featured: /arkives/robolabs?featured=true
 *   - use this to get the list of featured arkives of the user
 *   - if this param is not provided, do not include this in where clause.
 * 
 * 2. public: /arkives/robolabs?public=false
 *   - if there is active user, this will return private arkives
 * 
 * Others options:
 *   - /arkives/robolabs?public=false&featured=true
 * 
 * @param props 
 * @returns 
 */
export const getArkivesByUser = async (props: ArkivesProps) => {
    const {
        supabase,
        params: {
            username = '',
            isPublic,
            isFeatured,
            page,
            rows,
            isMinimal,
        }
    } = props

    const { sql } = initDbConnection()

    const { columns, deploymentColumns } = getColumns(isMinimal)
    const { limit, offset } = getLimitOffset(page, rows)

    const latestDeployment = getLatestDeployment(sql, deploymentColumns)
    const selectQuery = getSelectClause(sql, columns)
    const minimalQuery = getMinimalQuery(sql, latestDeployment, isMinimal)

    // If there is no active user, return public arkives only
    const hasUser = await hasActiveUser(username, supabase)

    let arkives = []

    const data = await sql`
        ${selectQuery}
        ${minimalQuery}

        WHERE up.username = ${username}
        ${hasUser
            ? sql`AND a.public = ${isPublic === 'true'}`
            : sql`AND a.public = true`
        }
        ${typeof isFeatured !== 'undefined'
            ? sql`AND a.featured = ${isFeatured === 'true'}`
            : sql``
        }

        LIMIT ${limit}
        OFFSET ${offset}
    `

    arkives = mapToArkivesSchema(data, isMinimal)

    const totalArkives = isMinimal
        ? arkives.length ? data[0].total_arkives : 0
        : arkives.length

    return {
        total_arkives: totalArkives,
        arkives
    }
}

/**
 * Return specific arkive using arkive's name
 * 
 * Endpoint: /arkives/:username/:arkivename
 * 
 * Path param: 
 * 1. arkivename
 *   - if the arkive being searched is privately owned by another user, 
 *     nothing will be returned.
 * 
 * @param props 
 * @returns 
 */
export const getArkiveByName = async (props: ArkivesProps) => {
    const { username = '', arkivename = '', isMinimal } = props.params

    const { sql } = initDbConnection()
    const { columns, deploymentColumns } = getColumns()

    const latestDeployment = getLatestDeployment(sql, deploymentColumns)
    const selectQuery = getSelectClause(sql, columns)
    const minimalQuery = getMinimalQuery(sql, latestDeployment, isMinimal)

    const data = await sql`
        ${selectQuery}
        ${minimalQuery}
        WHERE a.name = ${arkivename} AND up.username = ${username}
    `

    const arkives = mapToArkivesSchema(data, isMinimal)

    if (arkives.length === 0) {
        throw new HttpError(404, 'Arkive not found')
    } else {
        return arkives[0]
    }
}

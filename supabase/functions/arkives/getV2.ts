import { postgres, SupabaseClient } from '../_shared/deps.ts'
import { HttpError } from "../_shared/http_error.ts";
import { arkiveMapper, deploymentMapper } from "../_shared/mappers.ts";
import { Arkive } from '../_shared/models/arkive.ts';
import { getEnv, getLimitOffset, hasActiveUser } from '../_shared/utils.ts'

/**
 * TODO: Add the following functions
 * 
 * [ ] getAllArkives
 * [ ] getAllPublicArkives
 * [ ] getOtherUsersPublicArkives
 * [ ] getAllArkivesByUser
 * [x] getArkiveByName
 * [x] getFeaturedArkives 
 */

// Keep all interfaces here:
export interface ArkivesProps {
    supabase: SupabaseClient,
    params: {
        username?: string,
        arkivename?: string,
        isMinimal?: boolean,
        isPublic?: boolean,
        isFeatured?: boolean,
        page?: string,
        rows?: string
    }
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

// TODO:
export const getAllArkives = () => {

}

/**
 * Returns all public arkives.
 * When there is no active user, return all public arkives
 */
export const getAllPublicArkives = () => {

}

/**
 * This is a very specific case that FE will be using.
 * Returns all public arkives EXCEPT the active user's arkives
 */
export const getOtherUsersPublicArkives = () => {
    // Use client.auth here to get the active user
}

/**
 * Returns all private and public arkives of the active user.
 */
export const getAllArkivesByUser = () => {

}

/**
 * When no user, get all public featured arkives.
 * When there is a user, public featured arkives from other users + user's featured arkives
 * @param props: ArkivesProps 
 */
export const getFeaturedArkives = async (props: ArkivesProps) => {
    const {
        supabase,
        params: {
            username = '',
            page,
            rows,
            isMinimal,
        }
    } = props

    const { sql } = initDbConnection()

    const { columns, deploymentColumns } = getColumns(isMinimal)
    const { limit, offset } = getLimitOffset(page, rows)

    const isPublic = !(await hasActiveUser(supabase, username))

    const latestDeployment = getLatestDeployment(sql, deploymentColumns)
    const selectQuery = getSelectClause(sql, columns)

    const data = await sql`
        ${selectQuery}
        ${isMinimal
            ? sql`LEFT JOIN (${latestDeployment}) d ON a.id = d.arkive_id`
            : sql`LEFT JOIN public.deployments d ON a.id = d.arkive_id`
        }
        ${isPublic
            ? sql`WHERE a.featured = true AND a.public = true`
            : sql`WHERE a.featured = true`
        }
        LIMIT ${limit}
        OFFSET ${offset}
    `

    const arkives = mapToArkivesSchema(data, isMinimal)

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
 */
export const getArkiveByName = async (props: ArkivesProps) => {
    const { username = '', arkivename = '', isMinimal } = props.params

    const { sql } = initDbConnection()
    const { columns, deploymentColumns } = getColumns()

    const latestDeployment = getLatestDeployment(sql, deploymentColumns)
    const selectQuery = getSelectClause(sql, columns)

    const data = await sql`
        ${selectQuery}
        ${isMinimal
            ? sql`LEFT JOIN (${latestDeployment}) d ON a.id = d.arkive_id`
            : sql`LEFT JOIN public.deployments d ON a.id = d.arkive_id`
        }
        WHERE a.name = ${arkivename} AND up.username = ${username}
    `

    const arkives = mapToArkivesSchema(data, isMinimal)

    if (arkives.length === 0) {
        throw new HttpError(404, 'Arkive not found')
    } else {
        return arkives[0]
    }
}

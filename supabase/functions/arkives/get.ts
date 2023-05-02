import { SupabaseClient, postgres } from "../_shared/deps.ts";
import { HttpError } from "../_shared/http_error.ts";
import { getUserIdFromUsername } from "../_shared/username.ts";
import { getEnv } from "../_shared/utils.ts";

export async function get(
  supabase: SupabaseClient,
  params: {
    username?: string;
    arkivename?: string;
  },
) {
  const { username, arkivename } = params;

  const publicOnly = await shouldReturnOnlyPublic(supabase, params);

  const sql = postgres(getEnv("SUPABASE_DB_URL"), {
    port: 6543,
    password: getEnv("SUPABASE_DB_PASSWORD"),
  });

  const arkives = await sql`
    SELECT
      a.id,
      a.created_at,
      a.name,
      a.user_id,
      a.public,
      a.thumbnail_url,
      a.code_repo_url,
      a.project_url,
      up.username,
      ARRAY_AGG(
        json_build_object(
          'deployment_id', d.id,
          'deployment_created_at', d.created_at,
          'major_version', d.major_version,
          'minor_version', d.minor_version,
          'status', d.status,
          'arkive_id', d.arkive_id,
          'file_path', d.file_path
        )
      ) AS deployments
    FROM
      public.arkive a
    JOIN
      public.user_profile up ON a.user_id = up.id
    LEFT JOIN
      public.deployments d ON a.id = d.arkive_id
    ${publicOnly
      ? username
        ? arkivename
          ? sql`WHERE a.public = true AND up.username = ${username} AND a.name = ${arkivename}`
          : sql`WHERE a.public = true AND up.username = ${username}`
        : sql`WHERE a.public = true`
      : username
        ? arkivename
          ? sql`WHERE up.username = ${username} AND a.name = ${arkivename}`
          : sql`WHERE up.username = ${username}`
        : sql`WHERE a.public = true`  // return empty array
    }
    GROUP BY
      a.id, up.username;
  `

  if (username && arkivename && arkives.length === 0) {
    throw new HttpError(404, "Arkive not found");
  }

  if (username && arkivename) {
    return arkives[0];
  }

  return arkives;
}

const shouldReturnOnlyPublic = async (client: SupabaseClient, params: {
  username?: string;
}) => {
  const { username } = params;

  if (!username) {
    return true;
  }

  if (username) {
    const { data: { user } } = await client.auth.getUser()

    if (!user) {
      return true;
    }

    const userIdFromUsername = await getUserIdFromUsername(client, username);
    return userIdFromUsername !== user.id;
  }
}

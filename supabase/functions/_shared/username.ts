import { SupabaseClient } from "./deps.ts";
import { HttpError } from "./http_error.ts";
import { getEnv } from "./utils.ts";

export const getUserIdFromUsername = async (
  supabase: SupabaseClient,
  username: string,
) => {
  const profileRes = await supabase
    .from(getEnv("PROFILE_TABLE"))
    .select<"id", { id: string }>("id")
    .eq("username", username)
    .single();

  if (profileRes.error) {
    if (profileRes.error.code === "PGRST116") {
      throw new HttpError(404, `User ${username} not found`)
    }
    throw profileRes.error;
  }

  return profileRes.data.id;
};

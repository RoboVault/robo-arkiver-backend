import { SupabaseClient } from "../_shared/deps.ts";
import { getEnv } from "../_shared/utils.ts";

export const del = async (
  supabase: SupabaseClient,
  params: { arkiveName: string; userId: string },
) => {
  const { arkiveName, userId } = params;

  const arkiveRes = await supabase.from(getEnv("ARKIVE_TABLE"))
    .select("*")
    .eq("name", arkiveName)
    .eq("user_id", userId);

  if (arkiveRes.error) {
    throw arkiveRes.error;
  }

  const id = arkiveRes.data[0].id;

  const delDeploymentRes = await supabase
    .from(getEnv("DEPLOYMENTS_TABLE"))
    .delete()
    .eq("arkive_id", parseInt(id))
    .select();

  if (delDeploymentRes.error) {
    throw delDeploymentRes.error;
  }

  const delDbRes = await supabase
    .from(getEnv("ARKIVE_TABLE"))
    .delete()
    .eq("id", parseInt(id))
    .select();

  if (delDbRes.error) {
    throw delDbRes.error;
  }

  // delete from storage
  const path = `${userId}/${id}`;
  const readStorageRes = await supabase.storage
    .from(getEnv("ARKIVE_STORAGE"))
    .list(path);

  if (readStorageRes.error) {
    throw readStorageRes.error;
  }

  const deleteStorageRes = await supabase.storage
    .from(getEnv("ARKIVE_STORAGE"))
    .remove(readStorageRes.data.map((f) => `${path}/${f.name}`));

  if (deleteStorageRes.error) {
    throw deleteStorageRes.error;
  }

  return delDbRes.data;
};

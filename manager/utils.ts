import { supabase } from "./deps.ts";

export const getEnv = (key: string, defaultValue?: string): string => {
  const value = Deno.env.get(key);
  if (!value && !defaultValue) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value || defaultValue || "";
};

export const rm = async (path: string, options?: Deno.RemoveOptions) => {
  await Deno.remove(path, options);
};

export const getSupabaseClient = () => {
  return supabase.createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_KEY"),
    {
      auth: { storage: localStorage },
    },
  );
};

export const unpack = async (path: string, target: string) => {
  const p = Deno.run({
    cmd: ["tar", "xzf", path, "-C", target],
  });
  const status = await p.status();
  p.close();
  if (!status.success) {
    throw new Error(`Failed to unpack ${path}`);
  }
};

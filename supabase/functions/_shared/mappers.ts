import { postgres } from "./deps.ts";

export const arkiveMapper = (arkive: postgres.Row) => {
    return {
        id: arkive.arkive_id,
        name: arkive.name,
        user_id: arkive.user_id,
        public: arkive.public,
        thumbnail_url: arkive.thumbnail_url,
        code_repo_url: arkive.code_repo_url,
        project_url: arkive.project_url,
        environment: arkive.environment,
        username: arkive.username,
        featured: arkive.featured,
    }
}

export const deploymentMapper = (arkive: postgres.Row) => {
    return {
        id: arkive.arkive_id,
        created_at: arkive.created_at,
        major_version: arkive.major_version,
        minor_version: arkive.minor_version,
        status: arkive.status,
    }
}
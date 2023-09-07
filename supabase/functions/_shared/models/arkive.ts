export type Arkive = {
    id: number
    name: string
    user_id: string
    public: boolean
    thumbnail_url: string
    code_repo_url: string
    project_url: string
    environment: string
    username: string
    featured: boolean
    deployments: {
        id: number
        created_at: string
        major_version: number
        minor_version: number
        status: string
        manifest: string
    }[]
}
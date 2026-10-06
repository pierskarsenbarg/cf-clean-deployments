export interface CloudflareDeployment {
  id: string;
  created_on: string;
  environment: "production" | "preview";
  latest_stage: { status: string; name: string };
  aliases: string[] | null;
  is_skipped: boolean;
  url: string;
}

interface ListDeploymentsResponse {
  result: CloudflareDeployment[];
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result_info: {
    count: number;
    page: number;
    per_page: number;
    total_count: number;
    total_pages: number;
  };
}

interface WorkersListDeploymentsResponse {
  result: { deployments: Array<{ id: string; created_on: string }> };
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result_info: { total_pages: number };
}

export type ProjectType = "pages" | "workers";

interface DeleteDeploymentResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
}

export class CloudflareClient {
  private readonly baseUrl = "https://api.cloudflare.com/client/v4";

  constructor(
    private readonly apiToken: string,
    private readonly accountId: string,
    private readonly type: ProjectType = "workers",
  ) {}

  private get projectPath(): string {
    return this.type === "pages" ? "pages/projects" : "workers/scripts";
  }

  private async errorDetail(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { errors?: Array<{ message: string }> };
      return body.errors?.map((e) => e.message).join(", ") ?? "";
    } catch {
      return "";
    }
  }

  private get authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      "Content-Type": "application/json",
    };
  }

  async listDeployments(
    projectName: string,
    environment?: "production" | "preview",
  ): Promise<CloudflareDeployment[]> {
    const all: CloudflareDeployment[] = [];
    let page = 1;
    const perPage = 25;

    while (true) {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      });
      if (environment && this.type === "pages") {
        params.set("env", environment);
      }

      const url = `${this.baseUrl}/accounts/${this.accountId}/${this.projectPath}/${projectName}/deployments?${params}`;
      const response = await fetch(url, { headers: this.authHeaders });

      if (!response.ok) {
        const detail = await this.errorDetail(response);
        throw new Error(
          `Cloudflare API error ${response.status}: ${response.statusText}${detail ? ` (${detail})` : ""}`,
        );
      }

      const data = (await response.json()) as
        | ListDeploymentsResponse
        | WorkersListDeploymentsResponse;

      if (!data.success) {
        const msg = data.errors.map((e) => e.message).join(", ");
        throw new Error(`Cloudflare API returned errors: ${msg}`);
      }

      if (this.type === "workers") {
        // The first Workers deployment overall is the live one; mark it so cleanup protects it.
        const workers = (data as WorkersListDeploymentsResponse).result.deployments;
        all.push(
          ...workers.map((d, i) => ({
            id: d.id,
            created_on: d.created_on,
            environment: page === 1 && i === 0 ? ("production" as const) : ("preview" as const),
            latest_stage: { status: "success", name: "deploy" },
            aliases: null,
            is_skipped: false,
            url: "",
          })),
        );
      } else {
        all.push(...(data as ListDeploymentsResponse).result);
      }

      if (page >= data.result_info.total_pages) {
        break;
      }
      page++;
    }

    return all;
  }

  async deleteDeployment(projectName: string, deploymentId: string): Promise<void> {
    const forceParam = this.type === "pages" ? "?force=true" : "";
    const url = `${this.baseUrl}/accounts/${this.accountId}/${this.projectPath}/${projectName}/deployments/${deploymentId}${forceParam}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.authHeaders,
    });

    if (!response.ok) {
      const detail = await this.errorDetail(response);
      throw new Error(
        `Failed to delete deployment ${deploymentId}: ${response.status} ${response.statusText}${detail ? ` (${detail})` : ""}`,
      );
    }

    const data = (await response.json()) as DeleteDeploymentResponse;

    if (!data.success) {
      const msg = data.errors.map((e) => e.message).join(", ");
      throw new Error(`Failed to delete deployment ${deploymentId}: ${msg}`);
    }
  }
}

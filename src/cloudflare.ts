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

interface DeleteDeploymentResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
}

export class CloudflareClient {
  private readonly baseUrl = "https://api.cloudflare.com/client/v4";

  constructor(
    private readonly apiToken: string,
    private readonly accountId: string,
  ) {}

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
      if (environment) {
        params.set("env", environment);
      }

      const url = `${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/deployments?${params}`;
      const response = await fetch(url, { headers: this.authHeaders });

      if (!response.ok) {
        throw new Error(`Cloudflare API error ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as ListDeploymentsResponse;

      if (!data.success) {
        const msg = data.errors.map((e) => e.message).join(", ");
        throw new Error(`Cloudflare API returned errors: ${msg}`);
      }

      all.push(...data.result);

      if (page >= data.result_info.total_pages) {
        break;
      }
      page++;
    }

    return all;
  }

  async deleteDeployment(projectName: string, deploymentId: string): Promise<void> {
    const url = `${this.baseUrl}/accounts/${this.accountId}/pages/projects/${projectName}/deployments/${deploymentId}?force=true`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: this.authHeaders,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to delete deployment ${deploymentId}: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as DeleteDeploymentResponse;

    if (!data.success) {
      const msg = data.errors.map((e) => e.message).join(", ");
      throw new Error(`Failed to delete deployment ${deploymentId}: ${msg}`);
    }
  }
}

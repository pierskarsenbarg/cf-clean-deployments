import type { MockInstance } from "vitest";
import { CloudflareClient, CloudflareDeployment } from "../src/cloudflare";

const TOKEN = "test-token";
const ACCOUNT_ID = "test-account";
const PROJECT = "my-project";

function makeDeployment(
  id: string,
  overrides: Partial<CloudflareDeployment> = {},
): CloudflareDeployment {
  return {
    id,
    created_on: "2024-01-01T00:00:00Z",
    environment: "preview",
    latest_stage: { status: "success", name: "deploy" },
    aliases: null,
    is_skipped: false,
    url: `https://${id}.example.pages.dev`,
    ...overrides,
  };
}

function makeListResponse(deployments: CloudflareDeployment[], page: number, totalPages: number) {
  return {
    result: deployments,
    success: true,
    errors: [],
    result_info: {
      count: deployments.length,
      page,
      per_page: 25,
      total_count: deployments.length,
      total_pages: totalPages,
    },
  };
}

describe("CloudflareClient.listDeployments", () => {
  let client: CloudflareClient;
  let fetchSpy: MockInstance;

  beforeEach(() => {
    client = new CloudflareClient(TOKEN, ACCOUNT_ID);
    fetchSpy = vi.spyOn(global, "fetch");
  });

  it("sends Authorization header", async () => {
    const d = makeDeployment("dep-1");
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => makeListResponse([d], 1, 1),
    } as unknown as Response);

    await client.listDeployments(PROJECT);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)["Authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  it("returns all deployments on a single page", async () => {
    const deployments = [makeDeployment("a"), makeDeployment("b")];
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => makeListResponse(deployments, 1, 1),
    } as unknown as Response);

    const result = await client.listDeployments(PROJECT);
    expect(result).toHaveLength(2);
    expect(result.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("fetches all pages when there are multiple pages", async () => {
    const page1 = [makeDeployment("a"), makeDeployment("b")];
    const page2 = [makeDeployment("c")];

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeListResponse(page1, 1, 2),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeListResponse(page2, 2, 2),
      } as unknown as Response);

    const result = await client.listDeployments(PROJECT);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(3);
    expect(result.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by environment when provided", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => makeListResponse([], 1, 1),
    } as unknown as Response);

    await client.listDeployments(PROJECT, "preview");

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain("env=preview");
  });

  it("does not add env param when environment is undefined", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => makeListResponse([], 1, 1),
    } as unknown as Response);

    await client.listDeployments(PROJECT);

    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).not.toContain("env=");
  });

  it("throws on non-ok HTTP response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    } as unknown as Response);

    await expect(client.listDeployments(PROJECT)).rejects.toThrow("Cloudflare API error 401");
  });

  it("throws when success is false", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: [],
        success: false,
        errors: [{ code: 1000, message: "Invalid token" }],
        result_info: { count: 0, page: 1, per_page: 25, total_count: 0, total_pages: 0 },
      }),
    } as unknown as Response);

    await expect(client.listDeployments(PROJECT)).rejects.toThrow("Invalid token");
  });
});

describe("CloudflareClient.deleteDeployment", () => {
  let client: CloudflareClient;
  let fetchSpy: MockInstance;

  beforeEach(() => {
    client = new CloudflareClient(TOKEN, ACCOUNT_ID);
    fetchSpy = vi.spyOn(global, "fetch");
  });

  it("sends DELETE request with force=true", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, errors: [] }),
    } as unknown as Response);

    await client.deleteDeployment(PROJECT, "dep-abc");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("dep-abc");
    expect(url).toContain("force=true");
    expect(options.method).toBe("DELETE");
  });

  it("throws on non-ok HTTP response", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as unknown as Response);

    await expect(client.deleteDeployment(PROJECT, "missing")).rejects.toThrow(
      "Failed to delete deployment missing",
    );
  });

  it("throws when success is false in response body", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        errors: [{ code: 8000000, message: "Cannot delete active deployment" }],
      }),
    } as unknown as Response);

    await expect(client.deleteDeployment(PROJECT, "dep-active")).rejects.toThrow(
      "Cannot delete active deployment",
    );
  });
});

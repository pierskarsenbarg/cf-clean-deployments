import type { Mocked, MockedClass } from "vitest";

vi.mock("@actions/core");
vi.mock("../src/cloudflare");

import * as core from "@actions/core";
import { CloudflareClient, CloudflareDeployment } from "../src/cloudflare";
import { run } from "../src/main";

const mockedCore = core as Mocked<typeof core>;
const MockedClient = CloudflareClient as MockedClass<typeof CloudflareClient>;

function makeDeployment(
  id: string,
  createdOn: string,
  overrides: Partial<CloudflareDeployment> = {},
): CloudflareDeployment {
  return {
    id,
    created_on: createdOn,
    environment: "preview",
    latest_stage: { status: "success", name: "deploy" },
    aliases: null,
    is_skipped: false,
    url: `https://${id}.example.pages.dev`,
    ...overrides,
  };
}

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV };
  delete process.env["CLOUDFLARE_API_TOKEN"];
  delete process.env["CLOUDFLARE_ACCOUNT_ID"];
});

afterEach(() => {
  process.env = OLD_ENV;
});

function setupInputs(inputs: Record<string, string>) {
  mockedCore.getInput.mockImplementation((name: string, options?: { required?: boolean }) => {
    const val = inputs[name] ?? "";
    if (options?.required && !val) {
      throw new Error(`Input required and not supplied: ${name}`);
    }
    return val;
  });
}

function setupClient(deployments: CloudflareDeployment[], deleteImpl?: ReturnType<typeof vi.fn>) {
  MockedClient.prototype.listDeployments = vi.fn().mockResolvedValue(deployments);
  MockedClient.prototype.deleteDeployment = deleteImpl ?? vi.fn().mockResolvedValue(undefined);
}

describe("input validation", () => {
  it("fails when both keep-deployments and keep-days are set", async () => {
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "5",
      "keep-days": "7",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient([]);

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Only one of keep-deployments or keep-days"),
    );
  });

  it("fails when neither keep-deployments nor keep-days are set", async () => {
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "",
      "keep-days": "",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient([]);

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Exactly one of keep-deployments or keep-days"),
    );
  });

  it("fails when api-token is missing and env var is not set", async () => {
    setupInputs({
      "api-token": "",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "5",
      "keep-days": "",
      environment: "preview",
      "dry-run": "false",
    });

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("API token is required"),
    );
    expect(MockedClient).not.toHaveBeenCalled();
  });

  it("fails when account-id is missing and env var is not set", async () => {
    setupInputs({
      "api-token": "tok",
      "account-id": "",
      "project-name": "proj",
      "keep-deployments": "5",
      "keep-days": "",
      environment: "preview",
      "dry-run": "false",
    });

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("account ID is required"),
    );
    expect(MockedClient).not.toHaveBeenCalled();
  });

  it("falls back to CLOUDFLARE_API_TOKEN env var", async () => {
    process.env["CLOUDFLARE_API_TOKEN"] = "env-token";
    setupInputs({
      "api-token": "",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "5",
      "keep-days": "",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient([]);

    await run();

    expect(MockedClient).toHaveBeenCalledWith("env-token", "acc");
  });

  it("falls back to CLOUDFLARE_ACCOUNT_ID env var", async () => {
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "env-account";
    setupInputs({
      "api-token": "tok",
      "account-id": "",
      "project-name": "proj",
      "keep-deployments": "5",
      "keep-days": "",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient([]);

    await run();

    expect(MockedClient).toHaveBeenCalledWith("tok", "env-account");
  });

  it("fails when environment input is invalid", async () => {
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "5",
      "keep-days": "",
      environment: "staging",
      "dry-run": "false",
    });
    setupClient([]);

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Invalid environment"),
    );
  });

  it("fails when keep-deployments is not a valid integer", async () => {
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "abc",
      "keep-days": "",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient([]);

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("non-negative integer"),
    );
  });

  it("fails when keep-days is not a valid integer", async () => {
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "",
      "keep-days": "many",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient([]);

    await run();

    expect(mockedCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("non-negative integer"),
    );
  });
});

describe("deletion behaviour", () => {
  const deployments: CloudflareDeployment[] = [
    makeDeployment("dep-1", "2024-06-15T00:00:00Z"),
    makeDeployment("dep-2", "2024-06-10T00:00:00Z"),
    makeDeployment("dep-3", "2024-06-01T00:00:00Z"),
  ];

  it("deletes old deployments by count and sets deleted-count output", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "1",
      "keep-days": "",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient(deployments, deleteMock);

    await run();

    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(mockedCore.setOutput).toHaveBeenCalledWith("deleted-count", "2");
  });

  it("does not delete in dry-run mode and sets deleted-count to 0", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "1",
      "keep-days": "",
      environment: "preview",
      "dry-run": "true",
    });
    setupClient(deployments, deleteMock);

    await run();

    expect(deleteMock).not.toHaveBeenCalled();
    expect(mockedCore.setOutput).toHaveBeenCalledWith("deleted-count", "0");
    expect(mockedCore.info).toHaveBeenCalledWith(expect.stringContaining("[dry-run]"));
  });

  it("sets deleted-count to 0 when nothing qualifies for deletion", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "10",
      "keep-days": "",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient(deployments, deleteMock);

    await run();

    expect(deleteMock).not.toHaveBeenCalled();
    expect(mockedCore.setOutput).toHaveBeenCalledWith("deleted-count", "0");
  });

  it("issues warning but continues when a deletion fails", async () => {
    const deleteMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockResolvedValueOnce(undefined);

    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "1",
      "keep-days": "",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient(deployments, deleteMock);

    await run();

    expect(mockedCore.warning).toHaveBeenCalledWith(expect.stringContaining("permission denied"));
    expect(mockedCore.setOutput).toHaveBeenCalledWith("deleted-count", "1");
  });

  it('passes undefined environment to listDeployments when environment is "all"', async () => {
    const listMock = vi.fn().mockResolvedValue([]);
    MockedClient.prototype.listDeployments = listMock;
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "10",
      "keep-days": "",
      environment: "all",
      "dry-run": "false",
    });

    await run();

    expect(listMock).toHaveBeenCalledWith("proj", undefined);
  });

  it("uses keep-days mode to delete deployments older than the threshold", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    setupInputs({
      "api-token": "tok",
      "account-id": "acc",
      "project-name": "proj",
      "keep-deployments": "",
      "keep-days": "1",
      environment: "preview",
      "dry-run": "false",
    });
    setupClient(deployments, deleteMock);

    await run();

    expect(deleteMock).toHaveBeenCalledTimes(3);
  });
});

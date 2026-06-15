import { CloudflareDeployment } from "../src/cloudflare";
import { selectByCount, selectByDays } from "../src/cleanup";

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

describe("selectByCount", () => {
  it("returns empty array when there are no deployments", () => {
    expect(selectByCount([], 5)).toEqual([]);
  });

  it("returns nothing to delete when count is >= total deployments", () => {
    const deps = [
      makeDeployment("a", "2024-01-03T00:00:00Z"),
      makeDeployment("b", "2024-01-02T00:00:00Z"),
    ];
    expect(selectByCount(deps, 2)).toEqual([]);
    expect(selectByCount(deps, 10)).toEqual([]);
  });

  it("keeps the N most recent and marks the rest for deletion", () => {
    const deps = [
      makeDeployment("a", "2024-01-03T00:00:00Z"), // newest
      makeDeployment("b", "2024-01-02T00:00:00Z"),
      makeDeployment("c", "2024-01-01T00:00:00Z"), // oldest
    ];
    const toDelete = selectByCount(deps, 1);
    expect(toDelete.map((d) => d.id)).toEqual(["b", "c"]);
  });

  it("sorts by date descending before slicing", () => {
    const deps = [
      makeDeployment("old", "2024-01-01T00:00:00Z"),
      makeDeployment("new", "2024-01-10T00:00:00Z"),
      makeDeployment("mid", "2024-01-05T00:00:00Z"),
    ];
    const toDelete = selectByCount(deps, 1);
    expect(toDelete.map((d) => d.id)).toEqual(["mid", "old"]);
  });

  it("returns all to delete when keepCount is 0", () => {
    const deps = [
      makeDeployment("a", "2024-01-03T00:00:00Z"),
      makeDeployment("b", "2024-01-02T00:00:00Z"),
    ];
    const toDelete = selectByCount(deps, 0);
    expect(toDelete).toHaveLength(2);
  });

  it("excludes protected production deployments from deletion", () => {
    const deps = [
      makeDeployment("preview-1", "2024-01-03T00:00:00Z"),
      makeDeployment("preview-2", "2024-01-02T00:00:00Z"),
      makeDeployment("prod-1", "2024-01-01T00:00:00Z", {
        environment: "production",
        latest_stage: { status: "success", name: "deploy" },
      }),
    ];
    const toDelete = selectByCount(deps, 1);
    // prod-1 would be in the tail but is protected
    expect(toDelete.map((d) => d.id)).toEqual(["preview-2"]);
  });

  it("does not modify the original array", () => {
    const deps = [
      makeDeployment("a", "2024-01-02T00:00:00Z"),
      makeDeployment("b", "2024-01-01T00:00:00Z"),
    ];
    const original = [...deps];
    selectByCount(deps, 0);
    expect(deps).toEqual(original);
  });
});

describe("selectByDays", () => {
  const now = new Date("2024-06-15T12:00:00Z");

  it("returns empty array when there are no deployments", () => {
    expect(selectByDays([], 7, now)).toEqual([]);
  });

  it("returns nothing when all deployments are within the keep window", () => {
    const deps = [
      makeDeployment("a", "2024-06-14T00:00:00Z"), // 1 day ago
      makeDeployment("b", "2024-06-10T00:00:00Z"), // 5 days ago
    ];
    expect(selectByDays(deps, 7, now)).toEqual([]);
  });

  it("returns deployments older than keepDays", () => {
    const deps = [
      makeDeployment("recent", "2024-06-14T00:00:00Z"), // 1 day ago
      makeDeployment("old", "2024-06-01T00:00:00Z"), // 14 days ago
    ];
    const toDelete = selectByDays(deps, 7, now);
    expect(toDelete.map((d) => d.id)).toEqual(["old"]);
  });

  it("deployment exactly at cutoff boundary is not deleted", () => {
    // cutoff = now - 7 days = 2024-06-08T12:00:00Z
    const atCutoff = makeDeployment("at-cutoff", "2024-06-08T12:00:00Z");
    expect(selectByDays([atCutoff], 7, now)).toEqual([]);
  });

  it("deployment just before cutoff is deleted", () => {
    // cutoff = now - 7 days = 2024-06-08T12:00:00Z
    const justBefore = makeDeployment("just-before", "2024-06-08T11:59:59Z");
    const toDelete = selectByDays([justBefore], 7, now);
    expect(toDelete.map((d) => d.id)).toEqual(["just-before"]);
  });

  it("excludes protected production deployments", () => {
    const deps = [
      makeDeployment("preview-old", "2024-05-01T00:00:00Z"),
      makeDeployment("prod-old", "2024-05-01T00:00:00Z", {
        environment: "production",
        latest_stage: { status: "success", name: "deploy" },
      }),
    ];
    const toDelete = selectByDays(deps, 7, now);
    expect(toDelete.map((d) => d.id)).toEqual(["preview-old"]);
  });

  it("uses current time when now is not provided", () => {
    const veryOld = makeDeployment("ancient", "2020-01-01T00:00:00Z");
    const toDelete = selectByDays([veryOld], 7);
    expect(toDelete).toHaveLength(1);
  });
});

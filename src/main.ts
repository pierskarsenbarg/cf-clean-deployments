import * as core from "@actions/core";
import { CloudflareClient } from "./cloudflare";
import { selectByCount, selectByDays } from "./cleanup";

export async function run(): Promise<void> {
  const apiToken = core.getInput("api-token") || process.env["CLOUDFLARE_API_TOKEN"] || "";
  const accountId = core.getInput("account-id") || process.env["CLOUDFLARE_ACCOUNT_ID"] || "";
  const projectName = core.getInput("project-name", { required: true });
  const keepDeploymentsInput = core.getInput("keep-deployments");
  const keepDaysInput = core.getInput("keep-days");
  const environmentInput = core.getInput("environment") || "preview";
  const dryRun = core.getInput("dry-run") === "true";

  if (!apiToken) {
    core.setFailed(
      "Cloudflare API token is required. Set the api-token input or CLOUDFLARE_API_TOKEN environment variable.",
    );
    return;
  }
  if (!accountId) {
    core.setFailed(
      "Cloudflare account ID is required. Set the account-id input or CLOUDFLARE_ACCOUNT_ID environment variable.",
    );
    return;
  }

  const hasKeepDeployments = keepDeploymentsInput !== "";
  const hasKeepDays = keepDaysInput !== "";

  if (hasKeepDeployments && hasKeepDays) {
    core.setFailed("Only one of keep-deployments or keep-days may be set, not both.");
    return;
  }
  if (!hasKeepDeployments && !hasKeepDays) {
    core.setFailed("Exactly one of keep-deployments or keep-days must be set.");
    return;
  }

  const validEnvironments = ["preview", "production", "all"];
  if (!validEnvironments.includes(environmentInput)) {
    core.setFailed(
      `Invalid environment "${environmentInput}". Must be one of: ${validEnvironments.join(", ")}.`,
    );
    return;
  }

  const client = new CloudflareClient(apiToken, accountId);

  core.info(`Fetching deployments for project "${projectName}"...`);

  const environment =
    environmentInput === "all" ? undefined : (environmentInput as "production" | "preview");

  const deployments = await client.listDeployments(projectName, environment);
  core.info(`Found ${deployments.length} deployment(s).`);

  let toDelete;
  if (hasKeepDeployments) {
    const keepCount = parseInt(keepDeploymentsInput, 10);
    if (isNaN(keepCount) || keepCount < 0) {
      core.setFailed(`keep-deployments must be a non-negative integer.`);
      return;
    }
    toDelete = selectByCount(deployments, keepCount);
    core.info(
      `Keeping ${keepCount} most recent deployment(s); ${toDelete.length} will be deleted.`,
    );
  } else {
    const keepDays = parseInt(keepDaysInput, 10);
    if (isNaN(keepDays) || keepDays < 0) {
      core.setFailed(`keep-days must be a non-negative integer.`);
      return;
    }
    toDelete = selectByDays(deployments, keepDays);
    core.info(
      `Keeping deployments from the last ${keepDays} day(s); ${toDelete.length} will be deleted.`,
    );
  }

  if (toDelete.length === 0) {
    core.info("Nothing to delete.");
    core.setOutput("deleted-count", "0");
    return;
  }

  if (dryRun) {
    core.info("[dry-run] The following deployments would be deleted:");
    for (const d of toDelete) {
      core.info(`  [dry-run] ${d.id} (created ${d.created_on}) ${d.url}`);
    }
    core.setOutput("deleted-count", "0");
    return;
  }

  let deletedCount = 0;
  for (const d of toDelete) {
    try {
      await client.deleteDeployment(projectName, d.id);
      core.info(`Deleted deployment ${d.id} (created ${d.created_on})`);
      deletedCount++;
    } catch (err) {
      core.warning(
        `Failed to delete deployment ${d.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  core.info(`Done. Deleted ${deletedCount} deployment(s).`);
  core.setOutput("deleted-count", String(deletedCount));
}

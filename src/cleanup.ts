import { CloudflareDeployment } from "./cloudflare";

function findActiveProduction(
  deployments: CloudflareDeployment[],
): CloudflareDeployment | undefined {
  return sortedByDateDesc(deployments).find(
    (d) => d.environment === "production" && d.latest_stage.status === "success",
  );
}

function sortedByDateDesc(deployments: CloudflareDeployment[]): CloudflareDeployment[] {
  return [...deployments].sort(
    (a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime(),
  );
}

export function selectByCount(
  deployments: CloudflareDeployment[],
  keepCount: number,
): CloudflareDeployment[] {
  const active = findActiveProduction(deployments);
  return sortedByDateDesc(deployments)
    .slice(keepCount)
    .filter((d) => d !== active);
}

export function selectByDays(
  deployments: CloudflareDeployment[],
  keepDays: number,
  now: Date = new Date(),
): CloudflareDeployment[] {
  const cutoff = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000);
  const active = findActiveProduction(deployments);
  return deployments.filter((d) => new Date(d.created_on) < cutoff).filter((d) => d !== active);
}

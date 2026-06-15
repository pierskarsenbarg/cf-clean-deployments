import { CloudflareDeployment } from "./cloudflare";

function isProtected(deployment: CloudflareDeployment): boolean {
  return deployment.environment === "production" && deployment.latest_stage.status === "success";
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
  const sorted = sortedByDateDesc(deployments);
  return sorted.slice(keepCount).filter((d) => !isProtected(d));
}

export function selectByDays(
  deployments: CloudflareDeployment[],
  keepDays: number,
  now: Date = new Date(),
): CloudflareDeployment[] {
  const cutoff = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000);
  return deployments.filter((d) => new Date(d.created_on) < cutoff).filter((d) => !isProtected(d));
}

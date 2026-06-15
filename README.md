# cf-clean-deployments

A GitHub Action that deletes old [Cloudflare Pages](https://pages.cloudflare.com/) deployments, keeping your project tidy by removing previews based on age or count.

> **Note:** Cloudflare's API does not support deleting individual Workers deployments. This action targets Pages projects only.

## Usage

```yaml
- uses: pierskarsenbarg/cf-clean-deployments@v1
  with:
    api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    project-name: my-pages-project
    keep-deployments: 10
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-token` | No* | — | Cloudflare API token. Falls back to the `CLOUDFLARE_API_TOKEN` environment variable. |
| `account-id` | No* | — | Cloudflare account ID. Falls back to the `CLOUDFLARE_ACCOUNT_ID` environment variable. |
| `project-name` | Yes | — | Name of the Cloudflare Pages project. |
| `keep-deployments` | No** | — | Keep this many of the most recent deployments and delete the rest. |
| `keep-days` | No** | — | Delete deployments older than this many days. |
| `environment` | No | `preview` | Which deployments to target: `preview`, `production`, or `all`. |
| `dry-run` | No | `false` | Log what would be deleted without actually deleting anything. |

\* Either the input or the corresponding environment variable must be set.  
\*\* Exactly one of `keep-deployments` or `keep-days` must be set.

## Outputs

| Output | Description |
|--------|-------------|
| `deleted-count` | Number of deployments deleted. Always `0` in dry-run mode. |

## Authentication

Create a Cloudflare API token with the **Cloudflare Pages — Edit** permission, then store it as a secret in your repository. Your account ID can be found on the Cloudflare dashboard overview page.

It is recommended to store both values as repository secrets and pass them via the `api-token` and `account-id` inputs, or set them as environment variables:

```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

## Examples

### Delete preview deployments older than 30 days

```yaml
name: Clean old deployments

on:
  schedule:
    - cron: '0 2 * * *'  # daily at 02:00 UTC

jobs:
  clean:
    runs-on: ubuntu-latest
    steps:
      - uses: pierskarsenbarg/cf-clean-deployments@v1
        with:
          api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          project-name: my-pages-project
          keep-days: 30
```

### Keep only the 5 most recent preview deployments

```yaml
- uses: pierskarsenbarg/cf-clean-deployments@v1
  with:
    api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    project-name: my-pages-project
    keep-deployments: 5
```

### Dry run to see what would be deleted

```yaml
- uses: pierskarsenbarg/cf-clean-deployments@v1
  with:
    api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    project-name: my-pages-project
    keep-days: 7
    dry-run: true
```

### Target all environments (preview and production)

```yaml
- uses: pierskarsenbarg/cf-clean-deployments@v1
  with:
    api-token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    project-name: my-pages-project
    keep-deployments: 10
    environment: all
```

> **Note:** Active production deployments are never deleted, even when `environment` is set to `production` or `all`.

## License

MIT

# Optional external panel deployment chart

The official Langboard app package is hosted by Langboard and does not need this
chart, a separate panel service or a container image. Use this guide only when
explicitly choosing external panel hosting. This chart serves panel assets; it
does not run the DevTron API observer or establish a Langboard connection.

The portable chart includes Devtron's standard `.image_descriptor_template.json`.
Register a reviewed chart archive under **Deployment Charts** and select that
chart type in the application's base configuration. Supply installation values
from `deploy/chart/values.yaml` through the native configuration editor. Keep real
origins and Secret references in your deployment configuration.

```sh
helm package deploy/chart --destination chart-dist
```

Configure an external image source when your existing CI builds the image.
After verifying completed publication, source and signature, send its image and
digest through the standard external-CI webhook. Enable digest enforcement for
the deployment pipeline where the installed Devtron supports it. The descriptor
uses the native `Name` and `Tag` release attributes to populate the single `image`
value. The chart accepts a full `repository:tag@sha256:digest` reference and rejects
a tag-only image. Verify the final rendered value and actual workload digest;
webhook acceptance alone does not prove a deployment.

The native release attributes do not supply the source commit. Leave
`imageSourceRevision` empty for this path; the chart then omits its source
annotation. Source identity remains in verified image provenance and the native
CI artifact's material history. If another delivery system projects the verified
source commit, it may supply this optional annotation. A formatted annotation is
informational and does not replace signature or source verification.

Choose GitOps CD with an approved repository and the intended Argo reconciler.
Qualify ownership transfer before adopting a serving Helm release. This chart
does not install an Argo controller, create a writer, or transfer ownership.
Application image updates and rollback use the existing chart; publish a new
chart version only when the chart package changes.

Native contract references, pinned to Devtron v2.2.1:

- [Deployment chart format](https://github.com/devtron-labs/devtron/blob/6d3522367a1cf5dc1d6dbe8b50e7f41e542ff94d/docs/user-guide/global-configurations/deployment-charts.md)
- [Release attributes](https://github.com/devtron-labs/devtron/blob/6d3522367a1cf5dc1d6dbe8b50e7f41e542ff94d/pkg/app/AppService.go#L871)

Chart rendering and packaging tests are not live installation, image ingestion,
GitOps deployment or rollback acceptance. Check compatibility with your installed
Devtron version and qualify those operations independently.

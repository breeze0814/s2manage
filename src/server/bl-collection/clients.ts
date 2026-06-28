import type { BlCollectionSite } from "@prisma/client";
import { BlNewApiClient } from "@/server/bl-collection/new-api-client";
import { BlSub2ApiClient } from "@/server/bl-collection/sub2api-client";
import type { BlCollectorClient } from "@/server/bl-collection/types";

export function clientForBlCollectionSite(site: Pick<BlCollectionSite, "baseUrl" | "siteType" | "proxyUrl">): BlCollectorClient {
  const proxyUrl = site.proxyUrl?.trim() || undefined;
  return site.siteType === "new_api"
    ? new BlNewApiClient(site.baseUrl, undefined, proxyUrl)
    : new BlSub2ApiClient(site.baseUrl, undefined, proxyUrl);
}

export const dynamic = "force-dynamic";
import { jsonOk, withRouteErrors } from "@/lib/api";
import { driftdeskHistory } from "@/lib/histories";

export const GET = withRouteErrors(async () => {
  const items = await driftdeskHistory();
  return jsonOk({ ok: true, product: "driftdesk", count: items.length, items });
});

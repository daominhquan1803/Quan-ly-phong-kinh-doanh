/**
 * CHỈ ĐỌC — gọi thẳng AMIS "GET /api/v2/Stocks/product_ledger" (1 trang) để xác nhận shape
 * response thật khớp với swagger public trước khi tin vào code đồng bộ tồn kho.
 * Cách chạy: cd apps/worker && npx tsx --env-file=.env ../../scripts/inspect-amis-inventory.ts
 */
const AMIS_BASE_URL = process.env.AMIS_BASE_URL || "https://crmconnect.misa.vn";

async function main() {
  const appId = process.env.AMIS_APP_ID;
  const clientSecret = process.env.AMIS_CLIENT_SECRET;
  if (!appId || !clientSecret) throw new Error("Thiếu AMIS_APP_ID/AMIS_CLIENT_SECRET");

  const tokenRes = await fetch(`${AMIS_BASE_URL}/api/v2/Account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: appId, client_secret: clientSecret }),
  });
  const tokenJson = (await tokenRes.json()) as { success: boolean; data?: string; user_msg?: string };
  if (!tokenRes.ok || !tokenJson.success || !tokenJson.data) throw new Error(tokenJson.user_msg || "Không lấy được token");
  console.log("Token OK");

  const url = `${AMIS_BASE_URL}/api/v2/Stocks/product_ledger?page=0&pageSize=5`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tokenJson.data}`, Clientid: appId } });
  const json = await res.json();
  console.log("HTTP", res.status);
  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase (service role — safe for admin-only mutations)
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const { connector_id, actor_name, actor_id } = await req.json() as {
      connector_id: string;
      actor_name:   string;
      actor_id?:    string;
    };

    if (!connector_id) {
      return NextResponse.json({ success: false, error: "connector_id is required" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Fetch the connector
    const { data: connector, error: fetchErr } = await supabase
      .from("tracking_connectors")
      .select("id, name, connector_type, status, api_base_url, environment, api_key_configured, auth_type")
      .eq("id", connector_id)
      .maybeSingle();

    if (fetchErr || !connector) {
      return NextResponse.json({ success: false, error: "Connector not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    // ── Determine test result ───────────────────────────────────────────────
    let testSuccess  = false;
    let testMessage  = "";
    let testResponse: Record<string, unknown>;

    const isMock = connector.status === "Mock" || !connector.api_base_url;
    const env    = connector.environment ?? "Sandbox";

    if (isMock) {
      // Mock mode — always succeeds
      testSuccess  = true;
      testMessage  = `Mock connection test successful. No real API called (${env} mode).`;
      testResponse = {
        mock:          true,
        connector:     connector.name,
        connector_type: connector.connector_type,
        environment:   env,
        auth_type:     connector.auth_type,
        api_key_configured: connector.api_key_configured,
        response_time_ms:  Math.floor(Math.random() * 120) + 30,
        http_status:   200,
        message:       "OK — Mock endpoint reachable",
        server:        "Nexum Mock Gateway v1",
        tested_at:     now,
      };
    } else {
      // Real connector mode — we don't call paid APIs yet, return informational failure
      testSuccess  = false;
      testMessage  = `Real API connection not attempted. Store credentials in environment variables (TRACKING_${connector.connector_type.toUpperCase().replace(/\s/g, "_")}_KEY) and deploy a server-side connector to enable live testing.`;
      testResponse = {
        mock:          false,
        connector:     connector.name,
        connector_type: connector.connector_type,
        environment:   env,
        skipped:       true,
        reason:        "Live API testing disabled — MVP mode. Real API keys must be stored as server-side environment variables.",
        tested_at:     now,
      };
    }

    // ── Persist test result to connector record ────────────────────────────
    await supabase
      .from("tracking_connectors")
      .update({
        last_tested_at: now,
        test_status:    testSuccess ? "Success" : "Skipped",
        test_response:  testResponse,
        updated_at:     now,
      })
      .eq("id", connector_id);

    // ── Audit log ──────────────────────────────────────────────────────────
    await supabase.from("audit_logs").insert({
      job_reference: null,
      action:        "tracking_provider_tested",
      actor_id:      actor_id ?? null,
      actor_name:    actor_name,
      actor_role:    "admin",
      details: {
        connector_id:   connector_id,
        connector_name: connector.name,
        connector_type: connector.connector_type,
        environment:    env,
        test_success:   testSuccess,
        mock_mode:      isMock,
      },
      created_at: now,
    });

    return NextResponse.json({
      success:      testSuccess,
      message:      testMessage,
      test_response: testResponse,
      tested_at:    now,
    });

  } catch (err) {
    console.error("[tracking-providers/test]", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

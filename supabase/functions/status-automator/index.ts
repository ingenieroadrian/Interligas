import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const now = new Date().toISOString();

    // programada → alineacion: if deadline has passed (shouldn't normally happen but guard)
    // alineacion → cerrada: when deadline passes
    const { data: toClose, error: e1 } = await supabase
      .from("confrontations")
      .select("id")
      .eq("status", "alineacion")
      .lte("deadline", now);

    if (e1) throw e1;

    if (toClose && toClose.length > 0) {
      const ids = toClose.map((c: { id: string }) => c.id);
      await supabase
        .from("confrontations")
        .update({ status: "cerrada" })
        .in("id", ids);

      // Log status changes
      for (const { id } of toClose) {
        await supabase.from("status_logs").insert({
          confrontation_id: id,
          old_status: "alineacion",
          new_status: "cerrada",
          changed_by: "system",
        });
      }
    }

    // cerrada → en_curso: when match_date+time arrives
    const { data: toStart, error: e2 } = await supabase
      .from("confrontations")
      .select("id, match_date, match_time")
      .eq("status", "cerrada");

    if (e2) throw e2;

    const nowTs = Date.now();
    const toStartIds: string[] = [];

    for (const c of (toStart || [])) {
      const matchTs = new Date(`${c.match_date}T${c.match_time}`).getTime();
      if (matchTs <= nowTs) toStartIds.push(c.id);
    }

    if (toStartIds.length > 0) {
      await supabase
        .from("confrontations")
        .update({ status: "en_curso" })
        .in("id", toStartIds);

      for (const id of toStartIds) {
        await supabase.from("status_logs").insert({
          confrontation_id: id,
          old_status: "cerrada",
          new_status: "en_curso",
          changed_by: "system",
        });
      }
    }

    const result = {
      closed: toClose?.length || 0,
      started: toStartIds.length,
      timestamp: now,
    };

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

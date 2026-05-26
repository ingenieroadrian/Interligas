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

    // alineacion → cerrada: when deadline passes
    const { data: toClose, error: e1 } = await supabase
      .from("confrontations")
      .select("id, category, home_league_id, away_league_id")
      .eq("status", "alineacion")
      .lte("deadline", now);

    if (e1) throw e1;

    let autoRostersCreated = 0;

    if (toClose && toClose.length > 0) {
      const ids = toClose.map((c: { id: string }) => c.id);

      await supabase
        .from("confrontations")
        .update({ status: "cerrada" })
        .in("id", ids);

      for (const conf of toClose) {
        // Log status change
        await supabase.from("status_logs").insert({
          confrontation_id: conf.id,
          old_status: "alineacion",
          new_status: "cerrada",
          changed_by: "system",
        });

        // Auto-lineup: for each league side, find coach and create roster if not yet submitted
        const leagueIds: string[] = [conf.home_league_id, conf.away_league_id].filter(Boolean);

        for (const leagueId of leagueIds) {
          // Find active coach for this league
          const { data: coach } = await supabase
            .from("coaches")
            .select("id")
            .eq("league_id", leagueId)
            .eq("active", true)
            .maybeSingle();

          if (!coach) continue;

          // Check if roster already submitted
          const { data: existing } = await supabase
            .from("rosters")
            .select("id, is_submitted")
            .eq("confrontation_id", conf.id)
            .eq("coach_id", coach.id)
            .maybeSingle();

          if (existing?.is_submitted) continue;

          // Get players ranked 1, 2, 3 for this category
          const { data: players } = await supabase
            .from("players")
            .select("id, ranking")
            .eq("coach_id", coach.id)
            .eq("league_active", true)
            .eq("category", conf.category)
            .in("ranking", [1, 2, 3]);

          if (!players || players.length < 2) continue;

          const byRank: Record<number, string> = {};
          for (const p of players) {
            if (p.ranking !== null) byRank[p.ranking] = p.id;
          }

          // Rules: slot_1 = ranking #2, slot_2 = ranking #1, doubles = #1 + #3
          const slot1 = byRank[2] ?? null;
          const slot2 = byRank[1] ?? null;
          const doublesA = byRank[1] ?? null;
          const doublesB = byRank[3] ?? null;

          if (!slot1 || !slot2) continue;

          const rosterPayload = {
            confrontation_id: conf.id,
            coach_id: coach.id,
            league_id: leagueId,
            slot_1: slot1,
            slot_2: slot2,
            slot_doubles_a: doublesA,
            slot_doubles_b: doublesB,
            is_submitted: true,
            submitted_at: now,
          };

          if (existing) {
            await supabase
              .from("rosters")
              .update(rosterPayload)
              .eq("id", existing.id);
          } else {
            await supabase.from("rosters").insert(rosterPayload);
          }

          autoRostersCreated++;
        }
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

    return new Response(
      JSON.stringify({
        success: true,
        closed: toClose?.length || 0,
        autoRostersCreated,
        started: toStartIds.length,
        timestamp: now,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateCoachPayload {
  action: "create";
  full_name: string;
  unique_code: string;
  phone: string;
  league_id: string;
  email: string;
  password: string;
  coach_email: string;
  role_id: string;
}

interface UpdatePasswordPayload {
  action: "update_password";
  auth_id: string;
  new_password: string;
}

type Payload = CreateCoachPayload | UpdatePasswordPayload;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body: Payload = await req.json();

    // ── UPDATE PASSWORD ──────────────────────────────────────────────────────
    if (body.action === "update_password") {
      const { auth_id, new_password } = body;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_id, {
        password: new_password,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE COACH + USER ──────────────────────────────────────────────────
    if (body.action === "create") {
      const { full_name, unique_code, phone, league_id, email, password, coach_email, role_id } = body;

      // 1. Create auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authId = authData.user.id;

      // 2. Create system_users record (active = false for coaches)
      const { data: sysUserData, error: sysUserError } = await supabaseAdmin
        .from("system_users")
        .insert({
          auth_id: authId,
          full_name,
          unique_code,
          email,
          role_id,
          active: false,
        })
        .select("id")
        .single();

      if (sysUserError) {
        // Rollback auth user
        await supabaseAdmin.auth.admin.deleteUser(authId);
        return new Response(JSON.stringify({ error: sysUserError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const sysUserId = sysUserData.id;

      // 3. Create coach record
      const { error: coachError } = await supabaseAdmin.from("coaches").insert({
        full_name,
        unique_code,
        phone,
        league_id,
        active: false,
        user_id: sysUserId,
        email: coach_email,
      });

      if (coachError) {
        // Rollback system_user and auth user
        await supabaseAdmin.from("system_users").delete().eq("id", sysUserId);
        await supabaseAdmin.auth.admin.deleteUser(authId);
        return new Response(JSON.stringify({ error: coachError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, email, auth_id: authId, user_id: sysUserId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

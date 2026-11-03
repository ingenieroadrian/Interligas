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

    // ── AUTENTICACIÓN: solo Super Admin o Administrador de Liga ──────────────
    const json = (obj: unknown, status: number) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "No autenticado" }, 401);

    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) return json({ error: "Sesión inválida" }, 401);

    const { data: callerRow } = await supabaseAdmin
      .from("system_users")
      .select("active, roles(name)")
      .eq("auth_id", caller.user.id)
      .maybeSingle();
    // deno-lint-ignore no-explicit-any
    const callerRole = (callerRow as any)?.roles?.name as string | undefined;
    const isSuperAdmin = callerRole === "Super Admin";
    if (!callerRow?.active || (!isSuperAdmin && callerRole !== "Administrador de Liga")) {
      return json({ error: "No autorizado" }, 403);
    }

    const body: Payload = await req.json();

    // ── UPDATE PASSWORD ──────────────────────────────────────────────────────
    if (body.action === "update_password") {
      const { auth_id, new_password } = body;
      if (!isSuperAdmin) {
        const { data: target } = await supabaseAdmin
          .from("system_users")
          .select("roles(name)")
          .eq("auth_id", auth_id)
          .maybeSingle();
        // deno-lint-ignore no-explicit-any
        if (!target || (target as any).roles?.name !== "Entrenador") {
          return json({ error: "Solo puedes cambiar la contraseña de entrenadores" }, 403);
        }
      }
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
      if (!isSuperAdmin) {
        const { data: role } = await supabaseAdmin
          .from("roles").select("name").eq("id", role_id).maybeSingle();
        if (role?.name !== "Entrenador") {
          return json({ error: "Solo puedes crear usuarios con rol Entrenador" }, 403);
        }
      }

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

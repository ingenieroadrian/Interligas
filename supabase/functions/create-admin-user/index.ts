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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Create auth user via admin API (produces correct password hash)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: "admin@interligas.com",
      password: "Interligas2026!",
      email_confirm: true,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authId = authData.user.id;

    // Get Super Admin role id
    const { data: roleData } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("name", "Super Admin")
      .maybeSingle();

    // Insert system_users record
    const { error: insertError } = await supabaseAdmin.from("system_users").insert({
      auth_id: authId,
      full_name: "Administrador Principal",
      unique_code: "SA-001",
      email: "admin@interligas.com",
      role_id: roleData?.id ?? null,
      active: true,
    });

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, email: "admin@interligas.com" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

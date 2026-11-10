// Supabase Edge Function: manage-users
// Creates and maintains login accounts. Soldiers sign in with their Personal No
// (Snk No); internally that maps to "<personalno>@<LOGIN_EMAIL_DOMAIN>".
//
// Deploy:  supabase functions deploy manage-users
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
//          Optional: supabase secrets set LOGIN_EMAIL_DOMAIN=5sigbn.local
//          (must match NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN in the web app)
//
// Permissions
//   admin, co, 2ic, adjt : everything (super admin)
//   coy_comd             : create & reset passwords for SOLDIER accounts of own coy
//   approve_application  : Adjt / 2IC / CO / Admin approve a "new ID" application from the
//                          login page -> soldier record + login with the password he chose
// supabase-js v2.118 bundled into this folder, so the function needs NO internet
// (works on a fully offline LAN server). Rebuild: see supabase/functions/manage-users/README.md
import { createClient } from "./supabase-js.bundle.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["admin", "co", "2ic", "adjt", "coy_comd", "coy_rep", "bn_rep", "clk", "soldier"];
const COY_ROLES = ["coy_comd", "coy_rep"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function loginEmail(personalNo: string) {
  const domain = (Deno.env.get("LOGIN_EMAIL_DOMAIN") ?? "5sigbn.local").trim().toLowerCase();
  const local = personalNo.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "-");
  return `${local}@${domain}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Edge Function configuration is incomplete." }, 500);

    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: caller, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller.user) return json({ error: "Unauthorized" }, 401);

    const { data: me } = await admin.from("profiles").select("role, company_id, active").eq("id", caller.user.id).maybeSingle();
    if (!me || !me.active) return json({ error: "Your account is not active." }, 403);

    const isAdmin = ["admin", "co", "2ic", "adjt"].includes(me.role);
    const coyComd = me.role === "coy_comd" && !!me.company_id;
    if (!isAdmin && !coyComd) return json({ error: "You are not permitted to manage accounts." }, 403);

    const canManageSoldierOfCompany = (companyId: string | null) => isAdmin || (coyComd && companyId === me.company_id);

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");

    // ---------------------------------------------------------------- list
    if (action === "list") {
      let query = admin.from("profiles").select("id, full_name, role, company_id, soldier_id, active, must_change_password, created_at, appointment, held_by, held_by_soldier").order("full_name");
      if (coyComd) query = query.eq("company_id", me.company_id);
      const [{ data: profiles, error: pErr }, authUsers] = await Promise.all([query, listAllAuthUsers(admin)]);
      if (pErr) throw pErr;
      const emails = new Map(authUsers.map((u) => [u.id, { email: u.email ?? "", lastSignIn: u.last_sign_in_at ?? null }]));
      return json({
        users: (profiles ?? []).map((p) => ({
          id: p.id,
          fullName: p.full_name,
          appointment: p.appointment ?? null,
          heldBy: p.held_by ?? null,
          heldBySoldier: p.held_by_soldier ?? null,
          role: p.role,
          companyId: p.company_id,
          soldierId: p.soldier_id,
          active: p.active,
          mustChangePassword: p.must_change_password,
          loginId: (emails.get(p.id)?.email ?? "").split("@")[0],
          email: emails.get(p.id)?.email ?? "",
          lastSignIn: emails.get(p.id)?.lastSignIn ?? null,
        })),
      });
    }

    // -------------------------------------------------------------- create
    if (action === "create" || action === "bulk_create") {
      const items: Array<{ soldierId?: string; loginId?: string; fullName?: string; role?: string; companyId?: string | null; appointment?: string; heldBy?: string; heldBySoldier?: string | null }> =
        action === "create" ? [body] : (Array.isArray(body.soldierIds) ? body.soldierIds.map((id: string) => ({ soldierId: id, role: "soldier" })) : []);
      const password = String(body.password ?? "");
      if (password.length < 8) return json({ error: "Initial password must be at least 8 characters." }, 400);
      if (!items.length) return json({ error: "Nothing to create." }, 400);

      const results: Array<{ soldierId?: string; loginId?: string; ok: boolean; error?: string; id?: string }> = [];
      for (const item of items) {
        try {
          const role = String(item.role ?? "soldier");
          if (!ROLES.includes(role)) throw new Error("Invalid role");
          if (role !== "soldier" && !isAdmin) throw new Error("Only Adjt / 2IC / CO / Admin can create staff accounts");

          let loginId = String(item.loginId ?? "").trim();
          let fullName = String(item.fullName ?? "").trim();
          let companyId: string | null = item.companyId ?? null;
          // Staff logins belong to an APPOINTMENT (e.g. "Training Clerk", "Rdo Coy Rep"), never to a soldier record;
          // "held by" only records who is doing the duty now.
          let soldierId: string | null = role === "soldier" ? item.soldierId ?? null : null;
          const appointment = role === "soldier" ? null : String(item.appointment ?? item.fullName ?? "").trim() || null;
          const heldBy = role === "soldier" ? null : String(item.heldBy ?? "").trim() || null;
          const heldBySoldier = role === "soldier" ? null : item.heldBySoldier ?? null;
          if (role !== "soldier") fullName = fullName || appointment || "";

          if (soldierId) {
            const { data: s, error: sErr } = await admin.from("soldiers").select("id, snk_no, rank, name, company_id").eq("id", soldierId).maybeSingle();
            if (sErr || !s) throw new Error("Soldier not found");
            const { data: existing } = await admin.from("profiles").select("id").eq("soldier_id", s.id).maybeSingle();
            if (existing) throw new Error("Already has an account");
            loginId = loginId || s.snk_no;
            fullName = fullName || `${s.rank} ${s.name}`;
            if (role === "soldier" || COY_ROLES.includes(role)) companyId = companyId ?? s.company_id;
            if (role === "soldier") companyId = s.company_id;
          }
          if (!loginId) throw new Error("Personal No / login ID is required");
          if (!fullName) throw new Error("Name is required");
          if (COY_ROLES.includes(role) && !companyId) throw new Error("Coy Comd / Coy Rep must have a company");
          if (["admin", "co", "2ic", "adjt", "bn_rep", "clk"].includes(role)) companyId = null;
          if (role === "soldier" && !canManageSoldierOfCompany(companyId)) throw new Error("Outside your company");

          const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email: loginEmail(loginId),
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          });
          if (cErr || !created.user) throw cErr ?? new Error("Could not create login");

          const { error: upErr } = await admin.from("profiles").upsert({
            id: created.user.id,
            full_name: fullName,
            role,
            company_id: companyId,
            soldier_id: soldierId,
            appointment,
            held_by: heldBy,
            held_by_soldier: heldBySoldier,
            active: true,
            must_change_password: true,
          });
          if (upErr) {
            await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
            throw upErr;
          }
          results.push({ soldierId: soldierId ?? undefined, loginId, ok: true, id: created.user.id });
        } catch (e) {
          results.push({ soldierId: item.soldierId, loginId: item.loginId, ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      }
      if (action === "create") {
        const r = results[0];
        return r.ok ? json(r, 201) : json({ error: r.error }, 400);
      }
      return json({ results });
    }

    // -------------------------------------------------- reset password
    if (action === "reset_password") {
      const userId = String(body.userId ?? "");
      const password = String(body.password ?? "");
      if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
      const { data: target } = await admin.from("profiles").select("role, company_id").eq("id", userId).maybeSingle();
      if (!target) return json({ error: "User not found" }, 404);
      if (!isAdmin && (target.role !== "soldier" || !canManageSoldierOfCompany(target.company_id))) {
        return json({ error: "You can only reset soldier passwords in your scope." }, 403);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      await admin.from("profiles").update({ must_change_password: true }).eq("id", userId);
      return json({ ok: true });
    }

    // ------------------------------------------------------------ update
    if (action === "update") {
      if (!isAdmin) return json({ error: "Only Adjt / 2IC / CO / Admin can change roles." }, 403);
      const userId = String(body.userId ?? "");
      const role = String(body.role ?? "");
      if (!ROLES.includes(role)) return json({ error: "Invalid role" }, 400);
      const companyId = ["admin", "co", "2ic", "adjt", "bn_rep", "clk"].includes(role) ? null : (body.companyId ?? null);
      if (COY_ROLES.includes(role) && !companyId) return json({ error: "Coy Comd / Coy Rep must have a company" }, 400);
      if (userId === caller.user.id && !["admin", "co", "2ic", "adjt"].includes(role)) return json({ error: "You cannot remove your own super-admin role." }, 400);
      const staff = role !== "soldier";
      const patch: Record<string, unknown> = {
        role,
        company_id: companyId,
        active: body.active !== false,
      };
      // a staff login never carries a soldier record; an individual login keeps his own unless a new one is given
      if (staff) patch.soldier_id = null; else if (body.soldierId !== undefined) patch.soldier_id = body.soldierId || null;
      if (staff) {
        if (body.appointment !== undefined) { patch.appointment = String(body.appointment || "").trim() || null; patch.full_name = patch.appointment ?? undefined; }
        if (body.heldBy !== undefined) patch.held_by = String(body.heldBy || "").trim() || null;
        if (body.heldBySoldier !== undefined) patch.held_by_soldier = body.heldBySoldier || null;
      }
      const { error } = await admin.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
      return json({ ok: true });
    }

    // ------------------------------------------------ approve new ID application
    if (action === "approve_application") {
      if (!isAdmin) return json({ error: "Only the Adjt (or 2IC / CO / Admin) can approve ID applications." }, 403);
      const appId = String(body.applicationId ?? "");
      const { data: app, error: aErr } = await admin.from("id_applications").select("*").eq("id", appId).maybeSingle();
      if (aErr) throw aErr;
      if (!app) return json({ error: "Application not found" }, 404);
      if (app.status !== "Pending") return json({ error: `Application is already ${String(app.status).toLowerCase()}` }, 400);
      const { data: secret } = await admin.from("id_application_secrets").select("password_hash").eq("application_id", appId).maybeSingle();
      if (!secret) return json({ error: "Password of this application is missing — ask him to apply again." }, 400);

      const companyId = String(body.companyId ?? app.company_id);
      const norm = (v: string) => v.replace(/\s+/g, "").toUpperCase();
      const { data: clash } = await admin.from("soldiers").select("id, snk_no");
      if ((clash ?? []).some((x: { snk_no: string }) => norm(x.snk_no) === norm(app.snk_no))) {
        return json({ error: `Personal No ${app.snk_no} is already in the soldiers database.` }, 400);
      }
      const data = (app.data ?? {}) as Record<string, unknown>;
      const allowed = new Set([
        "trade", "name_bn", "platoon", "appointment", "date_joined_unit", "previous_unit", "date_of_birth", "date_of_enrolment", "date_of_rank", "retirement_date",
        "height_in", "weight_lbs", "blood_group", "medical_category", "medical_remarks", "religion", "marital_status", "date_of_marriage", "spouse_name", "education", "nid_no",
        "home_division", "home_district", "home_upazila", "distance_from_ib_km", "permanent_address", "present_address", "mobile", "alt_mobile", "email",
        "emergency_name", "emergency_relation", "emergency_mobile",
      ]);
      const soldierRow: Record<string, unknown> = { snk_no: app.snk_no, category: app.category, rank: app.rank, name: app.name, company_id: companyId, status: "Serving", created_by: caller.user.id };
      for (const [k, v] of Object.entries(data)) if (allowed.has(k) && v !== "" && v !== null) soldierRow[k] = v;
      const { data: soldier, error: sErr } = await admin.from("soldiers").insert(soldierRow).select("id").single();
      if (sErr) return json({ error: sErr.message }, 400);

      const cleanup = async (userId?: string) => {
        if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
        await admin.from("soldiers").delete().eq("id", soldier.id);
      };
      const records = Array.isArray(app.records) ? app.records : [];
      if (records.length) {
        await admin.from("soldier_records").insert(records
          .filter((r: { kind?: string }) => r && ["family", "education"].includes(String(r.kind)))
          .map((r: { kind: string; data?: unknown; record_date?: string }) => ({ soldier_id: soldier.id, kind: r.kind, data: r.data ?? {}, record_date: r.record_date || null, created_by: caller.user.id })));
      }
      const fullName = `${app.rank} ${app.name}`;
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: loginEmail(app.snk_no),
        password_hash: secret.password_hash,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (cErr || !created.user) {
        await cleanup();
        return json({ error: cErr?.message ?? "Could not create the login (does this Personal No already have one?)" }, 400);
      }
      const { error: pErr } = await admin.from("profiles").upsert({
        id: created.user.id, full_name: fullName, role: "soldier", company_id: companyId, soldier_id: soldier.id, active: true, must_change_password: false,
      });
      if (pErr) {
        await cleanup(created.user.id);
        throw pErr;
      }
      await admin.from("id_applications").update({
        status: "Approved", company_id: companyId, reviewed_by: caller.user.id, reviewed_at: new Date().toISOString(), review_remarks: body.remarks ?? null,
        soldier_id: soldier.id, user_id: created.user.id,
      }).eq("id", appId);
      await admin.from("id_application_secrets").delete().eq("application_id", appId);
      return json({ ok: true, soldierId: soldier.id, userId: created.user.id, loginId: app.snk_no });
    }

    // ------------------------------------------------------------ delete
    if (action === "delete") {
      if (!isAdmin) return json({ error: "Only Adjt / 2IC / CO / Admin can delete accounts." }, 403);
      const userId = String(body.userId ?? "");
      if (userId === caller.user.id) return json({ error: "You cannot delete your own account." }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (target?.role === "admin") {
        const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true);
        if ((count ?? 0) <= 1) return json({ error: "The last Admin account cannot be deleted." }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function listAllAuthUsers(admin: any) {
  const all: Array<{ id: string; email?: string; last_sign_in_at?: string }> = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return all;
}

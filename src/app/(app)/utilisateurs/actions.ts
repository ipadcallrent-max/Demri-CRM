"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Role, Societe } from "@/lib/types";

async function exigerAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non connecté.");
  const { data } = await supabase.from("profils").select("role").eq("id", user.id).single();
  if (data?.role !== "admin") throw new Error("Réservé aux administrateurs.");
  return user;
}

export async function inviter(_: unknown, form: FormData): Promise<{ ok: boolean; message: string }> {
  try {
    await exigerAdmin();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const nom = String(form.get("nom") ?? "").trim();
    const role = String(form.get("role")) as Role;
    const societe = String(form.get("societe")) as Societe;
    if (!email || !nom) return { ok: false, message: "Nom et e-mail obligatoires." };
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    const { error } = await createServiceClient().auth.admin.inviteUserByEmail(email, {
      data: { nom, role, societe },
      redirectTo: `${origin}/auth/callback`,
    });
    if (error) return { ok: false, message: `Invitation impossible : ${error.message}` };
    revalidatePath("/utilisateurs");
    return { ok: true, message: `Invitation envoyée à ${email}.` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function retirer(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const moi = await exigerAdmin();
    if (moi.id === id) return { ok: false, message: "Vous ne pouvez pas retirer votre propre compte." };
    const { error } = await createServiceClient().auth.admin.deleteUser(id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: "Utilisateur retiré." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

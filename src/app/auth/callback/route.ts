import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Retour du lien magique ou de l'invitation envoyés par e-mail. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const supabase = await createClient();
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : token_hash && type
      ? await supabase.auth.verifyOtp({ token_hash, type })
      : { error: new Error("lien invalide") };
  return NextResponse.redirect(`${origin}${error ? "/login" : "/"}`);
}

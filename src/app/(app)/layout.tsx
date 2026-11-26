import { redirect } from "next/navigation";
import { DataProvider } from "@/components/DataProvider";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import type { Profil } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: moi } = await supabase.from("profils").select("*").eq("id", user.id).single<Profil>();
  if (!moi) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-xl font-bold">Accès non autorisé</h1>
        <p className="mt-2 text-mut">Votre compte n’a pas encore été ajouté par un administrateur.</p>
        <form action="/auth/sortie" method="post" className="mt-4">
          <button className="btn">Se déconnecter</button>
        </form>
      </main>
    );
  }
  return (
    <DataProvider moi={moi}>
      <div className="mx-auto max-w-[1100px] px-4 pt-4 pb-16">
        <Nav />
        <main>{children}</main>
      </div>
    </DataProvider>
  );
}

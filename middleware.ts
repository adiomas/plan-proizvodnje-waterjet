import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Pokreni middleware na svim rutama osim statičkih datoteka i API-ja:
     * - _next/static, _next/image, favicon.ico, manifest.json, sw.js, ikone
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|.*\\.png$|.*\\.svg$).*)",
  ],
};

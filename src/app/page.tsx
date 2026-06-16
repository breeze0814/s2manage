import { redirect } from "next/navigation";
import { Shell } from "@/components/app/shell";
import { getSession, isInitialized } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await isInitialized())) redirect("/setup");
  if (!(await getSession())) redirect("/login");
  return <Shell />;
}

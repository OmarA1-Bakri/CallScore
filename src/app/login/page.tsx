import { redirect } from "next/navigation";

export default function LoginPage(): never {
  redirect("/api/auth/whop");
}

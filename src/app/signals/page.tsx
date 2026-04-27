import { redirect } from "next/navigation";

export default function SignalsIndexPage(): never {
  redirect("/signals/active");
}

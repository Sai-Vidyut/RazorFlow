import { redirect } from "next/navigation";

/** Legacy route — cart lives in /desk Transaction section. */
export default function CartPage() {
  redirect("/desk");
}

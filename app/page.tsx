import { redirect } from "next/navigation";
import { DEFAULT_LANDING } from "@/lib/start-page";

export default function Home() {
  redirect(DEFAULT_LANDING);
}

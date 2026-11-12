import { getSettings } from "@/lib/settings";
import HelpClient from "./HelpClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Help & Support | Brand Deals Hub",
  description: "Get support for deals, store access, and account questions.",
};

export default function HelpPage() {
  const s = getSettings();

  return <HelpClient settings={s} />;
}

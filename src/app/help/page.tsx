import { getSettings } from "@/lib/settings";
import HelpClient from "./HelpClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Need Help? | Brand Promotion",
  description: "Get support for brand deals, refund claims, order tracking, and more.",
};

export default function HelpPage() {
  const s = getSettings();

  return <HelpClient settings={s} />;
}

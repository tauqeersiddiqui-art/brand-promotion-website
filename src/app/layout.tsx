import type { Metadata } from "next";
import "./globals.css";
import { getSettings, type SiteSettings } from "@/lib/settings";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingChat from "@/components/FloatingChat";
import CsrfBootstrap from "@/components/CsrfBootstrap";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = getSettings();
  return {
    title: {
      default: `${s.site_name} — ${s.tagline}`,
      template: `%s · ${s.site_name}`,
    },
    description: s.tagline,
  };
}

async function safeSettings(): Promise<SiteSettings> {
  try {
    return getSettings();
  } catch {
    return {
      site_name: "Brand Promotion",
      tagline: "India's smartest deals & brand promotion platform",
      announcement: "",
      whatsapp: "919999999999",
      telegram: "brandpromotion",
      support_email: "support@brandpromotion.in",
      instagram: "",
      mediators: "Direct,Amit Mediator,Rahul Agency,Pooja Deals,VIP Campaigns,Social Reach",
      rules_instructions: "1. Search keyword on Amazon/Flipkart.\n2. Submit Order & Price screenshot.\n3. Post 5-star review upon delivery.\n4. Submit claim for 100% UPI refund.",
    };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await safeSettings();
  const announcement = s.announcement.trim();

  return (
    <html lang="en">
      <body>
        <CsrfBootstrap />
        {announcement && (
          <div className="announcement">
            <div className="container">{announcement}</div>
          </div>
        )}
        <Navbar siteName={s.site_name} />
        <main id="content">{children}</main>
        <Footer settings={s} />
        <FloatingChat whatsapp={s.whatsapp} telegram={s.telegram} />
      </body>
    </html>
  );
}

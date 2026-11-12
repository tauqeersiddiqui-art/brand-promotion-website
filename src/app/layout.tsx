import type { Metadata } from "next";
import "./globals.css";
import { ADSENSE_CLIENT } from "@/lib/adsense";
import { getSettings, ANNOUNCEMENT, type SiteSettings } from "@/lib/settings";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingChat from "@/components/FloatingChat";
import CsrfBootstrap from "@/components/CsrfBootstrap";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = getSettings();
  const adsenseClient = ADSENSE_CLIENT;
  // metadataBase makes every relative canonical/OpenGraph URL absolute. Without
  // it Next emits relative og:image URLs, which most crawlers ignore.
  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: `${s.site_name} — ${s.tagline}`,
      template: `%s · ${s.site_name}`,
    },
    description: s.tagline,
    applicationName: s.site_name,
    openGraph: {
      type: "website",
      siteName: s.site_name,
      title: `${s.site_name} — ${s.tagline}`,
      description: s.tagline,
      url: "/",
      locale: "en_IN",
    },
    twitter: {
      card: "summary_large_image",
      title: `${s.site_name} — ${s.tagline}`,
      description: s.tagline,
    },
    ...(adsenseClient
      ? { other: { "google-adsense-account": adsenseClient } }
      : {}),
  };
}

async function safeSettings(): Promise<SiteSettings> {
  try {
    return getSettings();
  } catch {
    return {
      site_name: "Brand Deals Hub",
      tagline: "India's #1 Verified Deal Discovery Platform",
      announcement: "",
      whatsapp: "918527324446",
      telegram: "branddeals",
      support_email: "support@branddeals.in",
      instagram: "branddeals.in",
      mediators: "Support Team,Deal Curators,VIP Shoppers",
      rules_instructions: "1. Browse verified deals on our platform.\n2. Click 'Shop on' to visit the store directly.\n3. Apply the deal code at checkout.\n4. Contact store support for order issues.",
    };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await safeSettings();
  const announcement = ANNOUNCEMENT.trim();
  const adsenseClient = ADSENSE_CLIENT;

  return (
    <html lang="en">
      <body>
        {adsenseClient && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
            crossOrigin="anonymous"
          />
        )}
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

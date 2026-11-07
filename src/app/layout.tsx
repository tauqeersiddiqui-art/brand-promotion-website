import type { Metadata } from "next";
import "./globals.css";
import { ADSENSE_CLIENT } from "@/lib/adsense";
import { getSettings, type SiteSettings } from "@/lib/settings";
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
      site_name: "Brand Promotion",
      tagline: "India's smartest deals & brand promotion platform",
      announcement: "",
      whatsapp: "918527324446",
      telegram: "brandreviewer",
      support_email: "support@brandpromotion.in",
      instagram: "",
      mediators: "Direct,Amit Mediator,Rahul Agency,Pooja Deals,VIP Campaigns,Social Reach",
      rules_instructions: "1. Search keyword on Amazon/Flipkart.\n2. Submit order screenshot with Order ID.\n3. Post 5-star review upon delivery.\n4. After the return window closes, claim with review + order screenshots.",
    };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await safeSettings();
  const announcement = s.announcement.trim();
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

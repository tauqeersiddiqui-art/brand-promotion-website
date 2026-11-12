import { getSettings, whatsappLink, telegramLink } from "@/lib/settings";
import ContactClient from "./ContactClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact Us | Brand Deals Hub",
  description: "Contact our support team for help with deals, store access, and account questions.",
};

export default function ContactPage() {
  const settings = getSettings();

  return (
    <ContactClient
      whatsappHref={
        settings.whatsapp
          ? whatsappLink(settings.whatsapp, "Hi, I have a question about a deal.")
          : ""
      }
      telegramHref={settings.telegram ? telegramLink(settings.telegram) : ""}
      supportEmail={settings.support_email}
    />
  );
}

import { getSettings, whatsappLink, telegramLink } from "@/lib/settings";
import ContactClient from "./ContactClient";

export const dynamic = "force-dynamic";

export default function ContactPage() {
  const settings = getSettings();

  return (
    <ContactClient
      whatsappHref={
        settings.whatsapp
          ? whatsappLink(settings.whatsapp, "Hi, I have a question about my deal cashback.")
          : ""
      }
      telegramHref={settings.telegram ? telegramLink(settings.telegram) : ""}
      supportEmail={settings.support_email}
    />
  );
}

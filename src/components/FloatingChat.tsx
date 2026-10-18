export default function FloatingChat({
  whatsapp,
  telegram,
}: {
  whatsapp: string;
  telegram: string;
}) {
  return (
    <div className="float-stack">
      {whatsapp && (
        <a
          className="float-btn float-wa"
          href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
            "Hi! I have a question about a deal."
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on WhatsApp"
          title="Chat on WhatsApp"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff">
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.83 9.83 0 0 0 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.02 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.27z" />
          </svg>
        </a>
      )}
      {telegram && (
        <a
          className="float-btn float-tg"
          href={`https://t.me/${telegram.replace(/^@/, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Join Telegram"
          title="Join Telegram Channel"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff">
            <path d="M21.94 4.2 19.05 19.1c-.21 1.05-.86 1.3-1.73.81l-4.78-3.53-2.31 2.22c-.26.26-.47.47-.94.47l.34-4.86 8.85-8c.38-.34-.09-.53-.6-.19L7.02 13.28 2.26 11.8c-1.03-.32-1.05-1.03.21-1.53l17.2-6.63c.86-.32 1.61.19 1.33 1.53z" />
          </svg>
        </a>
      )}
    </div>
  );
}

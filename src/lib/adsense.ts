const FALLBACK_CLIENT = "ca-pub-7773361971010362";

export const ADSENSE_CLIENT =
  (process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "").trim() || FALLBACK_CLIENT;

export const ADSENSE_PUB_ID = ADSENSE_CLIENT.replace(/^ca-/, "");

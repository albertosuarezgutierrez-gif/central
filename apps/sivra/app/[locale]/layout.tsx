import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const SITE_URL = "https://housesevillana.vercel.app";

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("homeTitle"), template: `%s | ${t("siteName")}` },
    description: t("homeDescription"),
    applicationName: t("siteName"),
    authors: [{ name: "Alberto Suárez Gutiérrez" }],
    creator: "Alberto Suárez Gutiérrez",
    publisher: t("siteName"),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        "es-ES": "/es",
        "en-US": "/en",
        "fr-FR": "/fr",
        "de-DE": "/de",
        "it-IT": "/it",
        "x-default": "/es",
      },
    },
    openGraph: {
      type: "website",
      locale: locale === "es" ? "es_ES" : locale === "en" ? "en_US" : `${locale}_${locale.toUpperCase()}`,
      url: `${SITE_URL}/${locale}`,
      siteName: t("siteName"),
      title: t("homeTitle"),
      description: t("homeDescription"),
      images: [{ url: "/og/house-sevillana-1200x630.jpg", width: 1200, height: 630, alt: t("ogAlt") }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("homeTitle"),
      description: t("homeDescription"),
      images: ["/og/house-sevillana-1200x630.jpg"],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default async function PublicLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const tNav = await getTranslations({ locale, namespace: "nav" });
  const tFoot = await getTranslations({ locale, namespace: "footer" });
  const tMeta = await getTranslations({ locale, namespace: "meta" });

  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://housesevillana.vercel.app/#organization",
    name: tMeta("siteName"),
    url: "https://housesevillana.vercel.app",
    founder: { "@type": "Person", name: "Alberto Suárez Gutiérrez" },
    address: {
      "@type": "PostalAddress",
      streetAddress: "Calle Socorro 24",
      addressLocality: "Sevilla",
      postalCode: "41003",
      addressCountry: "ES",
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+34637349990",
      email: "alberto.suarez.gutierrez@gmail.com",
      contactType: "reservations",
      availableLanguage: ["Spanish", "English", "French", "German", "Italian"],
    },
    sameAs: ["https://www.booking.com/hotel/es/house-sevillana.es.html"],
  };

  return (
    <NextIntlClientProvider>
      <div className="min-h-screen bg-white text-neutral-900">
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-neutral-200">
          <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
            <Link href="/" locale={locale} className="font-semibold tracking-tight">
              House Sevillana
            </Link>
            <div className="flex items-center gap-3">
              <LanguageSwitcher current={locale} />
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="border-t border-neutral-200 mt-24 bg-neutral-50">
          <div className="mx-auto max-w-6xl px-4 py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="font-semibold">House Sevillana</p>
              <p className="mt-2 text-sm text-neutral-600">{tFoot("tagline")}</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{tFoot("navTitle")}</p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                <li><Link href="/" locale={locale}>{tNav("home")}</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">{tFoot("legalTitle")}</p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                <li>{tFoot("vftLabel")}: {tFoot("vftPending")}</li>
                <li>NIF: 28823484E</li>
                <li>Calle Socorro 24, 41003 Sevilla</li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold">{tFoot("contactTitle")}</p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                <li>
                  <a href={`mailto:${tFoot("email")}`} className="hover:underline">
                    {tFoot("email")}
                  </a>
                </li>
                <li>
                  <a href={`tel:${tFoot("phone").replace(/\s/g, "")}`} className="hover:underline">
                    {tFoot("phone")}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-neutral-200 py-4 text-center text-xs text-neutral-500">
            {tFoot("rights", { year: new Date().getFullYear() })}
          </div>
        </footer>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
      </div>
    </NextIntlClientProvider>
  );
}

function LanguageSwitcher({ current }: { current: string }) {
  const labels: Record<string, string> = { es: "ES", en: "EN", fr: "FR", de: "DE", it: "IT" };
  return (
    <div className="flex items-center gap-1 text-xs">
      {routing.locales.map((l) => (
        <Link
          key={l}
          href="/"
          locale={l}
          className={`px-2 py-1 rounded ${l === current ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
        >
          {labels[l]}
        </Link>
      ))}
    </div>
  );
}

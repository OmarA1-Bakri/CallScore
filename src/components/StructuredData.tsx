import { SITE_URL } from "@/lib/site";

const applicationDescription =
  "CallScore tracks public crypto creator market calls, scores predictions against real price data, and ranks creators by alpha, accuracy, consistency, and self-correction.";

export default function StructuredData() {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "CallScore",
    url: SITE_URL,
    description: applicationDescription,
  };

  const applicationSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "CallScore",
    url: SITE_URL,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: applicationDescription,
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Pro",
        price: "19",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Alpha",
        price: "49",
        priceCurrency: "USD",
      },
    ],
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CallScore",
    url: SITE_URL,
    sameAs: ["https://www.omarbakri.com"],
  };

  return (
    <>
      {[websiteSchema, applicationSchema, organizationSchema].map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}

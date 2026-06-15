import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | Athlete Intelligence',
  description: 'Privacy Policy for Athlete Intelligence.',
}

const lastUpdated = 'June 14, 2026'

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#030500] px-5 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-cyan-300/20 bg-slate-950/80 p-6 shadow-2xl shadow-cyan-950/30 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Athlete Intelligence</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: {lastUpdated}</p>

        <section className="mt-8 space-y-5 text-sm leading-7 text-slate-300 sm:text-base">
          <p>
            Athlete Intelligence (“Athlete Intelligence,” “we,” “us,” or “our”) provides sports analytics,
            athlete-performance context, matchup analysis, and related digital tools through athleteintelligence.xyz
            and associated services (the “Service”). This Privacy Policy explains how we collect, use, and protect
            information when you use the Service or connect third-party developer platforms such as TikTok.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Information We Collect</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Account information such as name, email address, authentication provider identifiers, and subscription or access status.</li>
            <li>Usage information such as pages viewed, features used, device/browser information, approximate location derived from IP address, logs, and diagnostics.</li>
            <li>Payment and subscription status handled through our payment provider. We do not store full payment card numbers.</li>
            <li>Information you choose to provide when contacting us, requesting support, or using access-code or account features.</li>
            <li>Third-party platform data that you authorize us to access, limited to the permissions you grant through that platform.</li>
          </ul>

          <h2 className="pt-4 text-xl font-bold text-white">How We Use Information</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>To operate, secure, maintain, and improve the Service.</li>
            <li>To authenticate users, manage subscriptions, provide access, and prevent fraud or abuse.</li>
            <li>To personalize product experiences and provide sports-analysis features.</li>
            <li>To respond to support requests and communicate important service updates.</li>
            <li>To comply with legal obligations and enforce our Terms and Conditions.</li>
          </ul>

          <h2 className="pt-4 text-xl font-bold text-white">Third-Party Services</h2>
          <p>
            We may use service providers for hosting, analytics, authentication, payments, communications, and
            integrations. These providers process information only as needed to provide their services to us. If you
            authorize a third-party integration, such as TikTok or another developer platform, your use of that
            integration is also governed by that platform’s own terms and privacy policy.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Cookies and Similar Technologies</h2>
          <p>
            We may use cookies, local storage, and similar technologies to keep you signed in, remember preferences,
            measure performance, and protect the Service from abuse. You can control cookies through your browser
            settings, but disabling them may affect functionality.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Data Sharing</h2>
          <p>
            We do not sell personal information. We may share information with service providers, when required by
            law, to protect rights and safety, as part of a business transfer, or with your consent.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Data Retention</h2>
          <p>
            We retain information for as long as reasonably necessary to provide the Service, comply with legal
            obligations, resolve disputes, enforce agreements, and maintain security records.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Security</h2>
          <p>
            We use reasonable administrative, technical, and organizational safeguards designed to protect information.
            No online service can guarantee perfect security, and you use the Service at your own risk.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Your Choices</h2>
          <p>
            Depending on your location, you may have rights to access, correct, delete, restrict, or export certain
            personal information. You may also disconnect third-party integrations from the relevant platform settings.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Children’s Privacy</h2>
          <p>
            The Service is not directed to children under 13, and we do not knowingly collect personal information from
            children under 13. If you believe a child has provided us information, contact us so we can take appropriate action.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">International Users</h2>
          <p>
            Information may be processed in the United States or other countries where we or our providers operate.
            By using the Service, you understand that information may be transferred outside your location.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. The updated version will be posted on this page with
            a revised “Last updated” date.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Contact</h2>
          <p>
            Questions about this Privacy Policy can be sent through the contact channels available on the Service or by
            contacting the operator of athleteintelligence.xyz.
          </p>
        </section>
      </div>
    </main>
  )
}

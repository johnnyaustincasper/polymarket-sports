import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms and Conditions | Athlete Intelligence',
  description: 'Terms and Conditions for Athlete Intelligence.',
}

const lastUpdated = 'June 14, 2026'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#030500] px-5 py-10 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-cyan-300/20 bg-slate-950/80 p-6 shadow-2xl shadow-cyan-950/30 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-200/80">Athlete Intelligence</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-5xl">Terms and Conditions</h1>
        <p className="mt-3 text-sm text-slate-400">Last updated: {lastUpdated}</p>

        <section className="mt-8 space-y-5 text-sm leading-7 text-slate-300 sm:text-base">
          <p>
            These Terms and Conditions (“Terms”) govern your access to and use of athleteintelligence.xyz and related
            services provided by Athlete Intelligence (“Athlete Intelligence,” “we,” “us,” or “our”) (the “Service”).
            By accessing or using the Service, you agree to these Terms.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Use of the Service</h2>
          <p>
            The Service provides sports analytics, athlete-performance context, matchup analysis, data visualization,
            and related informational tools. You agree to use the Service only for lawful purposes and in accordance
            with these Terms.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Eligibility and Accounts</h2>
          <p>
            You must be able to form a binding contract to use the Service. You are responsible for maintaining the
            confidentiality of your account credentials and for all activity under your account. You agree to provide
            accurate account information and to notify us of unauthorized access or security issues.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Subscriptions, Payments, and Access</h2>
          <p>
            Some features may require paid access, a subscription, or an approved access code. Prices, availability,
            and features may change over time. Payments are processed by third-party providers and may be subject to
            their terms. Unless otherwise stated, fees are non-refundable except where required by law.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Informational Purposes Only</h2>
          <p>
            The Service is provided for informational, educational, and analytical purposes only. Athlete Intelligence
            does not provide financial, legal, gambling, medical, or professional advice. Sports outcomes are uncertain,
            and analysis may be incomplete, delayed, inaccurate, or affected by changing news, injuries, lineup changes,
            market conditions, or data-provider limitations. You are solely responsible for your own decisions.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">No Guaranteed Results</h2>
          <p>
            We do not guarantee the accuracy, completeness, timeliness, profitability, availability, or reliability of
            any analysis, signal, projection, data, or feature. Past performance, historical statistics, model outputs,
            market context, or social sentiment do not guarantee future results.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Third-Party Data and Platforms</h2>
          <p>
            The Service may display, reference, or connect to third-party data, APIs, websites, platforms, payment
            processors, authentication providers, or developer platforms such as TikTok. Third-party services are not
            controlled by Athlete Intelligence and may be governed by their own terms and policies. We are not
            responsible for third-party content, data availability, or platform decisions.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Acceptable Use</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>Do not attempt to access the Service without authorization or bypass subscription/access controls.</li>
            <li>Do not interfere with, disrupt, scrape at excessive rates, reverse engineer, or overload the Service.</li>
            <li>Do not use the Service to violate laws, platform rules, intellectual-property rights, or privacy rights.</li>
            <li>Do not resell, redistribute, or commercially exploit the Service without written permission.</li>
          </ul>

          <h2 className="pt-4 text-xl font-bold text-white">Intellectual Property</h2>
          <p>
            The Service, including its design, software, branding, content, and analysis features, is owned by Athlete
            Intelligence or its licensors and is protected by applicable intellectual-property laws. Subject to these
            Terms, we grant you a limited, revocable, non-exclusive, non-transferable right to access and use the Service.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Service Changes and Availability</h2>
          <p>
            We may modify, suspend, or discontinue any part of the Service at any time. We may also limit or terminate
            access if we believe you violated these Terms or if required by law, security, provider, or operational needs.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Disclaimer of Warranties</h2>
          <p>
            The Service is provided “as is” and “as available” without warranties of any kind, whether express, implied,
            or statutory, including warranties of merchantability, fitness for a particular purpose, title, and non-infringement.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Athlete Intelligence and its owners, operators, affiliates,
            contractors, and providers will not be liable for indirect, incidental, special, consequential, exemplary,
            or punitive damages, or for lost profits, lost data, lost opportunities, or decisions made based on the Service.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Indemnification</h2>
          <p>
            You agree to defend, indemnify, and hold harmless Athlete Intelligence from claims, damages, liabilities,
            costs, and expenses arising from your use of the Service, your violation of these Terms, or your violation
            of applicable law or third-party rights.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. The updated version will be posted on this page with a revised
            “Last updated” date. Continued use of the Service after changes become effective means you accept the changes.
          </p>

          <h2 className="pt-4 text-xl font-bold text-white">Contact</h2>
          <p>
            Questions about these Terms can be sent through the contact channels available on the Service or by contacting
            the operator of athleteintelligence.xyz.
          </p>
        </section>
      </div>
    </main>
  )
}

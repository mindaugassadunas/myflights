export const metadata = { title: "Styleguide — Aloft" };
export const dynamic = "force-dynamic";

export default function StyleguidePage() {
  return (
    <div className="px-5 py-6 pt-[calc(env(safe-area-inset-top)+16px)] space-y-8 max-w-2xl">
      <header>
        <p className="text-[14px] text-text-secondary font-mono-data uppercase tracking-wider">
          Aloft · Dark Precision
        </p>
        <h1 className="mt-1 text-[28px] leading-8 font-light">Styleguide</h1>
        <p className="mt-2 text-[14px] leading-5 text-text-secondary">
          Type, palette, and surfaces. Mobile-first scale; tested at 390px viewport.
        </p>
      </header>

      <Section title="Type scale">
        <div className="space-y-3">
          <Sample label="Display 28/32" className="text-[28px] leading-8 font-light">
            04:42 UTC
          </Sample>
          <Sample label="H1 22/28" className="text-[22px] leading-7 font-normal">
            Heathrow → Vilnius
          </Sample>
          <Sample label="H2 18/24" className="text-[18px] leading-6 font-normal">
            Year in review
          </Sample>
          <Sample label="Body 16/24" className="text-[16px] leading-6">
            Honest trajectories, not great-circle approximations.
          </Sample>
          <Sample label="Small 14/20" className="text-[14px] leading-5 text-text-secondary">
            ADS-B coverage was sparse over the North Atlantic.
          </Sample>
          <Sample label="Mono 15/20" className="text-[15px] leading-5 font-mono-data">
            FL360 · 472 kt · 54.1234° N 23.5678° E
          </Sample>
        </div>
      </Section>

      <Section title="Palette">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Swatch name="bg" hex="#0A0B0D" />
          <Swatch name="surface" hex="#13151A" />
          <Swatch name="surface-elev" hex="#1A1D23" />
          <Swatch name="border" hex="#1F2228" />
          <Swatch name="text-primary" hex="#E8EAED" />
          <Swatch name="text-secondary" hex="#8B9099" />
          <Swatch name="accent" hex="#00D4FF" />
          <Swatch name="warning" hex="#E8A547" />
          <Swatch name="success" hex="#4ADE80" />
        </div>
      </Section>

      <Section title="Altitude gradient">
        <div className="h-8 rounded-[2px] border border-border"
             style={{
               background:
                 "linear-gradient(to right, #0A3A8C 0%, #1976D2 25%, #00D4FF 50%, #4ADE80 75%, #E8A547 100%)",
             }} />
        <div className="mt-2 flex justify-between text-[12px] font-mono-data text-text-secondary">
          <span>FL000</span>
          <span>FL150</span>
          <span>FL300</span>
          <span>FL400+</span>
        </div>
      </Section>

      <Section title="Surfaces">
        <div className="space-y-3">
          <div className="bg-surface border border-border rounded-[2px] p-5">
            <div className="text-[16px]">surface · data card</div>
            <div className="text-[14px] text-text-secondary mt-1">
              Sharp corners (2px). Used for list rows and stat panels.
            </div>
          </div>
          <div className="bg-surface-elevated border border-border rounded-[12px] p-5">
            <div className="text-[16px]">surface-elevated · sheet</div>
            <div className="text-[14px] text-text-secondary mt-1">
              12px corners for bottom sheets — matches the swipe-up affordance.
            </div>
          </div>
        </div>
      </Section>

      <Section title="Touch targets">
        <div className="flex flex-wrap gap-3">
          <button className="h-11 min-w-[44px] px-5 bg-accent text-bg rounded-[8px] font-medium">
            Primary 44pt
          </button>
          <button className="h-11 min-w-[44px] px-5 border border-border rounded-[8px]">
            Secondary
          </button>
          <button className="h-11 min-w-[44px] px-5 text-text-secondary">
            Ghost
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[14px] text-text-secondary font-mono-data uppercase tracking-wider mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Sample({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[12px] font-mono-data text-text-secondary">{label}</div>
      <div className={className}>{children}</div>
    </div>
  );
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="border border-border rounded-[2px] overflow-hidden">
      <div className="h-12" style={{ background: hex }} />
      <div className="px-2 py-1.5 bg-surface">
        <div className="text-[13px]">{name}</div>
        <div className="text-[12px] font-mono-data text-text-secondary">{hex}</div>
      </div>
    </div>
  );
}

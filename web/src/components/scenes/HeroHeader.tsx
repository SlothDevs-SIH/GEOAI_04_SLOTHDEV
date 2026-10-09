/** S-01 */
export default function HeroHeader() {
  return (
    <div data-testid="hero" className="anim-in max-w-4xl">
      <h1 className="text-display text-fg">See what really changed, not every pixel that moved.</h1>
      <p className="mt-s12 text-body text-secondary">
        Compare two satellite images of the same place. We filter out seasonal, lighting and radar-speckle false alarms,
        then rank the real changes by severity, explain each one, and export them for GIS.
      </p>
      <div className="mt-s18 flex flex-wrap items-center gap-s12">
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-tiny text-fg shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="font-semibold text-amber-300">Priority 1:</span>
          <span className="text-secondary">Urban & Forest Encroachment (Madhya Pradesh & Central Belt)</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-tiny text-fg shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400" />
          <span className="font-semibold text-cyan-300">Priority 2:</span>
          <span className="text-secondary">Disaster & Cloud-Piercing Flood Impact (Assam Radar)</span>
        </div>
      </div>
    </div>
  );
}

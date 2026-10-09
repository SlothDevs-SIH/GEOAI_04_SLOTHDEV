/** S-01 */
export default function HeroHeader() {
  return (
    <div data-testid="hero" className="anim-in max-w-3xl">
      <h1 className="text-display text-fg">See what really changed, not every pixel that moved.</h1>
      <p className="mt-s12 text-body text-secondary">
        Compare two satellite images of the same place. We filter out seasonal, lighting and radar-speckle false alarms,
        then rank the real changes by severity, explain each one, and export them for GIS.
      </p>
    </div>
  );
}

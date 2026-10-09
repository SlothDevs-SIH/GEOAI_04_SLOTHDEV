import { CardSection } from "../ui/Primitives";

/** Honest limits, stated plainly. Each one is backed by the README, the QA notes or the Accuracy page. */
export const LIMITS: string[] = [
  "10 m satellite pixels cannot see people or single small huts. The site tells you where to look; it does not replace a visit.",
  "It prioritises where to look. Confirm critical changes on the ground: change types and reasons come from spectral rules, not from the learned model.",
  "The rules and thresholds were tuned on Maharashtra scenes, then checked by eye on six other regions. We say \"checked on six regions\", never \"works everywhere\".",
  "Known confusers: rivers and sandbars move between dates and get flagged (the Yamuna in Delhi, the Brahmaputra at Guwahati), and bare soil in dry regions produces scattered small detections.",
  "The learned detector is strong in some places and weak in others (see the per-location table on Accuracy), so the rule-based Spectral mode stays the default.",
  "Optical images cannot see through cloud: clouded areas are removed, not analysed. Radar covers floods under cloud.",
  "Radar flood mapping shows open water from one date, so it cannot tell a flood from a permanent river unless a reference date is used; flooded crops and streets can look bright and may be missed. The Assam demo is a single event, the 2016 flood.",
  "Cropland comes from WorldCover 2021; when the before image is older, it is shown as an upper bound.",
];

/** A4 §5 LimitsCard. */
export default function LimitsCard() {
  return (
    <CardSection title="Limits (what it does not do)" testid="limits">
      <ul className="m-0 flex list-disc flex-col gap-s8 pl-s18 text-body text-secondary">
        {LIMITS.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </CardSection>
  );
}

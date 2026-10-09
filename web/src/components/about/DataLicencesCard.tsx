import { CardSection, Scroller } from "../ui/Primitives";

/** [source, what we use it for, licence / terms]. Wording follows the README credits; nothing is claimed that the repository does not state. */
export const SOURCES: [string, string, string][] = [
  ["Copernicus Sentinel-2 L2A (ESA)", "Optical before/after images, read from the Element84 Earth Search bucket", "Copernicus open data: free and open"],
  ["Copernicus Sentinel-1 (ESA)", "Radar images for flood mapping through cloud", "Copernicus open data: free and open"],
  ["ESA WorldCover 2021 v200", "Cropland and built-up land for the impact numbers", "CC-BY 4.0"],
  ["JRC Global Surface Water", "Permanent-water mask, so rivers are not reported as floods", "Open data (Pekel et al., 2016): cite the source"],
  ["OpenStreetMap", "Base map, buildings and roads for the impact numbers", "ODbL: © OpenStreetMap contributors"],
  ["Sen1Floods11 v1.1 (Cloud to Street)", "Expert hand-labelled flood chips, used for radar accuracy", "CC-BY 4.0"],
  ["OSCD (Onera Satellite Change Detection)", "Training and testing the learned optical model", "Research dataset; licence not stated in the files we downloaded"],
  ["LEVIR-CD", "Testing the high-resolution BIT mode", "Academic use only; commercial use prohibited; Google Earth imagery terms apply"],
];

/** A4 §5 DataLicencesCard. */
export default function DataLicencesCard() {
  return (
    <CardSection title="Data and licences" testid="data-licences">
      <Scroller testid="data-licences-scroller">
        <table className="w-full min-w-[540px] border-separate border-spacing-0 text-small">
          <thead>
            <tr className="text-left text-tiny text-muted">
              <th scope="col" className="px-s8 pb-s8 font-medium">Source</th>
              <th scope="col" className="px-s8 pb-s8 font-medium">What we use it for</th>
              <th scope="col" className="px-s8 pb-s8 font-medium">Licence or terms</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map(([name, use, licence]) => (
              <tr key={name} className="align-top">
                <th scope="row" className="border-t border-line px-s8 py-s8 text-left font-semibold text-fg">{name}</th>
                <td className="border-t border-line px-s8 py-s8 font-normal text-secondary">{use}</td>
                <td className="border-t border-line px-s8 py-s8 font-normal text-secondary">{licence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
    </CardSection>
  );
}

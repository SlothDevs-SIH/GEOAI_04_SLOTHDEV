import { View } from "react-native";
import { CardSection } from "../ui/Card";
import { Txt } from "../ui/Txt";

export function NotMeasuredList({ bullets }: { bullets: string[] }) {
  return (
    <View testID="acc-not-measured">
      <CardSection title="Not measured yet (said plainly)" slug="not-measured">
        <View testID="not-measured">
          {bullets.length ? bullets.map((b) => <Txt key={b} v="body" tone="secondary">• {b}</Txt>) : <Txt v="body" tone="secondary">Nothing outstanding in the results file.</Txt>}
        </View>
      </CardSection>
    </View>
  );
}

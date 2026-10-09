import Svg, { Circle, Line, Rect } from "react-native-svg";
import { useTheme } from "../../theme/ThemeProvider";

/** Q-02: a 95% interval drawn on a 0..1 axis, with the point estimate as a dot. */
export function CIBar({ value, ci95, width = 160, label }: { value: number; ci95: [number, number]; width?: number; label?: string }) {
  const { c } = useTheme();
  const x = (v: number) => Math.max(0, Math.min(1, v)) * (width - 8) + 4;
  return (
    <Svg testID="ci-bar" width={width} height={16} accessibilityLabel={label ?? `${value.toFixed(2)}, 95% interval ${ci95[0].toFixed(2)} to ${ci95[1].toFixed(2)}`} accessible>
      <Rect x={4} y={7} width={width - 8} height={2} fill={c.border} />
      <Line x1={x(ci95[0])} x2={x(ci95[1])} y1={8} y2={8} stroke={c.accent} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={x(value)} cy={8} r={4.5} fill={c.text} />
    </Svg>
  );
}

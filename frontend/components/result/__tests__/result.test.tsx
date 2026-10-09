import { fireEvent, render, screen } from "@testing-library/react-native";
import { ChangeCard, ChangeRow } from "../Changes";
import { CounterText } from "../ResultBits";
import { TierChip } from "../TierChip";
import { ThemeProvider } from "../../../theme/ThemeProvider";
import type { ChangeProps } from "../../../lib/types";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => undefined }));

const p: ChangeProps = { id: 7, tier: "critical", change_type: "built_up_gain", area_m2: 28800, area_ha: 2.88, magnitude: 0.5, confidence: 0.96, needs_review: true,
  centroid_lat: 13.0, centroid_lon: 77.7, reason: "New built-up surface", score: 1, review_status: "pending" };
const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

it("TierChip spells the tier out and carries an accessible label", async () => {
  await render(wrap(<TierChip tier="critical" />));
  expect(screen.getByText("Critical")).toBeTruthy();
  expect(screen.getByLabelText("Critical severity")).toBeTruthy();
});

it("ChangeRow reports selection and its press", async () => {
  const onSelect = jest.fn();
  await render(wrap(<ChangeRow feature={p} index={0} isSelected onSelect={onSelect} status="confirmed" />));
  const row = screen.getByTestId("change-row");
  expect(row.props.accessibilityState).toMatchObject({ selected: true });
  expect(row.props.accessibilityLabel).toContain("confirmed");
  await fireEvent.press(row);
  expect(onSelect).toHaveBeenCalledWith(7);
});

it("ChangeCard shows the reason and toggles confirm/dismiss", async () => {
  const onReview = jest.fn();
  await render(wrap(<ChangeCard feature={p} base="/demos/x" reviewStatus="pending" onReview={onReview} />));
  expect(screen.getByTestId("reason")).toHaveTextContent(/New built-up surface/);
  await fireEvent.press(screen.getByTestId("btn-confirm"));
  expect(onReview).toHaveBeenLastCalledWith("confirmed");
  await fireEvent.press(screen.getByTestId("btn-dismiss"));
  expect(onReview).toHaveBeenLastCalledWith("dismissed");
});

it("ChangeCard un-confirms when pressed again", async () => {
  const onReview = jest.fn();
  await render(wrap(<ChangeCard feature={p} base="/demos/x" reviewStatus="confirmed" onReview={onReview} />));
  await fireEvent.press(screen.getByTestId("btn-confirm"));
  expect(onReview).toHaveBeenLastCalledWith("pending");
});

it("ChangeCard with nothing selected invites a click", async () => {
  await render(wrap(<ChangeCard base="/demos/x" reviewStatus="pending" onReview={jest.fn()} />));
  expect(screen.getByText(/Click a polygon/)).toBeTruthy();
});

it("CounterText is a polite live region and flips with the filter", async () => {
  const { rerender } = await render(wrap(<CounterText rawCount={6117} keptCount={272} filterOn={false} />));
  expect(screen.getByTestId("counter")).toHaveTextContent("Filter off: 6,117 raw detections");
  expect(screen.getByTestId("counter").props.accessibilityLiveRegion).toBe("polite");
  await rerender(wrap(<CounterText rawCount={6117} keptCount={272} filterOn />));
  await screen.findByText(/272 real changes/, {}, { timeout: 2000 });
});

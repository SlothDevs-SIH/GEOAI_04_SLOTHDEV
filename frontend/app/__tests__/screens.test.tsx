import { render, screen } from "@testing-library/react-native";
import Accuracy from "../accuracy";
import Scenes from "../index";
import About from "../about";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { mockStaticFetch } from "../../lib/__tests__/helpers/staticFetch";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => undefined }));
const wrap = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;
beforeEach(() => { mockStaticFetch(); });

it("Scenes lists the demo scenes with raw -> real counts", async () => {
  await render(wrap(<Scenes />));
  const cards = await screen.findAllByTestId("scene-card", {}, { timeout: 3000 });
  expect(cards.length).toBeGreaterThanOrEqual(7);
  expect(screen.getByTestId("analyse-card")).toBeTruthy();
  expect(screen.getByText(/See what really changed/)).toBeTruthy();
});

it("Accuracy renders the measured blocks, with the honest not-measured list", async () => {
  await render(wrap(<Accuracy />));
  for (const id of ["acc-oscd", "acc-oscd-locations", "acc-learned-fa", "acc-levir", "acc-radar-events", "acc-not-measured"]) {
    expect(await screen.findByTestId(id, {}, { timeout: 3000 })).toBeTruthy();
  }
  expect(screen.getByTestId("acc-levir")).toHaveTextContent(/0\.90 \[0\.89/);
  expect(screen.getByTestId("acc-oscd")).toHaveTextContent(/Naive/);
});

it("About spells out every status", async () => {
  await render(wrap(<About />));
  expect(screen.getAllByTestId("status-chip").length).toBeGreaterThanOrEqual(8);
  expect(screen.getByTestId("tech-stack")).toBeTruthy();
});

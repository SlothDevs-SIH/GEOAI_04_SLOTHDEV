import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
test("jest-expo renders", async () => { await render(<Text testID="x">ok</Text>); expect(screen.getByTestId("x")).toHaveTextContent("ok"); });

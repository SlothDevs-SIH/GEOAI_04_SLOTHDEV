// Reanimated 4 / worklets need their jest mocks (no native runtime under jest).
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => {
  const m = require("react-native-reanimated/mock");
  return { ...m, __esModule: true, useReducedMotion: () => true, FadeInDown: { duration: () => ({ delay: () => undefined }) }, Easing: m.Easing ?? { out: (f: unknown) => f, cubic: 1, inOut: (f: unknown) => f, quad: 1, linear: 1 } };
});
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

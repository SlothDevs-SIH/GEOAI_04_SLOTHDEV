import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

/** true while the device has a network connection. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)), []);
  return online;
}

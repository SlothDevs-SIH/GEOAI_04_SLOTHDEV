import { Component, type ReactNode } from "react";
import { View } from "react-native";
import { ErrorState } from "../ui/Alerts";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View testID="error-boundary" style={{ flex: 1, justifyContent: "center" }}>
        <ErrorState message={this.state.error.message} onRetry={() => this.setState({ error: undefined })} />
      </View>
    );
  }
}

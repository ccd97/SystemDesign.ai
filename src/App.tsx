import { SettingsProvider } from "./app/providers/SettingsProvider";
import { ToastProvider } from "./app/providers/ToastProvider";
import { ToastContainer } from "./widgets/ToastContainer";
import { EditorPage } from "./pages/EditorPage";

export function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <EditorPage />
        <ToastContainer />
      </ToastProvider>
    </SettingsProvider>
  );
}

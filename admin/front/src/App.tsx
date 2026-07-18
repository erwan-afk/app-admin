import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AuthProvider } from "@/context/AuthContext";
import { AuthGate } from "@/components/AuthGate";

function App() {
  return (
    <TooltipProvider>
      <AuthProvider>
        <AuthGate>
          <AdminLayout />
        </AuthGate>
      </AuthProvider>
      <Toaster richColors position="top-right" />
    </TooltipProvider>
  );
}

export default App;

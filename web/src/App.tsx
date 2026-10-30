import { Navigate, Route, Routes } from "react-router-dom";
import { ConsentPage } from "@/pages/Consent";
import { DevicePage } from "@/pages/Device";
import { HomePage } from "@/pages/Home";
import { SignInPage } from "@/pages/SignIn";
import { SignUpPage } from "@/pages/SignUp";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />
      <Route path="/consent" element={<ConsentPage />} />
      <Route path="/device" element={<DevicePage />} />
      <Route path="*" element={<Navigate to="/sign-in" replace />} />
    </Routes>
  );
}

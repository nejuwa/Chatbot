import { LoginForm } from "@/components/auth/login-form";
import { AuthPageBackground } from "@/components/auth/auth-page-background";

export default function LoginPage() {
  return (
    <AuthPageBackground>
      <LoginForm />
    </AuthPageBackground>
  );
}

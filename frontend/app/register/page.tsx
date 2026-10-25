import { RegisterForm } from "@/components/auth/register-form";
import { AuthPageBackground } from "@/components/auth/auth-page-background";

export default function RegisterPage() {
  return (
    <AuthPageBackground>
      <RegisterForm />
    </AuthPageBackground>
  );
}

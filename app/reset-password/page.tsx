import PasswordResetForm from "../../components/PasswordResetForm";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token = "" } = await searchParams;
  return <PasswordResetForm token={token} />;
}

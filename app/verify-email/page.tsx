import VerifyEmail from "../../components/VerifyEmail";

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { token = "" } = await searchParams;
  return <VerifyEmail token={token} />;
}

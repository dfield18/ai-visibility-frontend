import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
      <SignIn
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'shadow-lg',
            headerTitle: 'text-gray-900',
            headerSubtitle: 'text-gray-500',
            socialButtonsBlockButton: 'border-gray-200 hover:bg-gray-50',
            formButtonPrimary: 'bg-[#4A7C59] hover:bg-[#3d6649]',
            footerActionLink: 'text-[#4A7C59] hover:text-[#3d6649]',
          },
        }}
      />
    </div>
  );
}

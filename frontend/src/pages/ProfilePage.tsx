// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the profile page layout combining the profile details and change-password forms.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { KeyRoundIcon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import ProfileDetailsForm from "@/features/user/components/ProfileDetailsForm";
import PasswordChangeForm from "@/features/user/components/PasswordChangeForm";
import useProfile from "@/features/user/hooks/useProfile";

const ProfilePage = () => {
  const { data: profile, isPending, isError, error, refetch } = useProfile();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 md:px-10 md:py-10">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-full bg-indigo-100 text-indigo-900">
          <UserRoundIcon
            className="size-5"
            aria-hidden="true"
          />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My profile</h1>
          <p className="text-sm text-slate-600">
            View and update your account details.
          </p>
        </div>
      </div>

      <Card className="bg-white">
        <CardHeader className="border-b border-slate-200 pb-4">
          <CardTitle className="text-lg text-slate-900">
            Personal information
          </CardTitle>
          <CardDescription>
            Manage your username, phone number, and verified email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && (
            <div className="flex w-full flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
              <Spinner className="size-6" />
              <span>Loading profile...</span>
            </div>
          )}

          {isError && !profile && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <p className="max-w-md text-red-500">
                Unable to load your profile: {error.message}
              </p>
              <Button
                variant="outline"
                onClick={() => void refetch()}>
                Try again
              </Button>
            </div>
          )}

          {profile && (
            <ProfileDetailsForm
              user={profile.user}
              pendingEmailChange={profile.pendingEmailChange}
            />
          )}
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader className="border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <KeyRoundIcon
              className="size-5 text-indigo-700"
              aria-hidden="true"
            />
            <CardTitle className="text-lg text-slate-900">Password</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <PasswordChangeForm />
        </CardContent>
      </Card>
    </main>
  );
};

export default ProfilePage;

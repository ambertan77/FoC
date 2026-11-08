// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the TanStack Query mutation hook for resending the registration OTP.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { parseError, type ParsedError } from "@/utils/errorHandler";
import { resendRegistrationOtpService } from "../services/auth.service";
import type {
  RegistrationChallenge,
  ResendRegistrationOtpPayload,
} from "../types/auth.types";

const useResendRegistrationOtp = () => {
  const { mutate, isPending, isError, error } = useMutation<
    RegistrationChallenge,
    ParsedError,
    ResendRegistrationOtpPayload
  >({
    mutationFn: async (payload) => {
      try {
        return await resendRegistrationOtpService(payload);
      } catch (rawError) {
        throw parseError(rawError);
      }
    },
    onSuccess: () => {
      toast.success("A new verification code has been sent.");
    },
    onError: (resendError) => {
      toast.error(resendError.message);
    },
  });

  return {
    resendRegistrationOtp: mutate,
    isPending,
    isError,
    error,
  };
};

export default useResendRegistrationOtp;

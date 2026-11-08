// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the TanStack Query mutation hook that starts registration and issues the OTP.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { registerService } from "../services/auth.service";
import type { RegistrationChallenge } from "../types/auth.types";
import type { RegisterPayload } from "../schemas/register.schema";
import { parseError, type ParsedError } from "@/utils/errorHandler";

const useRegister = () => {
  const { mutate, isPending, isError, error } = useMutation<
    RegistrationChallenge,
    ParsedError,
    RegisterPayload
  >({
    mutationFn: async (payload) => {
      try {
        return await registerService(payload);
      } catch (rawError) {
        throw parseError(rawError);
      }
    },
    onSuccess: () => {
      toast.success("Verification code sent!");
    },
    onError: (registrationError) => {
      toast.error(registrationError.message);
    },
  });

  return {
    register: mutate,
    isPending,
    isError,
    error,
  };
};

export default useRegister;

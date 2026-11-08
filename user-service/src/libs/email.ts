// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the Brevo SMTP transporter setup (getEmailSetting, getTransporter) and sendRegistrationOtpEmail; the other email senders follow the same pattern.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import nodemailer, { type Transporter } from "nodemailer";
import { AppError } from "../errors/errors.js";
import {
  ADMIN_INVITATION_EXPIRES_IN_HOURS,
  REGISTRATION_OTP_EXPIRES_IN_MINUTES,
} from "../constants/auth.constants.js";

const BREVO_SMTP_HOST = "smtp-relay.brevo.com";
const BREVO_SMTP_PORT = 587;

let transporter: Transporter | undefined;

function getEmailSetting(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new AppError(
      "Email delivery is not configured",
      503,
      "EMAIL_NOT_CONFIGURED",
    );
  }

  return value;
}

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: BREVO_SMTP_HOST,
      port: BREVO_SMTP_PORT,
      secure: false,
      requireTLS: true,
      auth: {
        user: getEmailSetting("BREVO_SMTP_USER"),
        pass: getEmailSetting("BREVO_SMTP_KEY"),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  return transporter;
}

export async function sendRegistrationOtpEmail(
  recipientEmail: string,
  otp: string,
): Promise<void> {
  const from = getEmailSetting("EMAIL_FROM");
  const mailer = getTransporter();

  try {
    await mailer.sendMail({
      from,
      to: recipientEmail,
      subject: "Verify your Aaron account",
      text: [
        `Your Aaron verification code is: ${otp}`,
        "",
        `This code expires in ${REGISTRATION_OTP_EXPIRES_IN_MINUTES} minutes.`,
        "If you did not request this code, you can ignore this email.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("Email Service Error:", error);
    throw new AppError(
      "Unable to send verification email. Please try again later.",
      502,
      "EMAIL_DELIVERY_FAILED",
    );
  }
}

export async function sendEmailChangeOtpEmail(
  recipientEmail: string,
  otp: string,
): Promise<void> {
  const from = getEmailSetting("EMAIL_FROM");
  const mailer = getTransporter();

  try {
    await mailer.sendMail({
      from,
      to: recipientEmail,
      subject: "Verify your new Aaron email address",
      text: [
        `Your Aaron email change verification code is: ${otp}`,
        "",
        `This code expires in ${REGISTRATION_OTP_EXPIRES_IN_MINUTES} minutes.`,
        "If you did not request this change, you can ignore this email.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("Email Service Error:", error);
    throw new AppError(
      "Unable to send verification email. Please try again later.",
      502,
      "EMAIL_DELIVERY_FAILED",
    );
  }
}

export async function sendAdminInvitationEmail(
  recipientEmail: string,
  activationUrl: string,
): Promise<void> {
  const from = getEmailSetting("EMAIL_FROM");
  const mailer = getTransporter();

  try {
    await mailer.sendMail({
      from,
      to: recipientEmail,
      subject: "Activate your Aaron administrator account",
      text: [
        "You have been invited to become an Aaron administrator.",
        "",
        `Activate your account: ${activationUrl}`,
        "",
        `This link expires in ${ADMIN_INVITATION_EXPIRES_IN_HOURS} hours.`,
        "If you were not expecting this invitation, you can ignore this email.",
      ].join("\n"),
    });
  } catch {
    console.error("Administrator invitation email delivery failed");
    throw new AppError(
      "Unable to send administrator invitation. Please try again later.",
      502,
      "EMAIL_DELIVERY_FAILED",
    );
  }
}

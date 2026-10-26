import "dotenv/config";
import { z } from "zod";

const optionalEnvValue = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isSecurePublicUrl(value: string) {
  const url = new URL(value);
  return (
    url.protocol === "https:" &&
    !localHostnames.has(url.hostname)
  );
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z
    .string()
    .url()
    .transform((value) => new URL(value).origin)
    .default("http://localhost:3000"),
  JWT_SECRET: z.string().min(32),
  DATABASE_URL: z.string().url(),
  CLOUDINARY_CLOUD_NAME: optionalEnvValue,
  CLOUDINARY_API_KEY: optionalEnvValue,
  CLOUDINARY_API_SECRET: optionalEnvValue,
  AUTH_REFRESH_COOKIE_NAME: z.string().default("refresh_token"),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_ACCESS_TOKEN_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  UPLOAD_DIR: z.string().trim().min(1).default("uploads"),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(25).default(10),
  SMTP_HOST: optionalEnvValue,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SMTP_USER: optionalEnvValue,
  SMTP_PASSWORD: optionalEnvValue,
  SMTP_FROM: optionalEnvValue,
  PASSWORD_RESET_URL: z.string().url().default("http://localhost:3000/reset-password"),
  LLM_PROVIDER: z.string().trim().min(1).default("google"),
  LLM_MODEL: z.string().trim().min(1).default("gemini-3.5-flash-lite"),
  GOOGLE_API_KEY: optionalEnvValue,
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  LLM_MAX_TOKENS: z.coerce.number().int().min(1).default(1024),
  HISTORY_WINDOW: z.coerce.number().int().min(1).max(100).default(20),
  SYSTEM_PROMPT: z.string().default("You are a helpful assistant."),
  AUTH_COOKIE_NAME: z.string().default("access_token"),
  CSRF_COOKIE_NAME: z.string().default("csrf_token"),
  GOOGLE_CLIENT_ID: optionalEnvValue,
  GOOGLE_CLIENT_SECRET: optionalEnvValue,
  GOOGLE_CALLBACK_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
}).superRefine((config, ctx) => {
  const oauthValues = [
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_CALLBACK_URL,
  ];
  const configuredValues = oauthValues.filter(Boolean).length;

  if (configuredValues !== 0 && configuredValues !== oauthValues.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL must be configured together",
      path: ["GOOGLE_CLIENT_ID"],
    });
  }

  const smtpValues = [
    config.SMTP_HOST,
    config.SMTP_USER,
    config.SMTP_PASSWORD,
    config.SMTP_FROM,
  ];
  const configuredSmtpValues = smtpValues.filter(Boolean).length;
  if (configuredSmtpValues !== 0 && configuredSmtpValues !== smtpValues.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM must be configured together",
      path: ["SMTP_HOST"],
    });
  }

  const cloudinaryValues = [
    config.CLOUDINARY_CLOUD_NAME,
    config.CLOUDINARY_API_KEY,
    config.CLOUDINARY_API_SECRET,
  ];
  const configuredCloudinaryValues = cloudinaryValues.filter(Boolean).length;
  if (configuredCloudinaryValues !== 0 && configuredCloudinaryValues !== cloudinaryValues.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be configured together",
      path: ["CLOUDINARY_CLOUD_NAME"],
    });
  }
  if (config.NODE_ENV === "production" && configuredCloudinaryValues !== cloudinaryValues.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cloudinary credentials are required in production for persistent media storage",
      path: ["CLOUDINARY_CLOUD_NAME"],
    });
  }

  if (config.NODE_ENV === "production" && !isSecurePublicUrl(config.CORS_ORIGIN)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "CORS_ORIGIN must use the deployed HTTPS frontend origin in production",
      path: ["CORS_ORIGIN"],
    });
  }

  if (
    config.NODE_ENV === "production" &&
    config.SMTP_HOST &&
    !isSecurePublicUrl(config.PASSWORD_RESET_URL)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "PASSWORD_RESET_URL must use the deployed frontend in production when SMTP is configured",
      path: ["PASSWORD_RESET_URL"],
    });
  }

  if (
    config.NODE_ENV === "production" &&
    config.GOOGLE_CALLBACK_URL &&
    !isSecurePublicUrl(config.GOOGLE_CALLBACK_URL)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "GOOGLE_CALLBACK_URL must use a deployed HTTPS URL in production",
      path: ["GOOGLE_CALLBACK_URL"],
    });
  }
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  throw new Error(`Invalid environment configuration: ${result.error.message}`);
}

export const env = result.data;

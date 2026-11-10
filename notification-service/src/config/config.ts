import "dotenv/config";

function getEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`${name} is not configured`);
    }

    return value;
}

function getEnvNumber(name: string): number {
    const value = getEnv(name);
    const number = Number(value);

    if (Number.isNaN(number)) {
        throw new Error(`${name} must be a number`);
    }

    return number;
}

const config = {
    port: getEnvNumber("PORT"),
    databaseUrl: getEnv("DATABASE_URL"),
    frontendUrl: getEnv("FRONTEND_URL"),
    jwtPublicKeyPath: getEnv("JWT_PUBLIC_KEY_PATH"),
    rabbitmqUrl: getEnv("RABBITMQ_URL"),
    // SSE keep-alive. Keep it below the proxy and CloudFront idle timeouts.
    heartbeatMs: 15_000,
    // Open SSE streams allowed per user (one per tab or device). Extra ones get a 429.
    maxStreamsPerUser: getEnvNumber("MAX_STREAMS_PER_USER") ?? 8,
};

export default config;